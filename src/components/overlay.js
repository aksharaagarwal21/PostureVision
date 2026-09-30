// Canvas drawing for the camera view: skeleton, angle label and red marks on
// the joints involved in a form mistake.

import { POSE_CONNECTIONS } from "../pose/poseDetector";

export const COLORS = {
  good: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  idle: "#38bdf8",
};

const MISTAKE_RED = "#ff2d2d";

const visible = (lm) => (lm?.visibility ?? 1) >= 0.5;

export function skeletonColor(state) {
  if (!state || state.status !== "active") return COLORS.idle;
  if (state.issues.some((i) => i.severity === "error")) return COLORS.error;
  if (state.issues.some((i) => i.severity === "warning")) return COLORS.warning;
  return COLORS.good;
}

export function drawSkeleton(ctx, landmarks, width, height, color) {
  ctx.lineWidth = Math.max(3, width / 250);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (const { start, end } of POSE_CONNECTIONS) {
    // Skip the face mesh lines; they add clutter without helping
    if (start < 11 || end < 11) continue;
    const a = landmarks[start];
    const b = landmarks[end];
    if (!visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  for (const lm of landmarks.slice(11)) {
    if (!visible(lm)) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, Math.max(3, width / 300), 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Mistakes that should be marked on the body (not tips like stance width)
function markedIssues(state) {
  if (!state || state.status !== "active") return [];
  return (state.issues ?? []).filter((i) => i.severity !== "info" && i.joints?.length);
}

// Red segments and pulsing rings on the joints involved in each mistake.
// Draw inside the same (possibly mirrored) transform as the skeleton.
export function drawMistakeMarks(ctx, landmarks, state, width, height, time) {
  const issues = markedIssues(state);
  if (issues.length === 0) return;

  const joints = new Set(issues.flatMap((i) => i.joints));
  const pulse = 0.5 + 0.5 * Math.sin(time / 180);
  const base = Math.max(8, width / 90);

  // Body segments between two marked joints
  ctx.save();
  ctx.strokeStyle = MISTAKE_RED;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(6, width / 130);
  ctx.shadowColor = MISTAKE_RED;
  ctx.shadowBlur = 12;
  for (const { start, end } of POSE_CONNECTIONS) {
    if (!joints.has(start) || !joints.has(end)) continue;
    const a = landmarks[start];
    const b = landmarks[end];
    if (!visible(a) || !visible(b)) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
  ctx.restore();

  // Rings on the joints
  for (const index of joints) {
    const lm = landmarks[index];
    if (!lm || !visible(lm)) continue;
    const x = lm.x * width;
    const y = lm.y * height;

    ctx.beginPath();
    ctx.arc(x, y, base, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255, 45, 45, 0.85)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, base * (1.6 + pulse), 0, 2 * Math.PI);
    ctx.lineWidth = Math.max(3, width / 320);
    ctx.strokeStyle = `rgba(255, 45, 45, ${0.35 + 0.5 * (1 - pulse)})`;
    ctx.stroke();
  }
}

// Red banner at the top of the video with the most important correction.
// Draw without the mirror transform so the text reads correctly.
export function drawMistakeBanner(ctx, state, width) {
  const issues = markedIssues(state);
  if (issues.length === 0) return;
  const main = issues.find((i) => i.severity === "error") ?? issues[0];

  const fontSize = Math.max(16, Math.round(width / 42));
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const text = `⚠ ${main.message}`;
  const padX = fontSize;
  const boxW = Math.min(width - 24, ctx.measureText(text).width + padX * 2);
  const boxH = fontSize * 2;
  const x = (width - boxW) / 2;
  const y = fontSize * 0.8;

  ctx.fillStyle = main.severity === "error" ? "rgba(220, 38, 38, 0.92)" : "rgba(234, 88, 12, 0.92)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, boxH / 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, y + boxH / 2, boxW - padX);
  ctx.textAlign = "start";
}

export function drawAngleLabel(ctx, landmarks, state, width, height, mirrored) {
  if (state?.labelJoint == null || !Number.isFinite(state.angle)) return;
  const joint = landmarks[state.labelJoint];
  if (!joint) return;
  const x = (mirrored ? 1 - joint.x : joint.x) * width;
  const y = joint.y * height;

  const text = `${Math.round(state.angle)}°`;
  ctx.font = `600 ${Math.round(width / 40)}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 16;
  const h = width / 28;
  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.fillRect(x + 12, y - h / 2, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 20, y);
}
