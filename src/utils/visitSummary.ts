import type {
  GlucoseReading, PatientProfile, DiabetesCondition, ReadingContext, GlucoseUnit,
  GlucoseStatus, GlucoseStats, ChartDataPoint, ReferenceRanges, ReadingWithStatus,
} from '@/types';
import { REFERENCE_RANGES, CONTEXT_LABELS, estimateHbA1c } from '@/constants';
import { classifyGlucose, computeStats, toChartData, getRangeForContext, formatGlucoseAmount } from '@/utils/helpers';

const CONTEXT_ORDER: ReadingContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];

const STATUS_LABELS: Record<GlucoseStatus, string> = {
  critical: 'Critical', low: 'Low', normal: 'Normal', elevated: 'Elevated', high: 'High',
};

// ─── Per-context insight ─────────────────────────────────────────────────────

export interface ContextInsight {
  context: ReadingContext;
  avg: number;
  inRangePct: number; // % of readings in this context classified 'normal'
  count: number;
  status: GlucoseStatus; // classification of the avg itself
}

export function computeContextInsights(
  readings: GlucoseReading[],
  condition: DiabetesCondition
): ContextInsight[] {
  return CONTEXT_ORDER.map((context) => {
    const ctxReadings = readings.filter((r) => r.context === context);
    if (!ctxReadings.length) return null;

    const avg = Math.round(ctxReadings.reduce((a, b) => a + b.value, 0) / ctxReadings.length);
    const inRangeCount = ctxReadings.filter(
      (r) => classifyGlucose(r.value, r.context, condition) === 'normal'
    ).length;

    return {
      context,
      avg,
      inRangePct: Math.round((inRangeCount / ctxReadings.length) * 100),
      count: ctxReadings.length,
      status: classifyGlucose(avg, context, condition),
    };
  }).filter((x): x is ContextInsight => x !== null);
}

// ─── Notable readings ────────────────────────────────────────────────────────

export interface NotableReading extends ReadingWithStatus {
  severityScore: number;
  // Signed mg/dL distance from the target boundary: negative = below target,
  // positive = above target. Kept as a raw number (not a formatted string) so
  // the unit — mg/dL vs mmol/L, a global display preference — is resolved at
  // render time by the screen, not baked in here.
  deviationMgDl: number;
}

export function getNotableReadings(
  readings: GlucoseReading[],
  condition: DiabetesCondition,
  opts?: { limit?: number; maxPerDay?: number }
): NotableReading[] {
  const limit = opts?.limit ?? 5;
  const maxPerDay = opts?.maxPerDay ?? 2;

  const candidates: NotableReading[] = [];
  for (const r of readings) {
    const status = classifyGlucose(r.value, r.context, condition);
    if (status === 'normal') continue;

    const range = getRangeForContext(r.context, condition);
    const isLow = r.value < range.low;
    const boundaryDistance = isLow ? range.low - r.value : r.value - range.high;
    const severityScore = boundaryDistance * (isLow ? 1.5 : 1.0) * (status === 'critical' ? 2.0 : 1.0);
    const deviationMgDl = isLow ? -boundaryDistance : boundaryDistance;

    candidates.push({ ...r, status, label: STATUS_LABELS[status], severityScore, deviationMgDl });
  }
  candidates.sort((a, b) => b.severityScore - a.severityScore);

  const result: NotableReading[] = [];
  const perDayCount = new Map<string, number>();
  for (const candidate of candidates) {
    if (result.length >= limit) break;
    const day = candidate.recordedAt.slice(0, 10);
    const dayCount = perDayCount.get(day) ?? 0;
    if (dayCount >= maxPerDay) continue;
    result.push(candidate);
    perDayCount.set(day, dayCount + 1);
  }
  return result;
}

// ─── Pattern flags (synthesis line) ──────────────────────────────────────────

export interface PatternFlag {
  id: string;
  severity: 'good' | 'warning' | 'critical';
  // A function, not a pre-formatted string — the amounts embedded in some of
  // these sentences are glucose values, and unit (mg/dL vs mmol/L) is a global
  // display preference resolved by the screen at render time, not baked in here.
  render: (unit: GlucoseUnit) => string;
}

export function detectPatternFlags(
  contextInsights: ContextInsight[],
  stats: GlucoseStats,
  hypoCount: number,
  condition: DiabetesCondition
): PatternFlag[] {
  const flags: PatternFlag[] = [];

  if (hypoCount > 0) {
    flags.push({
      id: 'hypo-events',
      severity: 'critical',
      render: () => `${hypoCount} reading${hypoCount !== 1 ? 's' : ''} fell into hypoglycemic range this period.`,
    });
  }

  for (const insight of contextInsights) {
    if (insight.count < 5 || insight.inRangePct >= 60) continue;
    const range = getRangeForContext(insight.context, condition);
    const label = CONTEXT_LABELS[insight.context];
    const outOfRangeCount = Math.round((insight.count * (100 - insight.inRangePct)) / 100);

    if (insight.avg > range.high) {
      const amountMgDl = insight.avg - range.high;
      flags.push({
        id: `ctx-high-${insight.context}`,
        severity: 'warning',
        render: (unit) => `${label} readings run high — ${outOfRangeCount} of ${insight.count} readings exceeded target, averaging ${formatGlucoseAmount(amountMgDl, unit)} over goal.`,
      });
    } else if (insight.avg < range.low) {
      const amountMgDl = range.low - insight.avg;
      flags.push({
        id: `ctx-low-${insight.context}`,
        severity: 'warning',
        render: (unit) => `${label} readings run low — ${outOfRangeCount} of ${insight.count} readings fell under target, averaging ${formatGlucoseAmount(amountMgDl, unit)} under goal.`,
      });
    }
  }

  if (!flags.length) {
    flags.push({
      id: 'all-good',
      severity: 'good',
      render: () => stats.readingCount
        ? `Time in range is strong at ${stats.timeInRange}% — no concerning patterns detected this period.`
        : 'No readings logged this period.',
    });
  }

  return flags.slice(0, 3);
}

// ─── Composition ──────────────────────────────────────────────────────────────

export interface VisitSummary {
  generatedAt: string;
  windowDays: number;
  patient: Pick<PatientProfile, 'name' | 'age' | 'gender' | 'condition'>;
  stats: GlucoseStats;
  hba1cEstimate: number | null;
  chartData: ChartDataPoint[];
  contextInsights: ContextInsight[];
  patternFlags: PatternFlag[];
  notableReadings: NotableReading[];
  targetRanges: ReferenceRanges;
  hypoCount: number;
}

export function computeVisitSummary(
  patient: PatientProfile,
  readings: GlucoseReading[],
  windowDays = 30
): VisitSummary {
  const stats = computeStats(readings, patient.condition);
  const hypoCount = readings.filter(
    (r) => r.value < getRangeForContext(r.context, patient.condition).low
  ).length;
  const contextInsights = computeContextInsights(readings, patient.condition);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    patient: { name: patient.name, age: patient.age, gender: patient.gender, condition: patient.condition },
    stats,
    hba1cEstimate: stats.average ? estimateHbA1c(stats.average) : null,
    chartData: toChartData(readings, patient.condition),
    contextInsights,
    patternFlags: detectPatternFlags(contextInsights, stats, hypoCount, patient.condition),
    notableReadings: getNotableReadings(readings, patient.condition),
    targetRanges: REFERENCE_RANGES[patient.condition],
    hypoCount,
  };
}
