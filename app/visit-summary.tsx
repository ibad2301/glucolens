import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useAppStore } from '@/store/useAppStore';
import { CONDITION_LABELS, CONTEXT_LABELS } from '@/constants';
import {
  THEME_COLORS, THEME_STATUS_COLORS, THEME_STATUS_BG_COLORS, THEME_STATUS_TEXT_COLORS,
  TYPE, SPACE, SCREEN_PADDING, SECTION_GAP, THEME_RADIUS,
} from '@/constants/theme';
import { formatDateTime, formatGlucose, formatGlucoseAmount, formatRange, mgToMmol } from '@/utils/helpers';
import { computeVisitSummary } from '@/utils/visitSummary';

const WINDOW_DAYS = 30;
const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - SPACE.space5 * 2 - 32;

export default function VisitSummaryScreen() {
  const { activePatient, readings, loadReadings, unit } = useAppStore();
  const insets = useSafeAreaInsets();

  useEffect(() => { loadReadings(WINDOW_DAYS); }, []);

  if (!activePatient) return null;

  const summary = computeVisitSummary(activePatient, readings, WINDOW_DAYS);
  const { stats, hba1cEstimate, chartData, contextInsights, patternFlags, notableReadings, targetRanges, hypoCount } = summary;

  const earliest = readings.length
    ? readings.reduce((min, r) => (r.recordedAt < min ? r.recordedAt : min), readings[0].recordedAt)
    : null;
  const actualSpanDays = earliest
    ? Math.max(1, differenceInCalendarDays(new Date(), parseISO(earliest)) + 1)
    : WINDOW_DAYS;
  const windowLabel = readings.length ? `Last ${Math.min(WINDOW_DAYS, actualSpanDays)} days` : `Last ${WINDOW_DAYS} days`;

  const toDisplay = (mgDl: number) => (unit === 'mmol/L' ? mgToMmol(mgDl) : mgDl);

  const allVals = chartData.map((d) => d.value);
  const maxVal = Math.ceil((Math.max(...allVals, targetRanges.fasting.high + 40, 200)) / 20) * 20;
  const spacing = chartData.length > 1
    ? Math.max(24, (CHART_W - 16) / (chartData.length - 1))
    : CHART_W;
  const lineData = chartData.map((d, i) => ({
    value: toDisplay(d.value),
    dataPointColor: THEME_STATUS_COLORS[d.status],
    label: (chartData.length <= 7 || i === 0 || i === chartData.length - 1 ||
      i % Math.ceil(chartData.length / 5) === 0) ? d.label : '',
  }));

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Visit Summary</Text>
            <Text style={styles.subtitle}>{windowLabel}</Text>
          </View>
          <Pressable style={styles.doneBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.identityRow}>
          <Text style={styles.identityName}>{activePatient.name}</Text>
          <Text style={styles.identityMeta}>
            {activePatient.age} yrs · {activePatient.gender.charAt(0).toUpperCase() + activePatient.gender.slice(1)} · {CONDITION_LABELS[activePatient.condition]}
          </Text>
        </View>

        {readings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No readings in the last {WINDOW_DAYS} days.</Text>
            <Text style={styles.emptySub}>Log a few readings before the next visit to build a summary.</Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push('/(tabs)/log')}>
              <Text style={styles.emptyCtaText}>Log a reading</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard label="Est. HbA1c" value={hba1cEstimate ? `${hba1cEstimate}%` : '—'} sub="estimated" color={THEME_COLORS.textPrimary} />
              <MetricCard
                label="Time in range"
                value={`${stats.timeInRange}%`}
                sub="target ≥70%"
                color={stats.timeInRange >= 70 ? THEME_COLORS.normal : stats.timeInRange >= 50 ? THEME_COLORS.elevated : THEME_COLORS.high}
              />
              <MetricCard label="Average" value={`${toDisplay(stats.average)}`} sub={unit} color={THEME_COLORS.textPrimary} />
              <MetricCard
                label="Hypo events"
                value={`${hypoCount}`}
                sub={hypoCount > 0 ? 'below range' : 'none recorded'}
                color={hypoCount > 0 ? THEME_COLORS.high : THEME_COLORS.normal}
              />
            </View>

            <View style={styles.synthesisCard}>
              {patternFlags.map((f) => (
                <View key={f.id} style={styles.synthesisRow}>
                  <Text style={[styles.synthesisIcon, { color: f.severity === 'good' ? THEME_COLORS.normal : THEME_COLORS.primary }]}>
                    {f.severity === 'good' ? '✓' : '!'}
                  </Text>
                  <Text style={styles.synthesisText}>{f.render(unit)}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Glucose over time</Text>
            <View style={styles.card}>
              {chartData.length > 1 ? (
                <View style={{ height: 140, overflow: 'hidden' }}>
                <LineChart
                  data={lineData}
                  width={CHART_W}
                  height={140}
                  spacing={spacing}
                  maxValue={toDisplay(maxVal)}
                  initialSpacing={8}
                  endSpacing={8}
                  color={THEME_COLORS.primary}
                  thickness={2.5}
                  curved
                  curvature={0.15}
                  areaChart
                  startFillColor={THEME_COLORS.primary}
                  endFillColor={THEME_COLORS.primaryTint}
                  startOpacity={0.15}
                  endOpacity={0.01}
                  dataPointsRadius={4}
                  dataPointsColor={THEME_COLORS.primary}
                  xAxisColor={THEME_COLORS.border}
                  yAxisColor={THEME_COLORS.border}
                  yAxisTextStyle={{ color: THEME_COLORS.textTertiary, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: THEME_COLORS.textTertiary, fontSize: 10 }}
                  rulesColor={THEME_COLORS.border}
                  rulesType="dashed"
                  showReferenceLine1
                  referenceLine1Position={toDisplay(targetRanges.fasting.high)}
                  referenceLine1Config={{ color: THEME_COLORS.elevated, dashWidth: 6, dashGap: 4 }}
                  showReferenceLine2
                  referenceLine2Position={toDisplay(targetRanges.fasting.low)}
                  referenceLine2Config={{ color: THEME_COLORS.normal, dashWidth: 6, dashGap: 4 }}
                />
                </View>
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyChartText}>Log at least 2 readings to see the chart</Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Notable readings</Text>
            <View style={styles.card}>
              {notableReadings.length > 0 ? (
                notableReadings.map((r, i) => (
                  <View key={r.id} style={[styles.notableRow, i === notableReadings.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.statusDot, { backgroundColor: THEME_STATUS_COLORS[r.status] }]} />
                    <View style={styles.notableLeft}>
                      <Text style={styles.notableValue}>{formatGlucose(r.value, unit)}</Text>
                      <Text style={styles.notableMeta}>{CONTEXT_LABELS[r.context]} · {formatDateTime(r.recordedAt)}</Text>
                    </View>
                    <Text style={[styles.notableDeviation, { color: THEME_STATUS_TEXT_COLORS[r.status] }]}>
                      {r.deviationMgDl < 0
                        ? `${formatGlucoseAmount(Math.abs(r.deviationMgDl), unit)} below target`
                        : `+${formatGlucoseAmount(r.deviationMgDl, unit)} above target`}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.allGoodText}>All readings within target range this period.</Text>
              )}
            </View>

            {contextInsights.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Breakdown by context</Text>
                <View style={styles.card}>
                  {contextInsights.map((c, i) => (
                    <View key={c.context} style={[styles.ctxRow, i === contextInsights.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={styles.ctxLeft}>
                        <Text style={styles.ctxLabel}>{CONTEXT_LABELS[c.context]}</Text>
                        <Text style={styles.ctxCount}>{c.count} reading{c.count !== 1 ? 's' : ''} · {c.inRangePct}% in range</Text>
                      </View>
                      <View style={[styles.ctxBadge, { backgroundColor: THEME_STATUS_BG_COLORS[c.status] }]}>
                        <Text style={[styles.ctxBadgeText, { color: THEME_STATUS_TEXT_COLORS[c.status] }]}>{formatGlucose(c.avg, unit)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Target ranges</Text>
            <View style={styles.card}>
              {[
                { label: 'Fasting', low: targetRanges.fasting.low, high: targetRanges.fasting.high },
                { label: 'After meal', low: targetRanges.postMeal.low, high: targetRanges.postMeal.high },
                { label: 'Bedtime', low: targetRanges.bedtime.low, high: targetRanges.bedtime.high },
              ].map((r, i, arr) => (
                <View key={r.label} style={[styles.rangeRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.rangeLabel}>{r.label}</Text>
                  <Text style={styles.rangeValue}>{formatRange(r.low, r.high, unit)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Self-reported fingerstick readings, not continuous glucose monitoring. Ranges per ADA Standards of Medical Care 2024. Values shown in {unit}.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: THEME_COLORS.background },
  header:           { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:            { ...TYPE.title2, color: THEME_COLORS.textPrimary },
  subtitle:         { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  doneBtn:          { minHeight: 36, paddingVertical: 8, paddingHorizontal: 16, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primaryTint },
  doneBtnText:      { ...TYPE.footnote, color: THEME_COLORS.primary, fontWeight: '700' },
  content:          { padding: SCREEN_PADDING, paddingBottom: 40 },
  identityRow:      { marginBottom: SECTION_GAP },
  identityName:     { ...TYPE.headline, color: THEME_COLORS.textPrimary },
  identityMeta:     { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  emptyCard:        { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, padding: SPACE.space6, alignItems: 'center', borderWidth: 1, borderColor: THEME_COLORS.border },
  emptyText:        { ...TYPE.headline, color: THEME_COLORS.textPrimary, textAlign: 'center' },
  emptySub:         { ...TYPE.footnote, color: THEME_COLORS.textSecondary, textAlign: 'center', marginTop: 6 },
  emptyCta:         { marginTop: SPACE.space4, backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.pill, paddingVertical: 10, paddingHorizontal: 20 },
  emptyCtaText:     { ...TYPE.body, color: THEME_COLORS.textInverse, fontWeight: '600' },
  metricsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.space3, marginBottom: SPACE.space4 },
  metricCard:       { flex: 1, minWidth: '45%', backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, borderWidth: 1, borderColor: THEME_COLORS.border },
  metricLabel:      { ...TYPE.caption1, color: THEME_COLORS.textSecondary },
  metricValue:      { ...TYPE.numericLarge, marginTop: 4 },
  metricSub:        { ...TYPE.caption3, color: THEME_COLORS.textTertiary, marginTop: 2 },
  synthesisCard:    { backgroundColor: THEME_COLORS.primaryTint, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, marginBottom: SECTION_GAP, gap: SPACE.space2 },
  synthesisRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.space2 },
  synthesisIcon:    { ...TYPE.body, fontWeight: '700', width: 16 },
  synthesisText:    { flex: 1, ...TYPE.footnote, color: THEME_COLORS.primary, lineHeight: 18 },
  sectionTitle:     { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3, textTransform: 'uppercase', letterSpacing: 0.5 },
  card:             { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  emptyChart:       { height: 100, alignItems: 'center', justifyContent: 'center', padding: SPACE.space4 },
  emptyChartText:   { ...TYPE.body, color: THEME_COLORS.textTertiary, textAlign: 'center', lineHeight: 22 },
  notableRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border, gap: SPACE.space3 },
  statusDot:        { width: 8, height: 8, borderRadius: 4 },
  notableLeft:      { flex: 1 },
  notableValue:     { ...TYPE.body, fontWeight: '600', color: THEME_COLORS.textPrimary },
  notableMeta:      { ...TYPE.caption3, color: THEME_COLORS.textSecondary, marginTop: 2 },
  notableDeviation: { ...TYPE.footnote, fontWeight: '600' },
  allGoodText:      { ...TYPE.body, color: THEME_COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACE.space2 },
  ctxRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border, gap: SPACE.space3 },
  ctxLeft:          { flex: 1 },
  ctxLabel:         { ...TYPE.body, fontWeight: '500', color: THEME_COLORS.textPrimary },
  ctxCount:         { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  ctxBadge:         { paddingHorizontal: 10, paddingVertical: 3, borderRadius: THEME_RADIUS.pill },
  ctxBadgeText:     { ...TYPE.footnote, fontWeight: '600' },
  rangeRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border },
  rangeLabel:       { ...TYPE.callout, color: THEME_COLORS.textPrimary },
  rangeValue:       { ...TYPE.body, fontWeight: '600', color: THEME_COLORS.primary },
  disclaimer:       { paddingHorizontal: 4, marginTop: 4 },
  disclaimerText:   { ...TYPE.caption3, color: THEME_COLORS.textTertiary, lineHeight: 16, textAlign: 'center' },
});
