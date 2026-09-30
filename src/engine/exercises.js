// Exercise library.
//
// Each exercise says which joint angle drives the rep count, where the rest
// position is, what counts as full range, which form rules apply and what the
// voice coach should say.
//
//   kind        "reps" or "hold" (timed, e.g. plank)
//   categories  groups it belongs to (see CATEGORIES), main one first
//   parts       body parts that must be visible
//   signal      metrics -> angle used for counting (degrees)
//   restRange   angle range accepted as the rest position for calibration
//   inPosition  optional metrics -> bool; frames outside it are ignored
//   counter     RepCounter config (direction, target angle, range, ...)
//   rules       form rules for PostureAnalyzer
//   met         energy cost (MET) used for calorie estimates
//   secondsPerRep  typical tempo, used to estimate workout length

import { SQUAT_RULES, jointsFor } from "./postureAnalyzer";

export const CATEGORIES = [
  { id: "warmup", name: "Warm-up" },
  { id: "upper", name: "Upper body" },
  { id: "lower", name: "Lower body" },
  { id: "core", name: "Core" },
  { id: "cardio", name: "Cardio" },
];

const rule = (id, severity, message, voice, parts, when) => ({
  id,
  severity,
  message,
  voice,
  joints: (m) => jointsFor(m, parts),
  when,
});

const leanFromRest = (m, baseline) =>
  Number.isFinite(m.torsoLean) && Number.isFinite(baseline.torsoLean)
    ? m.torsoLean - baseline.torsoLean
    : NaN;

const hipSagRule = rule(
  "hip_sag", "error",
  "Hips sagging: tighten your core and squeeze your glutes",
  "Tighten your core",
  ["shoulder", "hip", "ankle"],
  ({ m }) => m.hipSag > 0.15
);

const hipPikeRule = rule(
  "hip_pike", "warning",
  "Hips too high: lower them in line with your shoulders and ankles",
  "Lower your hips",
  ["shoulder", "hip", "ankle"],
  ({ m }) => m.hipSag < -0.2
);

export const EXERCISES = [
  {
    id: "squat",
    name: "Squat",
    kind: "reps",
    categories: ["lower"],
    met: 5.0,
    secondsPerRep: 3,
    camera: "Front or side view, whole body in frame",
    instructions: "Feet shoulder-width apart. Sit back and down until your thighs are parallel, then stand tall.",
    parts: ["shoulder", "hip", "knee", "ankle"],
    signal: (m) => m.kneeAngle,
    signalLabel: "Knee angle",
    labelPart: "knee",
    restRange: [150, 181],
    useHipDrop: true,
    counter: {
      direction: "decrease",
      goodDepthAngle: 100,
      minRangeOfMotion: 45,
      depthLabels: ["parallel", "above parallel"],
    },
    targetMessage: "Go deeper: aim for thighs parallel to the floor",
    targetVoice: "Go deeper",
    labels: { rest: "Standing", active: "Bottom of squat" },
    rules: SQUAT_RULES,
  },
  {
    id: "pushup",
    name: "Push-up",
    kind: "reps",
    categories: ["upper", "core"],
    met: 8.0,
    secondsPerRep: 2.5,
    camera: "Side view, whole body in frame",
    instructions: "Hands under your shoulders, body in a straight line. Lower your chest until your elbows reach 90°, then push up.",
    parts: ["shoulder", "elbow", "wrist", "hip", "ankle"],
    signal: (m) => m.elbowAngle,
    signalLabel: "Elbow angle",
    labelPart: "elbow",
    restRange: [145, 181],
    inPosition: (m) => m.lyingDown,
    positionHint: "Get into a push-up position, side-on to the camera",
    counter: {
      direction: "decrease",
      goodDepthAngle: 95,
      minRangeOfMotion: 45,
      depthLabels: ["full depth", "partial"],
    },
    targetMessage: "Lower your chest closer to the floor",
    targetVoice: "Go lower",
    labels: { rest: "Arms straight", active: "Chest low" },
    rules: [
      hipSagRule,
      hipPikeRule,
      rule(
        "hands_forward", "warning",
        "Place your hands under your shoulders",
        "Hands under shoulders",
        ["shoulder", "wrist"],
        ({ m, inRep }) => !inRep && m.wristShoulderOffset > 0.45
      ),
    ],
  },
  {
    id: "lunge",
    name: "Lunge",
    kind: "reps",
    categories: ["lower"],
    met: 4.0,
    secondsPerRep: 3,
    camera: "Side view, whole body in frame",
    instructions: "Step forward and lower until both knees are bent to about 90°, keeping your torso upright. Push back up.",
    parts: ["shoulder", "hip", "knee", "ankle"],
    signal: (m) => m.minKneeAngle,
    signalLabel: "Front knee",
    labelPart: "knee",
    restRange: [145, 181],
    useHipDrop: true,
    counter: {
      direction: "decrease",
      goodDepthAngle: 100,
      minRangeOfMotion: 40,
      depthLabels: ["full depth", "partial"],
    },
    targetMessage: "Lower until your front knee is bent to 90°",
    targetVoice: "Go lower",
    labels: { rest: "Standing", active: "Bottom of lunge" },
    rules: [
      rule(
        "torso_upright", "warning",
        "Keep your torso upright",
        "Chest up",
        ["shoulder", "hip"],
        ({ m, inRep }) => inRep && m.torsoLean > 25
      ),
      rule(
        "knee_past_toes", "warning",
        "Front knee is drifting far past your toes: take a longer step",
        "Take a longer step",
        ["knee", "foot"],
        ({ m, inRep }) => inRep && m.kneeForward > 0.45
      ),
      rule(
        "knee_valgus", "error",
        "Front knee caving in: keep it over your toes",
        "Knee out",
        ["knee"],
        ({ m, inRep }) => inRep && m.minKneeAngle < 140 && m.kneeWidthRatio < 0.6
      ),
    ],
  },
  {
    id: "curl",
    name: "Bicep curl",
    kind: "reps",
    categories: ["upper"],
    met: 3.5,
    secondsPerRep: 3,
    camera: "Front or side view, upper body in frame",
    instructions: "Elbows pinned to your sides. Curl the weight up to your shoulders, then lower it all the way.",
    parts: ["shoulder", "elbow", "wrist", "hip"],
    signal: (m) => m.minElbowAngle,
    signalLabel: "Elbow angle",
    labelPart: "elbow",
    restRange: [130, 181],
    counter: {
      direction: "decrease",
      goodDepthAngle: 60,
      minRangeOfMotion: 60,
      returnOffset: 15,
      depthLabels: ["full curl", "partial curl"],
    },
    targetMessage: "Curl all the way up to your shoulders",
    targetVoice: "Curl higher",
    labels: { rest: "Arms down", active: "Top of curl" },
    rules: [
      rule(
        "elbow_drift", "error",
        "Keep your elbows pinned to your sides",
        "Elbows in",
        ["shoulder", "elbow"],
        ({ m, inRep }) => inRep && m.upperArmLean > 35
      ),
      rule(
        "body_swing", "warning",
        "Don't swing your body: keep your torso still",
        "Don't swing",
        ["shoulder", "hip"],
        ({ m, inRep, baseline }) => inRep && Math.abs(leanFromRest(m, baseline)) > 12
      ),
    ],
  },
  {
    id: "press",
    name: "Shoulder press",
    kind: "reps",
    categories: ["upper"],
    met: 3.5,
    secondsPerRep: 3,
    camera: "Front view, upper body in frame",
    instructions: "Start with your hands at shoulder height. Press straight up until your arms are straight, then lower back to your shoulders.",
    parts: ["shoulder", "elbow", "wrist", "hip"],
    signal: (m) => m.elbowAngle,
    signalLabel: "Elbow angle",
    labelPart: "elbow",
    restRange: [30, 120],
    inPosition: (m) => m.wristLift > -0.2,
    positionHint: "Raise your hands to shoulder height to start",
    counter: {
      direction: "increase",
      standingAngle: 85,
      goodDepthAngle: 155,
      minRangeOfMotion: 45,
      depthLabels: ["full lockout", "partial press"],
    },
    targetMessage: "Press all the way up until your arms are straight",
    targetVoice: "Press higher",
    labels: { rest: "Hands at shoulders", active: "Arms overhead" },
    rules: [
      rule(
        "back_arch", "error",
        "Don't lean back: brace your core and keep your ribs down",
        "Don't lean back",
        ["shoulder", "hip"],
        ({ m, inRep, baseline }) => inRep && leanFromRest(m, baseline) > 12
      ),
      rule(
        "uneven_press", "warning",
        "Press both arms up evenly",
        "Press evenly",
        ["elbow", "wrist"],
        ({ m, inRep }) => inRep && m.elbowAsymmetry > 25
      ),
    ],
  },
  {
    id: "lateral_raise",
    name: "Lateral raise",
    kind: "reps",
    categories: ["upper"],
    met: 3.5,
    secondsPerRep: 3,
    camera: "Front view, upper body in frame",
    instructions: "Arms by your sides with a slight bend. Raise them out to shoulder height, then lower slowly.",
    parts: ["shoulder", "elbow", "wrist", "hip"],
    signal: (m) => m.shoulderAngle,
    signalLabel: "Arm angle",
    labelPart: "shoulder",
    restRange: [0, 40],
    counter: {
      direction: "increase",
      standingAngle: 15,
      goodDepthAngle: 78,
      minRangeOfMotion: 45,
      depthLabels: ["shoulder height", "below shoulder height"],
    },
    targetMessage: "Raise your arms to shoulder height",
    targetVoice: "Raise higher",
    labels: { rest: "Arms down", active: "Arms at shoulder height" },
    rules: [
      rule(
        "too_high", "warning",
        "Stop at shoulder height",
        "Stop at shoulder height",
        ["shoulder", "elbow"],
        ({ m }) => m.maxShoulderAngle > 115
      ),
      rule(
        "bent_elbows", "warning",
        "Keep your arms almost straight",
        "Straighten your arms",
        ["elbow"],
        ({ m, inRep }) => inRep && m.elbowAngle < 130
      ),
      rule(
        "body_swing", "warning",
        "Don't swing your body to lift the weight",
        "Don't swing",
        ["shoulder", "hip"],
        ({ m, inRep, baseline }) => inRep && Math.abs(leanFromRest(m, baseline)) > 12
      ),
      rule(
        "uneven_raise", "warning",
        "Raise both arms evenly",
        "Raise evenly",
        ["shoulder", "elbow"],
        ({ m, inRep }) => inRep && m.shoulderAsymmetry > 20
      ),
    ],
  },
  {
    id: "jumping_jack",
    name: "Jumping jack",
    kind: "reps",
    categories: ["cardio", "warmup"],
    met: 8.0,
    secondsPerRep: 1.2,
    camera: "Front view, whole body in frame",
    instructions: "Jump your feet wide while raising your arms overhead, then jump back together.",
    parts: ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"],
    signal: (m) => m.shoulderAngle,
    signalLabel: "Arm angle",
    labelPart: "shoulder",
    restRange: [0, 50],
    counter: {
      direction: "increase",
      standingAngle: 20,
      goodDepthAngle: 140,
      minRangeOfMotion: 80,
      descentOffset: 25,
      returnOffset: 20,
      bottomHysteresis: 10,
      confirmFrames: 1,
      minRepMs: 300,
      plateauMs: 300,
      depthLabels: ["full", "partial"],
    },
    slowRepMs: 0,
    targetMessage: "Bring your arms all the way overhead",
    targetVoice: "Arms higher",
    labels: { rest: "Feet together", active: "Arms overhead, feet wide" },
    rules: [
      rule(
        "feet_narrow", "warning",
        "Jump your feet wider",
        "Feet wider",
        ["ankle"],
        ({ m, inRep }) => inRep && m.shoulderAngle > 120 && m.ankleSpread < 1.8
      ),
    ],
  },
  {
    id: "glute_bridge",
    name: "Glute bridge",
    kind: "reps",
    categories: ["lower", "core"],
    met: 3.5,
    secondsPerRep: 3,
    camera: "Side view, lying on your back",
    instructions: "Lie on your back, knees bent, feet flat. Drive through your heels to lift your hips until your body is straight from shoulders to knees.",
    parts: ["shoulder", "hip", "knee", "ankle"],
    signal: (m) => m.nearHipAngle,
    signalLabel: "Hip angle",
    labelPart: "hip",
    restRange: [90, 158],
    inPosition: (m) => m.lyingDown,
    positionHint: "Lie on your back, side-on to the camera, knees bent",
    counter: {
      direction: "increase",
      standingAngle: 135,
      goodDepthAngle: 165,
      minRangeOfMotion: 20,
      descentOffset: 10,
      returnOffset: 6,
      bottomHysteresis: 5,
      depthLabels: ["full extension", "partial"],
    },
    targetMessage: "Squeeze your glutes and lift your hips higher",
    targetVoice: "Hips higher",
    labels: { rest: "Hips down", active: "Hips up" },
    rules: [
      rule(
        "feet_far", "warning",
        "Bring your feet closer to your hips",
        "Feet closer",
        ["knee", "ankle"],
        ({ m }) => m.nearKneeAngle > 125
      ),
      rule(
        "feet_close", "warning",
        "Move your feet a little further from your hips",
        "Feet further away",
        ["knee", "ankle"],
        ({ m }) => m.nearKneeAngle < 55
      ),
    ],
  },
  {
    id: "situp",
    name: "Sit-up",
    kind: "reps",
    categories: ["core"],
    met: 5.0,
    secondsPerRep: 2.5,
    camera: "Side view, lying on your back",
    instructions: "Lie on your back with knees bent. Curl up until your chest is near your knees, then lower with control.",
    parts: ["shoulder", "hip", "knee", "ankle"],
    signal: (m) => m.nearHipAngle,
    signalLabel: "Hip angle",
    labelPart: "hip",
    restRange: [110, 165],
    counter: {
      direction: "decrease",
      standingAngle: 135,
      goodDepthAngle: 75,
      minRangeOfMotion: 40,
      depthLabels: ["full sit-up", "partial"],
    },
    targetMessage: "Come all the way up",
    targetVoice: "All the way up",
    labels: { rest: "Lying back", active: "Sitting up" },
    rules: [
      rule(
        "legs_straight", "warning",
        "Keep your knees bent",
        "Bend your knees",
        ["hip", "knee", "ankle"],
        ({ m }) => m.nearKneeAngle > 140
      ),
    ],
  },
  {
    id: "plank",
    name: "Plank",
    kind: "hold",
    categories: ["core"],
    met: 3.8,
    camera: "Side view, whole body in frame",
    instructions: "Forearms on the floor, elbows under your shoulders, body in a straight line from head to heels. Hold.",
    parts: ["shoulder", "elbow", "hip", "knee", "ankle"],
    signal: (m) => m.bodyLineAngle,
    signalLabel: "Body line",
    labelPart: "hip",
    inPosition: (m) => m.lyingDown,
    positionHint: "Get into a plank position, side-on to the camera",
    labels: { rest: "Not planking", active: "Plank" },
    rules: [
      hipSagRule,
      hipPikeRule,
      rule(
        "elbows_under", "warning",
        "Stack your elbows under your shoulders",
        "Elbows under shoulders",
        ["shoulder", "elbow"],
        ({ m }) => m.nearUpperArmLean > 30
      ),
    ],
  },
];

export const EXERCISES_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id) {
  return EXERCISES_BY_ID[id] ?? EXERCISES[0];
}

export function exercisesIn(categoryId) {
  return EXERCISES.filter((e) => e.categories.includes(categoryId));
}

export function categoryName(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId)?.name ?? categoryId;
}
