-- ============================================================
-- GlucoLens Database Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── Enable UUID extension ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Patients table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  age         INTEGER NOT NULL CHECK (age > 0 AND age < 150),
  gender      TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  condition   TEXT NOT NULL CHECK (condition IN ('non_diabetic', 'prediabetic', 'type1', 'type2')),
  weight      REAL,
  height      REAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Glucose readings table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.glucose_readings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id   UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value        REAL NOT NULL CHECK (value > 0 AND value < 1000),
  unit         TEXT NOT NULL DEFAULT 'mg/dL' CHECK (unit IN ('mg/dL', 'mmol/L')),
  context      TEXT NOT NULL CHECK (context IN ('fasting', 'before_meal', 'after_meal', 'bedtime', 'random')),
  notes        TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The app's local SQLite row id for this reading, sent so pushes can be
  -- upserted (idempotent) instead of blind-inserted. NULL for any row
  -- inserted before this column existed — a unique index still allows
  -- multiple NULLs in Postgres, so that's compatible, not backfilled.
  client_id    TEXT
);

-- ─── Indexes ──────────────────────────────────────────────────
-- UNIQUE: syncPatientToCloud() upserts with onConflict: 'user_id',
-- which requires a unique constraint on this column in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_user_id
  ON public.patients(user_id);

CREATE INDEX IF NOT EXISTS idx_readings_patient_id
  ON public.glucose_readings(patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_readings_user_id
  ON public.glucose_readings(user_id, recorded_at DESC);

-- UNIQUE: syncReadingsToCloud() upserts with onConflict: 'client_id',
-- which requires a unique constraint on this column in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_client_id
  ON public.glucose_readings(client_id);

-- ─── Updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security (RLS) ─────────────────────────────────
-- This is the critical security layer.
-- Every patient can ONLY see their own data. No exceptions.

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glucose_readings ENABLE ROW LEVEL SECURITY;

-- Patients: users can only CRUD their own patient profile
CREATE POLICY "patients: own data only"
  ON public.patients
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Readings: users can only CRUD their own readings
CREATE POLICY "readings: own data only"
  ON public.glucose_readings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Done ─────────────────────────────────────────────────────
-- Your database is ready. Go back to the app and add your
-- SUPABASE_URL and SUPABASE_ANON_KEY to the .env file.
