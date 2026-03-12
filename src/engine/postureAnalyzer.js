export function analyzeSquatPosture(landmarks) {

  const leftHip = landmarks[23];
  const leftKnee = landmarks[25];
  const leftAnkle = landmarks[27];
  const leftShoulder = landmarks[11];

  const rightHip = landmarks[24];
  const rightKnee = landmarks[26];
  const rightAnkle = landmarks[28];
  const rightShoulder = landmarks[12];

  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;

  const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;

  const kneeX = (leftKnee.x + rightKnee.x) / 2;
  const ankleX = (leftAnkle.x + rightAnkle.x) / 2;

  let feedback = [];

  // Back lean
  const backAngle = Math.abs(shoulderX - hipX);

  if (backAngle > 0.15) {
    feedback.push("Back leaning too forward");
  }

  // Knee over toe
  if (kneeX > ankleX + 0.05) {
    feedback.push("Knees going too far forward");
  }

  // Depth
  if (hipY < leftKnee.y - 0.02) {
    feedback.push("Good squat depth");
  } else {
    feedback.push("Go lower");
  }

  return feedback;
}
