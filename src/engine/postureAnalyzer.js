// Squat form analysis.
//
// computeSquatMetrics() turns one frame of landmarks into view-aware,
// body-size-normalized measurements. SquatPostureAnalyzer turns a stream of
// those measurements into debounced feedback and a 0-100 form score.

import {
  calculateAngle,
  calculateAngle3D,
  angleFromVertical,
  tiltFromHorizontal,
  distance,
  midpoint,
  visibilityOf,
  visibilityWeighted,
} from "./angleUtils";
import { StableFlag } from "./filters";
import { LM, SIDES, SQUAT_REQUIRED } from "./landmarks";

export const View = { FRONT: "front", SIDE: "side", ANGLED: "angled" };

const MIN_VISIBILITY = 0.5;

function sideVisibility(landmarks, side) {
  const s = SIDES[side];
  return (
    visibilityOf(landmarks[s.shoulder]) +
    visibilityOf(landmarks[s.hip]) +
    visibilityOf(landmarks[s.knee]) +
    visibilityOf(landmarks[s.ankle])
  ) / 4;
}

function inFrame(lm, margin = 0.05) {
  return lm.x > -margin && lm.x < 1 + margin && lm.y > -margin && lm.y < 1 + margin;
}

// Width of shoulders/hips relative to torso length tells us how the user is
// turned: close to 0 from the side, around 0.5-0.8 from the front.
export function detectView(landmarks) {
  const shoulderWidth = Math.abs(landmarks[LM.LEFT_SHOULDER].x - landmarks[LM.RIGHT_SHOULDER].x);
  const hipWidth = Math.abs(landmarks[LM.LEFT_HIP].x - landmarks[LM.RIGHT_HIP].x);
  const torso = distance(
    midpoint(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]),
    midpoint(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP])
  );
  if (torso < 1e-6) return { view: View.ANGLED, widthRatio: NaN };

  const widthRatio = (shoulderWidth + hipWidth) / 2 / torso;
  let view = View.ANGLED;
  if (widthRatio > 0.42) view = View.FRONT;
  else if (widthRatio < 0.22) view = View.SIDE;
  return { view, widthRatio };
}

function jointAngle(landmarks, world, a, b, c) {
  if (world) return calculateAngle3D(world[a], world[b], world[c]);
  return calculateAngle(landmarks[a], landmarks[b], landmarks[c]);
}

// landmarks: normalized image landmarks (required)
// world: world landmarks in meters (optional, makes angles view-independent)
export function computeSquatMetrics(landmarks, world = null) {
  if (!landmarks || landmarks.length < 33) return null;

  const { view, widthRatio } = detectView(landmarks);
  const leftVis = sideVisibility(landmarks, "left");
  const rightVis = sideVisibility(landmarks, "right");

  // In side view the far leg is occluded; measure with the near one
  let nearSide = leftVis >= rightVis ? "left" : "right";
  if (Math.abs(leftVis - rightVis) < 0.05) {
    nearSide = (landmarks[LM.LEFT_HIP].z ?? 0) <= (landmarks[LM.RIGHT_HIP].z ?? 0) ? "left" : "right";
  }
  const near = SIDES[nearSide];

  // From the side only the near leg has to be clearly visible
  const required = view === View.SIDE
    ? [near.shoulder, near.hip, near.knee, near.ankle]
    : SQUAT_REQUIRED;
  const bodyVisible = required.every(
    (i) => visibilityOf(landmarks[i]) >= MIN_VISIBILITY && inFrame(landmarks[i])
  );

  // Knee and hip angles for both legs
  const L = SIDES.left;
  const R = SIDES.right;
  const leftKnee = jointAngle(landmarks, world, L.hip, L.knee, L.ankle);
  const rightKnee = jointAngle(landmarks, world, R.hip, R.knee, R.ankle);
  const leftHip = jointAngle(landmarks, world, L.shoulder, L.hip, L.knee);
  const rightHip = jointAngle(landmarks, world, R.shoulder, R.hip, R.knee);

  // Side view without 3D: trust the near leg almost exclusively
  const sideOnly = view === View.SIDE && !world;
  const wLeft = sideOnly ? (nearSide === "left" ? 1 : 0.05) : leftVis;
  const wRight = sideOnly ? (nearSide === "right" ? 1 : 0.05) : rightVis;

  const kneeAngle = visibilityWeighted(leftKnee, wLeft, rightKnee, wRight);
  const hipAngle = visibilityWeighted(leftHip, wLeft, rightHip, wRight);

  const midShoulder = midpoint(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]);
  const midHip = midpoint(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);

  // Torso lean from vertical. World coordinates see forward lean from any view.
  let torsoLean;
  if (world) {
    torsoLean = angleFromVertical(
      midpoint(world[LM.LEFT_SHOULDER], world[LM.RIGHT_SHOULDER]),
      midpoint(world[LM.LEFT_HIP], world[LM.RIGHT_HIP]),
      true
    );
  } else if (view !== View.FRONT) {
    torsoLean = angleFromVertical(landmarks[near.shoulder], landmarks[near.hip]);
  } else {
    torsoLean = NaN;
  }

  const shinLean = world
    ? angleFromVertical(world[near.knee], world[near.ankle], true)
    : angleFromVertical(landmarks[near.knee], landmarks[near.ankle]);

  // Body-size normalizers (image space)
  const shinLength = distance(landmarks[near.knee], landmarks[near.ankle]);
  const thighLength = distance(landmarks[near.hip], landmarks[near.knee]);

  // Side view: how far the knee travels past the toes, in shin lengths
  let kneeForward = NaN;
  let heelRise = NaN;
  let hipBelowKnee = NaN;
  if (view === View.SIDE && shinLength > 1e-6) {
    const heel = landmarks[near.heel];
    const toe = landmarks[near.foot];
    const facing = Math.sign(toe.x - heel.x) || 1;
    kneeForward = ((landmarks[near.knee].x - toe.x) * facing) / shinLength;
    heelRise = (toe.y - heel.y) / shinLength;
    hipBelowKnee = thighLength > 1e-6
      ? (landmarks[near.hip].y - landmarks[near.knee].y) / thighLength
      : NaN;
  }

  // Front view: knee width vs ankle width (knees caving in), level hips, stance
  let kneeWidthRatio = NaN;
  let hipTilt = NaN;
  let stanceRatio = NaN;
  if (view !== View.SIDE) {
    const src = world ?? landmarks;
    const kneeWidth = Math.abs(src[LM.LEFT_KNEE].x - src[LM.RIGHT_KNEE].x);
    const ankleWidth = Math.abs(src[LM.LEFT_ANKLE].x - src[LM.RIGHT_ANKLE].x);
    const shoulderWidth = Math.abs(src[LM.LEFT_SHOULDER].x - src[LM.RIGHT_SHOULDER].x);
    if (ankleWidth > 1e-6) kneeWidthRatio = kneeWidth / ankleWidth;
    if (shoulderWidth > 1e-6) stanceRatio = ankleWidth / shoulderWidth;

    const tilt = tiltFromHorizontal(landmarks[LM.RIGHT_HIP], landmarks[LM.LEFT_HIP]);
    // Normalize to [-90, 90] regardless of which hip is on the left of the image
    hipTilt = tilt > 90 ? tilt - 180 : tilt < -90 ? tilt + 180 : tilt;
  }

  const bothLegsVisible = leftVis >= 0.7 && rightVis >= 0.7;

  return {
    bodyVisible,
    view,
    widthRatio,
    nearSide,
    uses3D: Boolean(world),
    kneeAngle,
    leftKneeAngle: leftKnee,
    rightKneeAngle: rightKnee,
    hipAngle,
    torsoLean,
    shinLean,
    kneeForward,
    heelRise,
    hipBelowKnee,
    kneeWidthRatio,
    hipTilt,
    stanceRatio,
    kneeAsymmetry: bothLegsVisible || world ? Math.abs(leftKnee - rightKnee) : NaN,
    hipY: midHip.y,
    shoulderY: midShoulder.y,
    thighLength,
    shinLength,
  };
}

const PENALTY = { error: 25, warning: 12, info: 0 };

// Landmark indices for body parts: only the near side in side view
export function jointsFor(metrics, parts) {
  if (!metrics) return [];
  const sides = metrics.view === View.SIDE ? [metrics.nearSide] : ["left", "right"];
  const out = [];
  for (const side of sides) {
    for (const part of parts) {
      const index = SIDES[side][part];
      if (index !== undefined) out.push(index);
    }
  }
  return out;
}

// Each rule returns true when the fault is present. `inRep` is true while the
// user is moving through a rep. `joints` are marked on the video and `voice`
// is the short phrase the voice coach says.
export const SQUAT_RULES = [
  {
    id: "torso_lean",
    severity: "error",
    message: "Keep your chest up: your torso is leaning too far forward",
    voice: "Chest up",
    joints: (m) => jointsFor(m, ["shoulder", "hip"]),
    when: ({ m, inRep }) =>
      inRep &&
      Number.isFinite(m.torsoLean) &&
      m.torsoLean > 45 &&
      m.torsoLean > (Number.isFinite(m.shinLean) ? m.shinLean : 0) + 25,
  },
  {
    id: "knees_forward",
    severity: "warning",
    message: "Knees are drifting far past your toes: sit your hips back",
    voice: "Sit your hips back",
    joints: (m) => jointsFor(m, ["knee", "foot"]),
    when: ({ m, inRep }) => inRep && m.kneeForward > 0.35,
  },
  {
    id: "knee_valgus",
    severity: "error",
    message: "Knees caving in: push them out over your toes",
    voice: "Push your knees out",
    joints: (m) => jointsFor(m, ["knee"]),
    when: ({ m, inRep }) => inRep && m.kneeAngle < 150 && m.kneeWidthRatio < 0.8,
  },
  {
    id: "asymmetry",
    severity: "warning",
    message: "Uneven squat: keep your weight even on both legs",
    voice: "Keep your weight even",
    joints: (m) => jointsFor(m, ["knee"]),
    when: ({ m, inRep }) => inRep && m.kneeAsymmetry > 15,
  },
  {
    id: "hip_shift",
    severity: "warning",
    message: "Hips tilting to one side: keep them level",
    voice: "Keep your hips level",
    joints: (m) => jointsFor(m, ["hip"]),
    when: ({ m, inRep }) => inRep && Math.abs(m.hipTilt) > 7,
  },
  {
    id: "heel_lift",
    severity: "warning",
    message: "Keep your heels on the floor",
    voice: "Heels down",
    joints: (m) => jointsFor(m, ["heel", "ankle"]),
    when: ({ m, inRep, baseline }) =>
      inRep &&
      Number.isFinite(baseline.heelRise) &&
      m.heelRise - baseline.heelRise > 0.12,
  },
  {
    id: "stance_narrow",
    severity: "info",
    message: "Widen your stance to about shoulder width",
    voice: "Widen your stance",
    joints: (m) => jointsFor(m, ["ankle"]),
    when: ({ m, inRep }) => !inRep && m.stanceRatio < 0.7,
  },
  {
    id: "stance_wide",
    severity: "info",
    message: "Your stance is very wide: bring your feet in a little",
    voice: "Bring your feet in",
    joints: (m) => jointsFor(m, ["ankle"]),
    when: ({ m, inRep }) => !inRep && m.stanceRatio > 2.2,
  },
];

export class PostureAnalyzer {
  constructor(rules = SQUAT_RULES) {
    this.rules = rules;
    this.flags = Object.fromEntries(rules.map((r) => [r.id, new StableFlag(4, 8)]));
    this.reset();
  }

  reset() {
    Object.values(this.flags).forEach((f) => f.reset());
    this.baseline = {};
    this.score = 100;
  }

  // Remember what the rest position looks like for this user
  calibrate(restMetrics) {
    this.baseline = { ...restMetrics };
  }

  // reliable defaults to the squat's own visibility check
  analyze(metrics, { inRep = false, reliable = metrics?.bodyVisible } = {}) {
    if (!metrics || !reliable) {
      return { issues: [], score: Math.round(this.score), frameScore: null, reliable: false };
    }

    const ctx = { m: metrics, inRep, baseline: this.baseline };
    const issues = [];

    for (const rule of this.rules) {
      const active = this.flags[rule.id].update(Boolean(rule.when(ctx)));
      if (active) {
        issues.push({
          id: rule.id,
          severity: rule.severity,
          message: rule.message,
          voice: rule.voice ?? rule.message,
          joints: rule.joints ? rule.joints(metrics) : [],
        });
      }
    }

    const penalty = issues.reduce((sum, i) => sum + PENALTY[i.severity], 0);
    const frameScore = Math.max(0, 100 - penalty);
    this.score += 0.25 * (frameScore - this.score);

    return { issues, score: Math.round(this.score), frameScore, reliable: true };
  }
}

export class SquatPostureAnalyzer extends PostureAnalyzer {
  constructor() {
    super(SQUAT_RULES);
  }
}

// Feedback about a finished rep, based on the rep counter's record
export function reviewRep(rep, {
  avgFormScore = 100,
  targetMessage = "Go deeper: aim for thighs parallel to the floor",
  slowRepMs = 1000,
} = {}) {
  const reachedTarget = rep.reachedTarget ?? rep.depth === "parallel";
  const cues = [];
  if (!rep.counted) {
    cues.push({ severity: "warning", message: `Rep not counted: ${rep.reason}` });
  } else if (!reachedTarget) {
    cues.push({ severity: "warning", message: targetMessage });
  }
  if (rep.counted && rep.durationMs < slowRepMs) {
    cues.push({ severity: "info", message: "Slow down and control the movement" });
  }

  const depthPenalty = reachedTarget ? 0 : 15;
  const score = rep.counted ? Math.max(0, Math.round(avgFormScore - depthPenalty)) : 0;
  if (rep.counted && cues.length === 0 && score >= 85) {
    cues.push({ severity: "good", message: "Great rep!" });
  }
  return { score, cues };
}

// Stateless one-shot check kept for backwards compatibility
export function analyzeSquatPosture(landmarks, world = null) {
  const m = computeSquatMetrics(landmarks, world);
  if (!m) return [];
  const ctx = { m, inRep: m.kneeAngle < 160, baseline: {} };
  const feedback = SQUAT_RULES.filter((r) => r.when(ctx)).map((r) => r.message);
  if (Number.isFinite(m.hipBelowKnee)) {
    feedback.push(m.hipBelowKnee > 0 ? "Good squat depth" : "Go lower");
  }
  return feedback;
}
