// Approximate calories burned, using the standard MET formula:
//
//   kcal = MET x body weight (kg) x hours
//
// MET values come from the Compendium of Physical Activities. Real energy use
// depends on effort, fitness and body composition, so treat this as a rough
// estimate.

import { getExercise } from "./exercises";

export const DEFAULT_WEIGHT_KG = 65;
export const REST_MET = 1.5; // standing and catching your breath

export function kcal(met, weightKg, ms) {
  if (!(ms > 0) || !(met > 0)) return 0;
  const kg = weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  return (met * kg * ms) / 3_600_000;
}

export function exerciseCalories(exerciseId, weightKg, activeMs) {
  return kcal(getExercise(exerciseId).met ?? 4, weightKg, activeMs);
}

export function restCalories(weightKg, restMs) {
  return kcal(REST_MET, weightKg, restMs);
}
