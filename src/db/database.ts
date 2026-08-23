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
      weight      REAL,
      height      REAL,
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
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_readings_patient
      ON glucose_readings(patient_id, recorded_at DESC);
  `);
}

// ─── Patient Queries ─────────────────────────────────────────────────────────

export function savePatient(patient: PatientProfile): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO patients
      (id, name, age, gender, condition, weight, height, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient.id, patient.name, patient.age, patient.gender,
      patient.condition, patient.weight ?? null, patient.height ?? null,
      patient.createdAt, patient.updatedAt,
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
    weight:    row.weight ?? undefined,
    height:    row.height ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Reading Queries ─────────────────────────────────────────────────────────

export function saveReading(reading: GlucoseReading): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO glucose_readings
      (id, patient_id, value, unit, context, notes, recorded_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reading.id, reading.patientId, reading.value, reading.unit,
      reading.context, reading.notes ?? null,
      reading.recordedAt, reading.createdAt,
    ]
  );
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

export function deleteReading(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM glucose_readings WHERE id = ?', [id]);
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
