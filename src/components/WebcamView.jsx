import { useRef, useEffect } from "react";
import Webcam from "react-webcam";

import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

import { calculateAngle } from "../engine/angleUtils";
import { countSquatRep } from "../engine/repCounter";

export default function WebcamView() {

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  const standingHipY = useRef(null);
  const calibrationFrames = useRef([]);

  const prevAngle = useRef(180);
  const repCount = useRef(0);

  useEffect(() => {

    function handleResults(results) {

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {

        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: "lime",
          lineWidth: 4,
        });

        drawLandmarks(ctx, results.poseLandmarks, {
          color: "red",
          lineWidth: 2,
        });

        const leftHip = results.poseLandmarks[23];
        const leftKnee = results.poseLandmarks[25];
        const leftAnkle = results.poseLandmarks[27];

        const rightHip = results.poseLandmarks[24];
        const rightKnee = results.poseLandmarks[26];
        const rightAnkle = results.poseLandmarks[28];

        // Ignore unreliable frames
        if (
          leftHip.visibility < 0.6 ||
          rightHip.visibility < 0.6 ||
          leftKnee.visibility < 0.6 ||
          rightKnee.visibility < 0.6
        ) {
          ctx.restore();
          return;
        }

        // -------------------------
        // HIP MOVEMENT
        // -------------------------
        const hipY = (leftHip.y + rightHip.y) / 2;

        if (standingHipY.current === null) {

          calibrationFrames.current.push(hipY);

          if (calibrationFrames.current.length >= 30) {

            const sum = calibrationFrames.current.reduce((a, b) => a + b, 0);
            standingHipY.current = sum / calibrationFrames.current.length;

            console.log("Calibration complete:", standingHipY.current);

          } else {
            console.log("Calibrating posture...");
            ctx.restore();
            return;
          }
        }

        const hipDrop = hipY - standingHipY.current;

        // -------------------------
        // KNEE ANGLE
        // -------------------------
        const leftAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

        const rawAngle = Math.min(leftAngle, rightAngle);

        const kneeAngle =
          0.8 * prevAngle.current +
          0.2 * rawAngle;

        prevAngle.current = kneeAngle;

        console.log("Knee angle:", kneeAngle);
        console.log("Hip drop:", hipDrop);

        // -------------------------
        // REP COUNT
        // -------------------------
        if (Math.abs(hipDrop) > 0.05) {

          const { reps, repChanged } = countSquatRep(kneeAngle);
          repCount.current = reps;

          if (repChanged) {
            console.log("Rep completed:", reps);
          }
        }

        // -------------------------
        // DRAW REP COUNTER
        // -------------------------
        ctx.font = "40px Arial";
        ctx.fillStyle = "yellow";
        ctx.fillText("Reps: " + repCount.current, 20, 50);
      }

      ctx.restore();
    }

    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    pose.onResults(handleResults);

    const startCamera = () => {
      if (!webcamRef.current || !webcamRef.current.video) return;

      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          await pose.send({ image: webcamRef.current.video });
        },
        width: 640,
        height: 480,
      });

      camera.start();
    };

    setTimeout(startCamera, 500);

  }, []);

  return (
    <div style={{ position: "relative" }}>
      <Webcam
        ref={webcamRef}
        style={{
          position: "absolute",
          visibility: "hidden",
        }}
      />

      <canvas
        ref={canvasRef}
        width={640}
        height={480}
      />
    </div>
  );
}
