import { useEffect, useState } from "react";

import DemoFigure from "./DemoFigure";
import ExerciseGuide from "./ExerciseGuide";
import { EXERCISES, CATEGORIES, getExercise, categoryName } from "../engine/exercises";
import {
  TEMPLATES,
  Target,
  LIMITS,
  createPlanItem,
  planFromTemplate,
  sanitizePlan,
  standardWarmup,
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

// Exercises grouped by their main category
function ExerciseOptions() {
  return CATEGORIES.map((c) => (
    <optgroup key={c.id} label={c.name}>
      {EXERCISES.filter((ex) => ex.categories[0] === c.id).map((ex) => (
        <option key={ex.id} value={ex.id}>
          {ex.name}
        </option>
      ))}
    </optgroup>
  ));
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
              <ExerciseOptions />
            </select>
            <span className="category-chip">{categoryName(exercise.categories[0])}</span>
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

function PlanItemList({ items, onItemsChange, addDefault, addLabel, emptyText, makeItem = createPlanItem }) {
  const [addId, setAddId] = useState(addDefault);
  const updateItem = (i, next) => onItemsChange(items.map((it, j) => (j === i ? next : it)));
  const moveItem = (i, delta) => {
    const next = [...items];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    onItemsChange(next);
  };

  return (
    <>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ol className="plan-items">
          {items.map((item, i) => (
            <PlanItemRow
              key={item.uid}
              item={item}
              index={i}
              count={items.length}
              onChange={(next) => updateItem(i, next)}
              onMove={(delta) => moveItem(i, delta)}
              onRemove={() => onItemsChange(items.filter((_, j) => j !== i))}
            />
          ))}
        </ol>
      )}
      <div className="add-exercise">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Exercise to add">
          <ExerciseOptions />
        </select>
        <button type="button" onClick={() => onItemsChange([...items, makeItem(addId)])}>
          {addLabel}
        </button>
      </div>
    </>
  );
}

// Warm-up moves are short: one set, no rest between sets
const warmupItem = (exerciseId) => createPlanItem(exerciseId, { sets: 1, restSec: 0, targetType: "time", seconds: 30 });

export default function PlanBuilder({ profile, onProfileChange, onStart }) {
  const [plan, setPlan] = useState(loadDraft);
  const [savedPlans, setSavedPlans] = useState(loadPlans);

  // Keep the draft between visits
  useEffect(() => {
    saveModel(DRAFT_KEY, plan);
  }, [plan]);

  const estimate = estimatePlan(plan, profile.weightKg);

  const warmup = plan.warmup ?? [];
  const totalExercises = warmup.length + plan.items.length;

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
                    ~{Math.round(est.totalSec / 60)} min ·{" "}
                    {tplPlan.items.length > 0
                      ? `warm-up + ${tplPlan.items.length} exercises`
                      : `${tplPlan.warmup.length} warm-up moves`}
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

          <div className="warmup-section">
            <div className="section-head">
              <h3 className="section-title">Warm-up</h3>
              {warmup.length > 0 && (
                <button type="button" className="link-button" onClick={() => setPlan({ ...plan, warmup: [] })}>
                  Remove warm-up
                </button>
              )}
            </div>
            {warmup.length === 0 ? (
              <div className="warmup-empty">
                <p className="muted small">
                  Warming up raises your heart rate and loosens your joints, which helps prevent injuries.
                </p>
                <button type="button" onClick={() => setPlan({ ...plan, warmup: standardWarmup() })}>
                  + Add standard warm-up (about 5 min)
                </button>
              </div>
            ) : (
              <>
                <PlanItemList
                  items={warmup}
                  onItemsChange={(items) => setPlan({ ...plan, warmup: items })}
                  makeItem={warmupItem}
                  addDefault="arm_circles"
                  addLabel="+ Add warm-up move"
                  emptyText=""
                />
                <NumberField
                  label="Rest between warm-up moves"
                  value={plan.warmupRestSec ?? 10}
                  limits={LIMITS.restSec}
                  onChange={(warmupRestSec) => setPlan({ ...plan, warmupRestSec })}
                  suffix="sec"
                />
              </>
            )}
          </div>

          <h3 className="section-title">Main workout</h3>
          <PlanItemList
            items={plan.items}
            onItemsChange={(items) => setPlan({ ...plan, items })}
            addDefault="squat"
            addLabel="+ Add exercise"
            emptyText="Add exercises for your main workout."
          />

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
            disabled={totalExercises === 0}
            onClick={() => onStart(sanitizePlan(plan))}
          >
            Start workout
          </button>
          <button type="button" className="secondary" onClick={saveCurrentPlan} disabled={totalExercises === 0}>
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
                  <span className="muted small">{(p.warmup?.length ?? 0) + p.items.length} exercises</span>
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
