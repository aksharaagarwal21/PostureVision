import { useCallback, useEffect, useRef, useState } from "react";

import WebcamView from "./WebcamView";
import StatsPanel from "./StatsPanel";
import FeedbackPanel from "./FeedbackPanel";
import RepHistory from "./RepHistory";
import TrainingPanel from "./TrainingPanel";
import { WorkoutSession, CLASS_LABELS } from "../engine/workoutSession";
import { PoseClassifier } from "../engine/poseClassifier";
import { saveModel, loadModel, deleteModel } from "../engine/modelStore";
import { POSE_MODELS } from "../pose/poseDetector";

const CLASSIFIER_KEY = "classifier:squat";
const SPEAK_COOLDOWN_MS = 4000;

function createSession() {
  const classifier = PoseClassifier.fromJSON(loadModel(CLASSIFIER_KEY)) ?? new PoseClassifier({ labels: CLASS_LABELS });
  return new WorkoutSession({ exercise: "squat", classifier });
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export default function WorkoutView() {
  const [session] = useState(createSession);
  const [state, setState] = useState(null);
  const [model, setModel] = useState("full");
  const [mirrored, setMirrored] = useState(true);
  const [voice, setVoice] = useState(false);
  const [requireClassifier, setRequireClassifier] = useState(false);
  const [detectorStatus, setDetectorStatus] = useState("");
  const lastSpoken = useRef(0);

  const handleFrame = useCallback((next) => setState(next), []);

  // Voice coach: announce reps and the most important form error
  useEffect(() => {
    if (!voice || !state) return;
    const now = performance.now();
    if (state.event?.type === "rep") {
      speak(String(state.reps));
      lastSpoken.current = now;
      return;
    }
    const error = state.issues.find((i) => i.severity === "error");
    if (error && now - lastSpoken.current > SPEAK_COOLDOWN_MS) {
      speak(error.message.split(":")[0]);
      lastSpoken.current = now;
    }
  }, [state, voice]);

  const handleTrained = useCallback(() => {
    saveModel(CLASSIFIER_KEY, session.classifier.toJSON());
  }, [session]);

  function handleClearTraining() {
    session.clearTraining();
    setRequireClassifier(false);
    deleteModel(CLASSIFIER_KEY);
  }

  function handleRequireClassifier(value) {
    setRequireClassifier(value);
    session.setRequireClassifier(value);
  }

  return (
    <div className="workout">
      <div className="stage">
        <WebcamView
          session={session}
          model={model}
          mirrored={mirrored}
          onFrame={handleFrame}
          onStatus={setDetectorStatus}
        />
        <div className="controls">
          <label>
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {Object.entries(POSE_MODELS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label} · {info.size}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
            Mirror
          </label>
          <label className="toggle">
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
            Voice coach
          </label>
          <button onClick={() => session.recalibrate()} className="secondary">Recalibrate</button>
          <button onClick={() => session.reset()} className="secondary">Reset</button>
          <span className="muted small">{detectorStatus}</span>
        </div>
      </div>

      <aside className="sidebar">
        <StatsPanel state={state} />
        <FeedbackPanel state={state} />
        <RepHistory history={state?.history} />
        <TrainingPanel
          session={session}
          state={state}
          requireClassifier={requireClassifier}
          onRequireClassifier={handleRequireClassifier}
          onTrained={handleTrained}
          onClear={handleClearTraining}
        />
      </aside>
    </div>
  );
}
