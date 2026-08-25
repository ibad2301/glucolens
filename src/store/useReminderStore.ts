import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ensureNotificationPermission, scheduleDailyReminder, cancelReminder,
  FASTING_REMINDER_ID, BEDTIME_REMINDER_ID, AFTER_MEAL_REMINDER_ID,
} from '@/lib/reminders';

const STORAGE_KEY = 'glucolens_reminders';

interface ReminderSettings {
  fastingEnabled: boolean;
  fastingHour: number;
  fastingMinute: number;
  bedtimeEnabled: boolean;
  bedtimeHour: number;
  bedtimeMinute: number;
  afterMealEnabled: boolean;
}

const DEFAULTS: ReminderSettings = {
  fastingEnabled: false, fastingHour: 7, fastingMinute: 0,
  bedtimeEnabled: false, bedtimeHour: 21, bedtimeMinute: 0,
  afterMealEnabled: false,
};

interface ReminderState extends ReminderSettings {
  hydrate: () => Promise<void>;
  setFastingEnabled: (enabled: boolean) => Promise<boolean>;
  setFastingTime: (hour: number, minute: number) => Promise<void>;
  setBedtimeEnabled: (enabled: boolean) => Promise<boolean>;
  setBedtimeTime: (hour: number, minute: number) => Promise<void>;
  setAfterMealEnabled: (enabled: boolean) => Promise<boolean>;
}

function settingsOf(s: ReminderSettings): ReminderSettings {
  return {
    fastingEnabled: s.fastingEnabled, fastingHour: s.fastingHour, fastingMinute: s.fastingMinute,
    bedtimeEnabled: s.bedtimeEnabled, bedtimeHour: s.bedtimeHour, bedtimeMinute: s.bedtimeMinute,
    afterMealEnabled: s.afterMealEnabled,
  };
}

async function persist(s: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settingsOf(s)));
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  ...DEFAULTS,

  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) set(JSON.parse(stored));
    // Deliberately no re-scheduling here: native DAILY/TIME_INTERVAL
    // schedules are OS-managed and already persist across app restarts and
    // device reboots on their own — re-issuing them on every hydrate would
    // just be redundant work, not a correctness requirement.
  },

  // Returns whether the toggle actually turned on, so the screen can show
  // a message if permission was denied instead of silently reverting.
  setFastingEnabled: async (enabled) => {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) return false;
      await scheduleDailyReminder(
        FASTING_REMINDER_ID, get().fastingHour, get().fastingMinute,
        'Fasting reading', "It's a good time to log your fasting glucose."
      );
    } else {
      await cancelReminder(FASTING_REMINDER_ID);
    }
    set({ fastingEnabled: enabled });
    await persist(get());
    return true;
  },

  setFastingTime: async (hour, minute) => {
    set({ fastingHour: hour, fastingMinute: minute });
    await persist(get());
    if (get().fastingEnabled) {
      await scheduleDailyReminder(
        FASTING_REMINDER_ID, hour, minute,
        'Fasting reading', "It's a good time to log your fasting glucose."
      );
    }
  },

  setBedtimeEnabled: async (enabled) => {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) return false;
      await scheduleDailyReminder(
        BEDTIME_REMINDER_ID, get().bedtimeHour, get().bedtimeMinute,
        'Bedtime reading', "Don't forget your bedtime glucose check."
      );
    } else {
      await cancelReminder(BEDTIME_REMINDER_ID);
    }
    set({ bedtimeEnabled: enabled });
    await persist(get());
    return true;
  },

  setBedtimeTime: async (hour, minute) => {
    set({ bedtimeHour: hour, bedtimeMinute: minute });
    await persist(get());
    if (get().bedtimeEnabled) {
      await scheduleDailyReminder(
        BEDTIME_REMINDER_ID, hour, minute,
        'Bedtime reading', "Don't forget your bedtime glucose check."
      );
    }
  },

  // No immediate schedule call here — the actual one-off after-meal
  // reminder is scheduled by useAppStore.addReading() each time a
  // before-meal reading is logged, tied to that specific reading's time.
  setAfterMealEnabled: async (enabled) => {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) return false;
    } else {
      await cancelReminder(AFTER_MEAL_REMINDER_ID);
    }
    set({ afterMealEnabled: enabled });
    await persist(get());
    return true;
  },
}));
