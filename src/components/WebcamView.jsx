import { useRef, useEffect, useState } from "react";

import { createPoseDetector, POSE_CONNECTIONS } from "../pose/poseDetector";
import { LM } from "../engine/landmarks";

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

const COLORS = {
  good: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  idle: "#38bdf8",
};

function skeletonColor(state) {
  if (!state || state.status !== "active") return COLORS.idle;
  if (state.issues.some((i) => i.severity === "error")) return COLORS.error;
  if (state.issues.some((i) => i.severity === "warning")) return COLORS.warning;
  return COLORS.good;
}

function drawSkeleton(ctx, landmarks, width, height, color) {
  ctx.lineWidth = Math.max(3, width / 250);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (const { start, end } of POSE_CONNECTIONS) {
    // Skip the face mesh lines; they add clutter without helping
    if (start < 11 || end < 11) continue;
    const a = landmarks[start];
    const b = landmarks[end];
    if ((a.visibility ?? 1) < 0.5 || (b.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  for (const lm of landmarks.slice(11)) {
    if ((lm.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, Math.max(3, width / 300), 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawKneeLabel(ctx, landmarks, state, width, height, mirrored) {
  if (!state?.metrics || !Number.isFinite(state.kneeAngle)) return;
  const side = state.metrics.nearSide === "right" ? LM.RIGHT_KNEE : LM.LEFT_KNEE;
  const knee = landmarks[side];
  const x = (mirrored ? 1 - knee.x : knee.x) * width;
  const y = knee.y * height;

  const text = `${Math.round(state.kneeAngle)}°`;
  ctx.font = `600 ${Math.round(width / 40)}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 16;
  const h = width / 28;
  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.fillRect(x + 12, y - h / 2, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 20, y);
}

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
        }
        ctx.restore();

        if (result.landmarks) {
          drawKneeLabel(ctx, result.landmarks, state, width, height, mirrored);
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
