import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initializeDatabase } from '@/db/database';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { useReminderStore } from '@/store/useReminderStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Split out from RootLayout so ErrorBoundary (which lives above this) can
// catch a synchronous throw from initializeDatabase() in the effect below,
// and remount this component fresh — re-running init — on retry.
function AppInit() {
  const initialize = useAuthStore((s) => s.initialize);
  const hydrateUnit = useAppStore((s) => s.hydrateUnit);
  const hydrateReminders = useReminderStore((s) => s.hydrate);

  useEffect(() => {
    initializeDatabase();
    initialize(); // Restore Supabase session from SecureStore
    hydrateUnit(); // Restore glucose unit preference from AsyncStorage
    hydrateReminders(); // Restore reminder toggle/time settings from AsyncStorage
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="visit-summary" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ai-insights" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <ErrorBoundary>
        <AppInit />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
