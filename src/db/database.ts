import * as SQLite from 'expo-sqlite';
import { APP_CONFIG } from '@/constants';
import type { PatientProfile, GlucoseReading } from '@/types';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(APP_CONFIG.dbName);
  }
  return _db;
}

// ─── Migrations ──────────────────────────────────────────────────────────────

export function initializeDatabase(): void {
  const db = getDb();

  db.execSync(`
    CREATE TABLE IF NOT EXISTS patients (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      age         INTEGER NOT NULL,
      gender      TEXT NOT NULL,
      condition   TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS glucose_readings (
      id           TEXT PRIMARY KEY,
      patient_id   TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT 'mg/dL',
      context      TEXT NOT NULL,
      notes        TEXT,
      recorded_at  TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      synced       INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_readings_patient
      ON glucose_readings(patient_id, recorded_at DESC);
  `);

  // CREATE TABLE IF NOT EXISTS above won't add `synced` to a glucose_readings
  // table that already existed before this column was introduced — add it
  // by hand for those installs. Every pre-existing local reading is, by
  // definition, not yet in Supabase (readings sync didn't exist before this),
  // so defaulting them to unsynced (0) is correct, not just a fallback.
  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(glucose_readings)');
  if (!columns.some((c) => c.name === 'synced')) {
    db.execSync('ALTER TABLE glucose_readings ADD COLUMN synced INTEGER NOT NULL DEFAULT 0');
  }
}

// ─── Patient Queries ─────────────────────────────────────────────────────────

export function savePatient(patient: PatientProfile): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO patients
      (id, name, age, gender, condition, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      patient.id, patient.name, patient.age, patient.gender,
      patient.condition, patient.createdAt, patient.updatedAt,
    ]
  );
}

export function getPatient(id: string): PatientProfile | null {
  const db = getDb();
  const row = db.getFirstSync<any>(
    'SELECT * FROM patients WHERE id = ?', [id]
  );
  if (!row) return null;
  return mapRowToPatient(row);
}

export function getAllPatients(): PatientProfile[] {
  const db = getDb();
  const rows = db.getAllSync<any>('SELECT * FROM patients ORDER BY created_at DESC');
  return rows.map(mapRowToPatient);
}

function mapRowToPatient(row: any): PatientProfile {
  return {
    id:        row.id,
    name:      row.name,
    age:       row.age,
    gender:    row.gender,
    condition: row.condition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Reading Queries ─────────────────────────────────────────────────────────

export function saveReading(reading: GlucoseReading, synced: boolean = false): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO glucose_readings
      (id, patient_id, value, unit, context, notes, recorded_at, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reading.id, reading.patientId, reading.value, reading.unit,
      reading.context, reading.notes ?? null,
      reading.recordedAt, reading.createdAt, synced ? 1 : 0,
    ]
  );
}

export function getUnsyncedReadings(patientId: string): GlucoseReading[] {
  const db = getDb();
  const rows = db.getAllSync<any>(
    `SELECT * FROM glucose_readings WHERE patient_id = ? AND synced = 0 ORDER BY recorded_at ASC`,
    [patientId]
  );
  return rows.map(mapRowToReading);
}

export function markReadingsSynced(ids: string[]): void {
  if (!ids.length) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(', ');
  db.runSync(`UPDATE glucose_readings SET synced = 1 WHERE id IN (${placeholders})`, ids);
}

export function getReadings(patientId: string, days = 30): GlucoseReading[] {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db.getAllSync<any>(
    `SELECT * FROM glucose_readings
     WHERE patient_id = ? AND recorded_at >= ?
     ORDER BY recorded_at DESC`,
    [patientId, since.toISOString()]
  );
  return rows.map(mapRowToReading);
}

// Explicit start/end window (inclusive), for Trends' custom date range —
// `getReadings` only supports a rolling day count back from now.
export function getReadingsByDateRange(patientId: string, startISO: string, endISO: string): GlucoseReading[] {
  const db = getDb();
  const rows = db.getAllSync<any>(
    `SELECT * FROM glucose_readings
     WHERE patient_id = ? AND recorded_at >= ? AND recorded_at <= ?
     ORDER BY recorded_at DESC`,
    [patientId, startISO, endISO]
  );
  return rows.map(mapRowToReading);
}

export function deleteReading(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM glucose_readings WHERE id = ?', [id]);
}

// Fetches a single reading directly from SQLite, independent of whatever
// day-window the store's in-memory `readings` array currently holds (Log
// screen's own loadReadings(1) call would otherwise hide anything older).
export function getReading(id: string): GlucoseReading | null {
  const db = getDb();
  const row = db.getFirstSync<any>('SELECT * FROM glucose_readings WHERE id = ?', [id]);
  return row ? mapRowToReading(row) : null;
}

// Most recent reading regardless of day-window, so the Log screen can
// default to "same as usual" without depending on whatever period is
// currently loaded into the store.
export function getMostRecentReading(patientId: string): GlucoseReading | null {
  const db = getDb();
  const row = db.getFirstSync<any>(
    'SELECT * FROM glucose_readings WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1',
    [patientId]
  );
  return row ? mapRowToReading(row) : null;
}

function mapRowToReading(row: any): GlucoseReading {
  return {
    id:          row.id,
    patientId:   row.patient_id,
    value:       row.value,
    unit:        row.unit,
    context:     row.context,
    notes:       row.notes ?? undefined,
    recordedAt:  row.recorded_at,
    createdAt:   row.created_at,
  };
}
