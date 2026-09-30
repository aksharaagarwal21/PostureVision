// Draws a demo pose (from demoPoses.js) onto a canvas.

const LIMBS = [
  ["shoulder", "elbow"], ["elbow", "wrist"],
  ["hip", "knee"], ["knee", "ankle"], ["ankle", "heel"], ["heel", "toe"], ["ankle", "toe"],
];

export function drawDemo(ctx, pose, bounds, { width, height, colors }) {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const scale = Math.min(width / bw, height / bh);
  const ox = (width - bw * scale) / 2 - bounds.minX * scale;
  const oy = (height + bh * scale) / 2 + bounds.minY * scale;
  const px = ([x, y]) => [ox + x * scale, oy - y * scale];

  ctx.clearRect(0, 0, width, height);

  // Floor
  const floorY = oy;
  ctx.strokeStyle = colors.floor;
  ctx.lineWidth = Math.max(1, scale * 0.012);
  ctx.beginPath();
  ctx.moveTo(width * 0.04, floorY);
  ctx.lineTo(width * 0.96, floorY);
  ctx.stroke();

  const limbWidth = Math.max(3, scale * 0.075);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const line = (a, b, color, w = limbWidth) => {
    const [x1, y1] = px(a);
    const [x2, y2] = px(b);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawSide = (side, color) => {
    for (const [a, b] of LIMBS) {
      if (side[a] && side[b]) line(side[a], side[b], color, a === "ankle" || a === "heel" ? limbWidth * 0.7 : limbWidth);
    }
    if (pose.dumbbells && side.wrist) {
      const [x, y] = px(side.wrist);
      const s = limbWidth * 1.4;
      ctx.fillStyle = colors.prop;
      ctx.fillRect(x - s, y - s * 0.45, s * 2, s * 0.9);
    }
  };

  const front = pose.view === "front";
  drawSide(pose.far, front ? colors.body : colors.farBody);

  // Torso
  const torsoColor = colors.body;
  if (front) {
    const { near: l, far: r } = pose;
    ctx.fillStyle = torsoColor;
    ctx.beginPath();
    for (const [i, p] of [l.shoulder, r.shoulder, r.hip, l.hip].entries()) {
      const [x, y] = px(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    line(l.shoulder, r.shoulder, torsoColor);
    line(l.hip, r.hip, torsoColor);
  } else {
    line(pose.near.hip, pose.near.shoulder, torsoColor, limbWidth * 1.5);
  }
  line(front ? [0, pose.neck[1] - 0.08] : pose.near.shoulder, pose.neck, torsoColor);

  drawSide(pose.near, colors.body);

  // Head
  const [hx, hy] = px(pose.head);
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.arc(hx, hy, scale * 0.11, 0, 2 * Math.PI);
  ctx.fill();
}

// Reads theme colours from CSS custom properties on the canvas
export function demoColors(element) {
  const style = getComputedStyle(element);
  const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    body: get("--accent", "#38bdf8"),
    farBody: get("--demo-far", "#64748b"),
    floor: get("--panel-border", "#1e2a44"),
    prop: get("--text", "#e2e8f0"),
  };
}

// Ping-pong through the movement with short pauses at each end
export function demoPhase(ms, cycleMs) {
  const p = (ms % cycleMs) / cycleMs;
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  if (p < 0.1) return 0;
  if (p < 0.5) return ease((p - 0.1) / 0.4);
  if (p < 0.6) return 1;
  return 1 - ease((p - 0.6) / 0.4);
}
