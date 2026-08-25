// ─── Patient Profile ───────────────────────────────────────────────────────

export type DiabetesCondition =
  | 'non_diabetic'
  | 'prediabetic'
  | 'type1'
  | 'type2';

export type Gender = 'male' | 'female' | 'other';

export interface PatientProfile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  condition: DiabetesCondition;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

// ─── Glucose Reading ────────────────────────────────────────────────────────

export type ReadingContext =
  | 'fasting'
  | 'before_meal'
  | 'after_meal'
  | 'bedtime'
  | 'random';

export type GlucoseUnit = 'mg/dL' | 'mmol/L';

export interface GlucoseReading {
  id: string;
  patientId: string;
  value: number;       // always stored in mg/dL internally
  unit: GlucoseUnit;
  context: ReadingContext;
  notes?: string;
  recordedAt: string;  // ISO datetime
  createdAt: string;
}

// ─── Reference Ranges ───────────────────────────────────────────────────────

export interface GlucoseRange {
  low: number;    // mg/dL
  normal: number; // mg/dL
  high: number;   // mg/dL
}

export interface ReferenceRanges {
  fasting: GlucoseRange;
  postMeal: GlucoseRange;   // 2h after meal
  bedtime: GlucoseRange;
  random: GlucoseRange;
}

// ─── Status / Risk ──────────────────────────────────────────────────────────

export type GlucoseStatus = 'low' | 'normal' | 'elevated' | 'high' | 'critical';

export interface ReadingWithStatus extends GlucoseReading {
  status: GlucoseStatus;
  label: string;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface GlucoseStats {
  average: number;
  min: number;
  max: number;
  timeInRange: number;   // percentage 0–100
  readingCount: number;
  trend: 'improving' | 'stable' | 'worsening';
}

// ─── Chart Data ─────────────────────────────────────────────────────────────

export interface ChartDataPoint {
  value: number;
  label: string;
  date: string;
  context: ReadingContext;
  status: GlucoseStatus;
}
