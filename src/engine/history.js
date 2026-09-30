// Saved workouts, profile and plans, kept in the browser.

import { saveModel, loadModel, deleteModel } from "./modelStore";

const HISTORY_KEY = "history";
const PROFILE_KEY = "profile";
const PLANS_KEY = "plans";
const MAX_WORKOUTS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export function loadHistory() {
  const data = loadModel(HISTORY_KEY);
  return Array.isArray(data) ? data : [];
}

export function addWorkout(summary) {
  const history = [summary, ...loadHistory()].slice(0, MAX_WORKOUTS);
  saveModel(HISTORY_KEY, history);
  return history;
}

export function deleteWorkout(startedAt) {
  const history = loadHistory().filter((w) => w.startedAt !== startedAt);
  saveModel(HISTORY_KEY, history);
  return history;
}

export function clearHistory() {
  deleteModel(HISTORY_KEY);
  return [];
}

export function loadProfile() {
  return { weightKg: 65, ...(loadModel(PROFILE_KEY) ?? {}) };
}

export function saveProfile(profile) {
  saveModel(PROFILE_KEY, profile);
}

export function loadPlans() {
  const data = loadModel(PLANS_KEY);
  return Array.isArray(data) ? data : [];
}

export function savePlans(plans) {
  saveModel(PLANS_KEY, plans);
}

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// Totals, this week's activity, day streak and personal bests
export function historyStats(history, now = Date.now()) {
  const stats = {
    workouts: history.length,
    totalMs: 0,
    totalKcal: 0,
    totalReps: 0,
    thisWeek: 0,
    streakDays: 0,
    bests: {},
  };

  for (const w of history) {
    stats.totalMs += w.durationMs ?? 0;
    stats.totalKcal += w.kcal ?? 0;
    stats.totalReps += w.totalReps ?? 0;
    if (now - w.startedAt < 7 * DAY_MS) stats.thisWeek += 1;

    for (const e of w.exercises ?? []) {
      const best = stats.bests[e.exerciseId] ?? { bestSetReps: 0, bestHoldMs: 0, totalReps: 0 };
      best.bestSetReps = Math.max(best.bestSetReps, e.bestSetReps ?? 0);
      best.bestHoldMs = Math.max(best.bestHoldMs, e.bestHoldMs ?? 0);
      best.totalReps += e.reps ?? 0;
      stats.bests[e.exerciseId] = best;
    }
  }

  // Consecutive days with a workout, counting back from today (or yesterday)
  const days = new Set(history.map((w) => dayKey(w.startedAt)));
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  while (days.has(dayKey(cursor))) {
    stats.streakDays += 1;
    cursor -= DAY_MS;
  }

  stats.totalKcal = Math.round(stats.totalKcal);
  return stats;
}
