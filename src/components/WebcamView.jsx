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

  // stores hip position when standing
  const standingHipY = useRef(null);
  const calibrationFrames = useRef([]);


  useEffect(() => {

    function handleResults(results) {

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {

        // draw skeleton
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: "lime",
          lineWidth: 4,
        });

        drawLandmarks(ctx, results.poseLandmarks, {
          color: "red",
          lineWidth: 2,
        });

        // LEFT LEG
        const leftHip = results.poseLandmarks[23];
        const leftKnee = results.poseLandmarks[25];
        const leftAnkle = results.poseLandmarks[27];

        // RIGHT LEG
        const rightHip = results.poseLandmarks[24];
        const rightKnee = results.poseLandmarks[26];
        const rightAnkle = results.poseLandmarks[28];

        // ---------- HIP MOVEMENT ----------
        const hipY = (leftHip.y + rightHip.y) / 2;

        // capture standing hip position once
        // ----- calibration phase -----
if (standingHipY.current === null) {

  calibrationFrames.current.push(hipY);

  // collect first 30 frames
  if (calibrationFrames.current.length < 30) {
    console.log("Calibrating posture...");
    return;
  }

  // compute average standing hip height
  const sum = calibrationFrames.current.reduce((a, b) => a + b, 0);
  standingHipY.current = sum / calibrationFrames.current.length;

  console.log("Calibration complete. Standing hip:", standingHipY.current);
}

        const hipDrop = hipY - standingHipY.current;

        // ---------- KNEE ANGLE ----------
        const leftAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

        const kneeAngle = (leftAngle + rightAngle) / 2;

        // DEBUG
        console.log("Hip drop:", hipDrop);

        // ---------- REP COUNT ----------
        if (hipDrop > 0.02) {

          const { reps, stage, repChanged } = countSquatRep(kneeAngle);

          if (repChanged) {
            console.log("Rep completed:", reps);
          }

        }

      }

      ctx.restore();
    }

    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults(handleResults);

    const camera = new Camera(webcamRef.current.video, {
      onFrame: async () => {
        await pose.send({ image: webcamRef.current.video });
      },
      width: 640,
      height: 480,
    });

    camera.start();

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