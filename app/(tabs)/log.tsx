import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/useAppStore';
import { CONTEXT_LABELS, SYMPTOM_LABELS, MEAL_TYPE_LABELS } from '@/constants';
import {
  THEME_COLORS, THEME_STATUS_COLORS, THEME_STATUS_BG_COLORS, THEME_STATUS_TEXT_COLORS,
  TYPE, SPACE, SCREEN_PADDING, SECTION_GAP, THEME_RADIUS, THEME_SHADOW, HERO_FONT_SCALE_CAP,
} from '@/constants/theme';
import { Icon } from '@/components/Icon';
import { classifyGlucose, mgToMmol, mmolToMg, formatGlucose, formatGlucoseAmount, formatElapsedMinutes } from '@/utils/helpers';
import { findBestBeforeMealMatch, maturityFor } from '@/utils/mealPairing';
import type { ReadingContext } from '@/types';

const CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'] as ReadingContext[];
const SYMPTOMS = ['none', 'dizzy', 'headache', 'sweating', 'fatigue', 'shaky', 'nausea'] as const;
const MEAL_TYPES = ['low_carb', 'normal', 'high_carb', 'sweet'] as const;

type SymptomKey = typeof SYMPTOMS[number];

export default function LogScreen() {
  const { activePatient, addReading, unit, readings, loadReadings } = useAppStore();
  const insets = useSafeAreaInsets();

  useEffect(() => { loadReadings(1); }, []);

  const [value, setValue]       = useState('');
  const [context, setContext]   = useState<ReadingContext>('fasting');
  const [symptoms, setSymptoms] = useState<SymptomKey[]>(['none']);
  const [mealType, setMealType] = useState('');
  const [notes, setNotes]       = useState('');
  const [notesFocused, setNotesFocused] = useState(false);
  const [saved, setSaved]       = useState(false);

  // `numVal` is whatever the user typed, in the currently selected display unit.
  // Storage and clinical classification always happen in mg/dL, so everything
  // downstream of entry converts once at this boundary.
  const numVal      = parseFloat(value);
  const numValMgDl  = !isNaN(numVal) ? (unit === 'mmol/L' ? mmolToMg(numVal) : numVal) : NaN;
  const isValid     = !isNaN(numValMgDl) && numValMgDl > 0 && numValMgDl < 600;
  const isMeal      = context === 'before_meal' || context === 'after_meal';
  const status      = isValid && activePatient ? classifyGlucose(numValMgDl, context, activePatient.condition) : null;

  // Live meal-pairing preview: only meaningful while composing an after-meal
  // reading, and only once we know what "now" would be recorded as.
  const mealMatch = context === 'after_meal' && activePatient
    ? findBestBeforeMealMatch(readings, activePatient.condition, new Date())
    : null;
  const mealMatchElapsed = mealMatch ? Math.round((Date.now() - new Date(mealMatch.recordedAt).getTime()) / 60000) : null;
  const mealMatchMaturity = mealMatchElapsed !== null ? maturityFor(mealMatchElapsed) : null;
  const mealMatchDeltaMgDl = mealMatch && isValid ? numValMgDl - mealMatch.value : null;

  function toggleSymptom(s: SymptomKey) {
    Haptics.selectionAsync();
    if (s === 'none') { setSymptoms(['none']); return; }
    setSymptoms((prev) => {
      const without = prev.filter((x) => x !== 'none');
      const next = without.includes(s) ? without.filter((x) => x !== s) : [...without, s];
      return next.length === 0 ? ['none'] : next;
    });
  }

  function handleSave() {
    if (!isValid) {
      const lo = unit === 'mmol/L' ? mgToMmol(1) : 1;
      const hi = unit === 'mmol/L' ? mgToMmol(599) : 600;
      Alert.alert(`Enter a valid glucose value (${lo}–${hi})`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addReading({
      // Always store in mg/dL, regardless of what unit the field was displaying —
      // the conversion at input time is exactly what keeps storage/classification
      // unit-agnostic everywhere else in the app.
      value: numValMgDl,
      unit: 'mg/dL',
      context,
      notes: [
        notes.trim(),
        symptoms.includes('none') ? '' : `Symptoms: ${symptoms.join(', ')}`,
        mealType ? `Meal: ${MEAL_TYPE_LABELS[mealType as keyof typeof MEAL_TYPE_LABELS]}` : '',
      ].filter(Boolean).join(' · ') || undefined,
      recordedAt: new Date().toISOString(),
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false); setValue(''); setNotes('');
      setSymptoms(['none']); setMealType('');
      router.push('/(tabs)');
    }, 800);
  }

  const statusLabels: Record<NonNullable<typeof status>, string> = {
    critical: 'Critical — seek medical attention',
    low:      'Below target range',
    normal:   'Within normal range',
    elevated: 'Slightly elevated',
    high:     'Above target range',
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="auto" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Log Reading</Text>
        <Text style={styles.subtitle}>Enter your blood glucose value</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* Big input card — the second (and only other) raised/hero card in the app */}
        <View style={styles.valueCard}>
          <TextInput
            style={styles.valueInput}
            placeholder="—"
            placeholderTextColor={THEME_COLORS.textTertiary}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            maxLength={5}
            autoFocus
            maxFontSizeMultiplier={HERO_FONT_SCALE_CAP}
            accessibilityLabel={unit === 'mmol/L' ? 'Glucose value in millimoles per liter' : 'Glucose value in milligrams per deciliter'}
          />
          <Text style={styles.valueUnit}>{unit}</Text>

          {status ? (
            status === 'critical' ? (
              <View style={[styles.statusPreview, { backgroundColor: THEME_STATUS_BG_COLORS.critical }]}>
                <Text style={[styles.statusPreviewText, { color: THEME_STATUS_TEXT_COLORS.critical }]}>
                  {statusLabels[status]}
                </Text>
              </View>
            ) : (
              <View style={[styles.statusPreview, { backgroundColor: THEME_STATUS_BG_COLORS[status] }]}>
                <View style={[styles.statusDot, { backgroundColor: THEME_STATUS_COLORS[status] }]} />
                <Text style={[styles.statusPreviewText, { color: THEME_STATUS_TEXT_COLORS[status] }]}>
                  {statusLabels[status]}
                </Text>
              </View>
            )
          ) : (
            <View style={styles.statusPlaceholder}>
              <Text style={styles.statusPlaceholderText}>Enter a value to see your status</Text>
            </View>
          )}
        </View>

        {/* Context chips */}
        <Text style={styles.sectionLabel}>When was this reading?</Text>
        <View style={styles.chipGrid}>
          {CONTEXTS.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, context === c && styles.chipActive]}
              onPress={() => { setContext(c); Haptics.selectionAsync(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: context === c }}
            >
              <Text style={[styles.chipText, context === c && styles.chipTextActive]}>
                {CONTEXT_LABELS[c]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Meal pairing preview — only while composing an after-meal reading
            that matches an earlier before-meal reading from today. Framing
            depends on maturity: an "early" match (< 30 min since the before-
            meal reading) is still shown immediately, just without treating
            the delta as a finished clinical verdict — glucose is likely
            still rising at that point. */}
        {mealMatch && mealMatchElapsed !== null && (
          <View style={styles.pairCard}>
            <View style={styles.pairRow}>
              <Icon ios="arrow.left.arrow.right" android="swap-horizontal-outline" size={14} color={THEME_COLORS.primary} />
              <Text style={styles.pairText}>
                {mealMatchMaturity === 'early'
                  ? `Logged ${formatElapsedMinutes(mealMatchElapsed)} after your ${formatGlucose(mealMatch.value, unit)} before-meal reading`
                  : `Pairs with your ${formatGlucose(mealMatch.value, unit)} before-meal reading from ${formatElapsedMinutes(mealMatchElapsed)} ago`}
              </Text>
            </View>
            {mealMatchMaturity === 'early' ? (
              <Text style={styles.pairHint}>
                Check again closer to 2 hours after eating for a clearer picture
                {mealMatchDeltaMgDl !== null && mealMatchDeltaMgDl !== 0
                  ? ` — so far: ${mealMatchDeltaMgDl > 0 ? '+' : '−'}${formatGlucoseAmount(Math.abs(mealMatchDeltaMgDl), unit)}`
                  : ''}
              </Text>
            ) : (
              mealMatchDeltaMgDl !== null && mealMatchDeltaMgDl !== 0 && (
                <Text style={[styles.pairDelta, { color: mealMatchDeltaMgDl > 0 ? THEME_COLORS.elevated : THEME_COLORS.normal }]}>
                  {mealMatchDeltaMgDl > 0 ? '+' : '−'}{formatGlucoseAmount(Math.abs(mealMatchDeltaMgDl), unit)} {mealMatchDeltaMgDl > 0 ? 'increase' : 'decrease'}
                </Text>
              )
            )}
          </View>
        )}

        {/* Meal type — only for meal contexts */}
        {isMeal && (
          <>
            <Text style={styles.sectionLabel}>Meal type</Text>
            <View style={styles.chipGrid}>
              {MEAL_TYPES.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, mealType === m && styles.chipActive]}
                  onPress={() => { setMealType(m === mealType ? '' : m); Haptics.selectionAsync(); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mealType === m }}
                >
                  <Text style={[styles.chipText, mealType === m && styles.chipTextActive]}>
                    {MEAL_TYPE_LABELS[m]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Symptoms */}
        <Text style={styles.sectionLabel}>How do you feel?</Text>
        <View style={styles.chipGrid}>
          {SYMPTOMS.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, symptoms.includes(s) && styles.chipActive]}
              onPress={() => toggleSymptom(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: symptoms.includes(s) }}
            >
              <Text style={[styles.chipText, symptoms.includes(s) && styles.chipTextActive]}>
                {SYMPTOM_LABELS[s]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Notes */}
        <Text style={styles.sectionLabel}>Notes (optional)</Text>
        <TextInput
          style={[styles.notesInput, notesFocused && styles.notesInputFocused]}
          placeholder="e.g. after exercise, had a big lunch…"
          placeholderTextColor={THEME_COLORS.textTertiary}
          value={notes}
          onChangeText={setNotes}
          onFocus={() => setNotesFocused(true)}
          onBlur={() => setNotesFocused(false)}
          multiline
          numberOfLines={3}
        />

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, saved && styles.saveBtnSuccess, !isValid && !saved && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isValid || saved}
        >
          {saved && <Icon ios="checkmark.circle.fill" android="checkmark-circle" size={18} color={THEME_COLORS.textInverse} />}
          <Text style={styles.saveBtnText}>{saved ? 'Saved' : 'Save Reading'}</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: THEME_COLORS.background },

  header:               { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16 },
  title:                { ...TYPE.title1, color: THEME_COLORS.textPrimary },
  subtitle:             { ...TYPE.body, color: THEME_COLORS.textSecondary, marginTop: 2 },

  content:              { padding: SCREEN_PADDING, paddingBottom: 60 },

  // Value card — raised/hero treatment, same as Dashboard's latest-reading card
  valueCard:            { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.xl, padding: SPACE.space6, alignItems: 'center', marginBottom: SECTION_GAP, ...THEME_SHADOW.raised },
  valueInput:           { ...TYPE.numericHero, color: THEME_COLORS.textPrimary, textAlign: 'center', minWidth: 160, lineHeight: 62 },
  valueUnit:            { ...TYPE.subheadline, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space3 },
  statusPreview:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: THEME_RADIUS.pill, marginTop: 4 },
  statusDot:            { width: 7, height: 7, borderRadius: 4 },
  statusPreviewText:    { ...TYPE.body, fontWeight: '600' },
  statusPlaceholder:    { paddingVertical: 8, marginTop: 4 },
  statusPlaceholderText:{ ...TYPE.footnote, color: THEME_COLORS.textTertiary, textAlign: 'center' },

  sectionLabel:         { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space3, textTransform: 'uppercase', letterSpacing: 0.8 },

  pairCard:             { backgroundColor: THEME_COLORS.primaryTint, borderRadius: THEME_RADIUS.md, padding: SPACE.space3, marginBottom: SECTION_GAP, gap: 4 },
  pairRow:              { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2 },
  pairText:             { flex: 1, ...TYPE.footnote, color: THEME_COLORS.primary },
  pairDelta:            { ...TYPE.footnote, fontWeight: '700', marginLeft: 22 },
  pairHint:             { ...TYPE.caption3, color: THEME_COLORS.primary, marginLeft: 22 },

  chipGrid:             { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.space2, marginBottom: SECTION_GAP },
  chip:                 { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 16, borderRadius: THEME_RADIUS.pill, borderWidth: 1.5, borderColor: THEME_COLORS.border, backgroundColor: THEME_COLORS.surface },
  chipActive:           { backgroundColor: THEME_COLORS.primary, borderColor: THEME_COLORS.primary },
  chipText:             { ...TYPE.body, color: THEME_COLORS.textSecondary, fontWeight: '500' },
  chipTextActive:       { color: THEME_COLORS.textInverse, fontWeight: '600' },

  notesInput:           { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.md, padding: 14, ...TYPE.body, color: THEME_COLORS.textPrimary, borderWidth: 1.5, borderColor: THEME_COLORS.border, minHeight: 90, textAlignVertical: 'top', marginBottom: SECTION_GAP },
  notesInputFocused:    { borderColor: THEME_COLORS.primary, borderWidth: 2 },

  saveBtn:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.space2, height: 52, backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md },
  saveBtnSuccess:       { backgroundColor: THEME_COLORS.normal },
  saveBtnDisabled:      { backgroundColor: THEME_COLORS.border },
  saveBtnText:          { color: THEME_COLORS.textInverse, ...TYPE.headline },
});
