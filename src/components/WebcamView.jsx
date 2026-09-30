import { useRef, useEffect, useState } from "react";

import { createPoseDetector } from "../pose/poseDetector";
import {
  skeletonColor,
  drawSkeleton,
  drawMistakeMarks,
  drawMistakeBanner,
  drawAngleLabel,
} from "./overlay";

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

const CAMERA_RETRIES = 4;
const CAMERA_RETRY_MS = 800;

function cameraErrorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
      return "Camera access was blocked. Allow camera access in your browser, then try again.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is being used by another app or browser tab. Close it (Zoom, Teams, Camera app, other PostureVision tabs), then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Plug in a webcam, then try again.";
    default:
      return err?.message || String(err);
  }
}

// How often the React UI is updated (the canvas still renders every frame)
const UI_UPDATE_MS = 100;

export default function WebcamView({ session, model = "full", mirrored = true, onFrame, onStatus }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const callbacks = useRef({ onFrame, onStatus });
  const mirroredRef = useRef(mirrored);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    callbacks.current = { onFrame, onStatus };
  }, [onFrame, onStatus]);

  // Read on every frame, so toggling it doesn't restart the camera
  useEffect(() => {
    mirroredRef.current = mirrored;
  }, [mirrored]);

  useEffect(() => {
    let cancelled = false;
    let detector = null;
    let stream = null;
    let frameHandle = null;
    let lastUiUpdate = 0;
    let fps = 0;
    let lastFrameTime = null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function renderFrame() {
      if (cancelled) return;

      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const { width, height } = canvas;
        const mirrored = mirroredRef.current;

        const now = performance.now();
        if (lastFrameTime !== null) {
          fps += 0.1 * (1000 / Math.max(1, now - lastFrameTime) - fps);
        }
        lastFrameTime = now;

        const result = detector.detect(video, now);
        const state = session.processFrame(result, now);

        ctx.save();
        if (mirrored) {
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, width, height);
        if (result.landmarks) {
          drawSkeleton(ctx, result.landmarks, width, height, skeletonColor(state));
          drawMistakeMarks(ctx, result.landmarks, state, width, height, now);
        }
        ctx.restore();

        if (result.landmarks) {
          drawAngleLabel(ctx, result.landmarks, state, width, height, mirrored);
          drawMistakeBanner(ctx, state, width);
        }

        // Throttle React updates, but never drop a rep event
        if (now - lastUiUpdate >= UI_UPDATE_MS || state.event) {
          lastUiUpdate = now;
          callbacks.current.onFrame?.({ ...state, fps: Math.round(fps) });
        }
      }

      frameHandle = requestAnimationFrame(renderFrame);
    }

    async function openCamera() {
      // Windows can report the camera as busy for a moment after another
      // stream on it was stopped, so retry a few times before giving up
      for (let tries = 1; ; tries++) {
        try {
          return await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
        } catch (err) {
          const busy = err?.name === "NotReadableError" || err?.name === "AbortError";
          if (!busy || tries >= CAMERA_RETRIES || cancelled) throw err;
          await new Promise((resolve) => setTimeout(resolve, CAMERA_RETRY_MS));
        }
      }
    }

    async function start() {
      try {
        callbacks.current.onStatus?.("Starting camera…");
        const opened = await openCamera();
        if (cancelled) {
          // Cleanup already ran; release the camera we just opened
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        video.srcObject = stream;
        await video.play();

        callbacks.current.onStatus?.("Loading pose model…");
        const created = await createPoseDetector(model);
        if (cancelled) {
          created.close();
          return;
        }
        detector = created;

        callbacks.current.onStatus?.(`Pose model: ${model} (${detector.delegate})`);
        setError(null);
        renderFrame();
      } catch (err) {
        if (cancelled) return;
        setError(cameraErrorMessage(err));
        callbacks.current.onStatus?.("Error");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      detector?.close();
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [model, session, attempt]);

  return (
    <div className="camera">
      <video ref={videoRef} playsInline muted className="camera-video" />
      <canvas ref={canvasRef} width={1280} height={720} className="camera-canvas" />
      {error && (
        <div className="camera-error">
          <span>{error}</span>
          <button onClick={() => { setError(null); setAttempt((n) => n + 1); }}>Try again</button>
        </div>
      )}
    </div>
  );
}
