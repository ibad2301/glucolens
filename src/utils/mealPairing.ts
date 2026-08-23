import { differenceInMinutes, isSameDay, parseISO } from 'date-fns';
import type { GlucoseReading, DiabetesCondition, ReadingWithStatus } from '@/types';
import { APP_CONFIG } from '@/constants';
import { enrichReading } from '@/utils/helpers';

// The clinically-intended post-meal check interval (ADA: ~2h postprandial).
// Previously declared in APP_CONFIG but never read anywhere — this is the one
// place that interval actually drives behavior.
export const PAIR_TARGET_MINUTES = APP_CONFIG.postMealMinutes;

// PAIR_MIN_WINDOW_MINUTES is NOT an eligibility cutoff — a pair is recognized
// from the moment both readings exist, at any elapsed time. It's the threshold
// below which the comparison isn't yet clinically meaningful (glucose is
// likely still rising), so the UI frames it as "early" instead of a finished
// verdict. Above MAX, we stop pairing entirely — at that distance it's more
// likely the next meal's before-reading than a very late check on this one.
export const PAIR_MIN_WINDOW_MINUTES = 30;
export const PAIR_MAX_WINDOW_MINUTES = 240;

export type PairMaturity = 'early' | 'ideal';

export interface MealPair {
  id: string;
  before: ReadingWithStatus;
  after: ReadingWithStatus;
  elapsedMinutes: number;
  deltaMgDl: number; // after.value - before.value, signed
  direction: 'increase' | 'decrease' | 'unchanged';
  maturity: PairMaturity;
}

export function maturityFor(elapsedMinutes: number): PairMaturity {
  return elapsedMinutes < PAIR_MIN_WINDOW_MINUTES ? 'early' : 'ideal';
}

// Only the upper bound gates whether a pair is recognized at all. Elapsed
// time of 0 is allowed deliberately — two readings logged seconds apart in
// the same manual-testing session are still a real, valid, "early" pair.
function isEligible(beforeAt: Date, afterAt: Date): boolean {
  const elapsed = differenceInMinutes(afterAt, beforeAt);
  return elapsed >= 0 && elapsed <= PAIR_MAX_WINDOW_MINUTES;
}

// `getElapsedMinutes` must always return (after − before), never the reverse —
// callers differ in which side (before or after) is the fixed anchor vs. the
// varying candidate, so the sign has to be supplied explicitly per call site
// rather than assumed by this shared function.
function closestToTarget(candidates: GlucoseReading[], getElapsedMinutes: (r: GlucoseReading) => number): GlucoseReading {
  return candidates.reduce((closest, candidate) => {
    const dCandidate = Math.abs(getElapsedMinutes(candidate) - PAIR_TARGET_MINUTES);
    const dClosest = Math.abs(getElapsedMinutes(closest) - PAIR_TARGET_MINUTES);
    return dCandidate < dClosest ? candidate : closest;
  });
}

/**
 * Pairs each before-meal reading with the nearest-to-target, same-day,
 * not-yet-claimed after-meal reading within the eligible window. Processes
 * before-meal readings earliest-first so an earlier meal always gets first
 * claim on a candidate — deterministic, and prevents the same after-meal
 * reading from being reused across two different meals.
 */
export function pairMealReadings(
  readings: GlucoseReading[],
  condition: DiabetesCondition
): MealPair[] {
  const beforeReadings = readings
    .filter((r) => r.context === 'before_meal')
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const afterReadings = readings
    .filter((r) => r.context === 'after_meal')
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const claimedAfterIds = new Set<string>();
  const pairs: MealPair[] = [];

  for (const before of beforeReadings) {
    const beforeAt = parseISO(before.recordedAt);
    const candidates = afterReadings.filter(
      (a) => !claimedAfterIds.has(a.id) && isSameDay(parseISO(a.recordedAt), beforeAt) && isEligible(beforeAt, parseISO(a.recordedAt))
    );
    if (!candidates.length) continue;

    const best = closestToTarget(candidates, (a) => differenceInMinutes(parseISO(a.recordedAt), beforeAt));
    claimedAfterIds.add(best.id);

    const elapsedMinutes = differenceInMinutes(parseISO(best.recordedAt), beforeAt);
    const deltaMgDl = best.value - before.value;

    pairs.push({
      id: `${before.id}_${best.id}`,
      before: enrichReading(before, condition),
      after: enrichReading(best, condition),
      elapsedMinutes,
      deltaMgDl,
      direction: deltaMgDl > 0 ? 'increase' : deltaMgDl < 0 ? 'decrease' : 'unchanged',
      maturity: maturityFor(elapsedMinutes),
    });
  }

  return pairs.sort((a, b) => b.before.recordedAt.localeCompare(a.before.recordedAt));
}

/**
 * For a not-yet-saved after-meal reading being composed right now, finds the
 * best unclaimed before-meal candidate from today — reuses pairMealReadings
 * itself to determine what's already claimed, so there is exactly one
 * definition of "claimed" in this module, not two.
 */
export function findBestBeforeMealMatch(
  readings: GlucoseReading[],
  condition: DiabetesCondition,
  afterMealAt: Date
): GlucoseReading | null {
  const existingPairs = pairMealReadings(readings, condition);
  const claimedBeforeIds = new Set(existingPairs.map((p) => p.before.id));

  const candidates = readings.filter(
    (r) =>
      r.context === 'before_meal' &&
      !claimedBeforeIds.has(r.id) &&
      isSameDay(parseISO(r.recordedAt), afterMealAt) &&
      isEligible(parseISO(r.recordedAt), afterMealAt)
  );
  if (!candidates.length) return null;

  return closestToTarget(candidates, (b) => differenceInMinutes(afterMealAt, parseISO(b.recordedAt)));
}
