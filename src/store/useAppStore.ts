import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PatientProfile, GlucoseReading, GlucoseUnit } from '@/types';
import { savePatient, saveReading, getReadings, getReadingsByDateRange, getReading, deleteReading, getAllPatients, markReadingsSynced } from '@/db/database';
import { syncReadingsToCloud, updateReadingInCloud, deleteReadingFromCloud } from '@/lib/sync';
import { scheduleAfterMealReminder } from '@/lib/reminders';
import { useReminderStore } from '@/store/useReminderStore';
import { APP_CONFIG } from '@/constants';
import { generateId } from '@/utils/helpers';

interface AppState {
  // Glucose unit preference — single source of truth for the whole app.
  // Readings are always stored in mg/dL; this only controls presentation.
  unit: GlucoseUnit;
  setUnit: (unit: GlucoseUnit) => Promise<void>;
  hydrateUnit: () => Promise<void>;

  // Active patient
  activePatient: PatientProfile | null;
  setActivePatient: (p: PatientProfile | null) => void;
  createPatient: (data: Omit<PatientProfile, 'id' | 'createdAt' | 'updatedAt'>) => PatientProfile;
  updatePatient: (data: Partial<PatientProfile>) => PatientProfile | null;

  // Readings
  readings: GlucoseReading[];
  loadReadings: (period?: number | { start: string; end: string }) => void;
  addReading: (data: Omit<GlucoseReading, 'id' | 'createdAt' | 'patientId'>) => void;
  updateReading: (id: string, data: Partial<Omit<GlucoseReading, 'id' | 'createdAt' | 'patientId' | 'recordedAt'>>) => void;
  removeReading: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  unit: APP_CONFIG.defaultUnit,
  setUnit: async (unit) => {
    await AsyncStorage.setItem(APP_CONFIG.unitKey, unit);
    set({ unit });
  },
  hydrateUnit: async () => {
    const stored = await AsyncStorage.getItem(APP_CONFIG.unitKey);
    if (stored === 'mg/dL' || stored === 'mmol/L') set({ unit: stored });
  },

  activePatient: null,
  setActivePatient: (p) => set({ activePatient: p }),

  createPatient: (data) => {
    const now = new Date().toISOString();
    const patient: PatientProfile = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    savePatient(patient);
    set({ activePatient: patient });
    return patient;
  },

  updatePatient: (data) => {
    const current = get().activePatient;
    if (!current) return null;
    const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
    savePatient(updated);
    set({ activePatient: updated });
    return updated;
  },

  readings: [],
  loadReadings: (period = 30) => {
    const patient = get().activePatient;
    if (!patient) return;
    const readings = typeof period === 'number'
      ? getReadings(patient.id, period)
      : getReadingsByDateRange(patient.id, period.start, period.end);
    set({ readings });
  },

  addReading: (data) => {
    const patient = get().activePatient;
    if (!patient) return;
    const now = new Date().toISOString();
    const reading: GlucoseReading = {
      ...data,
      id: generateId(),
      patientId: patient.id,
      createdAt: now,
    };
    // Local save is the source of truth for responsiveness — it's
    // synchronous and the UI reflects success immediately, regardless of
    // network state.
    saveReading(reading, false);
    set((s) => ({ readings: [reading, ...s.readings] }));

    // Cloud push happens after, without blocking or delaying the above.
    // If it fails (most commonly: offline), the reading just stays marked
    // unsynced locally — retrySyncPendingReadings() picks it up on next
    // app open. No error is surfaced to the user here.
    syncReadingsToCloud([reading])
      .then((ok) => { if (ok) markReadingsSynced([reading.id]); })
      .catch((err) => console.error('[Sync] Failed to push new reading:', err));

    // Logging a before-meal reading is exactly the event the after-meal
    // reminder is tied to — schedule it now if the patient has that
    // reminder turned on, rather than on a fixed daily clock.
    if (reading.context === 'before_meal' && useReminderStore.getState().afterMealEnabled) {
      scheduleAfterMealReminder().catch((err) => console.error('[Reminders] Failed to schedule after-meal reminder:', err));
    }
  },

  updateReading: (id, data) => {
    // Read fresh from SQLite rather than the in-memory `readings` array —
    // that array only holds whatever day-window was last loaded, and an
    // edited reading may be outside it.
    const existing = getReading(id);
    if (!existing) return;
    const updated: GlucoseReading = { ...existing, ...data };
    saveReading(updated, false);
    set((s) => ({
      readings: s.readings.some((r) => r.id === id)
        ? s.readings.map((r) => (r.id === id ? updated : r))
        : s.readings,
    }));

    // Same fire-and-forget philosophy as addReading: local edit is truth
    // immediately, cloud push happens after without blocking.
    updateReadingInCloud(updated)
      .then((ok) => { if (ok) markReadingsSynced([updated.id]); })
      .catch((err) => console.error('[Sync] Failed to push updated reading:', err));
  },

  removeReading: (id) => {
    const target = get().readings.find((r) => r.id === id);
    deleteReading(id);
    set((s) => ({ readings: s.readings.filter((r) => r.id !== id) }));

    if (target) {
      deleteReadingFromCloud(target.id)
        .catch((err) => console.error('[Sync] Failed to delete reading from cloud:', err));
    }
  },
}));
