import { useCallback, useEffect, useRef, useState } from "react";

import WebcamView from "./WebcamView";
import ExercisePicker from "./ExercisePicker";
import StatsPanel from "./StatsPanel";
import FeedbackPanel from "./FeedbackPanel";
import RepHistory from "./RepHistory";
import TrainingPanel from "./TrainingPanel";
import { WorkoutSession, CLASS_LABELS } from "../engine/workoutSession";
import { PoseClassifier } from "../engine/poseClassifier";
import { getExercise } from "../engine/exercises";
import { VoiceCoach, createBrowserSpeaker, stopSpeaking } from "../engine/voiceCoach";
import { saveModel, loadModel, deleteModel } from "../engine/modelStore";
import { POSE_MODELS } from "../pose/poseDetector";

const modelKey = (exerciseId) => `classifier:${exerciseId}`;

function loadClassifier(exerciseId) {
  return PoseClassifier.fromJSON(loadModel(modelKey(exerciseId))) ?? new PoseClassifier({ labels: CLASS_LABELS });
}

export default function WorkoutView() {
  const [exerciseId, setExerciseId] = useState("squat");
  const [session] = useState(() => new WorkoutSession({ exercise: "squat", classifier: loadClassifier("squat") }));
  const [coach] = useState(() => new VoiceCoach(createBrowserSpeaker()));
  const [state, setState] = useState(null);
  const [model, setModel] = useState("full");
  const [mirrored, setMirrored] = useState(true);
  const [voice, setVoice] = useState(true);
  const [requireClassifier, setRequireClassifier] = useState(false);
  const [detectorStatus, setDetectorStatus] = useState("");
  const voiceRef = useRef(voice);

  const exercise = getExercise(exerciseId);

  useEffect(() => {
    voiceRef.current = voice;
    if (!voice) stopSpeaking();
  }, [voice]);

  useEffect(() => () => stopSpeaking(), []);

  // Called from the camera loop (throttled, but never drops rep events)
  const handleFrame = useCallback(
    (next) => {
      setState(next);
      if (voiceRef.current) coach.update(next, session.exercise, performance.now());
    },
    [coach, session]
  );

  function handleExerciseChange(id) {
    if (id === exerciseId) return;
    session.setExercise(id, loadClassifier(id));
    session.setRequireClassifier(false);
    setRequireClassifier(false);
    setExerciseId(id);
    setState(null);
    if (voiceRef.current) coach.introduce(getExercise(id), performance.now());
    else coach.reset();
  }

  function handleReset() {
    session.reset();
    coach.reset();
  }

  function handleRecalibrate() {
    session.recalibrate();
    coach.reset();
  }

  const handleTrained = useCallback(() => {
    saveModel(modelKey(session.exercise.id), session.classifier.toJSON());
  }, [session]);

  function handleClearTraining() {
    session.clearTraining();
    setRequireClassifier(false);
    deleteModel(modelKey(exerciseId));
  }

  function handleRequireClassifier(value) {
    setRequireClassifier(value);
    session.setRequireClassifier(value);
  }

  return (
    <div className="workout">
      <div className="stage">
        <ExercisePicker value={exerciseId} onChange={handleExerciseChange} />
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
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
            Voice coach
          </label>
          <label className="toggle">
            <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
            Mirror
          </label>
          <button onClick={handleRecalibrate} className="secondary">Recalibrate</button>
          <button onClick={handleReset} className="secondary">Reset</button>
          <span className="muted small">{detectorStatus}</span>
        </div>
      </div>

      <aside className="sidebar">
        <StatsPanel state={state} exercise={exercise} />
        <FeedbackPanel state={state} />
        {exercise.kind === "reps" && <RepHistory history={state?.history} />}
        <TrainingPanel
          key={exerciseId}
          exercise={exercise}
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
