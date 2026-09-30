// Whole-body measurements used by every exercise.
//
// Builds on computeSquatMetrics() (legs, torso, camera view) and adds the
// arms and whole-body alignment needed for upper-body and floor exercises.

import {
  calculateAngle,
  calculateAngle3D,
  angleFromVertical,
  distance,
  visibilityOf,
} from "./angleUtils";
import { computeSquatMetrics, jointsFor, View } from "./postureAnalyzer";
import { LM, SIDES } from "./landmarks";

const MIN_VISIBILITY = 0.5;

function armVisibility(landmarks, side) {
  const s = SIDES[side];
  return (
    visibilityOf(landmarks[s.shoulder]) +
    visibilityOf(landmarks[s.elbow]) +
    visibilityOf(landmarks[s.wrist])
  ) / 3;
}

// Signed distance of the hip from the shoulder-ankle line, in torso lengths.
// Positive = hips sagging towards the floor, negative = hips piked up.
function hipSag(shoulder, hip, ankle) {
  const dx = ankle.x - shoulder.x;
  const dy = ankle.y - shoulder.y;
  const len = Math.hypot(dx, dy);
  const torso = distance(shoulder, hip);
  if (len < 1e-6 || torso < 1e-6) return NaN;

  // Unit normal to the body line pointing down the image (towards the floor)
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return ((hip.x - shoulder.x) * nx + (hip.y - shoulder.y) * ny) / torso;
}

export function computePoseMetrics(landmarks, world = null) {
  const base = computeSquatMetrics(landmarks, world);
  if (!base) return null;

  const angle = (a, b, c) =>
    world
      ? calculateAngle3D(world[a], world[b], world[c])
      : calculateAngle(landmarks[a], landmarks[b], landmarks[c]);
  const fromVertical = (top, bottom) =>
    world
      ? angleFromVertical(world[top], world[bottom], true)
      : angleFromVertical(landmarks[top], landmarks[bottom]);

  const L = SIDES.left;
  const R = SIDES.right;
  const near = SIDES[base.nearSide];

  const leftArmVis = armVisibility(landmarks, "left");
  const rightArmVis = armVisibility(landmarks, "right");

  // Side view without 3D: only the near arm is trustworthy
  const sideOnly = base.view === View.SIDE && !world;
  const wLeft = sideOnly ? (base.nearSide === "left" ? 1 : 0.05) : leftArmVis;
  const wRight = sideOnly ? (base.nearSide === "right" ? 1 : 0.05) : rightArmVis;
  const leftUsable = wLeft >= MIN_VISIBILITY || (world && leftArmVis >= 0.3);
  const rightUsable = wRight >= MIN_VISIBILITY || (world && rightArmVis >= 0.3);

  const leftElbowAngle = angle(L.shoulder, L.elbow, L.wrist);
  const rightElbowAngle = angle(R.shoulder, R.elbow, R.wrist);
  // Shoulder raise: angle between the torso side (shoulder->hip) and upper arm
  const leftShoulderAngle = angle(L.hip, L.shoulder, L.elbow);
  const rightShoulderAngle = angle(R.hip, R.shoulder, R.elbow);
  // How far the upper arm points away from straight down
  const leftUpperArmLean = fromVertical(L.shoulder, L.elbow);
  const rightUpperArmLean = fromVertical(R.shoulder, R.elbow);

  const pick = (left, right, mode) => {
    const values = [];
    if (leftUsable && Number.isFinite(left)) values.push(left);
    if (rightUsable && Number.isFinite(right)) values.push(right);
    if (values.length === 0) return NaN;
    if (mode === "min") return Math.min(...values);
    if (mode === "max") return Math.max(...values);
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  // Body line (shoulder-hip-ankle) on the side nearest the camera
  const bodyLineAngle = angle(near.shoulder, near.hip, near.ankle);
  const sag = hipSag(landmarks[near.shoulder], landmarks[near.hip], landmarks[near.ankle]);

  // Wrist height above the shoulders, in torso lengths (image space)
  const torso2D = distance(landmarks[near.shoulder], landmarks[near.hip]);
  const wristLift = (side) =>
    torso2D > 1e-6
      ? (landmarks[side.shoulder].y - landmarks[side.wrist].y) / torso2D
      : NaN;
  const wristLiftLeft = wristLift(L);
  const wristLiftRight = wristLift(R);

  // Hands under shoulders (push-up/plank), in torso lengths
  const wristShoulderOffset = torso2D > 1e-6
    ? Math.abs(landmarks[near.wrist].x - landmarks[near.shoulder].x) / torso2D
    : NaN;

  // Feet apart relative to hip width (jumping jacks)
  const src = world ?? landmarks;
  const hipWidth = Math.abs(src[LM.LEFT_HIP].x - src[LM.RIGHT_HIP].x);
  const ankleSpread = base.view !== View.SIDE && hipWidth > 1e-6
    ? Math.abs(src[LM.LEFT_ANKLE].x - src[LM.RIGHT_ANKLE].x) / hipWidth
    : NaN;

  const bothArms = (leftArmVis >= 0.7 && rightArmVis >= 0.7) || Boolean(world);

  // Hip bend on each side (shoulder-hip-knee): drops as a knee comes up
  const leftHipAngle = angle(L.shoulder, L.hip, L.knee);
  const rightHipAngle = angle(R.shoulder, R.hip, R.knee);

  // Sideways lean of the torso, seen from the front (side bends)
  const midShoulder = [
    (landmarks[L.shoulder].x + landmarks[R.shoulder].x) / 2,
    (landmarks[L.shoulder].y + landmarks[R.shoulder].y) / 2,
  ];
  const midHip = [
    (landmarks[L.hip].x + landmarks[R.hip].x) / 2,
    (landmarks[L.hip].y + landmarks[R.hip].y) / 2,
  ];
  const torsoSideLean = base.view === View.SIDE
    ? NaN
    : Math.abs(Math.atan2(midShoulder[0] - midHip[0], midHip[1] - midShoulder[1]) * (180 / Math.PI));

  return {
    ...base,
    leftElbowAngle,
    rightElbowAngle,
    elbowAngle: pick(leftElbowAngle, rightElbowAngle, "avg"),
    minElbowAngle: pick(leftElbowAngle, rightElbowAngle, "min"),
    leftShoulderAngle,
    rightShoulderAngle,
    shoulderAngle: pick(leftShoulderAngle, rightShoulderAngle, "avg"),
    maxShoulderAngle: pick(leftShoulderAngle, rightShoulderAngle, "max"),
    upperArmLean: pick(leftUpperArmLean, rightUpperArmLean, "max"),
    nearUpperArmLean: base.nearSide === "left" ? leftUpperArmLean : rightUpperArmLean,
    elbowAsymmetry: bothArms ? Math.abs(leftElbowAngle - rightElbowAngle) : NaN,
    shoulderAsymmetry: bothArms ? Math.abs(leftShoulderAngle - rightShoulderAngle) : NaN,
    minKneeAngle: Math.min(base.leftKneeAngle, base.rightKneeAngle),
    leftHipAngle,
    rightHipAngle,
    minHipAngle: Math.min(leftHipAngle, rightHipAngle),
    torsoSideLean,
    nearHipAngle: angle(near.shoulder, near.hip, near.knee),
    nearKneeAngle: angle(near.hip, near.knee, near.ankle),
    bodyLineAngle,
    hipSag: sag,
    lyingDown: base.torsoLean > 50,
    wristLift: Math.min(wristLiftLeft, wristLiftRight),
    wristShoulderOffset,
    ankleSpread,
  };
}

// Are all the listed body parts clearly visible and inside the frame?
export function partsVisible(landmarks, metrics, parts) {
  return jointsFor(metrics, parts).every((i) => {
    const lm = landmarks[i];
    return (
      lm &&
      visibilityOf(lm) >= MIN_VISIBILITY &&
      lm.x > -0.05 && lm.x < 1.05 && lm.y > -0.05 && lm.y < 1.05
    );
  });
}

export { jointsFor };
