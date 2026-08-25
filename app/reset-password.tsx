import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase } from '@/lib/supabase';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';

// Recovery emails redirect here as `glucolens://reset-password#access_token=...&refresh_token=...&type=recovery`
// (implicit-flow tokens live in the URL fragment, not the query string).
type ScreenStatus = 'verifying' | 'ready' | 'invalid' | 'success';

function extractTokensFromUrl(url: string): { accessToken?: string; refreshToken?: string } {
  const fragmentIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const paramsString = fragmentIndex >= 0 ? url.slice(fragmentIndex + 1)
    : queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(paramsString);
  return {
    accessToken: params.get('access_token') ?? undefined,
    refreshToken: params.get('refresh_token') ?? undefined,
  };
}

export default function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [status, setStatus]         = useState<ScreenStatus>('verifying');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishSession(url: string | null) {
      if (!url) { if (!cancelled) setStatus('invalid'); return; }
      const { accessToken, refreshToken } = extractTokensFromUrl(url);
      if (!accessToken || !refreshToken) { if (!cancelled) setStatus('invalid'); return; }
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!cancelled) setStatus(error ? 'invalid' : 'ready');
    }

    Linking.getInitialURL().then(establishSession);
    const sub = Linking.addEventListener('url', ({ url }) => establishSession(url));
    return () => { cancelled = true; sub.remove(); };
  }, []);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!password)                e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Minimum 6 characters';
    if (password !== confirm)     e.confirm  = 'Passwords do not match';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStatus('success');
    await signOut(); // recovery session is a full session — sign out so they log in fresh with the new password
  }

  const strengthColor = password.length === 0 ? THEME_COLORS.border
    : password.length < 6 ? THEME_COLORS.danger
    : password.length < 10 ? THEME_COLORS.elevated
    : THEME_COLORS.normal;
  const strengthLabel = password.length === 0 ? '' : password.length < 6 ? 'Too short' : password.length < 10 ? 'Good' : 'Strong';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />

      <View style={[styles.brandHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>
          {status === 'success' ? 'Password Updated' : 'Set New Password'}
        </Text>
        <Text style={styles.headerSub}>
          {status === 'success' ? 'Your password has been changed'
            : status === 'invalid' ? 'This reset link is invalid or has expired'
            : 'Choose a new password for your account'}
        </Text>
      </View>

      <View style={styles.card}>
        {status === 'verifying' && (
          <View style={styles.centerWrap}>
            <ActivityIndicator color={THEME_COLORS.primary} />
            <Text style={styles.verifyingText}>Verifying your reset link…</Text>
          </View>
        )}

        {status === 'invalid' && (
          <View style={styles.successWrap}>
            <View style={[styles.successIcon, { backgroundColor: THEME_COLORS.dangerBg }]}>
              <Icon ios="exclamationmark.triangle.fill" android="alert-circle-outline" size={32} color={THEME_COLORS.danger} />
            </View>
            <Text style={styles.successTitle}>Link expired</Text>
            <Text style={styles.successSub}>Request a new password reset link and try again.</Text>
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => router.replace('/(auth)/forgot-password')}>
              <Text style={styles.btnText}>Request New Link</Text>
            </Pressable>
          </View>
        )}

        {status === 'ready' && (
          <>
            <Text style={styles.label}>New password</Text>
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

            <Text style={[styles.label, { marginTop: SPACE.space4 }]}>Confirm new password</Text>
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
              style={({ pressed }) => [styles.btn, submitting && styles.btnDisabled, pressed && !submitting && styles.btnPressed]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={[styles.btnText, submitting && styles.btnTextDisabled]}>{submitting ? 'Updating…' : 'Update Password'}</Text>
            </Pressable>
          </>
        )}

        {status === 'success' && (
          <View style={styles.successWrap}>
            <View style={styles.successIcon}>
              <Icon ios="checkmark.circle.fill" android="checkmark-circle-outline" size={32} color={THEME_COLORS.primary} />
            </View>
            <Text style={styles.successTitle}>All set!</Text>
            <Text style={styles.successSub}>Sign in with your new password to continue.</Text>
            <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.btnText}>Back to Sign In</Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: THEME_COLORS.primary },

  brandHeader:     { paddingHorizontal: SCREEN_PADDING, paddingBottom: SPACE.space6 },
  headerTitle:     { ...TYPE.title1, color: THEME_COLORS.textInverse, marginBottom: 4 },
  headerSub:       { ...TYPE.body, color: 'rgba(255,255,255,0.8)', lineHeight: 20 },

  card:            { flex: 1, backgroundColor: THEME_COLORS.surface, borderTopLeftRadius: THEME_RADIUS.sheet, borderTopRightRadius: THEME_RADIUS.sheet, padding: SCREEN_PADDING, paddingTop: SPACE.space6 },

  centerWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.space3 },
  verifyingText:   { ...TYPE.body, color: THEME_COLORS.textSecondary },

  label:           { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:           { minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary, backgroundColor: THEME_COLORS.background },
  inputError:      { borderColor: THEME_COLORS.danger },
  inputRow:        { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, backgroundColor: THEME_COLORS.background },
  inputInner:      { flex: 1, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary },
  eyeBtn:          { paddingHorizontal: SPACE.space4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  errorText:       { ...TYPE.caption1, color: THEME_COLORS.danger, marginTop: 5 },
  strengthRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2, marginTop: SPACE.space2 },
  strengthBar:     { height: 4, width: 64, borderRadius: 2 },
  strengthText:    { ...TYPE.caption1 },

  btn:             { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, alignItems: 'center', marginTop: SPACE.space6 },
  btnPressed:      { backgroundColor: THEME_COLORS.primaryPressed },
  btnDisabled:     { backgroundColor: THEME_COLORS.border },
  btnTextDisabled: { color: THEME_COLORS.textTertiary },
  btnText:         { color: THEME_COLORS.textInverse, ...TYPE.headline },

  successWrap:     { alignItems: 'center', paddingTop: SPACE.space5 },
  successIcon:     { width: 80, height: 80, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.space5 },
  successTitle:    { ...TYPE.title3, color: THEME_COLORS.textPrimary, marginBottom: SPACE.space2 },
  successSub:      { ...TYPE.body, color: THEME_COLORS.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
});
