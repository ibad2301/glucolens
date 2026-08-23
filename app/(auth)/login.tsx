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
import { useAppStore } from '@/store/useAppStore';
import { syncOnLogin } from '@/lib/sync';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';

export default function LoginScreen() {
  const { signIn, isLoading } = useAuthStore();
  const { setActivePatient }  = useAppStore();
  const insets = useSafeAreaInsets();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!email.trim())             e.email    = 'Email is required';
    else if (!email.includes('@')) e.email    = 'Enter a valid email';
    if (!password)                 e.password = 'Password is required';
    else if (password.length < 6)  e.password = 'Minimum 6 characters';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function handleLogin() {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login failed', error.message.includes('Invalid') ? 'Incorrect email or password.' : error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const patient = await syncOnLogin();
    if (patient) { setActivePatient(patient); router.replace('/(tabs)'); }
    else router.replace('/onboarding');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />

      <View style={[styles.brandHeader, { paddingTop: insets.top + 24 }]}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>GL</Text>
        </View>
        <Text style={styles.appName}>GlucoLens</Text>
        <Text style={styles.tagline}>Clinical glucose companion</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Text style={styles.cardSub}>Welcome back — log in to your account</Text>

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
          />
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

          <Text style={[styles.label, { marginTop: SPACE.space3 }]}>Password</Text>
          <View style={[styles.inputRow, errors.password ? styles.inputError : null]}>
            <TextInput
              style={styles.inputInner}
              placeholder="••••••••"
              placeholderTextColor={THEME_COLORS.textTertiary}
              value={password}
              onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: '' })); }}
              secureTextEntry={!showPass}
            />
            <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={showPass ? 'Hide password' : 'Show password'}>
              <Icon ios={showPass ? 'eye.slash' : 'eye'} android={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={THEME_COLORS.textSecondary} />
            </Pressable>
          </View>
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

          <Pressable style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, isLoading && styles.btnDisabled, pressed && !isLoading && styles.primaryBtnPressed]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={[styles.primaryBtnText, isLoading && styles.btnTextDisabled]}>{isLoading ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]} onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.outlineBtnText}>Create an account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: THEME_COLORS.primary },

  brandHeader:    { alignItems: 'center', paddingBottom: SPACE.space7, paddingHorizontal: SCREEN_PADDING },
  logoCircle:     { width: 72, height: 72, borderRadius: THEME_RADIUS.xl, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.space3, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  logoText:       { color: THEME_COLORS.textInverse, fontSize: 28, fontWeight: '700' },
  appName:        { ...TYPE.title1, color: THEME_COLORS.textInverse },
  tagline:        { ...TYPE.body, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  content:        { flexGrow: 1, padding: SCREEN_PADDING, paddingTop: 0, paddingBottom: 40 },
  card:           { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.sheet, padding: SPACE.space6 },
  cardTitle:      { ...TYPE.title2, color: THEME_COLORS.textPrimary, marginBottom: 4 },
  cardSub:        { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space6 },

  label:          { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:          { minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary, backgroundColor: THEME_COLORS.background },
  inputError:     { borderColor: THEME_COLORS.danger },
  inputRow:       { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, backgroundColor: THEME_COLORS.background },
  inputInner:     { flex: 1, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary },
  eyeBtn:         { paddingHorizontal: SPACE.space4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  errorText:      { ...TYPE.caption1, color: THEME_COLORS.danger, marginTop: 5 },
  forgotBtn:      { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: SPACE.space2, marginBottom: SPACE.space4 },
  forgotText:     { ...TYPE.footnote, color: THEME_COLORS.primary, fontWeight: '600' },
  primaryBtn:     { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, alignItems: 'center' },
  primaryBtnPressed: { backgroundColor: THEME_COLORS.primaryPressed },
  btnDisabled:    { backgroundColor: THEME_COLORS.border },
  btnTextDisabled:{ color: THEME_COLORS.textTertiary },
  primaryBtnText: { color: THEME_COLORS.textInverse, ...TYPE.headline },
  dividerRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.space3, marginVertical: SPACE.space4 },
  dividerLine:    { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: THEME_COLORS.border },
  dividerText:    { ...TYPE.caption1, color: THEME_COLORS.textSecondary },
  outlineBtn:     { minHeight: 52, justifyContent: 'center', borderWidth: 1.5, borderColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, alignItems: 'center' },
  outlineBtnPressed: { backgroundColor: THEME_COLORS.primaryTint },
  outlineBtnText: { ...TYPE.headline, color: THEME_COLORS.primary },
});
