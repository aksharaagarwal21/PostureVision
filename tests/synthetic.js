// Synthetic BlazePose-style landmarks for a person squatting.
//
// The skeleton is built in body space (meters: forward, up, lateral), posed
// for a squat depth between 0 (standing) and 1 (deep squat), then projected
// into image and world landmarks for a camera at any yaw angle. Noise and
// occlusion can be added to mimic a real pose model.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const DEG = Math.PI / 180;

// Knee angle (degrees) produced by a given depth
export function kneeAngleForDepth(depth) {
  return 175 - 95 * depth;
}

// Returns 33 points in body space: { f, u, l }
function buildSkeleton(depth, opts) {
  const {
    extraLean = 0,     // degrees of additional torso lean (bad form)
    valgus = 0,        // 0..1, knees collapsing inward at depth
    heelLift = 0,      // meters the heels rise at depth
    stance = 0.17,     // half distance between ankles
    shin = 0.42,
    thigh = 0.44,
    torso = 0.5,
    baseLean = 10,     // torso lean when standing, degrees
    arms = null,       // { abduction, flexion, elbow, bend } in degrees
    hipSag = 0,        // meters the hips drop towards the floor (plank/push-up)
    pitch = 0,         // degrees the whole body tips forward (90 = horizontal)
  } = opts;

  const pts = Array.from({ length: 33 }, () => ({ f: 0, u: 0, l: 0 }));
  const shinTilt = 38 * depth * DEG;
  const knee = 175 - 95 * depth;
  const lean = (baseLean + 35 * depth + extraLean * depth) * DEG;

  for (const side of [1, -1]) {
    // side 1 = person's left
    const idx = side === 1
      ? { sh: 11, el: 13, wr: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 }
      : { sh: 12, el: 14, wr: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 };

    const lateralAnkle = side * stance;
    const ankle = { f: 0, u: 0.08, l: lateralAnkle };
    const lift = heelLift * depth;
    pts[idx.ankle] = { ...ankle, u: ankle.u + lift };
    pts[idx.heel] = { f: -0.06, u: 0.02 + lift, l: lateralAnkle };
    pts[idx.toe] = { f: 0.16, u: 0.02, l: lateralAnkle * 1.15 };

    const kneePt = {
      f: ankle.f + shin * Math.sin(shinTilt),
      u: pts[idx.ankle].u + shin * Math.cos(shinTilt),
      l: lateralAnkle * (1 + 0.15 * depth) - side * valgus * 0.14 * depth,
    };
    pts[idx.knee] = kneePt;

    // Rotate the knee->ankle direction by the knee angle to get knee->hip
    const phi = Math.atan2(-Math.cos(shinTilt), -Math.sin(shinTilt));
    const hipDir = phi - knee * DEG;
    pts[idx.hip] = {
      f: kneePt.f + thigh * Math.cos(hipDir),
      u: kneePt.u + thigh * Math.sin(hipDir),
      l: side * 0.1,
    };
  }

  const hipMid = {
    f: (pts[23].f + pts[24].f) / 2,
    u: (pts[23].u + pts[24].u) / 2,
  };
  for (const side of [1, -1]) {
    const sh = side === 1 ? 11 : 12;
    const el = side === 1 ? 13 : 14;
    const wr = side === 1 ? 15 : 16;
    pts[sh] = {
      f: hipMid.f + torso * Math.sin(lean),
      u: hipMid.u + torso * Math.cos(lean),
      l: side * 0.19,
    };
    // Arms held forward for balance
    pts[el] = { f: pts[sh].f + 0.27, u: pts[sh].u - 0.03, l: side * 0.18 };
    pts[wr] = { f: pts[sh].f + 0.52, u: pts[sh].u - 0.02, l: side * 0.12 };
    // Hands
    for (const h of side === 1 ? [17, 19, 21] : [18, 20, 22]) {
      pts[h] = { f: pts[wr].f + 0.06, u: pts[wr].u, l: pts[wr].l };
    }
  }

  // Head
  const neck = { f: (pts[11].f + pts[12].f) / 2, u: (pts[11].u + pts[12].u) / 2 };
  const head = {
    f: neck.f + 0.2 * Math.sin(lean * 0.7) + 0.06,
    u: neck.u + 0.2 * Math.cos(lean * 0.7),
  };
  for (let i = 0; i <= 10; i++) {
    const l = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * 0.04 * Math.min(i, 4) / 4;
    pts[i] = { f: head.f + 0.05, u: head.u + (i >= 9 ? -0.06 : 0.02), l };
  }
  pts[7] = { f: head.f - 0.04, u: head.u, l: 0.08 };
  pts[8] = { f: head.f - 0.04, u: head.u, l: -0.08 };

  if (arms) poseArms(pts, arms);
  if (hipSag) {
    // The front of the body faces the floor once pitched forward
    pts[23].f += hipSag;
    pts[24].f += hipSag;
  }
  if (pitch) tipForward(pts, pitch);

  return pts;
}

const add = (a, b, k = 1) => ({ f: a.f + b.f * k, u: a.u + b.u * k, l: a.l + b.l * k });
const dot = (a, b) => a.f * b.f + a.u * b.u + a.l * b.l;
const unit = (a) => {
  const n = Math.hypot(a.f, a.u, a.l) || 1;
  return { f: a.f / n, u: a.u / n, l: a.l / n };
};

// abduction: arm out to the side (0 = down, 90 = shoulder height, 180 = up)
// flexion: arm forward; elbow: bend (0 = straight); bend: "forward" or "up"
function poseArms(pts, { abduction = 10, flexion = 0, elbow = 10, bend = "forward" }) {
  const a = abduction * DEG;
  const fl = flexion * DEG;
  const e = elbow * DEG;
  for (const side of [1, -1]) {
    const [sh, el, wr] = side === 1 ? [11, 13, 15] : [12, 14, 16];
    const upper = unit({
      f: Math.sin(fl),
      u: -Math.cos(fl) * Math.cos(a),
      l: side * Math.cos(fl) * Math.sin(a),
    });
    let pref = bend === "up" ? { f: 0, u: 1, l: 0 } : { f: 1, u: 0, l: 0 };
    let perp = add(pref, upper, -dot(pref, upper));
    if (Math.hypot(perp.f, perp.u, perp.l) < 1e-3) {
      pref = bend === "up" ? { f: 1, u: 0, l: 0 } : { f: 0, u: 1, l: 0 };
      perp = add(pref, upper, -dot(pref, upper));
    }
    perp = unit(perp);
    const fore = unit(add({ f: upper.f * Math.cos(e), u: upper.u * Math.cos(e), l: upper.l * Math.cos(e) }, perp, Math.sin(e)));

    pts[el] = add(pts[sh], upper, 0.3);
    pts[wr] = add(pts[el], fore, 0.27);
    for (const h of side === 1 ? [17, 19, 21] : [18, 20, 22]) {
      pts[h] = add(pts[wr], fore, 0.06);
    }
  }
}

// Rotate the body forward around the feet, then rest it on the floor
function tipForward(pts, pitchDeg) {
  const p = pitchDeg * DEG;
  for (const pt of pts) {
    const f = pt.f * Math.cos(p) + pt.u * Math.sin(p);
    const u = pt.u * Math.cos(p) - pt.f * Math.sin(p);
    pt.f = f;
    pt.u = u;
  }
  const minU = Math.min(...pts.map((pt) => pt.u));
  const meanF = pts.reduce((sum, pt) => sum + pt.f, 0) / pts.length;
  for (const pt of pts) {
    pt.u += 0.03 - minU;
    pt.f -= meanF;
  }
}

// yaw: 0 = facing the camera, 90 = side view facing image right,
// -90 = side view facing image left
export function synthPose(depth, options = {}) {
  const {
    yaw = 90,
    scale = 0.42,          // image units per meter
    center = { x: 0.5, y: 0.55 },
    noise = 0,             // std-dev of image landmark noise
    worldNoise = 0,        // std-dev of world landmark noise (meters)
    rand = Math.random,
  } = options;

  const body = buildSkeleton(depth, options);
  const c = Math.cos(yaw * DEG);
  const s = Math.sin(yaw * DEG);

  const hipMid = {
    f: (body[23].f + body[24].f) / 2,
    u: (body[23].u + body[24].u) / 2,
    l: 0,
  };
  // Lying poses are wide: shrink them to fit the frame
  const fit = options.pitch ? 0.6 : 1;

  const landmarks = [];
  const world = [];

  body.forEach((p) => {
    const x = p.l * c + p.f * s;
    const z = -p.f * c + p.l * s;
    world.push({
      x: x - (hipMid.l * c + hipMid.f * s) + worldNoise * gaussian(rand),
      y: -(p.u - hipMid.u) + worldNoise * gaussian(rand),
      z: z - (-hipMid.f * c + hipMid.l * s) + worldNoise * gaussian(rand),
      visibility: 0.99,
    });
    landmarks.push({
      x: center.x + x * scale * fit + noise * gaussian(rand),
      // Feet near the bottom of the frame, head near the top
      y: center.y + 0.37 - p.u * scale * fit * 1.1 + noise * gaussian(rand),
      z: z * scale * fit,
      visibility: 0.99,
    });
  });

  // Side view: the leg further from the camera is partly hidden
  if (Math.abs(yaw) > 60) {
    const farLeft = (yaw > 0) === true; // facing right => person's left is far
    const far = farLeft ? [11, 13, 15, 23, 25, 27, 29, 31] : [12, 14, 16, 24, 26, 28, 30, 32];
    for (const i of far) {
      landmarks[i].visibility = 0.35;
      world[i].visibility = 0.35;
    }
  }

  return { landmarks, world };
}

// Knee-angle trace for a sequence of reps at `fps`.
// reps: [{ depth, durationMs, pauseMs }]
export function squatDepthTrace(reps, { fps = 30, leadMs = 1500 } = {}) {
  const dt = 1000 / fps;
  const frames = [];
  let t = 0;

  const hold = (ms) => {
    for (let e = 0; e < ms; e += dt) {
      frames.push({ t, depth: 0 });
      t += dt;
    }
  };

  hold(leadMs);
  for (const rep of reps) {
    const n = Math.max(2, Math.round(rep.durationMs / dt));
    for (let i = 0; i <= n; i++) {
      // Smooth down and up with a short pause at the bottom
      const phase = i / n;
      const shaped = Math.sin(Math.PI * phase);
      frames.push({ t, depth: rep.depth * Math.min(1, shaped * 1.15) });
      t += dt;
    }
    hold(rep.pauseMs ?? 600);
  }
  return frames;
}

// Generic rep trace: `level` goes 0 (rest) -> 1 (full rep) -> 0.
// reps: [{ level, durationMs, pauseMs }]
export function repTrace(reps, options) {
  return squatDepthTrace(reps.map((r) => ({ ...r, depth: r.level })), options).map((f) => ({
    t: f.t,
    level: f.depth,
  }));
}
