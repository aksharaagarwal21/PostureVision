import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  Target,
  planFromTemplate,
  sanitizePlan,
  planSteps,
  estimatePlan,
  createPlanItem,
  formatDuration,
  standardWarmup,
} from "../src/engine/workoutPlan";

describe("workout plans", () => {
  it("builds every template into a valid plan", () => {
    for (const t of TEMPLATES) {
      const plan = planFromTemplate(t.id);
      const clean = sanitizePlan(plan);
      expect(clean.items).toHaveLength(plan.items.length);
      expect(clean.warmup).toHaveLength(plan.warmup.length);
      // Every template starts with a warm-up
      expect(plan.warmup.length).toBeGreaterThan(0);
      expect(planSteps(plan).length).toBeGreaterThan(0);
    }
  });

  it("forces the plank to be timed", () => {
    expect(createPlanItem("plank").targetType).toBe(Target.TIME);
    const plan = sanitizePlan({ items: [{ exerciseId: "plank", targetType: "reps", sets: 2 }] });
    expect(plan.items[0].targetType).toBe(Target.TIME);
  });

  it("clamps bad input and drops unknown exercises", () => {
    const plan = sanitizePlan({
      name: "",
      items: [
        { exerciseId: "squat", sets: 99, reps: -5, restSec: "abc" },
        { exerciseId: "not_real", sets: 3 },
      ],
      restBetweenExercisesSec: 5000,
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ sets: 10, reps: 1, restSec: 30 });
    expect(plan.restBetweenExercisesSec).toBe(600);
    expect(plan.name).toBe("My workout");
  });

  it("puts set rest between sets and exercise rest between exercises", () => {
    const plan = {
      items: [
        createPlanItem("squat", { sets: 2, restSec: 20 }),
        createPlanItem("pushup", { sets: 2, restSec: 40 }),
      ],
      restBetweenExercisesSec: 90,
    };
    expect(planSteps(plan).map((s) => s.restAfterSec)).toEqual([20, 90, 40, 0]);
    expect(planSteps(plan).map((s) => `${s.exerciseId}${s.set}/${s.totalSets}`)).toEqual([
      "squat1/2", "squat2/2", "pushup1/2", "pushup2/2",
    ]);
  });

  it("estimates time and calories", () => {
    const plan = {
      items: [createPlanItem("squat", { sets: 3, reps: 10, restSec: 30 })],
      restBetweenExercisesSec: 60,
    };
    const est = estimatePlan(plan, 70);
    // 3 sets x 10 reps x 3 s + rests (30 + 30 + 0) + setup
    expect(est.activeSec).toBe(90);
    expect(est.totalSec).toBe(90 + 60 + 15);
    expect(est.kcal).toBeGreaterThan(5);
    expect(est.kcal).toBeLessThan(20);
  });

  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("runs the warm-up first with short rests, then the workout", () => {
    const plan = {
      warmup: [createPlanItem("arm_circles", { sets: 1, restSec: 0 }), createPlanItem("high_knees", { sets: 1, restSec: 0 })],
      warmupRestSec: 10,
      items: [createPlanItem("squat", { sets: 2, restSec: 30 })],
      restBetweenExercisesSec: 60,
    };
    const steps = planSteps(plan);
    expect(steps.map((s) => `${s.section}:${s.exerciseId}`)).toEqual([
      "warmup:arm_circles", "warmup:high_knees", "main:squat", "main:squat",
    ]);
    expect(steps.map((s) => s.restAfterSec)).toEqual([10, 60, 30, 0]);
    expect(steps.map((s) => s.itemIndex)).toEqual([0, 1, 2, 2]);
  });

  it("builds a warm-up from warm-up exercises only", () => {
    const warmup = standardWarmup();
    expect(warmup.length).toBeGreaterThanOrEqual(5);
    for (const it of warmup) expect(it.sets).toBe(1);
  });

  it("keeps old saved plans without a warm-up working", () => {
    const plan = sanitizePlan({ items: [{ exerciseId: "squat", sets: 2 }] });
    expect(plan.warmup).toEqual([]);
    expect(planSteps(plan)).toHaveLength(2);
  });
});
