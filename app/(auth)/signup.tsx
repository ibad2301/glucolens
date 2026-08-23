import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store/useAuthStore';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';

export default function SignupScreen() {
  const { signUp, isLoading } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!email.trim())             e.email    = 'Email is required';
    else if (!email.includes('@')) e.email    = 'Enter a valid email address';
    if (!password)                 e.password = 'Password is required';
    else if (password.length < 6)  e.password = 'Minimum 6 characters';
    if (password !== confirm)      e.confirm  = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSignUp() {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { error } = await signUp(email.trim().toLowerCase(), password);

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Sign Up Failed',
        error.message.includes('already registered')
          ? 'An account with this email already exists. Please sign in instead.'
          : error.message
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Account Created!',
      "Welcome to GlucoLens. Let's set up your patient profile.",
      [{ text: 'Continue', onPress: () => router.replace('/onboarding') }]
    );
  }

  const strengthColor = password.length === 0 ? THEME_COLORS.border
    : password.length < 6 ? THEME_COLORS.danger
    : password.length < 10 ? THEME_COLORS.elevated
    : THEME_COLORS.normal;

  const strengthLabel = password.length === 0 ? '' : password.length < 6 ? 'Too short' : password.length < 10 ? 'Good' : 'Strong';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      <View style={[styles.brandHeader, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Icon ios="chevron.left" android="chevron-back" size={16} color="rgba(255,255,255,0.9)" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Create Account</Text>
        <Text style={styles.headerSub}>Join GlucoLens to track your glucose</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email ? styles.inputError : null]}
            placeholder="you@example.com"
            placeholderTextColor={THEME_COLORS.textTertiary}
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: '' })); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

          <Text style={[styles.label, { marginTop: SPACE.space4 }]}>Password</Text>
          <View style={[styles.inputRow, errors.password ? styles.inputError : null]}>
            <TextInput
              style={styles.inputInner}
              placeholder="Min. 6 characters"
              placeholderTextColor={THEME_COLORS.textTertiary}
              value={password}
              onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: '' })); }}
              secureTextEntry={!showPass}
            />
            <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={showPass ? 'Hide password' : 'Show password'}>
              <Icon ios={showPass ? 'eye.slash' : 'eye'} android={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={THEME_COLORS.textSecondary} />
            </Pressable>
          </View>
          {password.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={[styles.strengthBar, { backgroundColor: strengthColor }]} />
              <Text style={[styles.strengthText, { color: strengthColor }]}>{strengthLabel}</Text>
            </View>
          )}
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

          <Text style={[styles.label, { marginTop: SPACE.space4 }]}>Confirm Password</Text>
          <TextInput
            style={[styles.input, errors.confirm ? styles.inputError : null]}
            placeholder="Re-enter your password"
            placeholderTextColor={THEME_COLORS.textTertiary}
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setErrors((e) => ({ ...e, confirm: '' })); }}
            secureTextEntry={!showPass}
          />
          {errors.confirm ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.btn, isLoading && styles.btnDisabled, pressed && !isLoading && styles.btnPressed]}
            onPress={handleSignUp}
            disabled={isLoading}
          >
            <Text style={[styles.btnText, isLoading && styles.btnTextDisabled]}>{isLoading ? 'Creating account…' : 'Create Account'}</Text>
          </Pressable>

          <Text style={styles.terms}>
            By creating an account you agree to our{' '}
            <Text style={{ color: THEME_COLORS.primary }}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={{ color: THEME_COLORS.primary }}>Privacy Policy</Text>.
          </Text>

          <Pressable style={styles.loginLink} onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
            <Text style={styles.loginLinkText}>
              Already have an account?{' '}
              <Text style={{ color: THEME_COLORS.primary, fontWeight: '600' }}>Sign in</Text>
            </Text>
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: THEME_COLORS.primary },

  brandHeader:  { paddingHorizontal: SCREEN_PADDING, paddingBottom: SPACE.space6 },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginBottom: SPACE.space3, alignSelf: 'flex-start' },
  backText:     { ...TYPE.body, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  headerTitle:  { ...TYPE.title1, color: THEME_COLORS.textInverse, marginBottom: 4 },
  headerSub:    { ...TYPE.body, color: 'rgba(255,255,255,0.8)' },

  content:      { flexGrow: 1, padding: SCREEN_PADDING, paddingTop: 0, paddingBottom: 40 },
  card:         { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.sheet, padding: SPACE.space6 },

  label:        { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:        { minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary, backgroundColor: THEME_COLORS.background },
  inputError:   { borderColor: THEME_COLORS.danger },
  inputRow:     { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, backgroundColor: THEME_COLORS.background },
  inputInner:   { flex: 1, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary },
  eyeBtn:       { paddingHorizontal: SPACE.space4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  errorText:    { ...TYPE.caption1, color: THEME_COLORS.danger, marginTop: 5 },
  strengthRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2, marginTop: SPACE.space2 },
  strengthBar:  { height: 4, width: 64, borderRadius: 2 },
  strengthText: { ...TYPE.caption1 },

  btn:          { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, alignItems: 'center', marginTop: SPACE.space6 },
  btnPressed:   { backgroundColor: THEME_COLORS.primaryPressed },
  btnDisabled:  { backgroundColor: THEME_COLORS.border },
  btnTextDisabled: { color: THEME_COLORS.textTertiary },
  btnText:      { color: THEME_COLORS.textInverse, ...TYPE.headline },
  terms:        { ...TYPE.caption1, color: THEME_COLORS.textSecondary, textAlign: 'center', marginTop: SPACE.space4, lineHeight: 18 },
  loginLink:    { alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: SPACE.space2 },
  loginLinkText:{ ...TYPE.callout, color: THEME_COLORS.textSecondary },
});
