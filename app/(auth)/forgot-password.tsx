import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store/useAuthStore';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Please enter a valid email address');
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await resetPassword(email.trim().toLowerCase());
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(true);
  }

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
        <Text style={styles.headerTitle}>{sent ? 'Check Your Email' : 'Reset Password'}</Text>
        <Text style={styles.headerSub}>
          {sent
            ? `We sent a reset link to ${email}`
            : "Enter your email and we'll send you a reset link"}
        </Text>
      </View>

      <View style={styles.card}>
        {!sent ? (
          <>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={THEME_COLORS.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable
              style={({ pressed }) => [styles.btn, loading && styles.btnDisabled, pressed && !loading && styles.btnPressed]}
              onPress={handleReset}
              disabled={loading}
            >
              <Text style={[styles.btnText, loading && styles.btnTextDisabled]}>{loading ? 'Sending…' : 'Send Reset Link'}</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.successWrap}>
            <View style={styles.successIcon}>
              <Icon ios="envelope.fill" android="mail-outline" size={32} color={THEME_COLORS.primary} />
            </View>
            <Text style={styles.successTitle}>Email sent!</Text>
            <Text style={styles.successSub}>
              Check your inbox and follow the link to reset your password. It may take a minute to arrive.
            </Text>
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
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginBottom: SPACE.space3, alignSelf: 'flex-start' },
  backText:        { ...TYPE.body, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  headerTitle:     { ...TYPE.title1, color: THEME_COLORS.textInverse, marginBottom: 4 },
  headerSub:       { ...TYPE.body, color: 'rgba(255,255,255,0.8)', lineHeight: 20 },

  card:            { flex: 1, backgroundColor: THEME_COLORS.surface, borderTopLeftRadius: THEME_RADIUS.sheet, borderTopRightRadius: THEME_RADIUS.sheet, padding: SCREEN_PADDING, paddingTop: SPACE.space6 },
  label:           { ...TYPE.caption2, color: THEME_COLORS.textSecondary, marginBottom: SPACE.space2, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:           { minHeight: 52, borderWidth: 1.5, borderColor: THEME_COLORS.border, borderRadius: THEME_RADIUS.md, padding: SPACE.space4, ...TYPE.body, color: THEME_COLORS.textPrimary, backgroundColor: THEME_COLORS.background, marginBottom: 4 },
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
