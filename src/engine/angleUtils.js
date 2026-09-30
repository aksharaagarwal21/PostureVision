// Geometry helpers for pose landmarks.
//
// Landmarks are objects with x, y and optionally z and visibility.
// Image landmarks are normalized to [0, 1] with y pointing down.
// World landmarks (MediaPipe Tasks) are in meters, centered on the hips.

const RAD_TO_DEG = 180 / Math.PI;
const EPSILON = 1e-9;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleBetween(ax, ay, az, cx, cy, cz) {
  const magA = Math.sqrt(ax * ax + ay * ay + az * az);
  const magC = Math.sqrt(cx * cx + cy * cy + cz * cz);

  // Degenerate segment (two landmarks on top of each other)
  if (magA < EPSILON || magC < EPSILON) return NaN;

  // Clamp to avoid NaN from floating point drift outside [-1, 1]
  const cos = clamp((ax * cx + ay * cy + az * cz) / (magA * magC), -1, 1);
  return Math.acos(cos) * RAD_TO_DEG;
}

// Angle ABC in degrees (vertex at B), using x and y only.
export function calculateAngle(A, B, C) {
  return angleBetween(
    A.x - B.x, A.y - B.y, 0,
    C.x - B.x, C.y - B.y, 0
  );
}

// Angle ABC in degrees (vertex at B), using x, y and z.
// With world landmarks this is independent of the camera viewpoint.
export function calculateAngle3D(A, B, C) {
  return angleBetween(
    A.x - B.x, A.y - B.y, (A.z ?? 0) - (B.z ?? 0),
    C.x - B.x, C.y - B.y, (C.z ?? 0) - (B.z ?? 0)
  );
}

// Angle in degrees between the segment bottom -> top and straight up.
// 0 = perfectly vertical, 90 = horizontal. Assumes y points down.
export function angleFromVertical(top, bottom, use3D = false) {
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  const dz = use3D ? (top.z ?? 0) - (bottom.z ?? 0) : 0;
  return angleBetween(dx, dy, dz, 0, -1, 0);
}

// Signed tilt of the line left -> right from horizontal, in degrees.
export function tiltFromHorizontal(left, right) {
  return Math.atan2(right.y - left.y, right.x - left.x) * RAD_TO_DEG;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

export function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

export function visibilityOf(landmark) {
  return landmark?.visibility ?? 1;
}

export function allVisible(landmarks, indices, threshold = 0.5) {
  return indices.every((i) => landmarks[i] && visibilityOf(landmarks[i]) >= threshold);
}

// Blend a left and right measurement, trusting the more visible side more.
// Returns NaN only when both sides are unusable.
export function visibilityWeighted(leftValue, leftVisibility, rightValue, rightVisibility) {
  const leftOk = Number.isFinite(leftValue) && leftVisibility > 0;
  const rightOk = Number.isFinite(rightValue) && rightVisibility > 0;

  if (leftOk && rightOk) {
    return (leftValue * leftVisibility + rightValue * rightVisibility) /
      (leftVisibility + rightVisibility);
  }
  if (leftOk) return leftValue;
  if (rightOk) return rightValue;
  return NaN;
}
