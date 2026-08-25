import type { DiabetesCondition, ReferenceRanges } from '@/types';

// ─── ADA 2024 Reference Ranges (mg/dL) ───────────────────────────────────────

export const REFERENCE_RANGES: Record<DiabetesCondition, ReferenceRanges> = {
  non_diabetic: {
    fasting:   { low: 0,  normal: 70,  high: 100 },
    postMeal:  { low: 0,  normal: 70,  high: 140 },
    bedtime:   { low: 0,  normal: 70,  high: 120 },
    random:    { low: 0,  normal: 70,  high: 140 },
  },
  prediabetic: {
    fasting:   { low: 0,  normal: 70,  high: 125 },
    postMeal:  { low: 0,  normal: 70,  high: 199 },
    bedtime:   { low: 0,  normal: 70,  high: 140 },
    random:    { low: 0,  normal: 70,  high: 199 },
  },
  type1: {
    fasting:   { low: 70, normal: 80,  high: 130 },
    postMeal:  { low: 70, normal: 80,  high: 180 },
    bedtime:   { low: 90, normal: 90,  high: 150 },
    random:    { low: 70, normal: 80,  high: 180 },
  },
  type2: {
    fasting:   { low: 70, normal: 80,  high: 130 },
    postMeal:  { low: 70, normal: 80,  high: 180 },
    bedtime:   { low: 90, normal: 90,  high: 150 },
    random:    { low: 70, normal: 80,  high: 180 },
  },
};

// ─── Labels ──────────────────────────────────────────────────────────────────

export const CONDITION_LABELS: Record<DiabetesCondition, string> = {
  non_diabetic: 'Non-Diabetic',
  prediabetic:  'Prediabetic',
  type1:        'Type 1 Diabetes',
  type2:        'Type 2 Diabetes',
};

export const CONDITION_DESCRIPTIONS: Record<DiabetesCondition, string> = {
  non_diabetic: 'No diabetes diagnosis. Standard healthy ranges apply.',
  prediabetic:  'Blood sugar is higher than normal but not yet Type 2.',
  type1:        'Autoimmune condition requiring insulin therapy.',
  type2:        'Most common form — managed with lifestyle and medication.',
};

export const CONTEXT_LABELS = {
  fasting:     'Fasting',
  before_meal: 'Before meal',
  after_meal:  'After meal',
  bedtime:     'Bedtime',
  random:      'Random',
};

export const SYMPTOM_LABELS = {
  none:      'None',
  dizzy:     'Dizzy',
  headache:  'Headache',
  sweating:  'Sweating',
  fatigue:   'Fatigue',
  shaky:     'Shaky',
  nausea:    'Nausea',
};

export const MEAL_TYPE_LABELS = {
  low_carb:   'Low carb',
  normal:     'Normal',
  high_carb:  'High carb',
  sweet:      'Sweet/dessert',
};

// ─── App Config ──────────────────────────────────────────────────────────────

export const APP_CONFIG = {
  defaultUnit:       'mg/dL' as const,
  dbName:            'glucolens.db',
  unitKey:           'glucolens_unit',
  postMealMinutes:   120,
};

// ─── HbA1c Estimation ────────────────────────────────────────────────────────
// Formula: HbA1c = (avgGlucose + 46.7) / 28.7  (Nathan et al.)

export function estimateHbA1c(avgGlucoseMgDl: number): number {
  return Math.round(((avgGlucoseMgDl + 46.7) / 28.7) * 10) / 10;
}

// ─── Status Thresholds ───────────────────────────────────────────────────────
export const STATUS_THRESHOLDS = {
  critical_low:  54,
  critical_high: 300,
};
