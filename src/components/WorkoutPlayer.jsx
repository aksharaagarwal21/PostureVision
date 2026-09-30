import { useCallback, useEffect, useRef, useState } from "react";

import WebcamView from "./WebcamView";
import DemoFigure from "./DemoFigure";
import FeedbackPanel from "./FeedbackPanel";
import { WorkoutSession, CLASS_LABELS } from "../engine/workoutSession";
import { WorkoutRunner, RunPhase } from "../engine/workoutRunner";
import { announce } from "../engine/workoutAnnouncer";
import { VoiceCoach, createBrowserSpeaker, stopSpeaking } from "../engine/voiceCoach";
import { PoseClassifier } from "../engine/poseClassifier";
import { getExercise } from "../engine/exercises";
import { getGuide } from "../content/exerciseGuides";
import { describeTarget, formatDuration } from "../engine/workoutPlan";
import { loadModel } from "../engine/modelStore";

const TICK_MS = 100;

function loadClassifier(exerciseId) {
  return PoseClassifier.fromJSON(loadModel(`classifier:${exerciseId}`)) ?? new PoseClassifier({ labels: CLASS_LABELS });
}

// Numbers the runner needs from the live session state
function liveNumbers(state) {
  if (!state) return {};
  return {
    reps: state.reps,
    partialReps: state.partialReps,
    formScore: state.formScore,
    averageFormScore: state.averageFormScore ?? (state.hold ? holdScore(state.hold) : state.formScore),
    holdMs: state.hold?.totalMs ?? 0,
  };
}

function holdScore(hold) {
  return hold.totalMs > 0 ? Math.round((100 * hold.goodFormMs) / hold.totalMs) : null;
}

function BreakOverlay({ runner, now, onSkip, onExtend }) {
  const step = runner.step;
  const exercise = getExercise(step.exerciseId);
  const guide = getGuide(step.exerciseId);
  const remaining = Math.ceil((runner.remainingMs(now) ?? 0) / 1000);
  const resting = runner.phase === RunPhase.REST;
  const newExercise = step.set === 1;

  return (
    <div className="break-overlay">
      <div className="break-card">
        <p className="break-label">{resting ? "Rest" : "Get ready"}</p>
        <p className="break-count" aria-live="polite">{remaining}</p>
        <p className="break-next">
          {resting ? "Next: " : ""}
          <strong>{exercise.name}</strong> · Set {step.set} of {step.totalSets} · {describeTarget(step)}
        </p>
        {(newExercise || !resting) && (
          <div className="break-demo">
            <DemoFigure exerciseId={step.exerciseId} width={220} height={165} />
            {guide && (
              <ol className="break-steps">
                {guide.steps.slice(0, 3).map((s, i) => (
                  <li key={i}>{s.text}</li>
                ))}
              </ol>
            )}
          </div>
        )}
        <p className="muted small">{exercise.camera}</p>
        <div className="break-actions">
          <button type="button" onClick={onExtend}>+20 s</button>
          <button type="button" className="primary" onClick={onSkip}>
            {resting ? "Skip rest" : "Start now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetPanel({ runner, state, now, onFinishSet }) {
  const step = runner.step;
  const exercise = getExercise(step.exerciseId);
  const timed = step.targetType === "time";
  const reps = state?.reps ?? 0;
  const remainingMs = timed ? runner.workRemainingMs(now) ?? 0 : null;
  const progress = timed
    ? 1 - remainingMs / (step.seconds * 1000)
    : Math.min(1, reps / step.reps);
  const holdingNow = exercise.kind !== "hold" || state?.hold?.holding;

  return (
    <section className="panel target-panel">
      <p className="target-exercise">
        <strong>{exercise.name}</strong> · Set {step.set} of {step.totalSets}
      </p>
      {timed ? (
        <p className="target-big">
          {formatDuration(Math.ceil(remainingMs / 1000))}
          <span className="target-unit"> left</span>
        </p>
      ) : (
        <p className="target-big">
          {reps}
          <span className="target-unit"> / {step.reps} reps</span>
        </p>
      )}
      <div className="depth" aria-label="Set progress">
        <div className="depth-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {exercise.kind === "hold" && !holdingNow && (
        <p className="status-banner">Get into position: the timer runs while you hold the plank</p>
      )}
      {state && state.status !== "active" && exercise.kind !== "hold" && state.message && (
        <p className="status-banner">{state.message}</p>
      )}
      <dl className="meta">
        <div>
          <dt>Set time</dt>
          <dd>{formatDuration(runner.phaseElapsed(now) / 1000)}</dd>
        </div>
        <div>
          <dt>Form score</dt>
          <dd>{state?.formScore ?? "–"}</dd>
        </div>
        {timed && exercise.kind !== "hold" ? (
          <div>
            <dt>Reps so far</dt>
            <dd>{reps}</dd>
          </div>
        ) : !timed ? (
          <div>
            <dt>Not counted</dt>
            <dd>{state?.partialReps ?? 0}</dd>
          </div>
        ) : null}
        <div>
          <dt>{state?.angleLabel ?? "Angle"}</dt>
          <dd>{Number.isFinite(state?.angle) ? `${Math.round(state.angle)}°` : "–"}</dd>
        </div>
      </dl>
      <button type="button" className="secondary" onClick={onFinishSet}>
        Finish set
      </button>
    </section>
  );
}

function SetLog({ results }) {
  if (results.length === 0) return null;
  return (
    <section className="panel">
      <h2>Completed sets</h2>
      <table className="history">
        <thead>
          <tr>
            <th>Exercise</th>
            <th>Set</th>
            <th>Done</th>
            <th>Form</th>
          </tr>
        </thead>
        <tbody>
          {[...results].reverse().map((r, i) => (
            <tr key={i}>
              <td>{getExercise(r.exerciseId).name}</td>
              <td>{r.set}/{r.totalSets}</td>
              <td>
                {r.targetType === "time"
                  ? `${Math.round(r.holdMs ? r.holdMs / 1000 : r.durationMs / 1000)} s`
                  : `${r.reps}/${r.target}`}
              </td>
              <td>{r.formScore ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function WorkoutPlayer({ plan, profile, onFinish, onExit }) {
  const [runner] = useState(() => new WorkoutRunner(plan, { weightKg: profile.weightKg }));
  const [session] = useState(() => {
    const first = plan.items[0].exerciseId;
    return new WorkoutSession({ exercise: first, classifier: loadClassifier(first) });
  });
  const [speaker] = useState(() => createBrowserSpeaker());
  const [coach] = useState(() => new VoiceCoach(speaker, { announceReady: false }));
  const [voice, setVoice] = useState(true);
  const [mirrored, setMirrored] = useState(true);
  const [state, setState] = useState(null);
  const [now, setNow] = useState(() => performance.now());
  const [, force] = useState(0);
  const voiceRef = useRef(voice);
  const liveRef = useRef({});
  const finishedRef = useRef(false);

  useEffect(() => {
    voiceRef.current = voice;
    if (!voice) stopSpeaking();
  }, [voice]);

  const handleEvents = useCallback(
    (events) => {
      if (events.length === 0) return;
      for (const event of events) {
        if (event.type === RunPhase.WORK) {
          session.startSet();
          coach.reset();
        } else if (event.type === RunPhase.REST || event.type === RunPhase.GET_READY) {
          // Switch exercise during the break so calibration can happen early
          const next = event.step?.exerciseId;
          if (next && next !== session.exercise.id) session.setExercise(next, loadClassifier(next));
        } else if (event.type === "done" && !finishedRef.current) {
          finishedRef.current = true;
          setTimeout(() => onFinish(event.summary), 0);
        }
      }
      if (voiceRef.current) {
        for (const a of announce(events)) speaker(a.text, a);
      }
      force((n) => n + 1);
    },
    [session, coach, speaker, onFinish]
  );

  // Start, and keep the clock running even if the camera stalls
  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now();
      if (runner.phase === RunPhase.IDLE) handleEvents(runner.start(t));
      handleEvents(runner.update(t, runner.phase === RunPhase.WORK ? liveRef.current : {}));
      setNow(t);
    }, TICK_MS);
    return () => {
      clearInterval(id);
      stopSpeaking();
    };
  }, [runner, handleEvents]);

  const handleFrame = useCallback(
    (next) => {
      setState(next);
      if (runner.phase !== RunPhase.WORK || runner.paused) return;
      liveRef.current = liveNumbers(next);
      if (voiceRef.current) coach.update(next, session.exercise, performance.now());
      // React to the final rep straight away rather than on the next tick
      if (next.event?.type === "rep") handleEvents(runner.update(performance.now(), liveRef.current));
    },
    [runner, session, coach, handleEvents]
  );

  const act = (fn) => () => handleEvents(fn(performance.now()) ?? []);
  const togglePause = () => {
    if (runner.paused) runner.resume(performance.now());
    else runner.pause(performance.now());
    force((n) => n + 1);
  };
  const paused = runner.paused;
  const step = runner.step;
  const exerciseNumber = step ? step.itemIndex + 1 : plan.items.length;

  return (
    <div className="player">
      <header className="player-bar">
        <div>
          <strong>{plan.name}</strong>
          <span className="muted small">
            {" "}· Exercise {exerciseNumber} of {plan.items.length}
          </span>
        </div>
        <div className="player-stats">
          <span title="Workout time">⏱ {formatDuration(runner.elapsedMs(now) / 1000)}</span>
          <span title="Approximate calories">🔥 ~{Math.round(runner.caloriesSoFar(now))} kcal</span>
        </div>
        <div className="player-actions">
          <label className="toggle">
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
            Voice
          </label>
          <label className="toggle">
            <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} />
            Mirror
          </label>
          <button type="button" onClick={togglePause}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="secondary" onClick={act((t) => runner.skipExercise(t))}>
            Skip exercise
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (window.confirm("End the workout now? Your progress so far will be saved.")) {
                handleEvents(runner.end(performance.now()));
              }
            }}
          >
            End
          </button>
          <button type="button" className="icon-button" onClick={onExit} aria-label="Leave without saving" title="Leave without saving">
            ✕
          </button>
        </div>
      </header>

      <div className="workout">
        <div className="stage">
          <div className="stage-video">
            <WebcamView
              session={session}
              model={profile.model}
              mirrored={mirrored}
              onFrame={handleFrame}
            />
            {step && (runner.phase === RunPhase.REST || runner.phase === RunPhase.GET_READY) && !paused && (
              <BreakOverlay
                runner={runner}
                now={now}
                onSkip={act((t) => runner.skipRest(t))}
                onExtend={() => { runner.extendRest(20); force((n) => n + 1); }}
              />
            )}
            {paused && (
              <div className="break-overlay">
                <div className="break-card">
                  <p className="break-label">Paused</p>
                  <button type="button" className="primary" onClick={togglePause}>
                    Resume
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="sidebar">
          {step && runner.phase === RunPhase.WORK && (
            <TargetPanel runner={runner} state={state} now={now} onFinishSet={act((t) => runner.completeSet(t))} />
          )}
          {runner.phase === RunPhase.WORK && <FeedbackPanel state={state} />}
          {step && runner.phase === RunPhase.WORK && (
            <section className="panel">
              <div className="guide-demo">
                <DemoFigure exerciseId={step.exerciseId} width={160} height={120} />
                <p className="muted small">{getGuide(step.exerciseId)?.tips?.[0]}</p>
              </div>
            </section>
          )}
          <SetLog results={runner.results} />
        </aside>
      </div>
    </div>
  );
}
