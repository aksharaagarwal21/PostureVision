let stage = "up";
let reps = 0;
let reachedBottom = false;

let bottomFrameCount = 0;
let lastRepTime = 0;

const REP_COOLDOWN = 1000; // milliseconds

export function countSquatRep(angle) {

  let repChanged = false;
  const now = Date.now();

  // -----------------------------
  // GOING DOWN
  // -----------------------------
  if (angle < 150 && stage === "up") {
    stage = "down";
  }

  // -----------------------------
  // BOTTOM DETECTION
  // -----------------------------
  if (angle < 130) {
    bottomFrameCount++;

    if (bottomFrameCount > 3) {
      reachedBottom = true;
    }

  } else {
    bottomFrameCount = 0;
  }

  // -----------------------------
  // COMING BACK UP
  // -----------------------------
  if (
    angle > 165 &&
    stage === "down" &&
    reachedBottom &&
    now - lastRepTime > REP_COOLDOWN
  ) {

    reps += 1;
    stage = "up";
    reachedBottom = false;
    repChanged = true;
    lastRepTime = now;
  }

  return {
    reps,
    stage,
    repChanged
  };
}
