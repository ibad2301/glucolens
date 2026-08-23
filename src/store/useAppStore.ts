import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PatientProfile, GlucoseReading, GlucoseUnit } from '@/types';
import { savePatient, saveReading, getReadings, deleteReading, getAllPatients } from '@/db/database';
import { APP_CONFIG } from '@/constants';
import { generateId } from '@/utils/helpers';

interface AppState {
  // Onboarding
  isOnboarded: boolean;
  setOnboarded: (val: boolean) => Promise<void>;

  // Glucose unit preference — single source of truth for the whole app.
  // Readings are always stored in mg/dL; this only controls presentation.
  unit: GlucoseUnit;
  setUnit: (unit: GlucoseUnit) => Promise<void>;
  hydrateUnit: () => Promise<void>;

  // Active patient
  activePatient: PatientProfile | null;
  setActivePatient: (p: PatientProfile | null) => void;
  createPatient: (data: Omit<PatientProfile, 'id' | 'createdAt' | 'updatedAt'>) => PatientProfile;
  updatePatient: (data: Partial<PatientProfile>) => void;

  // Readings
  readings: GlucoseReading[];
  loadReadings: (days?: number) => void;
  addReading: (data: Omit<GlucoseReading, 'id' | 'createdAt' | 'patientId'>) => void;
  removeReading: (id: string) => void;

  // UI
  isLoading: boolean;
  setLoading: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isOnboarded: false,
  setOnboarded: async (val) => {
    await AsyncStorage.setItem(APP_CONFIG.onboardingKey, val ? '1' : '0');
    set({ isOnboarded: val });
  },

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
    if (!current) return;
    const updated = { ...current, ...data, updatedAt: new Date().toISOString() };
    savePatient(updated);
    set({ activePatient: updated });
  },

  readings: [],
  loadReadings: (days = 30) => {
    const patient = get().activePatient;
    if (!patient) return;
    const readings = getReadings(patient.id, days);
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
    saveReading(reading);
    set((s) => ({ readings: [reading, ...s.readings] }));
  },

  removeReading: (id) => {
    deleteReading(id);
    set((s) => ({ readings: s.readings.filter((r) => r.id !== id) }));
  },

  isLoading: false,
  setLoading: (val) => set({ isLoading: val }),
}));
