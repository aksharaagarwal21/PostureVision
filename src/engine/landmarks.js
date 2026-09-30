// MediaPipe BlazePose landmark indices
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

export const SIDES = {
  left: {
    shoulder: LM.LEFT_SHOULDER,
    hip: LM.LEFT_HIP,
    knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE,
    heel: LM.LEFT_HEEL,
    foot: LM.LEFT_FOOT_INDEX,
  },
  right: {
    shoulder: LM.RIGHT_SHOULDER,
    hip: LM.RIGHT_HIP,
    knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE,
    heel: LM.RIGHT_HEEL,
    foot: LM.RIGHT_FOOT_INDEX,
  },
};

// Landmarks that must be visible to analyse a squat
export const SQUAT_REQUIRED = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
  LM.LEFT_HIP, LM.RIGHT_HIP,
  LM.LEFT_KNEE, LM.RIGHT_KNEE,
  LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
];
