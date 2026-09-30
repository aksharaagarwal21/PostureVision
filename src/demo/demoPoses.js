// Demo figure poses for each exercise.
//
// demoPose(exerciseId, t) returns 2D joint positions for a point in the
// movement: t = 0 is the start position, t = 1 the end of the rep. Units are
// meters, x to the right, y up, floor at y = 0. Side-view figures face right.

const L = { shin: 0.45, thigh: 0.45, torso: 0.52, upper: 0.29, fore: 0.27 };

const rad = (d) => (d * Math.PI) / 180;
// Direction in degrees: 0 = up, 90 = right, 180 = down, -90 = left
const dir = (deg, len) => [len * Math.sin(rad(deg)), len * Math.cos(rad(deg))];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpP = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

// Middle joint of a two-bone chain from a to c. bend picks the side (+1 / -1).
function ik(a, c, l1, l2, bend) {
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const d = Math.max(1e-6, Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-6));
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const angle = Math.atan2(dy, dx) + bend * Math.acos(Math.max(-1, Math.min(1, cos)));
  return [a[0] + l1 * Math.cos(angle), a[1] + l1 * Math.sin(angle)];
}

// Foot flat on the floor, toes pointing in `facing` direction
function flatFoot(ankle, facing = 1) {
  return {
    heel: [ankle[0] - 0.05 * facing, 0.02],
    toe: [ankle[0] + 0.17 * facing, 0.02],
  };
}

// Foot on its toes (push-up, plank, back leg of a lunge)
function onToes(ankle, lift = 1) {
  return {
    heel: [ankle[0] - 0.06, ankle[1] + 0.02 * lift],
    toe: [ankle[0] + 0.1, 0.02],
  };
}

function head(shoulder, towardDeg) {
  const neck = add(shoulder, dir(towardDeg, 0.1));
  return { neck, head: add(neck, dir(towardDeg, 0.14)) };
}

function offset(side, dx, dy = 0) {
  const out = {};
  for (const [key, p] of Object.entries(side)) out[key] = [p[0] + dx, p[1] + dy];
  return out;
}

// Standing chain built upwards from the ankle using absolute segment angles
function sideChain({ ankle, shin, thigh, torso, upper, fore }) {
  const knee = add(ankle, dir(shin, L.shin));
  const hip = add(knee, dir(thigh, L.thigh));
  const shoulder = add(hip, dir(torso, L.torso));
  const elbow = add(shoulder, dir(upper, L.upper));
  const wrist = add(elbow, dir(fore, L.fore));
  return { ankle, knee, hip, shoulder, elbow, wrist, ...flatFoot(ankle) };
}

function sidePose(near, far, torsoDeg, extra = {}) {
  return { view: "side", near, far, ...head(near.shoulder, torsoDeg), ...extra };
}

// --- Front view ------------------------------------------------------------

function frontPose({ ankleX = 0.12, upper, fore, lift = 0, dumbbells = false }) {
  const side = (s) => {
    const hip = [0.1 * s, 0.98 + lift];
    const ankle = [ankleX * s, 0.08 + lift];
    const knee = add(lerpP(hip, ankle, 0.5), [0.015 * s, 0]);
    const shoulder = [0.19 * s, 1.5 + lift];
    const elbow = add(shoulder, dir(upper * s, L.upper));
    const wrist = add(elbow, dir(fore * s, L.fore));
    return {
      hip, knee, ankle, shoulder, elbow, wrist,
      heel: [ankle[0], 0.02 + lift],
      toe: [ankle[0] + 0.08 * s, 0.02 + lift],
    };
  };
  const right = side(1);
  const left = side(-1);
  const neck = [0, 1.55 + lift];
  return { view: "front", near: left, far: right, neck, head: [0, 1.7 + lift], dumbbells };
}

// --- Exercises -------------------------------------------------------------

const POSES = {
  squat(t) {
    const near = sideChain({
      ankle: [0, 0.08],
      shin: 35 * t,
      thigh: -3 - 97 * t,
      torso: 5 + 38 * t,
      upper: 180 - 90 * t,
      fore: 180 - 90 * t,
    });
    return sidePose(near, offset(near, -0.04), 5 + 38 * t);
  },

  pushup(t) {
    const ankle = [0, 0.1];
    const shoulderY = lerp(0.61, 0.27, t);
    const body = (Math.acos((shoulderY - ankle[1]) / (L.shin + L.thigh + L.torso)) * 180) / Math.PI;
    const chain = sideChain({ ankle, shin: body, thigh: body, torso: body, upper: 180, fore: 180 });
    const wrist = [1.42 * Math.sin(rad(68.1)), 0.05];
    const elbow = ik(chain.shoulder, wrist, L.upper, L.fore, -1);
    const near = { ...chain, elbow, wrist, ...onToes(ankle) };
    return sidePose(near, offset(near, -0.04, 0.01), body);
  },

  lunge(t) {
    const hip = [lerp(0, -0.03, t), lerp(0.96, 0.55, t)];
    const frontAnkle = [lerp(0, 0.38, t), 0.08];
    const backAnkle = [lerp(0, -0.45, t), 0.08];
    const shoulder = add(hip, dir(2, L.torso));
    const elbow = add(shoulder, dir(185, L.upper));
    const wrist = add(elbow, dir(170, L.fore));
    const near = {
      hip, shoulder, elbow, wrist,
      ankle: frontAnkle,
      knee: ik(hip, frontAnkle, L.thigh, L.shin, 1),
      ...flatFoot(frontAnkle),
    };
    const far = {
      hip: [hip[0] - 0.03, hip[1]],
      shoulder: [shoulder[0] - 0.03, shoulder[1]],
      elbow: [elbow[0] - 0.03, elbow[1]],
      wrist: [wrist[0] - 0.03, wrist[1]],
      ankle: backAnkle,
      knee: ik([hip[0] - 0.03, hip[1]], backAnkle, L.thigh, L.shin, 1),
      ...(t > 0.3 ? onToes(backAnkle, 1 + 3 * t) : flatFoot(backAnkle)),
    };
    return sidePose(near, far, 2);
  },

  curl(t) {
    const near = sideChain({
      ankle: [0, 0.08], shin: 0, thigh: -2, torso: 2, upper: 178, fore: 178 - 145 * t,
    });
    return sidePose(near, offset(near, -0.04), 2, { dumbbells: true });
  },

  press(t) {
    return frontPose({ upper: lerp(95, 20, t), fore: lerp(0, 12, t), dumbbells: true });
  },

  lateral_raise(t) {
    const upper = lerp(172, 90, t);
    return frontPose({ upper, fore: upper - 8, dumbbells: true });
  },

  jumping_jack(t) {
    const arms = lerp(170, 10, t);
    return frontPose({
      ankleX: lerp(0.12, 0.42, t),
      upper: arms,
      fore: arms,
      lift: 0.06 * Math.sin(Math.PI * t),
    });
  },

  glute_bridge(t) {
    const shoulder = [0, 0.12];
    const hip = add(shoulder, dir(90 - lerp(0, 32, t), L.torso));
    const ankle = [0.98, 0.08];
    const near = {
      shoulder, hip, ankle,
      knee: ik(hip, ankle, L.thigh, L.shin, 1),
      elbow: add(shoulder, [0.25, -0.06]),
      wrist: add(shoulder, [0.5, -0.08]),
      ...flatFoot(ankle),
    };
    return {
      view: "side",
      near,
      far: offset(near, -0.03, 0.01),
      neck: add(shoulder, [-0.1, 0]),
      head: add(shoulder, [-0.24, 0.02]),
    };
  },

  situp(t) {
    const hip = [0.5, 0.12];
    const ankle = [1.0, 0.08];
    const phi = rad(lerp(8, 75, t));
    const along = [-Math.cos(phi), Math.sin(phi)];         // hip -> shoulder
    const chest = [Math.sin(phi), Math.cos(phi)];          // front of the body
    const shoulder = [hip[0] + along[0] * L.torso, hip[1] + along[1] * L.torso];
    const onChest = (k, out) => [
      hip[0] + along[0] * L.torso * k + chest[0] * out,
      hip[1] + along[1] * L.torso * k + chest[1] * out,
    ];
    const near = {
      hip, ankle, shoulder,
      knee: ik(hip, ankle, L.thigh, L.shin, 1),
      elbow: onChest(0.6, 0.12),
      wrist: onChest(0.95, 0.1),
      ...flatFoot(ankle),
    };
    const neck = [shoulder[0] + along[0] * 0.1, shoulder[1] + along[1] * 0.1];
    return {
      view: "side",
      near,
      far: offset(near, -0.03, 0.01),
      neck,
      head: [neck[0] + along[0] * 0.13 + chest[0] * 0.03, neck[1] + along[1] * 0.13 + chest[1] * 0.03],
    };
  },

  plank() {
    const ankle = [0, 0.1];
    const shoulderY = 0.05 + L.upper;
    const body = (Math.acos((shoulderY - ankle[1]) / (L.shin + L.thigh + L.torso)) * 180) / Math.PI;
    const chain = sideChain({ ankle, shin: body, thigh: body, torso: body, upper: 180, fore: 90 });
    const elbow = [chain.shoulder[0], 0.05];
    const near = { ...chain, elbow, wrist: [elbow[0] + L.fore, 0.04], ...onToes(ankle) };
    return sidePose(near, offset(near, -0.04, 0.01), body);
  },
};

export function demoPose(exerciseId, t) {
  const pose = POSES[exerciseId] ?? POSES.squat;
  return pose(Math.max(0, Math.min(1, t)));
}

export function hasDemo(exerciseId) {
  return exerciseId in POSES;
}

// Bounding box over the whole movement, so the figure doesn't jump around
export function demoBounds(exerciseId) {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= 10; i++) {
    const pose = demoPose(exerciseId, i / 10);
    const points = [pose.head, pose.neck, ...Object.values(pose.near), ...Object.values(pose.far)];
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const pad = 0.18;
  return { minX: minX - pad, maxX: maxX + pad, minY: -0.05, maxY: maxY + pad };
}
