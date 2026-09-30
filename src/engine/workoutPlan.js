// Personal workout plans: an optional warm-up, then the main exercises, with
// sets, reps or seconds per set, and rest between sets and between exercises.

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

export const DEFAULT_WARMUP_REST_SEC = 10;

const item = (exerciseId, sets, amount, restSec, targetType = Target.REPS) =>
  createPlanItem(exerciseId, {
    sets,
    targetType,
    ...(targetType === Target.TIME ? { seconds: amount } : { reps: amount }),
    restSec,
  });

// One set of each, short and easy: gets the heart rate up and joints moving
const warm = (exerciseId, amount, targetType = Target.TIME) => item(exerciseId, 1, amount, 0, targetType);

export function standardWarmup() {
  return [
    warm("arm_circles", 30),
    warm("torso_twist", 30),
    warm("side_bend", 10, Target.REPS),
    warm("hip_hinge", 10, Target.REPS),
    warm("high_knees", 30),
    warm("butt_kicks", 30),
  ];
}

export const TEMPLATES = [
  {
    id: "warmup_only",
    name: "Quick warm-up",
    description: "5 minutes to get moving",
    warmup: standardWarmup,
    build: () => [],
    restBetweenExercisesSec: 15,
  },
  {
    id: "beginner",
    name: "Beginner full body",
    description: "A gentle all-round start",
    warmup: () => [warm("arm_circles", 30), warm("hip_hinge", 8, Target.REPS), warm("high_knees", 30)],
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
    warmup: () => [warm("arm_circles", 30), warm("torso_twist", 30), warm("jumping_jack", 30)],
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
    warmup: () => [warm("hip_hinge", 10, Target.REPS), warm("high_knees", 30), warm("butt_kicks", 30)],
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
    warmup: () => [warm("torso_twist", 30), warm("side_bend", 10, Target.REPS), warm("high_knees", 30)],
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
    warmup: template.warmup ? template.warmup() : [],
    warmupRestSec: DEFAULT_WARMUP_REST_SEC,
    items: template.build(),
    restBetweenExercisesSec: template.restBetweenExercisesSec,
  };
}

// Returns a valid copy of a plan (e.g. one loaded from storage or edited)
export function sanitizePlan(plan) {
  const cleanItems = (list) => (list ?? [])
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
    warmup: cleanItems(plan?.warmup),
    warmupRestSec: clampInt(plan?.warmupRestSec, LIMITS.restSec, DEFAULT_WARMUP_REST_SEC),
    items: cleanItems(plan?.items),
    restBetweenExercisesSec: clampInt(plan?.restBetweenExercisesSec, LIMITS.restSec, 60),
  };
}

// Warm-up exercises first, then the main workout
export function allItems(plan) {
  return [
    ...(plan.warmup ?? []).map((it) => ({ ...it, section: "warmup" })),
    ...plan.items.map((it) => ({ ...it, section: "main" })),
  ];
}

// Rest after the last set of an exercise: short between warm-up moves
function restAfterExercise(plan, current, next) {
  if (!next) return 0;
  if (current.section === "warmup" && next.section === "warmup") {
    return plan.warmupRestSec ?? DEFAULT_WARMUP_REST_SEC;
  }
  return plan.restBetweenExercisesSec;
}

// One entry per set, in order, with the rest that follows it
export function planSteps(plan) {
  const steps = [];
  const items = allItems(plan);
  items.forEach((it, itemIndex) => {
    for (let set = 1; set <= it.sets; set++) {
      const lastSet = set === it.sets;
      steps.push({
        itemIndex,
        section: it.section,
        exerciseId: it.exerciseId,
        set,
        totalSets: it.sets,
        targetType: it.targetType,
        reps: it.reps,
        seconds: it.seconds,
        restAfterSec: lastSet ? restAfterExercise(plan, it, items[itemIndex + 1]) : it.restSec,
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
