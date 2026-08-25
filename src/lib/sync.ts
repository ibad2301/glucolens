import { supabase } from '@/lib/supabase';
import { savePatient, saveReading, getUnsyncedReadings, markReadingsSynced } from '@/db/database';
import type { PatientProfile, GlucoseReading } from '@/types';

export async function syncPatientToCloud(patient: PatientProfile): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('patients').upsert({
    user_id: user.id, name: patient.name, age: patient.age,
    gender: patient.gender, condition: patient.condition,
    created_at: patient.createdAt, updated_at: patient.updatedAt,
  }, { onConflict: 'user_id' });
  if (error) console.error('[Sync] Patient upload failed:', error.message);
}

export async function fetchPatientFromCloud(): Promise<PatientProfile | null> {
  const { data, error } = await supabase.from('patients').select('*').single();
  if (error || !data) return null;
  const patient: PatientProfile = {
    id: data.id, name: data.name, age: data.age, gender: data.gender,
    condition: data.condition, createdAt: data.created_at, updatedAt: data.updated_at,
  };
  savePatient(patient);
  return patient;
}

// Returns whether the push actually succeeded, so callers can decide whether
// it's safe to mark these readings as synced (and stop retrying them).
export async function syncReadingsToCloud(readings: GlucoseReading[]): Promise<boolean> {
  if (!readings.length) return true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: patientData, error: patientError } = await supabase.from('patients').select('id').single();
    if (patientError || !patientData) return false;
    const rows = readings.map((r) => ({
      // The reading's own local SQLite id, reused as-is rather than
      // generating a separate value — it's already a stable, unique
      // per-reading string, which is all `client_id` needs to be.
      client_id: r.id,
      patient_id: patientData.id, user_id: user.id, value: r.value,
      unit: r.unit, context: r.context, notes: r.notes ?? null,
      recorded_at: r.recordedAt, created_at: r.createdAt,
    }));
    const { error } = await supabase.from('glucose_readings').upsert(rows, { onConflict: 'client_id' });
    if (error) {
      console.error('[Sync] Readings upload failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    // Covers anything the client throws instead of returning as `error`
    // (e.g. a hard network failure) — most commonly "no connection."
    console.error('[Sync] Readings upload failed:', err);
    return false;
  }
}

// Pushes any local readings for this patient that haven't been confirmed in
// Supabase yet (new since last successful sync, or logged while offline).
// Safe to call repeatedly: readings are only marked synced after a
// confirmed successful push, so a reading is never dropped, and a reading
// that's already synced is never re-sent.
export async function retrySyncPendingReadings(patientId: string): Promise<void> {
  const pending = getUnsyncedReadings(patientId);
  if (!pending.length) return;
  const ok = await syncReadingsToCloud(pending);
  if (ok) markReadingsSynced(pending.map((r) => r.id));
}

// All three of insert (syncReadingsToCloud), update, and delete key on the
// same identity now: the reading's local SQLite id, sent as `client_id`.
// RLS already scopes every query to the caller's own rows, so no separate
// patient_id lookup is needed here just to match the correct reading.
export async function updateReadingInCloud(reading: GlucoseReading): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase.from('glucose_readings')
      .update({ value: reading.value, unit: reading.unit, context: reading.context, notes: reading.notes ?? null })
      .eq('client_id', reading.id)
      .select('id');
    if (error) {
      console.error('[Sync] Reading update failed:', error.message);
      return false;
    }
    // No matching cloud row (this reading was never successfully pushed) — insert it fresh instead.
    if (!data || data.length === 0) return syncReadingsToCloud([reading]);
    return true;
  } catch (err) {
    console.error('[Sync] Reading update failed:', err);
    return false;
  }
}

export async function deleteReadingFromCloud(id: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from('glucose_readings').delete().eq('client_id', id);
    if (error) {
      console.error('[Sync] Reading delete failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Sync] Reading delete failed:', err);
    return false;
  }
}

export async function fetchReadingsFromCloud(patientId: string, days = 30): Promise<GlucoseReading[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase.from('glucose_readings').select('*')
    .gte('recorded_at', since.toISOString()).order('recorded_at', { ascending: false });
  if (error || !data) return [];
  const readings: GlucoseReading[] = data.map((r) => ({
    // Prefer the reading's own client_id as the local id — it's what this
    // row was pushed under, so re-fetching it (e.g. on every cold start via
    // syncOnLogin) overwrites the same local row instead of duplicating it
    // under the cloud row's unrelated UUID. Falls back to the cloud id only
    // for rows pushed before client_id existed.
    id: r.client_id ?? r.id, patientId: r.patient_id, value: r.value, unit: r.unit,
    context: r.context, notes: r.notes ?? undefined,
    recordedAt: r.recorded_at, createdAt: r.created_at,
  }));
  // These came straight from Supabase, so they're already synced — mark
  // them as such locally or the next retry pass would re-push them as new
  // rows (this matters once a patient uses more than one device).
  readings.forEach((r) => saveReading(r, true));
  return readings;
}

export async function syncOnLogin(): Promise<PatientProfile | null> {
  try {
    const patient = await fetchPatientFromCloud();
    if (patient) {
      await fetchReadingsFromCloud(patient.id, 90);
      await retrySyncPendingReadings(patient.id);
    }
    return patient;
  } catch (err) {
    console.error('[Sync] Login sync failed:', err);
    return null;
  }
}
