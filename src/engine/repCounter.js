let stage = "up";
let reps = 0;
let reachedBottom = false;

export function countSquatRep(angle) {
  let repChanged = false;

  // Going down
  if (angle < 120 && stage === "up") {
    stage = "down";
  }

  // Bottom of squat
  if (angle < 90) {
    reachedBottom = true;
  }

  // Coming back up and completing rep
  if (angle > 165 && stage === "down" && reachedBottom) {
    stage = "up";
    reps += 1;
    repChanged = true;
    reachedBottom = false;
  }

  return {
    reps,
    stage,
    repChanged
  };
}