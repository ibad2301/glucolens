import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/useAppStore';
import { syncPatientToCloud } from '@/lib/sync';
import { CONDITION_LABELS, CONDITION_DESCRIPTIONS } from '@/constants';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';
import type { DiabetesCondition, Gender } from '@/types';

// Field components/styling below are copied verbatim from onboarding.tsx's
// step 1 (personal info) and step 2 (condition) — this screen intentionally
// introduces no new visual design, per the design-freeze constraint.

const CONDITIONS: DiabetesCondition[] = ['non_diabetic', 'prediabetic', 'type1', 'type2'];
const GENDERS: { key: Gender; label: string; icon: string }[] = [
  { key: 'male',   label: 'Male',   icon: '♂' },
  { key: 'female', label: 'Female', icon: '♀' },
  { key: 'other',  label: 'Other',  icon: '⊕' },
];

export default function EditProfileScreen() {
  const { activePatient, updatePatient } = useAppStore();
  const insets = useSafeAreaInsets();

  const [name, setName]           = useState(activePatient?.name ?? '');
  const [age, setAge]             = useState(activePatient ? String(activePatient.age) : '');
  const [gender, setGender]       = useState<Gender | null>(activePatient?.gender ?? null);
  const [condition, setCondition] = useState<DiabetesCondition | null>(activePatient?.condition ?? null);
  const [saving, setSaving]       = useState(false);

  if (!activePatient) return null;

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Please enter your name'); return; }
    if (!age || parseInt(age, 10) < 1 || parseInt(age, 10) > 120) { Alert.alert('Please enter a valid age'); return; }
    if (!gender) { Alert.alert('Please select your gender'); return; }
    if (!condition) { Alert.alert('Please select your diabetes condition'); return; }

    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updated = updatePatient({
      name: name.trim(),
      age: parseInt(age, 10),
      gender,
      condition,
    });
    if (!updated) {
      setSaving(false);
      Alert.alert('Error', 'Could not save profile. Please try again.');
      return;
    }
    try {
      await syncPatientToCloud(updated);
    } catch {
      // Local save already succeeded — cloud push failing here just means
      // it stays stale in Supabase until the next successful sync, same
      // best-effort handling as everywhere else patient/reading data syncs.
    }
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="auto" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Edit Profile</Text>
          <Pressable style={styles.doneBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.doneBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

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

        <Text style={[styles.fieldLabel, { marginTop: SPACE.space6 }]}>Diabetes condition</Text>
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

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { marginTop: SPACE.space6 }, pressed && styles.primaryBtnPressed]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: THEME_COLORS.surface },

  header:            { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16 },
  headerRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:             { ...TYPE.title2, color: THEME_COLORS.textPrimary },
  doneBtn:           { minHeight: 36, paddingVertical: 8, paddingHorizontal: 16, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primaryTint },
  doneBtnText:       { ...TYPE.footnote, color: THEME_COLORS.primary, fontWeight: '700' },

  scroll:            { flexGrow: 1, paddingHorizontal: SCREEN_PADDING, paddingTop: 24, paddingBottom: 40 },

  fieldLabel:        { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, marginTop: SPACE.space4, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:             { minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, ...TYPE.headline, fontWeight: '400', color: THEME_COLORS.textPrimary, backgroundColor: THEME_COLORS.surface },

  genderRow:         { flexDirection: 'row', gap: 10 },
  genderChip:        { flex: 1, minHeight: 52, justifyContent: 'center', paddingVertical: 14, borderRadius: THEME_RADIUS.md, borderWidth: 1.5, borderColor: THEME_COLORS.border, alignItems: 'center', backgroundColor: THEME_COLORS.surface, gap: 4 },
  genderChipActive:  { backgroundColor: THEME_COLORS.primaryTint, borderColor: THEME_COLORS.primary },
  genderIcon:        { fontSize: 18 },
  genderLabel:       { ...TYPE.body, color: THEME_COLORS.textSecondary, fontWeight: '500' },
  genderLabelActive: { color: THEME_COLORS.primary },

  condCard:          { borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SPACE.space2, backgroundColor: THEME_COLORS.surface },
  condCardActive:    { borderColor: THEME_COLORS.primary, backgroundColor: THEME_COLORS.primaryTint },
  condLeft:          { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.space3 },
  radio:             { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: THEME_COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  radioActive:       { borderColor: THEME_COLORS.primary },
  radioDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: THEME_COLORS.primary },
  condLabel:         { ...TYPE.headline, color: THEME_COLORS.textPrimary, marginBottom: 3 },
  condLabelActive:   { color: THEME_COLORS.primary },
  condDesc:          { ...TYPE.footnote, color: THEME_COLORS.textSecondary, lineHeight: 18 },

  primaryBtn:        { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, padding: 16, alignItems: 'center' },
  primaryBtnPressed: { backgroundColor: THEME_COLORS.primaryPressed },
  primaryBtnText:    { color: THEME_COLORS.textInverse, ...TYPE.headline },
});
