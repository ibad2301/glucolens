import { classifyGlucose, computeStats, toChartData } from './helpers';
import { REFERENCE_RANGES, STATUS_THRESHOLDS } from '@/constants';
import type { DiabetesCondition, ReadingContext, GlucoseReading } from '@/types';

const CONDITIONS: DiabetesCondition[] = ['non_diabetic', 'prediabetic', 'type1', 'type2'];
const CONTEXTS: ReadingContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];

function rangeFor(condition: DiabetesCondition, context: ReadingContext) {
  const r = REFERENCE_RANGES[condition];
  if (context === 'after_meal') return r.postMeal;
  if (context === 'bedtime') return r.bedtime;
  if (context === 'fasting') return r.fasting;
  return r.random; // before_meal and random intentionally share this range
}

describe('classifyGlucose', () => {
  describe.each(CONDITIONS)('condition: %s', (condition) => {
    describe.each(CONTEXTS)('context: %s', (context) => {
      const { low, high } = rangeFor(condition, context);

      test(`at range.low (${low}) is normal, unless range.low is itself below the universal critical_low threshold (54)`, () => {
        const expected = low < STATUS_THRESHOLDS.critical_low ? 'critical' : 'normal';
        expect(classifyGlucose(low, context, condition)).toBe(expected);
      });

      test(`one below range.low (${low - 1}) is low, unless that also crosses the universal critical_low threshold`, () => {
        const value = low - 1;
        const expected = value < STATUS_THRESHOLDS.critical_low ? 'critical' : 'low';
        expect(classifyGlucose(value, context, condition)).toBe(expected);
      });

      test(`at range.high (${high}) is normal`, () => {
        expect(classifyGlucose(high, context, condition)).toBe('normal');
      });

      test(`one above range.high (${high + 1}) is elevated, unless that crosses the universal critical_high threshold`, () => {
        const value = high + 1;
        const expected = value >= STATUS_THRESHOLDS.critical_high ? 'critical' : 'elevated';
        expect(classifyGlucose(value, context, condition)).toBe(expected);
      });

      test('just under the elevated ceiling (range.high * 1.3) is still elevated', () => {
        const ceiling = high * 1.3;
        const value = Math.floor(ceiling) - 1;
        if (value <= high) return; // no elevated band exists for a range this tight — nothing to assert
        const expected = value >= STATUS_THRESHOLDS.critical_high ? 'critical' : 'elevated';
        expect(classifyGlucose(value, context, condition)).toBe(expected);
      });

      test('at or above the elevated ceiling (range.high * 1.3) is high, not elevated', () => {
        const ceiling = high * 1.3;
        const value = Math.ceil(ceiling);
        if (value >= STATUS_THRESHOLDS.critical_high) return; // would be critical instead — covered by the universal-threshold tests below
        expect(classifyGlucose(value, context, condition)).toBe('high');
      });
    });
  });

  // The two universal critical thresholds apply the same way regardless of
  // condition/context, so a couple of representative combinations proves
  // the behavior without repeating it across all 20.
  describe('universal critical thresholds', () => {
    test('53 mg/dL is always critical', () => {
      expect(classifyGlucose(53, 'fasting', 'type1')).toBe('critical');
      expect(classifyGlucose(53, 'bedtime', 'non_diabetic')).toBe('critical');
      expect(classifyGlucose(53, 'random', 'prediabetic')).toBe('critical');
    });

    test('54 mg/dL is NOT critical on its own — it falls through to the per-condition range', () => {
      // type1 fasting: range.low = 70, so 54 (< 70) reads as "low"
      expect(classifyGlucose(54, 'fasting', 'type1')).toBe('low');
      // non_diabetic fasting: range.low = 0, so 54 falls inside the normal band
      expect(classifyGlucose(54, 'fasting', 'non_diabetic')).toBe('normal');
    });

    test('300 mg/dL is always critical', () => {
      expect(classifyGlucose(300, 'after_meal', 'type2')).toBe('critical');
      expect(classifyGlucose(300, 'random', 'prediabetic')).toBe('critical');
    });

    test('299 mg/dL is NOT critical — it reads as "high" once past the elevated ceiling', () => {
      expect(classifyGlucose(299, 'fasting', 'type1')).toBe('high');
    });
  });

  test('non_diabetic and prediabetic have range.low = 0, so "low" is unreachable except via the universal critical_low threshold', () => {
    // A value that would clinically read as "low" (60 mg/dL) is classified
    // normal here, because range.low is 0 for these two conditions — this
    // is a real, deliberate consequence of the current range data, not a
    // bug, and worth having explicit coverage for.
    expect(classifyGlucose(60, 'fasting', 'non_diabetic')).toBe('normal');
    expect(classifyGlucose(60, 'bedtime', 'prediabetic')).toBe('normal');
  });
});

// ─── computeStats ────────────────────────────────────────────────────────────

function makeReading(value: number, recordedAt: string, context: ReadingContext = 'fasting'): GlucoseReading {
  return {
    id: `r-${recordedAt}-${value}`, patientId: 'p1', value, unit: 'mg/dL',
    context, recordedAt, createdAt: recordedAt,
  };
}

// type2 fasting range: low 70, high 130 (from REFERENCE_RANGES) — every
// fixture below is hand-classified against that range:
//   90, 95, 100 -> normal (<=130)
//   140, 150, 160 -> elevated (130 < v < 130*1.3=169)
const condition: DiabetesCondition = 'type2';

describe('computeStats', () => {
  test('empty input returns the documented zeroed/stable shape', () => {
    expect(computeStats([], condition)).toEqual({
      average: 0, min: 0, max: 0, timeInRange: 0, readingCount: 0, trend: 'stable',
    });
  });

  test('improving trend: recent half averages more than 5 mg/dL below the older half', () => {
    // DESC order (most recent first), matching how the app always calls this.
    const readings = [
      makeReading(90, '2026-01-06T08:00:00Z'),
      makeReading(95, '2026-01-05T08:00:00Z'),
      makeReading(100, '2026-01-04T08:00:00Z'),
      makeReading(140, '2026-01-03T08:00:00Z'),
      makeReading(150, '2026-01-02T08:00:00Z'),
      makeReading(160, '2026-01-01T08:00:00Z'),
    ];
    // recentAvg (first 3) = (90+95+100)/3 = 95
    // olderAvg  (last 3)  = (140+150+160)/3 = 150 -> 95 < 150-5 -> improving
    // average = round(735/6) = round(122.5) = 123
    // timeInRange = 3 normal of 6 = 50%
    expect(computeStats(readings, condition)).toEqual({
      average: 123, min: 90, max: 160, timeInRange: 50, readingCount: 6, trend: 'improving',
    });
  });

  test('worsening trend: recent half averages more than 5 mg/dL above the older half', () => {
    const readings = [
      makeReading(160, '2026-01-06T08:00:00Z'),
      makeReading(150, '2026-01-05T08:00:00Z'),
      makeReading(140, '2026-01-04T08:00:00Z'),
      makeReading(100, '2026-01-03T08:00:00Z'),
      makeReading(95, '2026-01-02T08:00:00Z'),
      makeReading(90, '2026-01-01T08:00:00Z'),
    ];
    // recentAvg = (160+150+140)/3 = 150; olderAvg = (100+95+90)/3 = 95
    // 150 > 95+5 -> worsening. Same totals as above -> average 123, TIR 50%.
    expect(computeStats(readings, condition)).toEqual({
      average: 123, min: 90, max: 160, timeInRange: 50, readingCount: 6, trend: 'worsening',
    });
  });

  test('stable trend: recent and older halves are within 5 mg/dL of each other', () => {
    const readings = [
      makeReading(100, '2026-01-04T08:00:00Z'),
      makeReading(100, '2026-01-03T08:00:00Z'),
      makeReading(100, '2026-01-02T08:00:00Z'),
      makeReading(100, '2026-01-01T08:00:00Z'),
    ];
    // recentAvg = olderAvg = 100 -> difference 0 -> stable.
    // all 4 readings are 100, well within the normal band -> 100% in range.
    expect(computeStats(readings, condition)).toEqual({
      average: 100, min: 100, max: 100, timeInRange: 100, readingCount: 4, trend: 'stable',
    });
  });
});

// ─── toChartData ─────────────────────────────────────────────────────────────

describe('toChartData', () => {
  test('sorts ascending by recordedAt and attaches the correct label/status per point', () => {
    // Deliberately passed out of chronological order to prove the sort.
    // Noon UTC timestamps avoid any local-timezone date-boundary flakiness
    // in the 'MMM d' label formatting.
    const readings: GlucoseReading[] = [
      makeReading(200, '2026-01-03T12:00:00.000Z'), // high: 200 >= 130*1.3=169
      makeReading(90, '2026-01-01T12:00:00.000Z'),   // normal: 90 <= 130
      makeReading(140, '2026-01-02T12:00:00.000Z'),  // elevated: 130 < 140 < 169
    ];

    const result = toChartData(readings, condition);

    expect(result.map((r) => r.date)).toEqual([
      '2026-01-01T12:00:00.000Z',
      '2026-01-02T12:00:00.000Z',
      '2026-01-03T12:00:00.000Z',
    ]);
    expect(result[0]).toMatchObject({ value: 90, label: 'Jan 1', context: 'fasting', status: 'normal' });
    expect(result[1]).toMatchObject({ value: 140, label: 'Jan 2', context: 'fasting', status: 'elevated' });
    expect(result[2]).toMatchObject({ value: 200, label: 'Jan 3', context: 'fasting', status: 'high' });
  });

  test('empty input returns an empty array', () => {
    expect(toChartData([], condition)).toEqual([]);
  });
});
