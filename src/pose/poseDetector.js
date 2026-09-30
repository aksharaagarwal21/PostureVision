// Pose detection with MediaPipe Tasks PoseLandmarker (BlazePose GHUM).
//
// Replaces the legacy @mediapipe/pose solution. Besides 2D image landmarks it
// returns 3D world landmarks in meters, which make joint angles independent
// of where the camera is placed.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const TASKS_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;

export const POSE_MODELS = {
  lite: { label: "Lite (fastest)", size: "6 MB" },
  full: { label: "Full (balanced)", size: "9 MB" },
  heavy: { label: "Heavy (most accurate)", size: "31 MB" },
};

function modelUrl(variant) {
  return (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/" +
    `pose_landmarker_${variant}/float16/latest/pose_landmarker_${variant}.task`
  );
}

let filesetPromise = null;

function loadFileset() {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(WASM_URL).catch((error) => {
      filesetPromise = null;
      throw error;
    });
  }
  return filesetPromise;
}

async function createLandmarker(variant, delegate) {
  const fileset = await loadFileset();
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl(variant), delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputSegmentationMasks: false,
  });
}

// Creates a detector, preferring the GPU and falling back to the CPU.
export async function createPoseDetector(variant = "full") {
  if (!POSE_MODELS[variant]) throw new Error(`Unknown pose model "${variant}"`);

  let landmarker;
  let delegate = "GPU";
  try {
    landmarker = await createLandmarker(variant, "GPU");
  } catch (error) {
    console.warn("GPU pose detection unavailable, using CPU", error);
    delegate = "CPU";
    landmarker = await createLandmarker(variant, "CPU");
  }

  let lastTimestamp = -1;

  return {
    variant,
    delegate,

    // Returns { landmarks, world } for the first person, or nulls when
    // nobody is detected. Timestamps must strictly increase.
    detect(video, timestampMs) {
      const timestamp = Math.max(timestampMs, lastTimestamp + 1);
      lastTimestamp = timestamp;

      const result = landmarker.detectForVideo(video, timestamp);
      return {
        landmarks: result.landmarks?.[0] ?? null,
        world: result.worldLandmarks?.[0] ?? null,
      };
    },

    close() {
      landmarker.close();
    },
  };
}

export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;
