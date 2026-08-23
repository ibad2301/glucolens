import type { DiabetesCondition, ReferenceRanges, GlucoseStatus } from '@/types';

// ─── Brand Colors ────────────────────────────────────────────────────────────

export const COLORS = {
  // Primary teal
  primary:         '#0D9E75',
  primaryDark:     '#085041',
  primaryLight:    '#E1F5EE',
  primaryMid:      '#0F6E56',

  // Backgrounds
  background:      '#F4F6F5',
  surface:         '#FFFFFF',

  // Text
  textPrimary:     '#1A1A1A',
  textSecondary:   '#6B7280',
  textThird:       '#9CA3AF',
  textInverse:     '#FFFFFF',

  // Borders
  border:          '#E2E8E4',
  borderDark:      '#C8D4CC',

  // Status
  normal:          '#00C48C',
  normalBg:        '#E1F5EE',
  normalText:      '#085041',

  elevated:        '#FF9500',
  elevatedBg:      '#FFF3E0',
  elevatedText:    '#633806',

  high:            '#FF3B30',
  highBg:          '#FFEBEA',
  highText:        '#791F1F',

  critical:        '#AF2B2B',
  criticalBg:      '#F5D5D5',
  criticalText:    '#501313',

  low:             '#FF9500',
  lowBg:           '#FFF3E0',
  lowText:         '#633806',

  // Utility
  success:         '#00C48C',
  warning:         '#FF9500',
  danger:          '#FF3B30',
  info:            '#0D9E75',
};

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const SPACING = {
  xs:              4,
  sm:              8,
  md:              12,
  lg:              16,
  xl:              20,
  xxl:             28,
  screenPadding:   20,
  cardGap:         10,
};

// ─── Border Radius ───────────────────────────────────────────────────────────

export const RADIUS = {
  sm:              8,
  md:              12,
  lg:              16,
  xl:              20,
  pill:            999,
  avatar:          999,
};

// ─── Typography ──────────────────────────────────────────────────────────────

export const FONT = {
  // Sizes
  xs:              11,
  sm:              12,
  base:            14,
  md:              15,
  lg:              17,
  xl:              20,
  xxl:             24,
  hero:            44,

  // Weights
  regular:         '400' as const,
  medium:          '500' as const,
  semibold:        '600' as const,
  bold:            '700' as const,
};

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const SHADOW = {
  card: {
    shadowColor:   '#0D9E75',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius:  8,
    elevation:     3,
  },
  soft: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius:  4,
    elevation:     2,
  },
};

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

// ─── Status Colors ───────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<GlucoseStatus, string> = {
  low:      COLORS.low,
  normal:   COLORS.normal,
  elevated: COLORS.elevated,
  high:     COLORS.high,
  critical: COLORS.critical,
};

export const STATUS_BG_COLORS: Record<GlucoseStatus, string> = {
  low:      COLORS.lowBg,
  normal:   COLORS.normalBg,
  elevated: COLORS.elevatedBg,
  high:     COLORS.highBg,
  critical: COLORS.criticalBg,
};

export const STATUS_TEXT_COLORS: Record<GlucoseStatus, string> = {
  low:      COLORS.lowText,
  normal:   COLORS.normalText,
  elevated: COLORS.elevatedText,
  high:     COLORS.highText,
  critical: COLORS.criticalText,
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

export const CONTEXT_ICONS = {
  fasting:     'sunrise',
  before_meal: 'salad',
  after_meal:  'bowl-chopsticks',
  bedtime:     'moon',
  random:      'clock',
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
  onboardingKey:     'glucolens_onboarded',
  unitKey:           'glucolens_unit',
  postMealMinutes:   120,
  chartDaysDefault:  7,
};

// ─── HbA1c Estimation ────────────────────────────────────────────────────────
// Formula: HbA1c = (avgGlucose + 46.7) / 28.7  (Nathan et al.)

export function estimateHbA1c(avgGlucoseMgDl: number): number {
  return Math.round(((avgGlucoseMgDl + 46.7) / 28.7) * 10) / 10;
}

// ─── Status Thresholds ───────────────────────────────────────────────────────
export const STATUS_THRESHOLDS = {
  critical_low:  54,
  low:           70,
  critical_high: 300,
};
