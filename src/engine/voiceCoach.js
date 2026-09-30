// Voice guidance during a workout.
//
// Decides what to say from the session state: the rep count with a verdict
// on each rep ("5. Good rep" / "6. Go deeper"), live corrections for form
// mistakes, positioning help, milestones and hold timing. Speaking is done by
// an injected function so the logic can be tested without a browser.

const GOOD_REP = ["Good rep", "Nice", "Great form", "Perfect", "Well done"];

const LIVE_ERROR_COOLDOWN_MS = 5000;   // same mistake
const LIVE_WARNING_COOLDOWN_MS = 10000;
const MIN_GAP_MS = 1800;               // between any two live cues
const POSITION_DELAY_MS = 2500;        // wait before helping with position
const POSITION_COOLDOWN_MS = 10000;
const HOLD_CALLOUT_EVERY_MS = 10000;

export class VoiceCoach {
  // speak(text, { interrupt }) returns false if it could not speak right now.
  // announceReady: say "Ready" when tracking starts (off in guided workouts,
  // where the workout itself says "Go").
  constructor(speak, { announceReady = true } = {}) {
    this.speak = speak;
    this.announceReady = announceReady;
    this.reset();
  }

  reset() {
    this.lastSpoken = -Infinity;
    this.lastSaidById = new Map();
    this.activeIssues = new Set();
    this.lastStatus = null;
    this.statusSince = 0;
    this.lastPositionMessageAt = -Infinity;
    this.announcedReady = false;
    this.nextHoldCallout = HOLD_CALLOUT_EVERY_MS;
    this.goodIndex = 0;
  }

  say(text, now, { interrupt = false } = {}) {
    const spoken = this.speak(text, { interrupt });
    if (spoken !== false) this.lastSpoken = now;
    return spoken !== false;
  }

  // Call when the user picks an exercise
  introduce(exercise, now) {
    this.reset();
    this.say(`${exercise.name}. ${exercise.camera}.`, now, { interrupt: true });
  }

  update(state, exercise, now) {
    if (!state) return;

    if (state.status !== this.lastStatus) {
      this.lastStatus = state.status;
      this.statusSince = now;
    }

    if (state.status !== "active") {
      this.activeIssues.clear();
      this.positionHelp(state, now);
      return;
    }

    if (!this.announcedReady) {
      this.announcedReady = true;
      if (!this.announceReady) return;
      const text = exercise.kind === "hold" ? `Good. Hold your ${exercise.name.toLowerCase()}` : "Ready. Start now";
      this.say(text, now, { interrupt: true });
      return;
    }

    const event = state.event;
    if (event?.type === "rep") {
      this.say(this.repVerdict(event.rep, state.reps, exercise), now, { interrupt: true });
      return;
    }
    if (event?.type === "partial") {
      this.say(this.partialVerdict(event.rep, exercise), now, { interrupt: true });
      return;
    }
    if (event?.type === "hold_end" && event.durationMs > 3000) {
      this.say(`Rest. You held for ${Math.round(event.durationMs / 1000)} seconds`, now, { interrupt: true });
      this.nextHoldCallout = HOLD_CALLOUT_EVERY_MS;
      return;
    }

    if (state.hold?.holding) {
      if (state.hold.currentMs >= this.nextHoldCallout) {
        this.say(`${Math.round(this.nextHoldCallout / 1000)} seconds`, now);
        this.nextHoldCallout += HOLD_CALLOUT_EVERY_MS;
        return;
      }
    } else if (state.hold) {
      this.nextHoldCallout = HOLD_CALLOUT_EVERY_MS;
    }

    this.liveCorrections(state.issues ?? [], now);
  }

  repVerdict(rep, reps, exercise) {
    const mainIssue = rep.issues?.[0];
    let verdict;
    if (mainIssue) {
      verdict = mainIssue.voice;
    } else if (!rep.reachedTarget) {
      verdict = exercise.targetVoice;
    } else {
      verdict = GOOD_REP[this.goodIndex++ % GOOD_REP.length];
    }
    const milestone = reps % 5 === 0 ? `. ${reps} done, keep going` : "";
    return `${reps}. ${verdict}${milestone}`;
  }

  partialVerdict(rep, exercise) {
    if (rep.reason === "not enough range of motion") return `Not counted. ${exercise.targetVoice}`;
    if (rep.reason === "too fast") return "Not counted. Slow down";
    return "Not counted";
  }

  liveCorrections(issues, now) {
    const current = new Set(issues.map((i) => i.id));
    const ordered = [...issues]
      .filter((i) => i.severity === "error" || i.severity === "warning")
      .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

    for (const issue of ordered) {
      const isNew = !this.activeIssues.has(issue.id);
      const cooldown = issue.severity === "error" ? LIVE_ERROR_COOLDOWN_MS : LIVE_WARNING_COOLDOWN_MS;
      const lastSaid = this.lastSaidById.get(issue.id) ?? -Infinity;
      const due = now - lastSaid >= cooldown && (isNew || issue.severity === "error");

      if (due && now - this.lastSpoken >= MIN_GAP_MS) {
        if (this.say(issue.voice, now)) this.lastSaidById.set(issue.id, now);
        break;
      }
    }
    this.activeIssues = current;
  }

  positionHelp(state, now) {
    if (!state.message) return;
    if (now - this.statusSince < POSITION_DELAY_MS) return;
    if (now - this.lastPositionMessageAt < POSITION_COOLDOWN_MS) return;
    if (this.say(state.message, now)) this.lastPositionMessageAt = now;
  }
}

// Speaks through the browser's speech synthesis
export function createBrowserSpeaker() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return () => false;
  }
  const synth = window.speechSynthesis;

  // interrupt: cut off whatever is being said
  // queue: say it after the current speech instead of dropping it
  return (text, { interrupt = false, queue = false } = {}) => {
    if (interrupt) {
      synth.cancel();
    } else if (!queue && (synth.speaking || synth.pending)) {
      return false;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.lang = "en-US";
    synth.speak(utterance);
    return true;
  };
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
