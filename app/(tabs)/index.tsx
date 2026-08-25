import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, RefreshControl, Animated, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { type SFSymbol } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useAppStore } from '@/store/useAppStore';
import { fetchReadingsFromCloud } from '@/lib/sync';
import { CONDITION_LABELS, estimateHbA1c } from '@/constants';
import {
  THEME_COLORS, THEME_STATUS_COLORS, THEME_STATUS_BG_COLORS, THEME_STATUS_TEXT_COLORS,
  TYPE, SPACE, SCREEN_PADDING, SECTION_GAP, THEME_RADIUS, THEME_SHADOW, HERO_FONT_SCALE_CAP,
} from '@/constants/theme';
import { Icon } from '@/components/Icon';
import { computeStats, enrichReading, formatDateTime, formatGlucose, formatGlucoseAmount, formatElapsedMinutes, mgToMmol, contextLabel } from '@/utils/helpers';
import { pairMealReadings } from '@/utils/mealPairing';
import type { ReadingWithStatus, ReadingContext } from '@/types';

const SCHEDULE_SLOTS: { key: ReadingContext; label: string; time: string; ios: SFSymbol; android: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'fasting',     label: 'Fasting',     time: 'Morning',  ios: 'sunrise.fill',  android: 'sunny-outline' },
  { key: 'before_meal', label: 'Before Meal', time: 'Lunch',    ios: 'fork.knife',    android: 'restaurant-outline' },
  { key: 'after_meal',  label: 'After Meal',  time: '2h after', ios: 'clock.fill',    android: 'time-outline' },
  { key: 'bedtime',     label: 'Bedtime',     time: 'Night',    ios: 'moon.fill',     android: 'moon-outline' },
];

function hba1cStatusColor(hba1c: number) {
  if (hba1c < 5.7) return THEME_STATUS_COLORS.normal;
  if (hba1c < 6.5) return THEME_STATUS_COLORS.elevated;
  return THEME_STATUS_COLORS.high;
}

export default function DashboardScreen() {
  const { activePatient, readings, loadReadings, unit, removeReading } = useAppStore();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    const skeletonTimer = setTimeout(() => setShowSkeleton(true), 150);
    loadReadings(7);
    setLoading(false);
    clearTimeout(skeletonTimer);
  }, []);

  async function handleRefresh() {
    if (!activePatient) return;
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await fetchReadingsFromCloud(activePatient.id, 7);
      loadReadings(7);
      setSyncError(false);
    } catch {
      setSyncError(true);
    } finally {
      setRefreshing(false);
    }
  }

  if (!activePatient) return null;

  if (loading && showSkeleton) {
    return <DashboardSkeleton insets={insets} />;
  }
  if (loading) return null;

  const enriched = readings.map((r) => enrichReading(r, activePatient.condition));
  const stats    = computeStats(readings, activePatient.condition);
  const latest   = enriched[0] ?? null;
  const hba1c    = stats.average ? estimateHbA1c(stats.average) : null;

  const previousSameContext = latest
    ? enriched.slice(1).find((r) => r.context === latest.context) ?? null
    : null;
  const deltaMgDl = previousSameContext ? latest!.value - previousSameContext.value : null;

  const latestDisplayValue = latest ? (unit === 'mmol/L' ? mgToMmol(latest.value) : Math.round(latest.value)) : null;
  const avgDisplayValue = stats.average ? (unit === 'mmol/L' ? mgToMmol(stats.average) : stats.average) : null;

  const todaysMealPairs = pairMealReadings(readings, activePatient.condition).filter((p) => {
    const d = new Date(p.before.recordedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const initials = activePatient.name
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  function handleEditReading(id: string) {
    router.push({ pathname: '/(tabs)/log', params: { editId: id } });
  }

  function handleDeleteReading(id: string) {
    Alert.alert(
      'Delete reading',
      'Are you sure you want to delete this reading? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeReading(id) },
      ]
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      {/* Neutral header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.patientName}>{activePatient.name.split(' ')[0]}</Text>
          <View style={styles.conditionPill}>
            <Text style={styles.conditionText}>{CONDITION_LABELS[activePatient.condition]}</Text>
          </View>
        </View>
        <Pressable
          style={styles.avatar}
          hitSlop={8}
          onPress={() => router.push('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel={`Open profile for ${activePatient.name}`}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={THEME_COLORS.primary} />
        }
      >
        {syncError && (
          <View style={styles.errorBanner}>
            <Icon ios="exclamationmark.triangle.fill" android="warning-outline" size={16} color={THEME_COLORS.danger} />
            <Text style={styles.errorBannerText}>Couldn't sync latest data — showing saved readings</Text>
            <Pressable onPress={handleRefresh} hitSlop={8}>
              <Text style={styles.errorBannerRetry}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Latest reading hero card */}
        {latest ? (
          <View
            style={styles.latestCard}
            accessible
            accessibilityLabel={
              `Latest reading: ${formatGlucose(latest.value, unit)}, ${latest.label}, ` +
              `${contextLabel(latest.context)}, ${formatDateTime(latest.recordedAt)}` +
              (deltaMgDl !== null ? `, ${formatGlucoseAmount(Math.abs(deltaMgDl), unit)} ${deltaMgDl < 0 ? 'lower' : deltaMgDl > 0 ? 'higher' : 'the same'} than your last ${contextLabel(latest.context)} reading` : '')
            }
          >
            <View style={styles.latestTop}>
              <Text style={styles.latestLabel} maxFontSizeMultiplier={HERO_FONT_SCALE_CAP}>LATEST READING</Text>
              {latest.status === 'critical' ? (
                <View style={[styles.statusBadge, { backgroundColor: THEME_STATUS_BG_COLORS.critical }]}>
                  <Text style={[styles.statusText, { color: THEME_STATUS_TEXT_COLORS.critical }]}>{latest.label}</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: THEME_STATUS_BG_COLORS[latest.status] }]}>
                  <View style={[styles.statusDot, { backgroundColor: THEME_STATUS_COLORS[latest.status] }]} />
                  <Text style={[styles.statusText, { color: THEME_STATUS_TEXT_COLORS[latest.status] }]}>
                    {latest.label}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.latestValue, { color: THEME_STATUS_COLORS[latest.status] }]}
              maxFontSizeMultiplier={HERO_FONT_SCALE_CAP}
            >
              {latestDisplayValue}
            </Text>
            <Text style={styles.latestUnit}>{unit}</Text>
            <Text style={styles.latestMeta}>
              {contextLabel(latest.context)} · {formatDateTime(latest.recordedAt)}
            </Text>
            {deltaMgDl !== null && deltaMgDl !== 0 && (
              <View style={styles.deltaRow}>
                <Icon
                  ios={deltaMgDl < 0 ? 'arrow.down.right' : 'arrow.up.right'}
                  android={deltaMgDl < 0 ? 'trending-down-outline' : 'trending-up-outline'}
                  size={13}
                  color={THEME_COLORS.textSecondary}
                />
                <Text style={styles.deltaText}>
                  {formatGlucoseAmount(Math.abs(deltaMgDl), unit)} {deltaMgDl < 0 ? 'lower' : 'higher'} than your last {contextLabel(latest.context)} reading
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Pressable
            style={styles.emptyCard}
            onPress={() => router.push('/(tabs)/log')}
            accessibilityRole="button"
            accessibilityLabel="No readings yet. Tap to log your first glucose reading."
          >
            <View style={styles.emptyIconCircle}>
              <Icon ios="drop.fill" android="water-outline" size={26} color={THEME_COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No readings yet</Text>
            <Text style={styles.emptyText}>Log your first glucose reading to get started</Text>
            <Text style={styles.emptyAffordance}>Tap to begin  ›</Text>
          </Pressable>
        )}

        {/* Stats grid */}
        <Text style={styles.sectionTitle}>Last 7 Days</Text>
        <View style={styles.statsGrid}>
          <StatTile
            label="Avg Glucose"
            value={avgDisplayValue !== null ? `${avgDisplayValue}` : '—'}
            unit={unit}
            color={THEME_COLORS.textPrimary}
          />
          <StatTile
            label="Time in Range"
            value={stats.readingCount ? `${stats.timeInRange}%` : '—'}
            unit="target ≥70%"
            color={stats.timeInRange >= 70 ? THEME_STATUS_COLORS.normal : stats.timeInRange >= 50 ? THEME_STATUS_COLORS.elevated : THEME_STATUS_COLORS.high}
          />
          <StatTile
            label="Est. HbA1c"
            value={hba1c ? `${hba1c}%` : '—'}
            unit="estimated"
            color={hba1c ? hba1cStatusColor(hba1c) : THEME_COLORS.textPrimary}
          />
          <StatTile
            label="Trend"
            unit={stats.trend}
            valueIcon={
              stats.trend === 'improving' ? { ios: 'arrow.down.right', android: 'trending-down-outline' as const }
              : stats.trend === 'worsening' ? { ios: 'arrow.up.right', android: 'trending-up-outline' as const }
              : { ios: 'arrow.right', android: 'remove-outline' as const }
            }
            color={stats.trend === 'improving' ? THEME_STATUS_COLORS.normal : stats.trend === 'worsening' ? THEME_STATUS_COLORS.high : THEME_COLORS.textSecondary}
          />
        </View>

        {/* Today's schedule */}
        <Text style={styles.sectionTitle}>Today's Readings</Text>
        <View style={styles.scheduleCard}>
          {SCHEDULE_SLOTS.map((slot, i) => {
            const todayReadings = enriched.filter((r) => {
              const d = new Date(r.recordedAt);
              const today = new Date();
              return d.toDateString() === today.toDateString() && r.context === slot.key;
            });
            const done = todayReadings.length > 0;
            const last: ReadingWithStatus | undefined = todayReadings[0];
            return (
              <View key={slot.key} style={[styles.scheduleRow, i === SCHEDULE_SLOTS.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.scheduleIconWrap, done && styles.scheduleIconDone]}>
                  <Icon
                    ios={done ? 'checkmark' : slot.ios}
                    android={done ? 'checkmark' : slot.android}
                    size={16}
                    color={done ? THEME_COLORS.primary : THEME_COLORS.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scheduleLabel, done && styles.scheduleLabelDone]}>{slot.label}</Text>
                  <Text style={styles.scheduleTime}>{slot.time}</Text>
                </View>
                {done && last ? (
                  <View style={[styles.readingBadge, { backgroundColor: THEME_STATUS_BG_COLORS[last.status] }]}>
                    <Text style={[styles.readingBadgeText, { color: THEME_STATUS_TEXT_COLORS[last.status] }]}>
                      {formatGlucose(last.value, unit)}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    style={styles.logChip}
                    onPress={() => router.push('/(tabs)/log')}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${slot.label} reading`}
                  >
                    <Text style={styles.logChipText}>Log</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Meal response — today's paired before/after-meal readings */}
        {todaysMealPairs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Meal Response</Text>
            <View style={styles.mealCard}>
              {todaysMealPairs.map((p, i) => (
                <View key={p.id} style={[styles.mealRow, i === todaysMealPairs.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.mealValuesRow}>
                      <Text style={styles.mealValueText}>{formatGlucose(p.before.value, unit)}</Text>
                      <Icon ios="arrow.right" android="arrow-forward" size={11} color={THEME_COLORS.textTertiary} />
                      <Text style={styles.mealValueText}>{formatGlucose(p.after.value, unit)}</Text>
                    </View>
                    <Text style={styles.mealMeta}>
                      {formatElapsedMinutes(p.elapsedMinutes)} after eating{p.maturity === 'early' ? ' so far' : ''}
                    </Text>
                  </View>
                  {p.maturity === 'early' ? (
                    <View style={styles.mealDeltaBadgePending}>
                      <Icon ios="clock" android="time-outline" size={11} color={THEME_COLORS.textSecondary} />
                      <Text style={styles.mealDeltaTextPending}>
                        {p.deltaMgDl === 0 ? '±0' : `${p.deltaMgDl > 0 ? '+' : '−'}${formatGlucoseAmount(Math.abs(p.deltaMgDl), unit)}`}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.mealDeltaBadge,
                        { backgroundColor: p.direction === 'increase' ? THEME_STATUS_BG_COLORS.elevated : p.direction === 'decrease' ? THEME_STATUS_BG_COLORS.normal : THEME_COLORS.background },
                      ]}
                    >
                      <Icon
                        ios={p.direction === 'increase' ? 'arrow.up.right' : p.direction === 'decrease' ? 'arrow.down.right' : 'arrow.right'}
                        android={p.direction === 'increase' ? 'trending-up-outline' : p.direction === 'decrease' ? 'trending-down-outline' : 'remove-outline'}
                        size={11}
                        color={p.direction === 'increase' ? THEME_STATUS_TEXT_COLORS.elevated : p.direction === 'decrease' ? THEME_STATUS_TEXT_COLORS.normal : THEME_COLORS.textSecondary}
                      />
                      <Text
                        style={[
                          styles.mealDeltaText,
                          { color: p.direction === 'increase' ? THEME_STATUS_TEXT_COLORS.elevated : p.direction === 'decrease' ? THEME_STATUS_TEXT_COLORS.normal : THEME_COLORS.textSecondary },
                        ]}
                      >
                        {formatGlucoseAmount(Math.abs(p.deltaMgDl), unit)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Recent readings list */}
        {enriched.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Readings</Text>
            <View style={styles.recentCard}>
              {enriched.slice(0, 5).map((r, i, arr) => (
                <Swipeable
                  key={r.id}
                  renderRightActions={() => (
                    <Pressable
                      style={styles.deleteAction}
                      onPress={() => handleDeleteReading(r.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete reading"
                    >
                      <Icon ios="trash.fill" android="trash-outline" size={18} color={THEME_COLORS.textInverse} />
                    </Pressable>
                  )}
                  overshootRight={false}
                >
                  <Pressable
                    onPress={() => handleEditReading(r.id)}
                    style={[styles.readingRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${formatGlucose(r.value, unit)} ${contextLabel(r.context)} reading from ${formatDateTime(r.recordedAt)}`}
                  >
                    <View style={[styles.readingDot, { backgroundColor: THEME_STATUS_COLORS[r.status] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readingValue}>{formatGlucose(r.value, unit)}</Text>
                      <Text style={styles.readingMeta}>
                        {contextLabel(r.context)} · {formatDateTime(r.recordedAt)}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: THEME_STATUS_BG_COLORS[r.status] }]}>
                      <Text style={[styles.statusText, { color: THEME_STATUS_TEXT_COLORS[r.status] }]}>{r.label}</Text>
                    </View>
                  </Pressable>
                </Swipeable>
              ))}
            </View>
          </>
        )}

        {/* Log CTA */}
        <Pressable
          style={({ pressed }) => [styles.logBtn, pressed && styles.logBtnPressed]}
          onPress={() => router.push('/(tabs)/log')}
        >
          <Icon ios="plus" android="add" size={18} color={THEME_COLORS.textInverse} />
          <Text style={styles.logBtnText}>Log New Reading</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

function StatTile({ label, value, unit, color, valueIcon }: {
  label: string; value?: string; unit: string; color: string;
  valueIcon?: { ios: SFSymbol; android: keyof typeof Ionicons.glyphMap };
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
      onPress={() => router.push('/(tabs)/trends')}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? unit}${value ? ` ${unit}` : ''}. View trends.`}
    >
      <View style={styles.statTopRow}>
        <Text style={styles.statLabel}>{label}</Text>
        <Icon ios="chevron.right" android="chevron-forward" size={12} color={THEME_COLORS.textTertiary} />
      </View>
      {valueIcon ? (
        <View style={{ marginTop: 4 }}>
          <Icon ios={valueIcon.ios} android={valueIcon.android} size={26} color={color} />
        </View>
      ) : (
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      )}
      {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
    </Pressable>
  );
}

function SkeletonBlock({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[style, { backgroundColor: THEME_COLORS.border, opacity }]} />;
}

function DashboardSkeleton({ insets }: { insets: { top: number } }) {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <SkeletonBlock style={{ width: 100, height: 14, borderRadius: 4, marginBottom: 8 }} />
          <SkeletonBlock style={{ width: 140, height: 26, borderRadius: 6 }} />
        </View>
      </View>
      <View style={styles.content}>
        <SkeletonBlock style={{ height: 180, borderRadius: THEME_RADIUS.xl, marginBottom: SECTION_GAP }} />
        <View style={styles.statsGrid}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} style={{ flex: 1, minWidth: '45%', height: 88, borderRadius: THEME_RADIUS.md }} />
          ))}
        </View>
        <SkeletonBlock style={{ height: 180, borderRadius: THEME_RADIUS.lg, marginTop: SECTION_GAP }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: THEME_COLORS.background },

  // Neutral header (native large-title style)
  header:             { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft:         { flex: 1 },
  greeting:           { ...TYPE.caption1, color: THEME_COLORS.textSecondary },
  patientName:        { ...TYPE.title1, color: THEME_COLORS.textPrimary, marginTop: 1 },
  conditionPill:      { marginTop: 8, alignSelf: 'flex-start', backgroundColor: THEME_COLORS.primaryTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: THEME_RADIUS.pill },
  conditionText:      { ...TYPE.footnote, color: THEME_COLORS.primary },
  avatar:             { width: 36, height: 36, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primaryTint, alignItems: 'center', justifyContent: 'center' },
  avatarText:         { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.primary },

  scroll:             { flex: 1 },
  content:            { padding: SCREEN_PADDING, paddingBottom: 40 },

  errorBanner:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2, backgroundColor: THEME_COLORS.dangerBg, borderRadius: THEME_RADIUS.md, padding: SPACE.space3, marginBottom: SPACE.space4 },
  errorBannerText:    { flex: 1, ...TYPE.footnote, color: THEME_COLORS.danger },
  errorBannerRetry:   { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.danger },

  // Latest reading hero card
  latestCard:         { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.xl, padding: SPACE.space6, marginBottom: SECTION_GAP, alignItems: 'center', ...THEME_SHADOW.raised },
  latestTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: SPACE.space3 },
  latestLabel:        { ...TYPE.caption2, color: THEME_COLORS.textTertiary },
  latestValue:        { ...TYPE.numericHero, lineHeight: 62 },
  latestUnit:         { ...TYPE.subheadline, color: THEME_COLORS.textSecondary, marginTop: 2, marginBottom: SPACE.space2 },
  latestMeta:         { ...TYPE.footnote, color: THEME_COLORS.textSecondary },
  deltaRow:           { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACE.space2 },
  deltaText:          { ...TYPE.footnote, color: THEME_COLORS.textSecondary },

  // Status badge
  statusBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: THEME_RADIUS.pill },
  statusDot:          { width: 6, height: 6, borderRadius: 3 },
  statusText:         { ...TYPE.footnote, fontWeight: '600' },

  // Empty state
  emptyCard:          { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.xl, padding: SPACE.space7, marginBottom: SECTION_GAP, alignItems: 'center', borderWidth: 1, borderColor: THEME_COLORS.border },
  emptyIconCircle:    { width: 56, height: 56, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.space3 },
  emptyTitle:         { ...TYPE.headline, color: THEME_COLORS.textPrimary, marginBottom: 4 },
  emptyText:          { ...TYPE.body, color: THEME_COLORS.textSecondary, textAlign: 'center' },
  emptyAffordance:    { ...TYPE.footnote, color: THEME_COLORS.primary, marginTop: SPACE.space3 },

  // Section
  sectionTitle:       { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Stats grid
  statsGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.space3, marginBottom: SECTION_GAP },
  statCard:           { flex: 1, minWidth: '45%', backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, borderWidth: 1, borderColor: THEME_COLORS.border },
  statCardPressed:    { backgroundColor: THEME_COLORS.background },
  statTopRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel:          { ...TYPE.caption1, color: THEME_COLORS.textSecondary },
  statValue:          { ...TYPE.numericLarge, marginTop: 4 },
  statUnit:           { ...TYPE.caption3, color: THEME_COLORS.textTertiary, marginTop: 2 },

  // Schedule
  scheduleCard:       { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, paddingHorizontal: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  scheduleRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.space3, paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border },
  scheduleIconWrap:   { width: 34, height: 34, borderRadius: THEME_RADIUS.sm, backgroundColor: THEME_COLORS.background, alignItems: 'center', justifyContent: 'center' },
  scheduleIconDone:   { backgroundColor: THEME_COLORS.primaryTint },
  scheduleLabel:      { ...TYPE.body, fontWeight: '500', color: THEME_COLORS.textPrimary },
  scheduleLabelDone:  { color: THEME_COLORS.primary },
  scheduleTime:       { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 1 },
  logChip:            { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: THEME_RADIUS.pill, borderWidth: 1.5, borderColor: THEME_COLORS.primary },
  logChipText:        { ...TYPE.footnote, fontWeight: '600', color: THEME_COLORS.primary },
  readingBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: THEME_RADIUS.pill },
  readingBadgeText:   { ...TYPE.footnote, fontWeight: '600' },

  // Meal response
  mealCard:           { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, paddingHorizontal: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  mealRow:            { flexDirection: 'row', alignItems: 'center', gap: SPACE.space3, paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border },
  mealValuesRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2 },
  mealValueText:      { ...TYPE.headline, color: THEME_COLORS.textPrimary },
  mealMeta:           { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  mealDeltaBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: THEME_RADIUS.pill },
  mealDeltaText:      { ...TYPE.footnote, fontWeight: '700' },
  mealDeltaBadgePending: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.background },
  mealDeltaTextPending:  { ...TYPE.footnote, fontWeight: '600', color: THEME_COLORS.textSecondary },

  // Recent readings (single grouped card, hairline dividers)
  recentCard:         { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, paddingHorizontal: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border, overflow: 'hidden' },
  readingRow:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.space3, paddingVertical: SPACE.space3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surface },
  readingDot:         { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  readingValue:       { ...TYPE.headline, color: THEME_COLORS.textPrimary },
  readingMeta:        { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  deleteAction:       { width: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME_COLORS.danger },

  // Log button
  logBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.space2, height: 52, backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, marginTop: SPACE.space2 },
  logBtnPressed:      { backgroundColor: THEME_COLORS.primaryPressed },
  logBtnText:         { ...TYPE.headline, color: THEME_COLORS.textInverse },
});
