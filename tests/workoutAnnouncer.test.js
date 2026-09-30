import { describe, it, expect } from "vitest";
import { announce } from "../src/engine/workoutAnnouncer";

const squatSet = (set) => ({ exerciseId: "squat", set, totalSets: 3, targetType: "reps", reps: 12, seconds: 30 });
const plankSet = { exerciseId: "plank", set: 1, totalSets: 2, targetType: "time", reps: 10, seconds: 30 };
const texts = (events) => announce(events).map((a) => a.text);

describe("workout announcements", () => {
  it("introduces a new exercise", () => {
    expect(texts([{ type: "get_ready", step: squatSet(1) }])).toEqual(["Get ready. Squat. 3 sets of 12 reps."]);
  });

  it("counts down the last three seconds", () => {
    expect(texts([{ type: "tick", phase: "rest", secondsLeft: 3 }])).toEqual(["3"]);
    expect(texts([{ type: "tick", phase: "rest", secondsLeft: 10 }])).toEqual(["10 seconds left"]);
    expect(texts([{ type: "tick", phase: "rest", secondsLeft: 7 }])).toEqual([]);
  });

  it("says what's next after the last set of an exercise", () => {
    const events = [
      { type: "set_complete", result: { exerciseId: "squat" } },
      { type: "rest", step: plankSet, durationSec: 60 },
    ];
    expect(texts(events)).toEqual(["Set complete. Rest 60 seconds. Next up: Plank, 30 seconds."]);
  });

  it("only says rest between sets of the same exercise", () => {
    const events = [
      { type: "set_complete", result: { exerciseId: "squat" } },
      { type: "rest", step: squatSet(2), durationSec: 30 },
    ];
    expect(texts(events)).toEqual(["Set complete. Rest 30 seconds."]);
  });

  it("queues the rest announcement after the last rep count", () => {
    const [rest] = announce([
      { type: "set_complete", result: { exerciseId: "squat" } },
      { type: "rest", step: squatSet(2), durationSec: 30 },
    ]);
    expect(rest).toMatchObject({ interrupt: false, queue: true });
  });

  it("wraps up the workout", () => {
    const [done] = texts([{ type: "done", summary: { totalReps: 42, kcal: 61.4 } }]);
    expect(done).toBe("Workout complete! Great job. You did 42 reps and burned about 61 calories.");
    expect(texts([{ type: "done", summary: { totalReps: 0, kcal: 12 } }])).toEqual([
      "Workout complete! Great job. You burned about 12 calories.",
    ]);
  });

  it("starts the warm-up and marks when it's done", () => {
    const warm = { exerciseId: "arm_circles", section: "warmup", itemIndex: 0, set: 1, totalSets: 1, targetType: "time", seconds: 30 };
    expect(texts([{ type: "get_ready", step: warm }])).toEqual([
      "Let's warm up. Get ready. Arm circles. 1 set of 30 seconds.",
    ]);
    const events = [
      { type: "set_complete", result: { exerciseId: "high_knees", section: "warmup" } },
      { type: "rest", step: { ...squatSet(1), section: "main" }, durationSec: 60 },
    ];
    expect(texts(events)).toEqual([
      "Warm-up done! Rest 60 seconds, then the main workout. Next up: Squat, 12 reps.",
    ]);
  });
});
