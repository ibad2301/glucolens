import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Switch } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { CONDITION_LABELS, REFERENCE_RANGES, estimateHbA1c } from '@/constants';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, SECTION_GAP, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';
import { formatDate, computeStats, formatRange } from '@/utils/helpers';

export default function ProfileScreen() {
  const { signOut } = useAuthStore();
  const { activePatient, readings, setActivePatient, unit, setUnit } = useAppStore();
  const insets = useSafeAreaInsets();

  if (!activePatient) return null;

  const stats    = computeStats(readings, activePatient.condition);
  const hba1c    = stats.average ? estimateHbA1c(stats.average) : null;
  const ranges   = REFERENCE_RANGES[activePatient.condition];
  const initials = activePatient.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await signOut();
          setActivePatient(null);
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Avatar / identity */}
        <View style={styles.identityCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.name}>{activePatient.name}</Text>
          <View style={styles.conditionPill}>
            <Text style={styles.conditionText}>{CONDITION_LABELS[activePatient.condition]}</Text>
          </View>
          {hba1c !== null && (
            <View style={styles.hba1cWrap}>
              <Text style={styles.hba1cLabel}>Est. HbA1c</Text>
              <Text style={styles.hba1cValue}>{hba1c}%</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatItem label="Age" value={`${activePatient.age}`} />
          <View style={styles.statDivider} />
          <StatItem label="Readings" value={`${readings.length}`} />
          <View style={styles.statDivider} />
          <StatItem
            label="In range"
            value={stats.readingCount ? `${stats.timeInRange}%` : '—'}
            color={stats.timeInRange >= 70 ? THEME_COLORS.normal : THEME_COLORS.elevated}
          />
        </View>

        {/* Visit summary entry point */}
        <Pressable
          style={({ pressed }) => [styles.visitSummaryBtn, pressed && styles.visitSummaryBtnPressed]}
          onPress={() => router.push('/visit-summary')}
          accessibilityRole="button"
          accessibilityLabel="Open visit summary, a doctor-ready view of the last 30 days"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.visitSummaryTitle}>Visit Summary</Text>
            <Text style={styles.visitSummaryDesc}>A doctor-ready view of the last 30 days</Text>
          </View>
          <Icon ios="chevron.right" android="chevron-forward" size={16} color={THEME_COLORS.primary} />
        </Pressable>

        {/* Profile details */}
        <Text style={styles.sectionTitle}>Profile details</Text>
        <View style={styles.detailCard}>
          <DetailRow label="Full name"    value={activePatient.name} />
          <DetailRow label="Age"          value={`${activePatient.age} years`} />
          <DetailRow label="Gender"       value={activePatient.gender.charAt(0).toUpperCase() + activePatient.gender.slice(1)} />
          <DetailRow label="Condition"    value={CONDITION_LABELS[activePatient.condition]} highlight />
          <DetailRow label="Member since" value={formatDate(activePatient.createdAt)} last />
        </View>

        {/* Unit toggle */}
        <Text style={styles.sectionTitle}>Display settings</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Use mmol/L</Text>
              <Text style={styles.settingDesc}>Switch glucose units from mg/dL to mmol/L</Text>
            </View>
            <Switch
              value={unit === 'mmol/L'}
              onValueChange={(v) => setUnit(v ? 'mmol/L' : 'mg/dL')}
              trackColor={{ false: THEME_COLORS.border, true: THEME_COLORS.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Target ranges */}
        <Text style={styles.sectionTitle}>Your target ranges</Text>
        <View style={styles.detailCard}>
          <DetailRow label="Fasting"    value={formatRange(ranges.fasting.low, ranges.fasting.high, unit)} />
          <DetailRow label="After meal" value={formatRange(ranges.postMeal.low, ranges.postMeal.high, unit)} />
          <DetailRow label="Bedtime"    value={formatRange(ranges.bedtime.low, ranges.bedtime.high, unit)} last />
        </View>

        {/* ADA note */}
        <View style={styles.adaNote}>
          <Text style={styles.adaNoteText}>
            Ranges configured using ADA Standards of Medical Care 2024 for {CONDITION_LABELS[activePatient.condition]}.
          </Text>
        </View>

        {/* Sign out */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>GlucoLens v1.0.0 · Built with care</Text>

      </ScrollView>
    </View>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value, highlight, last }: {
  label: string; value: string; highlight?: boolean; last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && { color: THEME_COLORS.primary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: THEME_COLORS.background },
  header:         { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16 },
  title:          { ...TYPE.title1, color: THEME_COLORS.textPrimary },
  content:        { padding: SCREEN_PADDING, paddingBottom: 60 },
  identityCard:   { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.xl, padding: SPACE.space6, alignItems: 'center', marginBottom: SPACE.space3, borderWidth: 1, borderColor: THEME_COLORS.border },
  avatarRing:     { width: 88, height: 88, borderRadius: THEME_RADIUS.pill, borderWidth: 3, borderColor: THEME_COLORS.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.space3 },
  avatar:         { width: 78, height: 78, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText:     { color: THEME_COLORS.textInverse, fontSize: 28, fontWeight: '700' },
  name:           { ...TYPE.title3, color: THEME_COLORS.textPrimary },
  conditionPill:  { marginTop: 6, backgroundColor: THEME_COLORS.primaryTint, paddingHorizontal: 12, paddingVertical: 4, borderRadius: THEME_RADIUS.pill },
  conditionText:  { ...TYPE.footnote, color: THEME_COLORS.primary, fontWeight: '600' },
  hba1cWrap:      { marginTop: SPACE.space4, alignItems: 'center' },
  hba1cLabel:     { ...TYPE.caption2, color: THEME_COLORS.textSecondary },
  hba1cValue:     { ...TYPE.numericLarge, color: THEME_COLORS.primary, marginTop: 2 },
  statsRow:       { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, flexDirection: 'row', marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  statItem:       { flex: 1, alignItems: 'center' },
  statValue:      { ...TYPE.title3, color: THEME_COLORS.textPrimary },
  statLabel:      { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginTop: 3 },
  statDivider:    { width: 1, backgroundColor: THEME_COLORS.border },
  visitSummaryBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME_COLORS.primaryTint, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SECTION_GAP, gap: SPACE.space3 },
  visitSummaryBtnPressed: { backgroundColor: THEME_COLORS.primaryTintStrong },
  visitSummaryTitle:{ ...TYPE.body, fontWeight: '600', color: THEME_COLORS.primary },
  visitSummaryDesc: { ...TYPE.footnote, color: THEME_COLORS.primary, marginTop: 2 },
  sectionTitle:   { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailCard:     { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, paddingHorizontal: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border },
  detailLabel:    { ...TYPE.body, color: THEME_COLORS.textSecondary },
  detailValue:    { ...TYPE.body, fontWeight: '500', color: THEME_COLORS.textPrimary, flex: 1, textAlign: 'right' },
  settingsCard:   { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, paddingHorizontal: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  settingRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: SPACE.space3 },
  settingLabel:   { ...TYPE.body, fontWeight: '500', color: THEME_COLORS.textPrimary },
  settingDesc:    { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  adaNote:        { backgroundColor: THEME_COLORS.primaryTint, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, marginBottom: SECTION_GAP },
  adaNoteText:    { ...TYPE.footnote, color: THEME_COLORS.primary, lineHeight: 18 },
  signOutBtn:     { minHeight: 52, justifyContent: 'center', borderWidth: 1.5, borderColor: THEME_COLORS.danger, borderRadius: THEME_RADIUS.md, alignItems: 'center', marginBottom: SECTION_GAP },
  signOutBtnPressed: { backgroundColor: THEME_COLORS.dangerBg },
  signOutText:    { color: THEME_COLORS.danger, ...TYPE.headline },
  version:        { textAlign: 'center', ...TYPE.caption3, color: THEME_COLORS.textTertiary },
});
