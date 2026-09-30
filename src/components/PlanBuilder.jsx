import { useEffect, useState } from "react";

import DemoFigure from "./DemoFigure";
import ExerciseGuide from "./ExerciseGuide";
import { EXERCISES, getExercise } from "../engine/exercises";
import {
  TEMPLATES,
  Target,
  LIMITS,
  createPlanItem,
  planFromTemplate,
  sanitizePlan,
  estimatePlan,
  formatDuration,
} from "../engine/workoutPlan";
import { loadPlans, savePlans } from "../engine/history";
import { loadModel, saveModel } from "../engine/modelStore";
import { POSE_MODELS } from "../pose/poseDetector";

const DRAFT_KEY = "draft-plan";

function loadDraft() {
  const saved = loadModel(DRAFT_KEY);
  return saved ? sanitizePlan(saved) : planFromTemplate("beginner");
}

function NumberField({ label, value, onChange, limits, suffix }) {
  const [min, max] = limits;
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <label className="number-field">
      <span className="field-label">{label}</span>
      <span className="stepper">
        <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Less ${label}`}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => set(Number(e.target.value) || min)}
        />
        <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`More ${label}`}>
          +
        </button>
      </span>
      {suffix && <span className="muted small">{suffix}</span>}
    </label>
  );
}

function PlanItemRow({ item, index, count, onChange, onMove, onRemove }) {
  const [showGuide, setShowGuide] = useState(false);
  const exercise = getExercise(item.exerciseId);
  const hold = exercise.kind === "hold";
  const update = (patch) => onChange({ ...item, ...patch });

  return (
    <li className="plan-item">
      <div className="plan-item-main">
        <DemoFigure exerciseId={item.exerciseId} t={hold ? 0 : 1} width={84} height={63} />
        <div className="plan-item-fields">
          <div className="plan-item-title">
            <span className="plan-item-index">{index + 1}</span>
            <select
              value={item.exerciseId}
              onChange={(e) => {
                const next = getExercise(e.target.value);
                update({
                  exerciseId: next.id,
                  targetType: next.kind === "hold" ? Target.TIME : item.targetType,
                });
              }}
              aria-label="Exercise"
            >
              {EXERCISES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <button type="button" className="link-button" onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? "Hide how-to" : "How to do it"}
            </button>
          </div>

          <div className="plan-item-numbers">
            <NumberField label="Sets" value={item.sets} limits={LIMITS.sets} onChange={(sets) => update({ sets })} />

            {!hold && (
              <div className="segmented" role="radiogroup" aria-label="Target type">
                {[Target.REPS, Target.TIME].map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={item.targetType === type}
                    className={item.targetType === type ? "selected" : ""}
                    onClick={() => update({ targetType: type })}
                  >
                    {type === Target.REPS ? "Reps" : "Time"}
                  </button>
                ))}
              </div>
            )}

            {item.targetType === Target.TIME ? (
              <NumberField
                label="Seconds per set"
                value={item.seconds}
                limits={LIMITS.seconds}
                onChange={(seconds) => update({ seconds })}
              />
            ) : (
              <NumberField
                label="Reps per set"
                value={item.reps}
                limits={LIMITS.reps}
                onChange={(reps) => update({ reps })}
              />
            )}

            <NumberField
              label="Rest between sets"
              value={item.restSec}
              limits={LIMITS.restSec}
              onChange={(restSec) => update({ restSec })}
              suffix="sec"
            />
          </div>
        </div>

        <div className="plan-item-actions">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">
            ↓
          </button>
          <button type="button" onClick={onRemove} aria-label="Remove exercise" className="danger">
            ✕
          </button>
        </div>
      </div>

      {showGuide && (
        <div className="plan-item-guide">
          <ExerciseGuide exerciseId={item.exerciseId} />
        </div>
      )}
    </li>
  );
}

export default function PlanBuilder({ profile, onProfileChange, onStart }) {
  const [plan, setPlan] = useState(loadDraft);
  const [savedPlans, setSavedPlans] = useState(loadPlans);
  const [addId, setAddId] = useState("squat");

  // Keep the draft between visits
  useEffect(() => {
    saveModel(DRAFT_KEY, plan);
  }, [plan]);

  const estimate = estimatePlan(plan, profile.weightKg);

  const setItems = (items) => setPlan({ ...plan, items });
  const updateItem = (i, next) => setItems(plan.items.map((it, j) => (j === i ? next : it)));
  const moveItem = (i, delta) => {
    const items = [...plan.items];
    [items[i], items[i + delta]] = [items[i + delta], items[i]];
    setItems(items);
  };

  function saveCurrentPlan() {
    const clean = sanitizePlan(plan);
    const others = savedPlans.filter((p) => p.name !== clean.name);
    const next = [clean, ...others].slice(0, 20);
    savePlans(next);
    setSavedPlans(next);
  }

  function deleteSavedPlan(name) {
    const next = savedPlans.filter((p) => p.name !== name);
    savePlans(next);
    setSavedPlans(next);
  }

  return (
    <div className="planner">
      <div className="planner-main">
        <section className="panel">
          <h2>Start from a template</h2>
          <div className="template-grid">
            {TEMPLATES.map((t) => {
              const tplPlan = planFromTemplate(t.id);
              const est = estimatePlan(tplPlan, profile.weightKg);
              return (
                <button key={t.id} type="button" className="template-card" onClick={() => setPlan(tplPlan)}>
                  <strong>{t.name}</strong>
                  <span className="muted small">{t.description}</span>
                  <span className="small">
                    ~{Math.round(est.totalSec / 60)} min · {tplPlan.items.length} exercises
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="plan-header">
            <label className="plan-name">
              <span className="field-label">Workout name</span>
              <input
                type="text"
                value={plan.name}
                maxLength={60}
                onChange={(e) => setPlan({ ...plan, name: e.target.value })}
              />
            </label>
          </div>

          {plan.items.length === 0 ? (
            <p className="muted">Add at least one exercise to build your workout.</p>
          ) : (
            <ol className="plan-items">
              {plan.items.map((item, i) => (
                <PlanItemRow
                  key={item.uid}
                  item={item}
                  index={i}
                  count={plan.items.length}
                  onChange={(next) => updateItem(i, next)}
                  onMove={(delta) => moveItem(i, delta)}
                  onRemove={() => setItems(plan.items.filter((_, j) => j !== i))}
                />
              ))}
            </ol>
          )}

          <div className="add-exercise">
            <select value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Exercise to add">
              {EXERCISES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setItems([...plan.items, createPlanItem(addId)])}>
              + Add exercise
            </button>
          </div>

          <NumberField
            label="Rest between exercises"
            value={plan.restBetweenExercisesSec}
            limits={LIMITS.restSec}
            onChange={(restBetweenExercisesSec) => setPlan({ ...plan, restBetweenExercisesSec })}
            suffix="sec"
          />
        </section>
      </div>

      <aside className="planner-side">
        <section className="panel">
          <h2>Your profile</h2>
          <NumberField
            label="Body weight"
            value={profile.weightKg}
            limits={[25, 250]}
            onChange={(weightKg) => onProfileChange({ ...profile, weightKg })}
            suffix="kg"
          />
          <label className="number-field">
            <span className="field-label">Tracking model</span>
            <select value={profile.model} onChange={(e) => onProfileChange({ ...profile, model: e.target.value })}>
              {Object.entries(POSE_MODELS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">Your weight is only used to estimate calories and stays on this device.</p>
        </section>

        <section className="panel plan-summary">
          <h2>Workout summary</h2>
          <dl className="meta">
            <div>
              <dt>Total time</dt>
              <dd>~{formatDuration(estimate.totalSec)}</dd>
            </div>
            <div>
              <dt>Sets</dt>
              <dd>{estimate.sets}</dd>
            </div>
            <div>
              <dt>Exercise time</dt>
              <dd>~{formatDuration(estimate.activeSec)}</dd>
            </div>
            <div>
              <dt>Calories</dt>
              <dd>~{Math.round(estimate.kcal)} kcal</dd>
            </div>
          </dl>
          <button
            type="button"
            className="primary big"
            disabled={plan.items.length === 0}
            onClick={() => onStart(sanitizePlan(plan))}
          >
            Start workout
          </button>
          <button type="button" className="secondary" onClick={saveCurrentPlan} disabled={plan.items.length === 0}>
            Save this plan
          </button>
        </section>

        {savedPlans.length > 0 && (
          <section className="panel">
            <h2>Saved plans</h2>
            <ul className="saved-plans">
              {savedPlans.map((p) => (
                <li key={p.name}>
                  <button type="button" className="link-button" onClick={() => setPlan(sanitizePlan(p))}>
                    {p.name}
                  </button>
                  <span className="muted small">{p.items.length} exercises</span>
                  <button type="button" className="icon-button" onClick={() => deleteSavedPlan(p.name)} aria-label={`Delete ${p.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
