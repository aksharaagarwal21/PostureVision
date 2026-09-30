// Squat rep counter.
//
// A hysteresis state machine on the (smoothed) knee angle:
//
//   STANDING --angle drops below descent line--> DESCENDING
//   DESCENDING --angle rises past bottom + hysteresis--> ASCENDING
//   ASCENDING --angle drops below the bottom again--> DESCENDING (bounce)
//   ASCENDING --back above return line / plateaus near the top--> STANDING
//
// On the way back to STANDING the rep is validated (range of motion, duration,
// hip drop and optionally a trained classifier) and either counted or reported
// as a partial rep. Thresholds are relative to the user's calibrated standing
// angle, so they adapt to different bodies and camera angles.

export const Phase = {
  STANDING: "standing",
  DESCENDING: "descending",
  ASCENDING: "ascending",
};

export const DEFAULT_REP_CONFIG = {
  standingAngle: 170,       // calibrated knee angle when standing tall
  descentOffset: 20,        // descent starts this many degrees below standing
  returnOffset: 12,         // rep ends this many degrees below standing
  minRangeOfMotion: 45,     // standing - deepest angle needed to count a rep
  goodDepthAngle: 100,      // knee angle at or below this counts as parallel
  bottomHysteresis: 8,      // degrees above the deepest point before ascending
  confirmFrames: 2,         // consecutive frames needed to confirm a transition
  plateauMs: 600,           // time near the top that also finishes a rep
  minRepMs: 500,            // faster than this is treated as noise
  maxRepMs: 30000,
  maxDropoutMs: 1500,       // tracking loss longer than this aborts the rep
  minHipDrop: 0.2,          // hip drop at the bottom, in thigh lengths
  requireClassifier: false, // require a trained classifier to see "down"
  minDownProbability: 0.6,
  standingAdaptRate: 0.02,  // how quickly the standing angle tracks the user
};

export class SquatRepCounter {
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

  // Sets thresholds from measured standing and bottom angles
  // (e.g. from calibration or from classifier training samples).
  calibrate({ standingAngle, bottomAngle }) {
    const update = {};
    if (Number.isFinite(standingAngle)) update.standingAngle = standingAngle;

    if (Number.isFinite(standingAngle) && Number.isFinite(bottomAngle)) {
      const range = standingAngle - bottomAngle;
      if (range > 20) {
        update.descentOffset = Math.max(10, range * 0.25);
        update.returnOffset = Math.max(6, range * 0.15);
        update.minRangeOfMotion = Math.max(25, range * 0.6);
      }
    }
    this.configure(update);
  }

  get thresholds() {
    const c = this.config;
    return {
      descent: c.standingAngle - c.descentOffset,
      return: c.standingAngle - c.returnOffset,
      countable: c.standingAngle - c.minRangeOfMotion,
    };
  }

  // frame: { angle, timestamp, reliable, hipDrop, downProbability }
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

    if (this.phase === Phase.STANDING) {
      if (angle < t.descent) {
        this.pendingFrames += 1;
        if (this.pendingFrames >= c.confirmFrames) {
          this.startRep(frame);
        }
      } else {
        this.pendingFrames = 0;
        this.adaptStandingAngle(angle);
      }
    }

    if (this.current) {
      this.track(frame);

      if (this.phase === Phase.DESCENDING) {
        if (angle > this.current.minAngle + c.bottomHysteresis) {
          this.phase = Phase.ASCENDING;
          this.current.peakAngle = angle;
          this.current.peakTime = timestamp;
        }
      } else if (this.phase === Phase.ASCENDING) {
        if (angle <= this.current.minAngle) {
          // Went deeper again: still the same rep
          this.phase = Phase.DESCENDING;
          this.pendingFrames = 0;
        } else {
          event = this.checkRepEnd(frame);
        }
      }
    }

    this.lastAngle = angle;
    return this.snapshot(event);
  }

  startRep({ angle, timestamp }) {
    this.phase = Phase.DESCENDING;
    this.pendingFrames = 0;
    this.current = {
      startTime: timestamp,
      minAngle: angle,
      bottomTime: timestamp,
      peakAngle: angle,
      peakTime: timestamp,
      maxHipDrop: null,
      maxDownProbability: null,
    };
  }

  track({ angle, timestamp, hipDrop, downProbability }) {
    const rep = this.current;

    if (angle < rep.minAngle) {
      rep.minAngle = angle;
      rep.bottomTime = timestamp;
    }
    if (Number.isFinite(hipDrop)) {
      rep.maxHipDrop = Math.max(rep.maxHipDrop ?? -Infinity, hipDrop);
    }
    if (Number.isFinite(downProbability)) {
      rep.maxDownProbability = Math.max(rep.maxDownProbability ?? 0, downProbability);
    }
  }

  checkRepEnd({ angle, timestamp }) {
    const c = this.config;
    const t = this.thresholds;
    const rep = this.current;

    if (angle > rep.peakAngle + 1) {
      rep.peakAngle = angle;
      rep.peakTime = timestamp;
    }

    if (angle >= t.return) {
      this.pendingFrames += 1;
      if (this.pendingFrames >= c.confirmFrames) {
        return this.finishRep(timestamp);
      }
      return null;
    }
    this.pendingFrames = 0;

    // The user stood up but never reached the return line, e.g. the standing
    // angle was calibrated too high. Finish on a plateau near the top instead.
    const nearTop = rep.peakAngle >= c.standingAngle - 2 * c.returnOffset;
    const plateaued = timestamp - rep.peakTime >= c.plateauMs;
    const climbedMostOfTheWay =
      rep.peakAngle - rep.minAngle >= 0.75 * (c.standingAngle - rep.minAngle);

    if (nearTop && plateaued && climbedMostOfTheWay) {
      const event = this.finishRep(timestamp);
      this.config.standingAngle = rep.peakAngle + c.returnOffset / 2;
      return event;
    }
    return null;
  }

  finishRep(timestamp) {
    const c = this.config;
    const rep = this.current;
    const durationMs = timestamp - rep.startTime;
    const rangeOfMotion = c.standingAngle - rep.minAngle;

    let reason = null;
    if (rangeOfMotion < c.minRangeOfMotion) {
      reason = "not deep enough";
    } else if (durationMs < c.minRepMs) {
      reason = "too fast";
    } else if (durationMs > c.maxRepMs) {
      reason = "too slow";
    } else if (rep.maxHipDrop !== null && rep.maxHipDrop < c.minHipDrop) {
      reason = "hips did not drop";
    } else if (
      c.requireClassifier &&
      rep.maxDownProbability !== null &&
      rep.maxDownProbability < c.minDownProbability
    ) {
      reason = "bottom position not recognised";
    }

    const record = {
      index: reason ? null : this.reps + 1,
      counted: !reason,
      reason,
      depthAngle: rep.minAngle,
      depth: rep.minAngle <= c.goodDepthAngle ? "parallel" : "above parallel",
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

  // 0 at standing, 1 at the counting depth. Useful for a progress bar.
  progress(angle) {
    const c = this.config;
    const range = c.minRangeOfMotion;
    if (!Number.isFinite(angle) || range <= 0) return 0;
    return Math.min(1, Math.max(0, (c.standingAngle - angle) / range));
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

// Backwards-compatible functional API using a shared counter
const defaultCounter = new SquatRepCounter();

export function countSquatRep(angle) {
  return defaultCounter.update({ angle, timestamp: Date.now() });
}

export function resetSquatReps() {
  defaultCounter.reset();
}
