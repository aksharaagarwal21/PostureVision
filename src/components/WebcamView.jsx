import { useRef, useEffect, useState } from "react";

import { createPoseDetector, POSE_CONNECTIONS } from "../pose/poseDetector";
import { SquatSession } from "../engine/squatSession";

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

function drawSkeleton(ctx, landmarks, width, height) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = "lime";
  for (const { start, end } of POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if ((a.visibility ?? 1) < 0.5 || (b.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "red";
  for (const lm of landmarks.slice(11)) {
    if ((lm.visibility ?? 1) < 0.5) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export default function WebcamView({ model = "full" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [session] = useState(() => new SquatSession());
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let detector = null;
    let stream = null;
    let frameHandle = null;

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

        const now = performance.now();
        const result = detector.detect(video, now);
        const state = session.processFrame(result, now);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (result.landmarks) {
          drawSkeleton(ctx, result.landmarks, canvas.width, canvas.height);
        }

        ctx.font = "40px Arial";
        ctx.fillStyle = "yellow";
        ctx.fillText("Reps: " + state.reps, 20, 50);
      }

      frameHandle = requestAnimationFrame(renderFrame);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();

        detector = await createPoseDetector(model);
        if (cancelled) return;

        renderFrame();
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
    }

    start();

    return () => {
      cancelled = true;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      detector?.close();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [model, session]);

  return (
    <div style={{ position: "relative" }}>
      <video ref={videoRef} playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} width={640} height={480} />
      {error && <p>Camera or model error: {error}</p>}
    </div>
  );
}
