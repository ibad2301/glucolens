import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PAIR_TARGET_MINUTES } from '@/utils/mealPairing';

export const FASTING_REMINDER_ID = 'reminder-fasting';
export const BEDTIME_REMINDER_ID = 'reminder-bedtime';
export const AFTER_MEAL_REMINDER_ID = 'reminder-after-meal';

const ANDROID_CHANNEL_ID = 'reminders';

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Glucose reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// Call this the first time a patient enables any reminder — never on cold
// app launch. Returns false without prompting again if the patient already
// permanently denied (canAskAgain is false); the caller decides how to
// surface that rather than this function nagging on their behalf.
export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleDailyReminder(
  id: string, hour: number, minute: number, title: string, body: string
): Promise<void> {
  await ensureAndroidChannel();
  // Re-scheduling under the same identifier replaces any previous
  // schedule for it, so changing the time never leaves a stale duplicate.
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

export async function cancelReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

// Fires once, PAIR_TARGET_MINUTES after a before-meal reading is logged —
// the same ADA-recommended ~2h postprandial window mealPairing.ts already
// uses to match before/after readings into a pair. Re-logging a before-meal
// reading while an earlier reminder is still pending replaces it rather
// than stacking a second one.
export async function scheduleAfterMealReminder(): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.cancelScheduledNotificationAsync(AFTER_MEAL_REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: AFTER_MEAL_REMINDER_ID,
    content: {
      title: 'Log your after-meal reading',
      body: `It's been about ${Math.round(PAIR_TARGET_MINUTES / 60)} hours since your before-meal reading — time to check in.`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: PAIR_TARGET_MINUTES * 60 },
  });
}
