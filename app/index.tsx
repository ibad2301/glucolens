import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { syncOnLogin } from '@/lib/sync';
import { THEME_COLORS } from '@/constants/theme';

export default function Index() {
  const { session, isInitialized } = useAuthStore();
  const { activePatient, setActivePatient } = useAppStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function loadPatient() {
      if (session && !activePatient) {
        const patient = await syncOnLogin();
        if (patient) setActivePatient(patient);
      }
      setChecking(false);
    }
    if (isInitialized) loadPatient();
  }, [isInitialized, session]);

  if (!isInitialized || checking) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!activePatient) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME_COLORS.background },
});
