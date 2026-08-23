import { supabase } from '@/lib/supabase';
import { savePatient, saveReading } from '@/db/database';
import type { PatientProfile, GlucoseReading } from '@/types';

export async function syncPatientToCloud(patient: PatientProfile): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('patients').upsert({
    user_id: user.id, name: patient.name, age: patient.age,
    gender: patient.gender, condition: patient.condition,
    weight: patient.weight ?? null, height: patient.height ?? null,
    created_at: patient.createdAt, updated_at: patient.updatedAt,
  }, { onConflict: 'user_id' });
  if (error) console.error('[Sync] Patient upload failed:', error.message);
}

export async function fetchPatientFromCloud(): Promise<PatientProfile | null> {
  const { data, error } = await supabase.from('patients').select('*').single();
  if (error || !data) return null;
  const patient: PatientProfile = {
    id: data.id, name: data.name, age: data.age, gender: data.gender,
    condition: data.condition, weight: data.weight ?? undefined,
    height: data.height ?? undefined, createdAt: data.created_at, updatedAt: data.updated_at,
  };
  savePatient(patient);
  return patient;
}

export async function syncReadingsToCloud(readings: GlucoseReading[]): Promise<void> {
  if (!readings.length) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: patientData } = await supabase.from('patients').select('id').single();
  if (!patientData) return;
  const rows = readings.map((r) => ({
    patient_id: patientData.id, user_id: user.id, value: r.value,
    unit: r.unit, context: r.context, notes: r.notes ?? null,
    recorded_at: r.recordedAt, created_at: r.createdAt,
  }));
  const { error } = await supabase.from('glucose_readings').insert(rows);
  if (error) console.error('[Sync] Readings upload failed:', error.message);
}

export async function fetchReadingsFromCloud(patientId: string, days = 30): Promise<GlucoseReading[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase.from('glucose_readings').select('*')
    .gte('recorded_at', since.toISOString()).order('recorded_at', { ascending: false });
  if (error || !data) return [];
  const readings: GlucoseReading[] = data.map((r) => ({
    id: r.id, patientId: r.patient_id, value: r.value, unit: r.unit,
    context: r.context, notes: r.notes ?? undefined,
    recordedAt: r.recorded_at, createdAt: r.created_at,
  }));
  readings.forEach(saveReading);
  return readings;
}

export async function syncOnLogin(): Promise<PatientProfile | null> {
  try {
    const patient = await fetchPatientFromCloud();
    if (patient) await fetchReadingsFromCloud(patient.id, 90);
    return patient;
  } catch (err) {
    console.error('[Sync] Login sync failed:', err);
    return null;
  }
}
