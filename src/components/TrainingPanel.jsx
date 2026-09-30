import { useEffect, useRef, useState } from "react";

const COUNTDOWN_S = 3;
const RECORD_MS = 4000;

const LABEL_HINTS = {
  up: "Stand tall, then shift slightly and move your arms while recording",
  down: "Hold the bottom of your squat; bob a little up and down while recording",
};

export default function TrainingPanel({ session, state, requireClassifier, onRequireClassifier, onTrained, onClear }) {
  const [countdown, setCountdown] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const recording = state?.recording;
  const counts = state?.trainingCounts ?? session.classifier.counts;
  const trained = state?.classifierTrained ?? session.classifier.isTrained;
  const busy = countdown !== null || Boolean(recording);

  // Save once a recording finishes
  const wasRecording = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !recording) {
      onTrained();
    }
    wasRecording.current = Boolean(recording);
  }, [recording, onTrained]);

  function record(label) {
    setEvaluation(null);
    let remaining = COUNTDOWN_S;
    setCountdown({ label, remaining });
    timer.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer.current);
        setCountdown(null);
        session.startRecording(label, RECORD_MS);
      } else {
        setCountdown({ label, remaining });
      }
    }, 1000);
  }

  function evaluate() {
    setEvaluation(session.classifier.evaluate());
  }

  const prob = state?.classification?.probabilities;

  return (
    <section className="panel">
      <h2>Train on your body</h2>
      <p className="muted small">
        Record a few seconds of each position in your own space. The model learns your body and camera
        setup and tunes the rep thresholds to your squat.
      </p>

      <div className="train-buttons">
        {["rest", "active"].map((label) => (
          <button key={label} onClick={() => record(label)} disabled={busy}>
            Record {label.toUpperCase()} <span className="badge">{counts[label] ?? 0}</span>
          </button>
        ))}
      </div>

      {countdown && (
        <p className="status-banner">
          Get into the {countdown.label.toUpperCase()} position… {countdown.remaining}
          <br />
          <span className="small">{LABEL_HINTS[countdown.label]}</span>
        </p>
      )}
      {recording && (
        <div className="recording">
          <span>
            Recording {recording.label.toUpperCase()}: {recording.added} samples
          </span>
          <div className="depth">
            <div className="depth-bar recording-bar" style={{ width: `${Math.round(recording.progress * 100)}%` }} />
          </div>
        </div>
      )}

      {trained ? (
        <>
          {prob && (
            <p className="small">
              Live: rest {Math.round((prob.rest ?? 0) * 100)}% · active {Math.round((prob.active ?? 0) * 100)}%
            </p>
          )}
          <label className="toggle">
            <input
              type="checkbox"
              checked={requireClassifier}
              onChange={(e) => onRequireClassifier(e.target.checked)}
            />
            Only count reps the trained model confirms
          </label>
          <div className="train-buttons">
            <button onClick={evaluate} disabled={busy}>Test accuracy</button>
            <button onClick={onClear} disabled={busy} className="secondary">Clear training</button>
          </div>
          {evaluation && (
            <p className="small">
              Leave-one-out accuracy: <strong>{(evaluation.accuracy * 100).toFixed(1)}%</strong> on{" "}
              {evaluation.total} samples
            </p>
          )}
        </>
      ) : (
        <p className="small muted">Record at least 10 samples of each position to enable the model.</p>
      )}
    </section>
  );
}
