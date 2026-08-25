import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal,
  StyleSheet, Dimensions, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAppStore } from '@/store/useAppStore';
import { REFERENCE_RANGES, estimateHbA1c, CONTEXT_LABELS } from '@/constants';
import {
  THEME_COLORS, THEME_STATUS_COLORS, THEME_STATUS_BG_COLORS, THEME_STATUS_TEXT_COLORS,
  TYPE, SPACE, SCREEN_PADDING, SECTION_GAP, THEME_RADIUS,
} from '@/constants/theme';
import { computeStats, toChartData, classifyGlucose, formatRange, formatGlucose, formatDate, mgToMmol } from '@/utils/helpers';
import type { ReadingContext } from '@/types';

const PERIODS = [7, 14, 30] as const;
type Period = typeof PERIODS[number] | 'custom';

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - SPACE.space5 * 2 - 32;

const CONTEXT_ORDER: ReadingContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];

export default function TrendsScreen() {
  const { activePatient, readings, loadReadings, unit } = useAppStore();
  const [period, setPeriod] = useState<Period>(7);
  const insets = useSafeAreaInsets();

  const [rangeSheetVisible, setRangeSheetVisible] = useState(false);
  const [customStart, setCustomStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; });
  const [customEnd, setCustomEnd] = useState(() => new Date());
  const [showAndroidStartPicker, setShowAndroidStartPicker] = useState(false);
  const [showAndroidEndPicker, setShowAndroidEndPicker] = useState(false);

  useEffect(() => {
    if (period === 'custom') return; // custom range loads explicitly via handleApplyCustomRange
    loadReadings(period);
  }, [period]);

  if (!activePatient) return null;

  function handleApplyCustomRange() {
    loadReadings({ start: startOfDay(customStart).toISOString(), end: endOfDay(customEnd).toISOString() });
    setPeriod('custom');
    setRangeSheetVisible(false);
  }

  function onChangeStart(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidStartPicker(false);
    if (date) setCustomStart(date);
  }
  function onChangeEnd(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidEndPicker(false);
    if (date) setCustomEnd(date);
  }

  const stats     = computeStats(readings, activePatient.condition);
  const chartData = toChartData(readings, activePatient.condition);
  const ranges    = REFERENCE_RANGES[activePatient.condition];
  const hba1c     = stats.average ? estimateHbA1c(stats.average) : null;

  const allVals = chartData.map((d) => d.value);
  const maxVal  = Math.ceil((Math.max(...allVals, ranges.fasting.high + 40, 200)) / 20) * 20;
  const spacing = chartData.length > 1
    ? Math.max(28, (CHART_W - 16) / (chartData.length - 1))
    : CHART_W;

  const toDisplay = (mgDl: number) => (unit === 'mmol/L' ? mgToMmol(mgDl) : mgDl);

  const lineData = chartData.map((d, i) => ({
    value: toDisplay(d.value),
    dataPointColor: THEME_STATUS_COLORS[d.status],
    label: (chartData.length <= 7 || i === 0 || i === chartData.length - 1 ||
      i % Math.ceil(chartData.length / 5) === 0) ? d.label : '',
  }));

  const contextStats = CONTEXT_ORDER.map((ctx) => {
    const ctxReadings = readings.filter((r) => r.context === ctx);
    if (!ctxReadings.length) return null;
    const avg = Math.round(ctxReadings.reduce((a, b) => a + b.value, 0) / ctxReadings.length);
    const status = classifyGlucose(avg, ctx, activePatient.condition);
    return { ctx, label: CONTEXT_LABELS[ctx], avg, status, count: ctxReadings.length };
  }).filter(Boolean) as { ctx: ReadingContext; label: string; avg: number; status: string; count: number }[];

  const normalLow  = ranges.fasting.low;
  const normalHigh = ranges.fasting.high;
  const periodSub  = period === 'custom' ? 'custom range' : `last ${period}d`;

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Trends</Text>
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              style={[styles.periodChip, period === p && styles.periodActive]}
              onPress={() => setPeriod(p)}
              accessibilityRole="button"
              accessibilityLabel={`View last ${p} days`}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p}d
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.periodChip, period === 'custom' && styles.periodActive]}
            onPress={() => setRangeSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose a custom date range"
          >
            <Text style={[styles.periodText, period === 'custom' && styles.periodTextActive]}>
              Custom
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Glucose over time</Text>
          {chartData.length > 1 ? (
            <>
              {/* gifted-charts' bezier smoothing overshoots past local peaks/troughs on
                  sharp zigzags, and the library only clips fill paths horizontally, never
                  the stroke — clip the actual overshoot at the RN View level, which RN
                  guarantees regardless of what the SVG draws underneath. */}
              <View style={{ height: 180, overflow: 'hidden' }}>
              <LineChart
                data={lineData}
                width={CHART_W}
                height={180}
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
                referenceLine1Position={toDisplay(normalHigh)}
                referenceLine1Config={{
                  color: THEME_COLORS.elevated,
                  dashWidth: 6,
                  dashGap: 4,
                  labelText: `High (${toDisplay(normalHigh)})`,
                  labelTextStyle: { color: THEME_COLORS.elevated, fontSize: 10 },
                }}
                showReferenceLine2
                referenceLine2Position={toDisplay(normalLow)}
                referenceLine2Config={{
                  color: THEME_COLORS.normal,
                  dashWidth: 6,
                  dashGap: 4,
                  labelText: `Low (${toDisplay(normalLow)})`,
                  labelTextStyle: { color: THEME_COLORS.normal, fontSize: 10 },
                }}
              />
              </View>
              <View style={styles.legendRow}>
                {[
                  ['Normal', THEME_COLORS.normal],
                  ['Elevated', THEME_COLORS.elevated],
                  ['High', THEME_COLORS.high],
                  ['Critical', THEME_COLORS.critical],
                ].map(([l, c]) => (
                  <View key={l} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: c }]} />
                    <Text style={styles.legendText}>{l}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyChartText}>
                {chartData.length === 0
                  ? 'No readings yet — log readings to see your trend chart'
                  : 'Log at least 2 readings to see the chart'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Key metrics</Text>
        <View style={styles.metricsGrid}>
          <MetricCard label="Est. HbA1c" value={hba1c ? `${hba1c}%` : '—'} sub="estimated" color={THEME_COLORS.textPrimary} />
          <MetricCard
            label="Time in range"
            value={stats.readingCount ? `${stats.timeInRange}%` : '—'}
            sub="target ≥70%"
            color={stats.timeInRange >= 70 ? THEME_COLORS.normal : stats.timeInRange >= 50 ? THEME_COLORS.elevated : THEME_COLORS.high}
          />
          <MetricCard label="Average" value={stats.average ? `${toDisplay(stats.average)}` : '—'} sub={unit} color={THEME_COLORS.textPrimary} />
          <MetricCard label="Readings" value={`${stats.readingCount}`} sub={periodSub} color={THEME_COLORS.textPrimary} />
        </View>

        {contextStats.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Breakdown by context</Text>
            <View style={styles.card}>
              {contextStats.map((c, i) => {
                const pct = Math.min(100, Math.round((c.avg / maxVal) * 100));
                return (
                  <View key={c.ctx} style={[styles.ctxRow, i === contextStats.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.ctxLeft}>
                      <Text style={styles.ctxLabel}>{c.label}</Text>
                      <Text style={styles.ctxCount}>{c.count} reading{c.count !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.ctxRight}>
                      <View style={styles.ctxBarWrap}>
                        <View style={[styles.ctxBar, { width: `${pct}%`, backgroundColor: THEME_STATUS_COLORS[c.status as keyof typeof THEME_STATUS_COLORS] }]} />
                      </View>
                      <View style={[styles.ctxBadge, { backgroundColor: THEME_STATUS_BG_COLORS[c.status as keyof typeof THEME_STATUS_BG_COLORS] }]}>
                        <Text style={[styles.ctxBadgeText, { color: THEME_STATUS_TEXT_COLORS[c.status as keyof typeof THEME_STATUS_TEXT_COLORS] }]}>
                          {formatGlucose(c.avg, unit)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Your target ranges</Text>
        <View style={styles.card}>
          {[
            { label: 'Fasting',    low: ranges.fasting.low,  high: ranges.fasting.high },
            { label: 'After meal', low: ranges.postMeal.low, high: ranges.postMeal.high },
            { label: 'Bedtime',    low: ranges.bedtime.low,  high: ranges.bedtime.high },
          ].map((r, i, arr) => (
            <View key={r.label} style={[styles.rangeRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.rangeLabel}>{r.label}</Text>
              <Text style={styles.rangeValue}>{formatRange(r.low, r.high, unit)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.adaNote}>
          <Text style={styles.adaNoteText}>
            Ranges based on ADA Standards of Medical Care 2024 for {activePatient.condition.replace('_', ' ')}.
          </Text>
        </View>

      </ScrollView>

      <Modal
        visible={rangeSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRangeSheetVisible(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setRangeSheetVisible(false)} />
        <View style={[styles.sheetCard, { paddingBottom: insets.bottom + SPACE.space5 }]}>
          <Text style={styles.sheetTitle}>Custom Range</Text>

          <Text style={styles.fieldLabel}>Start date</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker value={customStart} mode="date" display="default" maximumDate={customEnd} onChange={onChangeStart} />
          ) : (
            <>
              <Pressable style={styles.dateField} onPress={() => setShowAndroidStartPicker(true)} accessibilityRole="button">
                <Text style={styles.dateFieldText}>{formatDate(customStart.toISOString())}</Text>
              </Pressable>
              {showAndroidStartPicker && (
                <DateTimePicker value={customStart} mode="date" display="default" maximumDate={customEnd} onChange={onChangeStart} />
              )}
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: SPACE.space4 }]}>End date</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker value={customEnd} mode="date" display="default" minimumDate={customStart} maximumDate={new Date()} onChange={onChangeEnd} />
          ) : (
            <>
              <Pressable style={styles.dateField} onPress={() => setShowAndroidEndPicker(true)} accessibilityRole="button">
                <Text style={styles.dateFieldText}>{formatDate(customEnd.toISOString())}</Text>
              </Pressable>
              {showAndroidEndPicker && (
                <DateTimePicker value={customEnd} mode="date" display="default" minimumDate={customStart} maximumDate={new Date()} onChange={onChangeEnd} />
              )}
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.sheetApplyBtn, pressed && styles.sheetApplyBtnPressed]}
            onPress={handleApplyCustomRange}
          >
            <Text style={styles.sheetApplyBtnText}>Apply</Text>
          </Pressable>
        </View>
      </Modal>
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
  container:       { flex: 1, backgroundColor: THEME_COLORS.background },
  header:          { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16 },
  title:           { ...TYPE.title1, color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3 },
  periodRow:       { flexDirection: 'row', gap: SPACE.space2 },
  periodChip:      { minHeight: 36, paddingVertical: 8, paddingHorizontal: 18, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.surface, borderWidth: 1, borderColor: THEME_COLORS.border },
  periodActive:    { backgroundColor: THEME_COLORS.primaryTint, borderColor: THEME_COLORS.primaryTint },
  periodText:      { ...TYPE.footnote, fontWeight: '600', color: THEME_COLORS.textSecondary },
  periodTextActive:{ color: THEME_COLORS.primary },
  content:         { padding: SCREEN_PADDING, paddingBottom: 40 },
  card:            { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  cardTitle:       { ...TYPE.headline, color: THEME_COLORS.textPrimary, marginBottom: SPACE.space4 },
  legendRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.space3, marginTop: SPACE.space3 },
  legendItem:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:       { width: 8, height: 8, borderRadius: 4 },
  legendText:      { ...TYPE.caption3, color: THEME_COLORS.textSecondary },
  emptyChart:      { height: 120, alignItems: 'center', justifyContent: 'center', padding: SPACE.space4 },
  emptyChartText:  { ...TYPE.body, color: THEME_COLORS.textTertiary, textAlign: 'center', lineHeight: 22 },
  sectionTitle:    { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.space3, marginBottom: SECTION_GAP },
  metricCard:      { flex: 1, minWidth: '45%', backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, borderWidth: 1, borderColor: THEME_COLORS.border },
  metricLabel:     { ...TYPE.caption1, color: THEME_COLORS.textSecondary },
  metricValue:     { ...TYPE.numericLarge, marginTop: 4 },
  metricSub:       { ...TYPE.caption3, color: THEME_COLORS.textTertiary, marginTop: 2 },
  ctxRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border, gap: SPACE.space3 },
  ctxLeft:         { flex: 1 },
  ctxLabel:        { ...TYPE.body, fontWeight: '500', color: THEME_COLORS.textPrimary },
  ctxCount:        { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  ctxRight:        { alignItems: 'flex-end', gap: 6 },
  ctxBarWrap:      { width: 80, height: 4, backgroundColor: THEME_COLORS.border, borderRadius: 2, overflow: 'hidden' },
  ctxBar:          { height: '100%', borderRadius: 2 },
  ctxBadge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: THEME_RADIUS.pill },
  ctxBadgeText:    { ...TYPE.footnote, fontWeight: '600' },
  rangeRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border },
  rangeLabel:      { ...TYPE.callout, color: THEME_COLORS.textPrimary },
  rangeValue:      { ...TYPE.body, fontWeight: '600', color: THEME_COLORS.primary },
  adaNote:         { backgroundColor: THEME_COLORS.primaryTint, borderRadius: THEME_RADIUS.md, padding: SPACE.space4 },
  adaNoteText:     { ...TYPE.footnote, color: THEME_COLORS.primary, lineHeight: 18 },

  // Custom date range bottom sheet — same sheet-radius card treatment
  // already used for forgot-password.tsx / reset-password.tsx.
  sheetBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetCard:       { backgroundColor: THEME_COLORS.surface, borderTopLeftRadius: THEME_RADIUS.sheet, borderTopRightRadius: THEME_RADIUS.sheet, padding: SCREEN_PADDING },
  sheetTitle:      { ...TYPE.title3, color: THEME_COLORS.textPrimary, marginBottom: SPACE.space4 },
  fieldLabel:      { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, textTransform: 'uppercase', letterSpacing: 0.6 },
  dateField:       { minHeight: 52, justifyContent: 'center', borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, paddingHorizontal: SPACE.space4, backgroundColor: THEME_COLORS.background },
  dateFieldText:   { ...TYPE.body, color: THEME_COLORS.textPrimary },
  sheetApplyBtn:        { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, alignItems: 'center', marginTop: SPACE.space6 },
  sheetApplyBtnPressed: { backgroundColor: THEME_COLORS.primaryPressed },
  sheetApplyBtnText:    { color: THEME_COLORS.textInverse, ...TYPE.headline },
});
