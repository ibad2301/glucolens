import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type {
  GlucoseReading, GlucoseStatus, ReadingWithStatus,
  PatientProfile, GlucoseStats, ChartDataPoint, ReadingContext, GlucoseRange,
} from '@/types';
import { REFERENCE_RANGES, STATUS_THRESHOLDS, CONTEXT_LABELS } from '@/constants';

// ─── ID Generation ───────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Unit Conversion ─────────────────────────────────────────────────────────

export function mgToMmol(mg: number): number {
  return Math.round((mg / 18.0182) * 10) / 10;
}

export function mmolToMg(mmol: number): number {
  return Math.round(mmol * 18.0182);
}

// ─── Status Classification ───────────────────────────────────────────────────

export function getRangeForContext(
  context: ReadingContext,
  condition: PatientProfile['condition']
): GlucoseRange {
  const ranges = REFERENCE_RANGES[condition];
  return context === 'after_meal' ? ranges.postMeal
    : context === 'bedtime'  ? ranges.bedtime
    : context === 'fasting'  ? ranges.fasting
    : ranges.random;
}

export function classifyGlucose(
  value: number,
  context: ReadingContext,
  condition: PatientProfile['condition']
): GlucoseStatus {
  const range = getRangeForContext(context, condition);

  if (value < STATUS_THRESHOLDS.critical_low) return 'critical';
  if (value < range.low)                       return 'low';
  if (value <= range.high)                     return 'normal';
  if (value >= STATUS_THRESHOLDS.critical_high) return 'critical';
  if (value > range.high && value < range.high * 1.3) return 'elevated';
  return 'high';
}

export function enrichReading(
  reading: GlucoseReading,
  condition: PatientProfile['condition']
): ReadingWithStatus {
  const status = classifyGlucose(reading.value, reading.context, condition);
  const labels: Record<GlucoseStatus, string> = {
    critical: 'Critical',
    low:      'Low',
    normal:   'Normal',
    elevated: 'Elevated',
    high:     'High',
  };
  return { ...reading, status, label: labels[status] };
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export function computeStats(
  readings: GlucoseReading[],
  condition: PatientProfile['condition']
): GlucoseStats {
  if (!readings.length) {
    return { average: 0, min: 0, max: 0, timeInRange: 0, readingCount: 0, trend: 'stable' };
  }

  const values = readings.map((r) => r.value);
  const average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const inRange = readings.filter((r) => {
    const s = classifyGlucose(r.value, r.context, condition);
    return s === 'normal';
  }).length;
  const timeInRange = Math.round((inRange / readings.length) * 100);

  // Simple trend: compare first half avg vs second half avg
  const half = Math.floor(readings.length / 2);
  const recentAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
  const olderAvg  = values.slice(half).reduce((a, b) => a + b, 0) / (readings.length - half || 1);
  const trend = recentAvg < olderAvg - 5 ? 'improving'
    : recentAvg > olderAvg + 5 ? 'worsening'
    : 'stable';

  return { average, min, max, timeInRange, readingCount: readings.length, trend };
}

// ─── Chart Data ──────────────────────────────────────────────────────────────

export function toChartData(
  readings: GlucoseReading[],
  condition: PatientProfile['condition']
): ChartDataPoint[] {
  return [...readings]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((r) => ({
      value:   r.value,
      label:   format(parseISO(r.recordedAt), 'MMM d'),
      date:    r.recordedAt,
      context: r.context,
      status:  classifyGlucose(r.value, r.context, condition),
    }));
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy');
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'MMM d · h:mm a');
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function formatGlucose(value: number, unit: 'mg/dL' | 'mmol/L' = 'mg/dL'): string {
  if (unit === 'mmol/L') return `${mgToMmol(value)} mmol/L`;
  return `${Math.round(value)} mg/dL`;
}

export function contextLabel(context: ReadingContext): string {
  return CONTEXT_LABELS[context];
}

export function formatElapsedMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Converts a raw mg/dL magnitude (always >= 0 — caller supplies the sign/direction
// separately) into a unit-aware display string, e.g. "58 mg/dL" or "3.2 mmol/L".
export function formatGlucoseAmount(amountMgDl: number, unit: 'mg/dL' | 'mmol/L'): string {
  if (unit === 'mmol/L') return `${mgToMmol(amountMgDl)} mmol/L`;
  return `${Math.round(amountMgDl)} mg/dL`;
}

export function formatRange(low: number, high: number, unit: 'mg/dL' | 'mmol/L'): string {
  if (unit === 'mmol/L') return `${mgToMmol(low)}–${mgToMmol(high)} mmol/L`;
  return `${low}–${high} mg/dL`;
}
