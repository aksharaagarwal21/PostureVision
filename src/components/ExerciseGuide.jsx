import DemoFigure from "./DemoFigure";
import { getExercise } from "../engine/exercises";
import { getGuide } from "../content/exerciseGuides";

// Animated demo plus numbered steps with a picture for each step
export default function ExerciseGuide({ exerciseId, compact = false }) {
  const exercise = getExercise(exerciseId);
  const guide = getGuide(exerciseId);
  if (!guide) return null;

  return (
    <div className={`guide ${compact ? "guide-compact" : ""}`}>
      <div className="guide-demo">
        <DemoFigure exerciseId={exerciseId} width={compact ? 220 : 280} height={compact ? 165 : 210} />
        <div>
          <p className="guide-muscles">
            <strong>Works:</strong> {guide.muscles}
          </p>
          <p className="muted small">Camera: {exercise.camera}</p>
        </div>
      </div>

      {!compact && (
        <>
          <ol className="guide-steps">
            {guide.steps.map((step, i) => (
              <li key={i} className="guide-step">
                <DemoFigure exerciseId={exerciseId} t={step.t} width={120} height={90} label={`Step ${i + 1}`} />
                <span>
                  <strong>Step {i + 1}.</strong> {step.text}
                </span>
              </li>
            ))}
          </ol>
          <ul className="guide-tips">
            {guide.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
