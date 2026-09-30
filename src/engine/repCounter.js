// Rep counter.
//
// A hysteresis state machine on a (smoothed) joint angle. For exercises where
// the angle drops during the rep (squat, curl, push-up):
//
//   STANDING --angle drops below descent line--> DESCENDING
//   DESCENDING --angle rises past bottom + hysteresis--> ASCENDING
//   ASCENDING --angle drops below the bottom again--> DESCENDING (bounce)
//   ASCENDING --back above return line / plateaus near the top--> STANDING
//
// Exercises where the angle rises during the rep (lateral raise, press,
// glute bridge) use direction "increase"; internally the signal is mirrored
// so the same logic applies. "Standing" always means the rest position.
//
// On the way back to rest the rep is validated (range of motion, duration,
// hip drop and optionally a trained classifier) and either counted or
// reported as a partial rep. Thresholds are relative to the user's
// calibrated rest angle, so they adapt to different bodies and camera angles.

export const Phase = {
  STANDING: "standing",
  DESCENDING: "descending",
  ASCENDING: "ascending",
};

export const DEFAULT_REP_CONFIG = {
  direction: "decrease",    // "decrease" or "increase" during the rep
  standingAngle: 170,       // calibrated angle at the rest position
  descentOffset: 20,        // rep starts this many degrees away from rest
  returnOffset: 12,         // rep ends this many degrees away from rest
  minRangeOfMotion: 45,     // degrees from rest needed to count a rep
  goodDepthAngle: 100,      // reaching this angle counts as full range
  depthLabels: ["parallel", "above parallel"],
  bottomHysteresis: 8,      // degrees past the turning point before returning
  confirmFrames: 2,         // consecutive frames needed to confirm a transition
  plateauMs: 600,           // time near the top that also finishes a rep
  minRepMs: 500,            // faster than this is treated as noise
  maxRepMs: 30000,
  maxDropoutMs: 1500,       // tracking loss longer than this aborts the rep
  minHipDrop: 0.2,          // hip drop at the bottom, in thigh lengths
  requireClassifier: false, // require a trained classifier to see "active"
  minActiveProbability: 0.6,
  standingAdaptRate: 0.02,  // how quickly the rest angle tracks the user
};

export class RepCounter {
  constructor(config = {}) {
    this.config = { ...DEFAULT_REP_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.partialReps = 0;
    this.phase = Phase.STANDING;
    this.history = [];
    this.current = null;
    this.pendingFrames = 0;
    this.lastReliableTime = null;
    this.lastAngle = null;
  }

  configure(config) {
    this.config = { ...this.config, ...config };
  }

  // +1 when the angle drops during a rep, -1 when it rises
  get sign() {
    return this.config.direction === "increase" ? -1 : 1;
  }

  // Sets thresholds from measured rest and fully-active angles
  // (e.g. from calibration or from classifier training samples).
  calibrate({ standingAngle, bottomAngle }) {
    const update = {};
    if (Number.isFinite(standingAngle)) update.standingAngle = standingAngle;

    if (Number.isFinite(standingAngle) && Number.isFinite(bottomAngle)) {
      const range = this.sign * (standingAngle - bottomAngle);
      if (range > 20) {
        update.descentOffset = Math.max(8, range * 0.25);
        update.returnOffset = Math.max(5, range * 0.15);
        update.minRangeOfMotion = Math.max(20, range * 0.6);
      }
    }
    this.configure(update);
  }

  // Thresholds in the internal (mirrored) signal space
  get thresholds() {
    const c = this.config;
    const rest = this.sign * c.standingAngle;
    return {
      rest,
      descent: rest - c.descentOffset,
      return: rest - c.returnOffset,
      countable: rest - c.minRangeOfMotion,
    };
  }

  // frame: { angle, timestamp, reliable, hipDrop, activeProbability }
  update(frame) {
    const { angle, timestamp } = frame;
    const reliable = frame.reliable !== false && Number.isFinite(angle);
    const c = this.config;
    let event = null;

    if (!reliable) {
      if (
        this.current &&
        this.lastReliableTime !== null &&
        timestamp - this.lastReliableTime > c.maxDropoutMs
      ) {
        event = this.abortRep("tracking lost");
      }
      return this.snapshot(event);
    }

    this.lastReliableTime = timestamp;
    const t = this.thresholds;
    const x = this.sign * angle;

    if (this.phase === Phase.STANDING) {
      if (x < t.descent) {
        this.pendingFrames += 1;
        if (this.pendingFrames >= c.confirmFrames) {
          this.startRep(x, timestamp);
        }
      } else {
        this.pendingFrames = 0;
        this.adaptStandingAngle(angle);
      }
    }

    if (this.current) {
      this.track(x, frame);

      if (this.phase === Phase.DESCENDING) {
        if (x > this.current.minX + c.bottomHysteresis) {
          this.phase = Phase.ASCENDING;
          this.current.peakX = x;
          this.current.peakTime = timestamp;
        }
      } else if (this.phase === Phase.ASCENDING) {
        if (x <= this.current.minX) {
          // Went deeper again: still the same rep
          this.phase = Phase.DESCENDING;
          this.pendingFrames = 0;
        } else {
          event = this.checkRepEnd(x, timestamp);
        }
      }
    }

    this.lastAngle = angle;
    return this.snapshot(event);
  }

  startRep(x, timestamp) {
    this.phase = Phase.DESCENDING;
    this.pendingFrames = 0;
    this.current = {
      startTime: timestamp,
      minX: x,
      bottomTime: timestamp,
      peakX: x,
      peakTime: timestamp,
      maxHipDrop: null,
      maxActiveProbability: null,
    };
  }

  track(x, { timestamp, hipDrop, activeProbability }) {
    const rep = this.current;

    if (x < rep.minX) {
      rep.minX = x;
      rep.bottomTime = timestamp;
    }
    if (Number.isFinite(hipDrop)) {
      rep.maxHipDrop = Math.max(rep.maxHipDrop ?? -Infinity, hipDrop);
    }
    if (Number.isFinite(activeProbability)) {
      rep.maxActiveProbability = Math.max(rep.maxActiveProbability ?? 0, activeProbability);
    }
  }

  checkRepEnd(x, timestamp) {
    const c = this.config;
    const t = this.thresholds;
    const rep = this.current;

    if (x > rep.peakX + 1) {
      rep.peakX = x;
      rep.peakTime = timestamp;
    }

    if (x >= t.return) {
      this.pendingFrames += 1;
      if (this.pendingFrames >= c.confirmFrames) {
        return this.finishRep(timestamp);
      }
      return null;
    }
    this.pendingFrames = 0;

    // The user got back to rest but never reached the return line, e.g. the
    // rest angle was calibrated too far out. Finish on a plateau instead.
    const nearTop = rep.peakX >= t.rest - 2 * c.returnOffset;
    const plateaued = timestamp - rep.peakTime >= c.plateauMs;
    const climbedMostOfTheWay = rep.peakX - rep.minX >= 0.75 * (t.rest - rep.minX);

    if (nearTop && plateaued && climbedMostOfTheWay) {
      const event = this.finishRep(timestamp);
      this.config.standingAngle = this.sign * (rep.peakX + c.returnOffset / 2);
      return event;
    }
    return null;
  }

  finishRep(timestamp) {
    const c = this.config;
    const t = this.thresholds;
    const rep = this.current;
    const durationMs = timestamp - rep.startTime;
    const rangeOfMotion = t.rest - rep.minX;
    const reachedTarget = rep.minX <= this.sign * c.goodDepthAngle;

    let reason = null;
    if (rangeOfMotion < c.minRangeOfMotion) {
      reason = "not enough range of motion";
    } else if (durationMs < c.minRepMs) {
      reason = "too fast";
    } else if (durationMs > c.maxRepMs) {
      reason = "too slow";
    } else if (rep.maxHipDrop !== null && rep.maxHipDrop < c.minHipDrop) {
      reason = "hips did not drop";
    } else if (
      c.requireClassifier &&
      rep.maxActiveProbability !== null &&
      rep.maxActiveProbability < c.minActiveProbability
    ) {
      reason = "position not recognised";
    }

    const record = {
      index: reason ? null : this.reps + 1,
      counted: !reason,
      reason,
      depthAngle: this.sign * rep.minX,
      reachedTarget,
      depth: c.depthLabels[reachedTarget ? 0 : 1],
      rangeOfMotion,
      durationMs,
      descentMs: rep.bottomTime - rep.startTime,
      ascentMs: timestamp - rep.bottomTime,
      endTime: timestamp,
    };

    if (reason) {
      this.partialReps += 1;
    } else {
      this.reps += 1;
    }
    this.history.push(record);

    this.phase = Phase.STANDING;
    this.current = null;
    this.pendingFrames = 0;

    return { type: reason ? "partial" : "rep", rep: record };
  }

  abortRep(reason) {
    this.phase = Phase.STANDING;
    this.current = null;
    this.pendingFrames = 0;
    return { type: "aborted", reason };
  }

  adaptStandingAngle(angle) {
    const c = this.config;
    if (this.lastAngle === null || Math.abs(angle - this.lastAngle) > 1.5) return;
    c.standingAngle += c.standingAdaptRate * (angle - c.standingAngle);
  }

  // 0 at rest, 1 at the counting range. Useful for a progress bar.
  progress(angle) {
    const c = this.config;
    const range = c.minRangeOfMotion;
    if (!Number.isFinite(angle) || range <= 0) return 0;
    const moved = this.sign * (c.standingAngle - angle);
    return Math.min(1, Math.max(0, moved / range));
  }

  snapshot(event) {
    return {
      reps: this.reps,
      partialReps: this.partialReps,
      phase: this.phase,
      // Kept for backwards compatibility with the old API
      stage: this.phase === Phase.STANDING ? "up" : "down",
      repChanged: event?.type === "rep",
      event,
    };
  }
}

// The counter started out squat-only; keep the old name working
export const SquatRepCounter = RepCounter;

// Backwards-compatible functional API using a shared counter
const defaultCounter = new RepCounter();

export function countSquatRep(angle) {
  return defaultCounter.update({ angle, timestamp: Date.now() });
}

export function resetSquatReps() {
  defaultCounter.reset();
}
