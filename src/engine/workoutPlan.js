// Personal workout plans: which exercises, how many sets, reps or seconds
// per set, and how long to rest between sets and between exercises.

import { EXERCISES_BY_ID, getExercise } from "./exercises";
import { exerciseCalories, restCalories } from "./calories";

export const Target = { REPS: "reps", TIME: "time" };

export const LIMITS = {
  sets: [1, 10],
  reps: [1, 100],
  seconds: [5, 600],
  restSec: [0, 600],
};

const SETUP_SEC_PER_SET = 5; // getting into position

let uidCounter = 0;
const uid = () => `item-${Date.now().toString(36)}-${++uidCounter}`;

const clampInt = (value, [min, max], fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function createPlanItem(exerciseId, overrides = {}) {
  const exercise = getExercise(exerciseId);
  const hold = exercise.kind === "hold";
  return {
    uid: uid(),
    exerciseId: exercise.id,
    sets: 3,
    targetType: hold ? Target.TIME : Target.REPS,
    reps: 10,
    seconds: 30,
    restSec: 30,
    ...overrides,
  };
}

const item = (exerciseId, sets, amount, restSec, targetType = Target.REPS) =>
  createPlanItem(exerciseId, {
    sets,
    targetType,
    ...(targetType === Target.TIME ? { seconds: amount } : { reps: amount }),
    restSec,
  });

export const TEMPLATES = [
  {
    id: "beginner",
    name: "Beginner full body",
    description: "A gentle all-round start",
    build: () => [
      item("squat", 3, 10, 45),
      item("pushup", 3, 8, 45),
      item("glute_bridge", 3, 12, 30),
      item("plank", 3, 20, 30, Target.TIME),
    ],
    restBetweenExercisesSec: 60,
  },
  {
    id: "upper",
    name: "Upper body",
    description: "Chest, arms and shoulders",
    build: () => [
      item("pushup", 3, 10, 60),
      item("curl", 3, 12, 45),
      item("press", 3, 10, 60),
      item("lateral_raise", 3, 12, 45),
    ],
    restBetweenExercisesSec: 75,
  },
  {
    id: "lower",
    name: "Lower body",
    description: "Legs and glutes",
    build: () => [
      item("squat", 4, 12, 60),
      item("lunge", 3, 10, 60),
      item("glute_bridge", 3, 15, 45),
    ],
    restBetweenExercisesSec: 75,
  },
  {
    id: "core_cardio",
    name: "Core and cardio",
    description: "Get your heart rate up",
    build: () => [
      item("jumping_jack", 3, 40, 30, Target.TIME),
      item("situp", 3, 15, 30),
      item("plank", 3, 30, 30, Target.TIME),
    ],
    restBetweenExercisesSec: 45,
  },
];

export function planFromTemplate(templateId) {
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  return {
    name: template.name,
    items: template.build(),
    restBetweenExercisesSec: template.restBetweenExercisesSec,
  };
}

// Returns a valid copy of a plan (e.g. one loaded from storage or edited)
export function sanitizePlan(plan) {
  const items = (plan?.items ?? [])
    .filter((i) => EXERCISES_BY_ID[i?.exerciseId])
    .map((i) => {
      const hold = getExercise(i.exerciseId).kind === "hold";
      return {
        uid: i.uid ?? uid(),
        exerciseId: i.exerciseId,
        sets: clampInt(i.sets, LIMITS.sets, 3),
        targetType: hold ? Target.TIME : i.targetType === Target.TIME ? Target.TIME : Target.REPS,
        reps: clampInt(i.reps, LIMITS.reps, 10),
        seconds: clampInt(i.seconds, LIMITS.seconds, 30),
        restSec: clampInt(i.restSec, LIMITS.restSec, 30),
      };
    });

  return {
    name: String(plan?.name ?? "My workout").slice(0, 60) || "My workout",
    items,
    restBetweenExercisesSec: clampInt(plan?.restBetweenExercisesSec, LIMITS.restSec, 60),
  };
}

// One entry per set, in order, with the rest that follows it
export function planSteps(plan) {
  const steps = [];
  plan.items.forEach((it, itemIndex) => {
    for (let set = 1; set <= it.sets; set++) {
      const lastSet = set === it.sets;
      const lastItem = itemIndex === plan.items.length - 1;
      steps.push({
        itemIndex,
        exerciseId: it.exerciseId,
        set,
        totalSets: it.sets,
        targetType: it.targetType,
        reps: it.reps,
        seconds: it.seconds,
        restAfterSec: lastSet ? (lastItem ? 0 : plan.restBetweenExercisesSec) : it.restSec,
      });
    }
  });
  return steps;
}

export function describeTarget(step) {
  return step.targetType === Target.TIME ? `${step.seconds} seconds` : `${step.reps} reps`;
}

export function setWorkSeconds(step) {
  if (step.targetType === Target.TIME) return step.seconds;
  return step.reps * (getExercise(step.exerciseId).secondsPerRep ?? 3);
}

export function estimatePlan(plan, weightKg) {
  let activeSec = 0;
  let restSec = 0;
  let calories = 0;
  for (const step of planSteps(plan)) {
    const work = setWorkSeconds(step);
    activeSec += work;
    restSec += step.restAfterSec + SETUP_SEC_PER_SET;
    calories += exerciseCalories(step.exerciseId, weightKg, work * 1000);
    calories += restCalories(weightKg, (step.restAfterSec + SETUP_SEC_PER_SET) * 1000);
  }
  return {
    totalSec: activeSec + restSec,
    activeSec,
    restSec,
    kcal: calories,
    sets: planSteps(plan).length,
  };
}

export function formatDuration(totalSec) {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
