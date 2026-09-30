import { describe, it, expect } from "vitest";
import { WorkoutRunner, RunPhase, FIRST_GET_READY_SEC } from "../src/engine/workoutRunner";
import { createPlanItem, Target } from "../src/engine/workoutPlan";

const plan = () => ({
  name: "Test",
  items: [
    createPlanItem("squat", { sets: 2, reps: 5, restSec: 20 }),
    createPlanItem("plank", { sets: 1, seconds: 30, targetType: Target.TIME }),
  ],
  restBetweenExercisesSec: 60,
});

// Drive the runner second by second
function advance(runner, from, seconds, live = () => ({})) {
  const events = [];
  let t = from;
  for (let i = 0; i < seconds * 10; i++) {
    t += 100;
    events.push(...runner.update(t, live(t)));
  }
  return { t, events };
}

describe("WorkoutRunner", () => {
  it("counts down, then starts the first set", () => {
    const runner = new WorkoutRunner(plan(), { weightKg: 70 });
    const [first] = runner.start(0);
    expect(first.type).toBe(RunPhase.GET_READY);
    const { events } = advance(runner, 0, FIRST_GET_READY_SEC + 0.2);
    expect(events.filter((e) => e.type === "tick").map((e) => e.secondsLeft).slice(-3)).toEqual([3, 2, 1]);
    expect(runner.phase).toBe(RunPhase.WORK);
    expect(runner.step).toMatchObject({ exerciseId: "squat", set: 1 });
  });

  it("finishes a set when the rep target is reached, then rests", () => {
    const runner = new WorkoutRunner(plan(), { weightKg: 70 });
    runner.start(0);
    let { t } = advance(runner, 0, 11);
    const events = runner.update((t += 100), { reps: 5, averageFormScore: 90 });
    expect(events.map((e) => e.type)).toEqual(["set_complete", RunPhase.REST]);
    expect(events[0].result).toMatchObject({ reps: 5, completed: true, formScore: 90 });
    expect(events[1].durationSec).toBe(20);
    expect(runner.step).toMatchObject({ exerciseId: "squat", set: 2 });
  });

  it("uses the longer rest before the next exercise", () => {
    const runner = new WorkoutRunner(plan());
    runner.start(0);
    let { t } = advance(runner, 0, 11);
    runner.update((t += 100), { reps: 5 });
    ({ t } = advance(runner, t, 21));
    const events = runner.update((t += 100), { reps: 5 });
    const rest = events.find((e) => e.type === RunPhase.REST);
    expect(rest.durationSec).toBe(60);
    expect(rest.step.exerciseId).toBe("plank");
  });

  it("times a plank by the time actually spent holding", () => {
    const runner = new WorkoutRunner(plan());
    runner.start(0);
    let { t } = advance(runner, 0, 11);
    runner.update((t += 100), { reps: 5 });
    ({ t } = advance(runner, t, 21));
    runner.update((t += 100), { reps: 5 });
    ({ t } = advance(runner, t, 61));
    expect(runner.step.exerciseId).toBe("plank");

    // Only holding for half of the elapsed time
    const start = t;
    const result = advance(runner, t, 70, (now) => ({ holdMs: (now - start) / 2 }));
    const done = result.events.find((e) => e.type === "done");
    expect(done).toBeTruthy();
    expect(result.events.some((e) => e.type === "halfway")).toBe(true);
    expect(done.summary.sets.at(-1)).toMatchObject({ exerciseId: "plank", completed: true });
    expect(done.summary.sets.at(-1).durationMs).toBeGreaterThan(55_000);
  });

  it("can extend or skip a rest", () => {
    const runner = new WorkoutRunner(plan());
    runner.start(0);
    let { t } = advance(runner, 0, 11);
    runner.update((t += 100), { reps: 5 });
    runner.extendRest(20);
    expect(runner.remainingMs(t)).toBe(40_000);
    runner.skipRest(t);
    expect(runner.phase).toBe(RunPhase.WORK);
  });

  it("does not count time while paused", () => {
    const runner = new WorkoutRunner(plan());
    runner.start(0);
    runner.pause(1000);
    expect(runner.update(50_000)).toEqual([]);
    runner.resume(50_000);
    expect(runner.phase).toBe(RunPhase.GET_READY);
    expect(runner.elapsedMs(50_000)).toBe(1000);
  });

  it("skips the rest of an exercise", () => {
    const runner = new WorkoutRunner(plan());
    runner.start(0);
    const { t } = advance(runner, 0, 11);
    const events = runner.skipExercise(t + 5000);
    expect(events.find((e) => e.type === RunPhase.REST).step.exerciseId).toBe("plank");
  });

  it("summarizes the workout when ended early", () => {
    const runner = new WorkoutRunner(plan(), { weightKg: 70 });
    runner.start(0);
    let { t } = advance(runner, 0, 11);
    runner.update((t += 100), { reps: 5, averageFormScore: 80 });
    ({ t } = advance(runner, t, 21, () => ({ reps: 3, averageFormScore: 70 })));
    ({ t } = advance(runner, t, 5, () => ({ reps: 3, averageFormScore: 70 })));
    const [done] = runner.end(t);
    expect(done.type).toBe("done");
    expect(done.summary.totalReps).toBe(8);
    expect(done.summary.setsCompleted).toBe(1);
    expect(done.summary.exercises[0]).toMatchObject({ exerciseId: "squat", sets: 2, reps: 8, avgFormScore: 75 });
    expect(done.summary.kcal).toBeGreaterThan(0);
  });
});
