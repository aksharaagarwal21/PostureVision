import { useEffect, useRef } from "react";

import { demoPose, demoBounds } from "../demo/demoPoses";
import { drawDemo, demoColors, demoPhase } from "../demo/drawDemo";
import { getExercise } from "../engine/exercises";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Animated demo of an exercise. Pass `t` to show one fixed position instead.
export default function DemoFigure({ exerciseId, t = null, width = 240, height = 180, label }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const bounds = demoBounds(exerciseId);
    const colors = demoColors(canvas);
    const exercise = getExercise(exerciseId);
    const cycleMs = Math.max(1600, (exercise.secondsPerRep ?? 2.5) * 1000 * 1.3);

    const render = (phase) => drawDemo(ctx, demoPose(exerciseId, phase), bounds, { width, height, colors });

    if (t !== null || exercise.staticDemo || prefersReducedMotion()) {
      render(t ?? (exercise.staticDemo ? 0 : 1));
      return undefined;
    }

    let frame;
    const start = performance.now();
    const loop = (now) => {
      render(demoPhase(now - start, cycleMs));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [exerciseId, t, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="demo-figure"
      style={{ width, height }}
      role="img"
      aria-label={label ?? `${getExercise(exerciseId).name} demonstration`}
    />
  );
}
