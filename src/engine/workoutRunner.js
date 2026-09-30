// Runs a workout plan: get ready -> set -> rest -> next set ... -> done.
//
// Pure timing logic. The caller passes the current time and live numbers from
// the WorkoutSession (reps, form score, hold time) to update(); it returns
// events the UI and voice can react to, and records the result of each set.

import { planSteps } from "./workoutPlan";
import { getExercise } from "./exercises";
import { exerciseCalories, restCalories } from "./calories";

export const RunPhase = {
  IDLE: "idle",
  GET_READY: "get_ready",
  WORK: "work",
  REST: "rest",
  DONE: "done",
};

export const FIRST_GET_READY_SEC = 10;
export const NEXT_SET_GET_READY_SEC = 5;

export class WorkoutRunner {
  constructor(plan, { weightKg = 0, clock = () => Date.now() } = {}) {
    this.plan = plan;
    this.steps = planSteps(plan);
    this.weightKg = weightKg;
    this.clock = clock;
    this.phase = RunPhase.IDLE;
    this.stepIndex = 0;
    this.results = [];
    this.activeMs = 0;
    this.restMs = 0;
    this.kcal = 0;
    this.paused = false;
    this.live = {};
  }

  get step() {
    return this.steps[this.stepIndex] ?? null;
  }

  get nextStep() {
    return this.steps[this.stepIndex + 1] ?? null;
  }

  start(now) {
    this.startedAt = this.clock();
    this.startTime = now;
    this.pausedTotal = 0;
    return [this.enter(RunPhase.GET_READY, now, FIRST_GET_READY_SEC)];
  }

  // --- Phase handling -------------------------------------------------------

  enter(phase, now, durationSec = null) {
    this.phase = phase;
    this.phaseStart = now;
    this.phasePaused = 0;
    this.phaseDurationMs = durationSec === null ? null : durationSec * 1000;
    this.lastSecondLeft = null;
    this.halfwayAnnounced = false;
    return { type: phase, step: this.step, next: this.nextStep, durationSec };
  }

  phaseElapsed(now) {
    const pausedNow = this.paused ? now - this.pausedAt : 0;
    return now - this.phaseStart - this.phasePaused - pausedNow;
  }

  remainingMs(now) {
    if (this.phaseDurationMs === null) return null;
    return Math.max(0, this.phaseDurationMs - this.phaseElapsed(now));
  }

  // Time left in a timed set (holds only count time spent in position)
  workRemainingMs(now) {
    const step = this.step;
    if (this.phase !== RunPhase.WORK || step?.targetType !== "time") return null;
    return Math.max(0, step.seconds * 1000 - this.workProgressMs(now));
  }

  workProgressMs(now) {
    const hold = getExercise(this.step.exerciseId).kind === "hold";
    return hold ? this.live.holdMs ?? 0 : this.phaseElapsed(now);
  }

  secondTicks(remainingMs, events) {
    const secondsLeft = Math.ceil(remainingMs / 1000);
    if (secondsLeft !== this.lastSecondLeft && secondsLeft > 0) {
      this.lastSecondLeft = secondsLeft;
      events.push({ type: "tick", phase: this.phase, secondsLeft, step: this.step });
    }
  }

  // live: { reps, partialReps, formScore, averageFormScore, holdMs, goodFormMs }
  update(now, live = {}) {
    const events = [];
    if (this.paused || this.phase === RunPhase.IDLE || this.phase === RunPhase.DONE) return events;

    if (this.phase === RunPhase.GET_READY || this.phase === RunPhase.REST) {
      const remaining = this.remainingMs(now);
      this.secondTicks(remaining, events);
      if (remaining <= 0) events.push(this.beginWork(now));
      return events;
    }

    // WORK
    this.live = { ...live };
    const step = this.step;
    if (step.targetType === "reps") {
      if ((live.reps ?? 0) >= step.reps) events.push(...this.finishSet(now, "target"));
    } else {
      const remaining = this.workRemainingMs(now);
      this.secondTicks(remaining, events);
      if (!this.halfwayAnnounced && remaining <= (step.seconds * 1000) / 2 && step.seconds >= 20) {
        this.halfwayAnnounced = true;
        events.push({ type: "halfway", step });
      }
      if (remaining <= 0) events.push(...this.finishSet(now, "target"));
    }
    return events;
  }

  beginWork(now) {
    this.restMs += this.phaseElapsed(now);
    this.kcal += restCalories(this.weightKg, this.phaseElapsed(now));
    this.live = {};
    return this.enter(RunPhase.WORK, now);
  }

  finishSet(now, reason) {
    const step = this.step;
    const durationMs = this.phaseElapsed(now);
    const calories = exerciseCalories(step.exerciseId, this.weightKg, durationMs);
    this.activeMs += durationMs;
    this.kcal += calories;

    const live = this.live;
    const result = {
      exerciseId: step.exerciseId,
      set: step.set,
      totalSets: step.totalSets,
      targetType: step.targetType,
      target: step.targetType === "time" ? step.seconds : step.reps,
      reps: live.reps ?? 0,
      partialReps: live.partialReps ?? 0,
      holdMs: live.holdMs ?? 0,
      formScore: live.averageFormScore ?? live.formScore ?? null,
      durationMs,
      kcal: calories,
      completed: reason === "target",
      reason,
    };
    // Skipping an exercise before starting it leaves nothing to record
    const nothingDone = reason === "skipped_exercise" && !(result.reps > 0) && durationMs < 2000;
    if (!nothingDone) this.results.push(result);

    const events = [{ type: "set_complete", result }];
    const restSec = reason === "skipped_exercise" ? this.plan.restBetweenExercisesSec : step.restAfterSec;

    if (this.stepIndex >= this.steps.length - 1) {
      events.push(this.finish(now));
      return events;
    }

    this.stepIndex += 1;
    if (restSec > 0) {
      events.push(this.enter(RunPhase.REST, now, restSec));
    } else {
      events.push(this.enter(RunPhase.GET_READY, now, NEXT_SET_GET_READY_SEC));
    }
    return events;
  }

  finish(now) {
    this.phase = RunPhase.DONE;
    this.endTime = now;
    return { type: "done", summary: this.summary(now) };
  }

  // --- Controls -----------------------------------------------------------

  // "I'm done with this set" (e.g. can't do more reps)
  completeSet(now) {
    if (this.phase !== RunPhase.WORK) return [];
    return this.finishSet(now, "manual");
  }

  // Skip the rest of this exercise and move to the next one
  skipExercise(now) {
    if (this.phase === RunPhase.DONE) return [];
    const itemIndex = this.step.itemIndex;
    if (this.phase !== RunPhase.WORK) {
      this.restMs += this.phaseElapsed(now);
      this.phase = RunPhase.WORK;
      this.phaseStart = now;
      this.phasePaused = 0;
    }
    // Jump to the last set of this exercise, then finish it as skipped
    while (this.nextStep && this.nextStep.itemIndex === itemIndex) this.stepIndex += 1;
    return this.finishSet(now, "skipped_exercise");
  }

  skipRest(now) {
    if (this.phase !== RunPhase.REST && this.phase !== RunPhase.GET_READY) return [];
    return [this.beginWork(now)];
  }

  extendRest(seconds) {
    if (this.phase === RunPhase.REST || this.phase === RunPhase.GET_READY) {
      this.phaseDurationMs += seconds * 1000;
    }
  }

  pause(now) {
    if (this.paused || this.phase === RunPhase.DONE) return;
    this.paused = true;
    this.pausedAt = now;
  }

  resume(now) {
    if (!this.paused) return;
    const pausedFor = now - this.pausedAt;
    this.phasePaused += pausedFor;
    this.pausedTotal += pausedFor;
    this.paused = false;
  }

  // End the workout early, keeping what was done
  end(now) {
    if (this.phase === RunPhase.DONE) return [];
    if (this.paused) this.resume(now);
    if (this.phase === RunPhase.WORK && this.phaseElapsed(now) > 2000) {
      const events = [];
      const durationMs = this.phaseElapsed(now);
      this.activeMs += durationMs;
      const calories = exerciseCalories(this.step.exerciseId, this.weightKg, durationMs);
      this.kcal += calories;
      this.results.push({
        exerciseId: this.step.exerciseId,
        set: this.step.set,
        totalSets: this.step.totalSets,
        targetType: this.step.targetType,
        target: this.step.targetType === "time" ? this.step.seconds : this.step.reps,
        reps: this.live.reps ?? 0,
        partialReps: this.live.partialReps ?? 0,
        holdMs: this.live.holdMs ?? 0,
        formScore: this.live.averageFormScore ?? this.live.formScore ?? null,
        durationMs,
        kcal: calories,
        completed: false,
        reason: "ended",
      });
      events.push(this.finish(now));
      return events;
    }
    return [this.finish(now)];
  }

  // --- Reporting ----------------------------------------------------------

  elapsedMs(now) {
    const end = this.phase === RunPhase.DONE ? this.endTime : now;
    const pausedNow = this.paused ? now - this.pausedAt : 0;
    return Math.max(0, end - this.startTime - this.pausedTotal - pausedNow);
  }

  // Calories so far, including the set in progress
  caloriesSoFar(now) {
    if (this.phase === RunPhase.WORK) {
      return this.kcal + exerciseCalories(this.step.exerciseId, this.weightKg, this.phaseElapsed(now));
    }
    if (this.phase === RunPhase.REST || this.phase === RunPhase.GET_READY) {
      return this.kcal + restCalories(this.weightKg, this.phaseElapsed(now));
    }
    return this.kcal;
  }

  summary(now) {
    const byExercise = new Map();
    for (const r of this.results) {
      if (!byExercise.has(r.exerciseId)) {
        byExercise.set(r.exerciseId, {
          exerciseId: r.exerciseId,
          sets: 0,
          reps: 0,
          holdMs: 0,
          bestSetReps: 0,
          bestHoldMs: 0,
          formScores: [],
        });
      }
      const e = byExercise.get(r.exerciseId);
      e.sets += 1;
      e.reps += r.reps;
      e.holdMs += r.holdMs;
      e.bestSetReps = Math.max(e.bestSetReps, r.reps);
      e.bestHoldMs = Math.max(e.bestHoldMs, r.holdMs);
      if (Number.isFinite(r.formScore)) e.formScores.push(r.formScore);
    }

    const exercises = [...byExercise.values()].map(({ formScores, ...e }) => ({
      ...e,
      avgFormScore: formScores.length
        ? Math.round(formScores.reduce((a, b) => a + b, 0) / formScores.length)
        : null,
    }));
    const scores = this.results.map((r) => r.formScore).filter(Number.isFinite);

    return {
      planName: this.plan.name,
      startedAt: this.startedAt,
      durationMs: this.elapsedMs(now),
      activeMs: this.activeMs,
      restMs: this.restMs,
      kcal: Math.round(this.kcal * 10) / 10,
      totalReps: this.results.reduce((sum, r) => sum + r.reps, 0),
      setsCompleted: this.results.filter((r) => r.completed).length,
      setsPlanned: this.steps.length,
      avgFormScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      exercises,
      sets: this.results,
    };
  }
}
