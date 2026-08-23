import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
  Animated, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { syncPatientToCloud } from '@/lib/sync';
import { CONDITION_LABELS, CONDITION_DESCRIPTIONS } from '@/constants';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';
import type { DiabetesCondition, Gender } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CONDITIONS: DiabetesCondition[] = ['non_diabetic', 'prediabetic', 'type1', 'type2'];
const GENDERS: { key: Gender; label: string; icon: string }[] = [
  { key: 'male',   label: 'Male',   icon: '♂' },
  { key: 'female', label: 'Female', icon: '♀' },
  { key: 'other',  label: 'Other',  icon: '⊕' },
];

const WELCOME_FEATURES: { ios: any; android: any; text: string }[] = [
  { ios: 'chart.bar.fill', android: 'bar-chart-outline', text: 'Personalized ADA 2024 reference ranges' },
  { ios: 'waveform.path.ecg', android: 'pulse-outline', text: 'Time-in-range and HbA1c trends at a glance' },
  { ios: 'doc.text.fill', android: 'document-text-outline', text: 'Doctor-ready visit summaries' },
];

export default function OnboardingScreen() {
  const { createPatient } = useAppStore();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [step, setStep]           = useState(0);
  const [name, setName]           = useState('');
  const [age, setAge]             = useState('');
  const [gender, setGender]       = useState<Gender | null>(null);
  const [condition, setCondition] = useState<DiabetesCondition | null>(null);
  const [saving, setSaving]       = useState(false);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const TOTAL_STEPS = 4;

  function animateToNext(nextStep: number) {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(nextStep);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }

  function handleNext() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1) {
      if (!name.trim()) { Alert.alert('Please enter your name'); return; }
      if (!age || parseInt(age) < 1 || parseInt(age) > 120) { Alert.alert('Please enter a valid age'); return; }
      if (!gender) { Alert.alert('Please select your gender'); return; }
    }
    if (step === 2 && !condition) {
      Alert.alert('Please select your diabetes condition');
      return;
    }
    animateToNext(step + 1);
  }

  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const patient = createPatient({
        name: name.trim(),
        age: parseInt(age, 10),
        gender: gender!,
        condition: condition!,
      });
      await syncPatientToCloud(patient);
      router.replace('/(tabs)');
    } catch (e) {
      setSaving(false);
      Alert.alert('Error', 'Could not save profile. Please try again.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      {/* Progress bar */}
      <View style={[styles.progressWrap, { paddingTop: insets.top + 12 }]}>
        {step > 0 && (
          <Pressable
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); animateToNext(step - 1); }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon ios="chevron.left" android="chevron-back" size={18} color={THEME_COLORS.primary} />
          </Pressable>
        )}
        <View style={styles.progressDots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <View style={styles.stepWrap}>
              <View style={styles.logoWrap}>
                <View style={styles.logoCircle}>
                  <Text style={styles.logoGL}>GL</Text>
                </View>
                <View style={styles.logoPulse} />
              </View>
              <Text style={styles.welcomeTitle}>Welcome to{'\n'}GlucoLens</Text>
              <Text style={styles.welcomeSub}>
                Your clinical-grade glucose companion. Built to help you and your doctor make better decisions together.
              </Text>
              <View style={styles.featureList}>
                {WELCOME_FEATURES.map((f, i) => (
                  <View key={i} style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <Icon ios={f.ios} android={f.android} size={16} color={THEME_COLORS.primary} />
                    </View>
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                ))}
              </View>
              <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]} onPress={handleNext}>
                <Text style={styles.primaryBtnText}>Get started</Text>
              </Pressable>
              <Text style={styles.alreadyText}>
                Already have an account?{' '}
                <Text style={{ color: THEME_COLORS.primary }} onPress={() => router.replace('/(auth)/login')}>
                  Sign in
                </Text>
              </Text>
            </View>
          )}

          {/* ── Step 1: Personal info ── */}
          {step === 1 && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>Personal info</Text>
              <Text style={styles.stepSub}>
                This helps configure your personalized glucose reference ranges.
              </Text>

              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ahmad Razif"
                placeholderTextColor={THEME_COLORS.textTertiary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={styles.fieldLabel}>Age</Text>
              <TextInput
                style={[styles.input, { width: 120 }]}
                placeholder="e.g. 45"
                placeholderTextColor={THEME_COLORS.textTertiary}
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
                maxLength={3}
                returnKeyType="done"
              />

              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.genderRow}>
                {GENDERS.map((g) => (
                  <Pressable
                    key={g.key}
                    style={[styles.genderChip, gender === g.key && styles.genderChipActive]}
                    onPress={() => { setGender(g.key); Haptics.selectionAsync(); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: gender === g.key }}
                  >
                    <Text style={styles.genderIcon}>{g.icon}</Text>
                    <Text style={[styles.genderLabel, gender === g.key && styles.genderLabelActive]}>
                      {g.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={({ pressed }) => [styles.primaryBtn, { marginTop: 32 }, pressed && styles.primaryBtnPressed]} onPress={handleNext}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Condition ── */}
          {step === 2 && (
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>Health profile</Text>
              <Text style={styles.stepSub}>
                Select your current diabetes condition. Your reference ranges will be automatically configured.
              </Text>

              {CONDITIONS.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.condCard, condition === c && styles.condCardActive]}
                  onPress={() => { setCondition(c); Haptics.selectionAsync(); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: condition === c }}
                >
                  <View style={styles.condLeft}>
                    <View style={[styles.radio, condition === c && styles.radioActive]}>
                      {condition === c && <View style={styles.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.condLabel, condition === c && styles.condLabelActive]}>
                        {CONDITION_LABELS[c]}
                      </Text>
                      <Text style={styles.condDesc}>{CONDITION_DESCRIPTIONS[c]}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}

              <Pressable style={({ pressed }) => [styles.primaryBtn, { marginTop: 24 }, pressed && styles.primaryBtnPressed]} onPress={handleNext}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 3: All set ── */}
          {step === 3 && (
            <View style={styles.stepWrap}>
              <View style={[styles.logoCircle, { backgroundColor: THEME_COLORS.normal, marginBottom: SPACE.space6 }]}>
                <Icon ios="checkmark" android="checkmark" size={32} color={THEME_COLORS.textInverse} />
              </View>
              <Text style={styles.stepTitle}>You're all set,{'\n'}{name.split(' ')[0]}!</Text>
              <Text style={styles.stepSub}>
                Your profile is configured with ADA 2024 clinical ranges for{' '}
                <Text style={{ fontWeight: '600', color: THEME_COLORS.textPrimary }}>
                  {CONDITION_LABELS[condition!]}
                </Text>.
              </Text>

              <View style={styles.summaryCard}>
                <SummaryRow label="Name"      value={name} />
                <SummaryRow label="Age"       value={`${age} years`} />
                <SummaryRow label="Gender"    value={gender!.charAt(0).toUpperCase() + gender!.slice(1)} />
                <SummaryRow label="Condition" value={CONDITION_LABELS[condition!]} highlight last />
              </View>

              <View style={styles.adaNote}>
                <Text style={styles.adaNoteText}>
                  Reference ranges sourced from American Diabetes Association Standards of Medical Care 2024.
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: THEME_COLORS.normal }, pressed && { opacity: 0.9 }]}
                onPress={handleFinish}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>
                  {saving ? 'Setting up…' : 'Open GlucoLens'}
                </Text>
              </Pressable>
            </View>
          )}

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value, highlight, last }: {
  label: string; value: string; highlight?: boolean; last?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && { color: THEME_COLORS.primary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: THEME_COLORS.surface },
  progressWrap:      { paddingHorizontal: SCREEN_PADDING, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  backBtn:           { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12, marginRight: 4 },
  progressDots:      { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot:               { width: 6, height: 6, borderRadius: 3, backgroundColor: THEME_COLORS.border },
  dotActive:         { width: 22, height: 6, borderRadius: 3, backgroundColor: THEME_COLORS.primary },
  dotDone:           { backgroundColor: THEME_COLORS.primaryPressed },
  scroll:            { flexGrow: 1, paddingHorizontal: SCREEN_PADDING, paddingBottom: 40 },
  stepWrap:          { paddingTop: 28 },

  // Welcome
  logoWrap:          { marginBottom: SPACE.space6, position: 'relative', width: 80, height: 80 },
  logoCircle:        { width: 80, height: 80, borderRadius: THEME_RADIUS.xl, backgroundColor: THEME_COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  logoPulse:         { position: 'absolute', width: 80, height: 80, borderRadius: THEME_RADIUS.xl, backgroundColor: THEME_COLORS.primary, opacity: 0.15, transform: [{ scale: 1.2 }] },
  logoGL:            { fontSize: 28, fontWeight: '700', color: THEME_COLORS.textInverse },
  welcomeTitle:      { ...TYPE.display, color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3, lineHeight: 40 },
  welcomeSub:        { ...TYPE.body, color: THEME_COLORS.textSecondary, lineHeight: 24, marginBottom: SPACE.space6 },
  featureList:       { backgroundColor: THEME_COLORS.background, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SPACE.space6, gap: SPACE.space3 },
  featureItem:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.space3 },
  featureIconWrap:   { width: 30, height: 30, borderRadius: THEME_RADIUS.sm, backgroundColor: THEME_COLORS.primaryTint, alignItems: 'center', justifyContent: 'center' },
  featureText:       { ...TYPE.body, color: THEME_COLORS.textPrimary, flex: 1 },
  alreadyText:       { textAlign: 'center', ...TYPE.body, color: THEME_COLORS.textSecondary, marginTop: SPACE.space4 },

  // Steps
  stepTitle:         { ...TYPE.title1, color: THEME_COLORS.textPrimary, marginBottom: SPACE.space2, lineHeight: 36 },
  stepSub:           { ...TYPE.body, color: THEME_COLORS.textSecondary, lineHeight: 24, marginBottom: SPACE.space6 },
  fieldLabel:        { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, marginTop: SPACE.space4, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:             { minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, ...TYPE.headline, fontWeight: '400', color: THEME_COLORS.textPrimary, backgroundColor: THEME_COLORS.surface },

  // Gender chips
  genderRow:         { flexDirection: 'row', gap: 10 },
  genderChip:        { flex: 1, minHeight: 52, justifyContent: 'center', paddingVertical: 14, borderRadius: THEME_RADIUS.md, borderWidth: 1.5, borderColor: THEME_COLORS.border, alignItems: 'center', backgroundColor: THEME_COLORS.surface, gap: 4 },
  genderChipActive:  { backgroundColor: THEME_COLORS.primaryTint, borderColor: THEME_COLORS.primary },
  genderIcon:        { fontSize: 18 },
  genderLabel:       { ...TYPE.body, color: THEME_COLORS.textSecondary, fontWeight: '500' },
  genderLabelActive: { color: THEME_COLORS.primary },

  // Condition cards
  condCard:          { borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SPACE.space2, backgroundColor: THEME_COLORS.surface },
  condCardActive:    { borderColor: THEME_COLORS.primary, backgroundColor: THEME_COLORS.primaryTint },
  condLeft:          { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.space3 },
  radio:             { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: THEME_COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  radioActive:       { borderColor: THEME_COLORS.primary },
  radioDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: THEME_COLORS.primary },
  condLabel:         { ...TYPE.headline, color: THEME_COLORS.textPrimary, marginBottom: 3 },
  condLabelActive:   { color: THEME_COLORS.primary },
  condDesc:          { ...TYPE.footnote, color: THEME_COLORS.textSecondary, lineHeight: 18 },

  // Summary
  summaryCard:       { backgroundColor: THEME_COLORS.background, borderRadius: THEME_RADIUS.lg, paddingHorizontal: SPACE.space4, marginBottom: SPACE.space4 },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME_COLORS.border },
  summaryLabel:      { ...TYPE.headline, fontWeight: '400', color: THEME_COLORS.textSecondary },
  summaryValue:      { ...TYPE.headline, color: THEME_COLORS.textPrimary },
  adaNote:           { backgroundColor: THEME_COLORS.primaryTint, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, marginBottom: SPACE.space6 },
  adaNoteText:       { ...TYPE.footnote, color: THEME_COLORS.primary, lineHeight: 18 },

  // Button
  primaryBtn:        { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, padding: 16, alignItems: 'center' },
  primaryBtnPressed: { backgroundColor: THEME_COLORS.primaryPressed },
  primaryBtnText:    { color: THEME_COLORS.textInverse, ...TYPE.headline },
});
