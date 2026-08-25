/**
 * One-off local load-test seeder — NEVER shipped in the app, NEVER run by
 * an AI tool call. Creates ~100 real authenticated Supabase users (Admin
 * API), a patient profile per user spread across all 4 diabetes conditions,
 * and ~300 readings per patient across a 90-day window (~30,000 rows total)
 * in your PRODUCTION Supabase project.
 *
 * Requires the service_role key, which bypasses Row Level Security and can
 * read/write any row in the project. It is read from a plain environment
 * variable at run time only — never written to .env, never committed, never
 * present in any app code. Run it like this, in your own terminal:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/load-test-seed.ts
 *
 * Get that key from: Supabase Dashboard -> Project Settings -> API ->
 * service_role secret. Treat it like a root DB password — it is one.
 *
 * Output: prints timing measurements, and writes the full list of generated
 * account emails/passwords to scripts/.load-test-accounts.json (gitignored)
 * so scripts/rls-security-test.ts can sign in as two of them afterward, and
 * so you can spot-check a few by logging into the app directly.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';

type Condition = 'non_diabetic' | 'prediabetic' | 'type1' | 'type2';
type Context = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';

const CONDITIONS: Condition[] = ['non_diabetic', 'prediabetic', 'type1', 'type2'];
const CONTEXTS: Context[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];

const PATIENT_COUNT = 100;
const READINGS_PER_PATIENT = 300;
const WINDOW_DAYS = 90;
const USER_CREATE_CONCURRENCY = 8;
const READING_INSERT_BATCH_SIZE = 500;
// RFC 2606 reserves .invalid specifically for addresses guaranteed to never
// resolve or deliver — the correct choice for synthetic test accounts.
const EMAIL_DOMAIN = 'glucolens-loadtest.invalid';
const TEST_PASSWORD = 'LoadTest-Seed-2026!';

const RANGES: Record<Condition, Record<'fasting' | 'postMeal' | 'bedtime' | 'random', { low: number; high: number }>> = {
  non_diabetic: { fasting: { low: 0, high: 100 }, postMeal: { low: 0, high: 140 }, bedtime: { low: 0, high: 120 }, random: { low: 0, high: 140 } },
  prediabetic:  { fasting: { low: 0, high: 125 }, postMeal: { low: 0, high: 199 }, bedtime: { low: 0, high: 140 }, random: { low: 0, high: 199 } },
  type1:        { fasting: { low: 70, high: 130 }, postMeal: { low: 70, high: 180 }, bedtime: { low: 90, high: 150 }, random: { low: 70, high: 180 } },
  type2:        { fasting: { low: 70, high: 130 }, postMeal: { low: 70, high: 180 }, bedtime: { low: 90, high: 150 }, random: { low: 70, high: 180 } },
};

function rangeFor(condition: Condition, context: Context) {
  const r = RANGES[condition];
  return context === 'after_meal' ? r.postMeal : context === 'bedtime' ? r.bedtime : context === 'fasting' ? r.fasting : r.random;
}

// Mixed distribution so seeded data exercises every GlucoseStatus band, not
// just uniform noise inside the normal range.
function randomValue(condition: Condition, context: Context): number {
  const range = rangeFor(condition, context);
  const roll = Math.random();
  if (roll < 0.72) return Math.round(range.low + (range.high - range.low) * (0.3 + Math.random() * 0.4)); // normal-ish
  if (roll < 0.90) return Math.round(range.high + 10 + Math.random() * 60); // elevated/high excursion
  if (roll < 0.97) return Math.max(20, Math.round(range.low - (5 + Math.random() * 15))); // mild low
  return Math.random() < 0.5 ? Math.round(30 + Math.random() * 20) : Math.round(300 + Math.random() * 50); // rare critical either direction
}

function randomTimestampWithinDays(windowDays: number): string {
  const daysAgo = Math.floor(Math.random() * windowDays);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

function loadSupabaseUrl(): string {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key === 'EXPO_PUBLIC_SUPABASE_URL') return trimmed.slice(eq + 1).trim();
  }
  throw new Error('EXPO_PUBLIC_SUPABASE_URL not found in .env');
}

async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Run:');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/load-test-seed.ts');
    process.exit(1);
  }
  const url = loadSupabaseUrl();

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as any },
  });

  console.log(`Seeding ${PATIENT_COUNT} patients x ~${READINGS_PER_PATIENT} readings (~${PATIENT_COUNT * READINGS_PER_PATIENT} rows) into ${url}\n`);

  // ─── 1. Create auth users + patient profiles ───────────────────────────────
  const t0 = Date.now();
  const accounts: { email: string; password: string; userId: string; patientId: string; condition: Condition }[] = [];
  let userFailures = 0;

  const specs = Array.from({ length: PATIENT_COUNT }, (_, i) => ({
    index: i,
    email: `loadtest-${String(i + 1).padStart(3, '0')}@${EMAIL_DOMAIN}`,
    condition: CONDITIONS[i % CONDITIONS.length],
  }));

  await withConcurrency(specs, USER_CREATE_CONCURRENCY, async (spec) => {
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: spec.email, password: TEST_PASSWORD, email_confirm: true,
    });
    if (userError || !userData.user) {
      console.error(`  [user ${spec.index + 1}] createUser failed:`, userError?.message);
      userFailures++;
      return;
    }

    const gender = (['male', 'female', 'other'] as const)[spec.index % 3];
    const age = 18 + (spec.index * 7) % 63; // spread 18-80, deterministic

    const { data: patient, error: patientError } = await supabase.from('patients').insert({
      user_id: userData.user.id,
      name: `Load Test Patient ${String(spec.index + 1).padStart(3, '0')}`,
      age, gender, condition: spec.condition,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();

    if (patientError || !patient) {
      console.error(`  [user ${spec.index + 1}] patient insert failed:`, patientError?.message);
      userFailures++;
      return;
    }

    accounts.push({
      email: spec.email, password: TEST_PASSWORD,
      userId: userData.user.id, patientId: patient.id, condition: spec.condition,
    });
  });

  const usersElapsedMs = Date.now() - t0;
  console.log(`Created ${accounts.length}/${PATIENT_COUNT} users + patients in ${(usersElapsedMs / 1000).toFixed(1)}s (${userFailures} failures)\n`);

  // ─── 2. Generate + batch-insert readings ───────────────────────────────────
  const t1 = Date.now();
  let totalReadingsInserted = 0;
  let readingBatchFailures = 0;

  for (const account of accounts) {
    const rows = Array.from({ length: READINGS_PER_PATIENT }, () => {
      const context = CONTEXTS[Math.floor(Math.random() * CONTEXTS.length)];
      const recordedAt = randomTimestampWithinDays(WINDOW_DAYS);
      return {
        patient_id: account.patientId, user_id: account.userId,
        value: randomValue(account.condition, context), unit: 'mg/dL', context,
        notes: null, recorded_at: recordedAt, created_at: recordedAt,
      };
    });

    for (let i = 0; i < rows.length; i += READING_INSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + READING_INSERT_BATCH_SIZE);
      const { error, data } = await supabase.from('glucose_readings').insert(batch).select('id');
      if (error) {
        console.error(`  readings insert failed for ${account.email}:`, error.message);
        readingBatchFailures++;
      } else {
        totalReadingsInserted += data?.length ?? batch.length;
      }
    }
  }

  const readingsElapsedMs = Date.now() - t1;
  console.log(`Inserted ${totalReadingsInserted} readings in ${(readingsElapsedMs / 1000).toFixed(1)}s (${readingBatchFailures} batch failures)\n`);

  // ─── 3. Row-count verification ──────────────────────────────────────────────
  const { count: patientCount } = await supabase.from('patients').select('*', { count: 'exact', head: true });
  const { count: readingCount } = await supabase.from('glucose_readings').select('*', { count: 'exact', head: true });
  console.log(`Verification (project-wide totals, includes any pre-existing rows):`);
  console.log(`  patients:         ${patientCount}`);
  console.log(`  glucose_readings: ${readingCount}\n`);

  // ─── 4. Timing probes: login + sync, and a 30-day Trends-equivalent fetch ──
  if (accounts.length > 0) {
    const sample = accounts[0];

    const loginClient = createClient(url, loadAnonKey(), { realtime: { transport: WebSocket as any } });
    const tLogin = Date.now();
    const { error: signInError } = await loginClient.auth.signInWithPassword({ email: sample.email, password: sample.password });
    const loginMs = Date.now() - tLogin;

    let syncMs = -1;
    if (!signInError) {
      const tSync = Date.now();
      await loginClient.from('patients').select('*').single();
      const since90 = new Date(); since90.setDate(since90.getDate() - 90);
      await loginClient.from('glucose_readings').select('*').gte('recorded_at', since90.toISOString());
      syncMs = Date.now() - tSync;
    }

    const tTrends = Date.now();
    const since30 = new Date(); since30.setDate(since30.getDate() - 30);
    const { data: trendsRows } = await loginClient.from('glucose_readings').select('*')
      .eq('patient_id', sample.patientId).gte('recorded_at', since30.toISOString()).order('recorded_at', { ascending: false });
    const trendsMs = Date.now() - tTrends;

    console.log(`Timing probes (against ${sample.email}, server-side query time — NOT on-device render time):`);
    console.log(`  sign-in (auth.signInWithPassword):                 ${loginMs}ms`);
    console.log(`  sync fetch (patient + 90d readings, syncOnLogin-equivalent): ${syncMs}ms`);
    console.log(`  30-day readings fetch (Trends-equivalent query, ${trendsRows?.length ?? 0} rows): ${trendsMs}ms`);
    console.log(`  NOTE: actual on-screen chart render time in the RN app is a separate,`);
    console.log(`  client-side measurement this script cannot take — check that on-device.\n`);
  }

  // ─── 5. Persist credentials for spot-checks and the RLS test script ────────
  const outPath = join(__dirname, '.load-test-accounts.json');
  writeFileSync(outPath, JSON.stringify(accounts, null, 2));
  console.log(`Wrote ${accounts.length} account credentials to ${outPath} (gitignored).`);
  console.log(`Sample accounts to spot-check in the app:`);
  for (const a of accounts.slice(0, 3)) {
    console.log(`  ${a.email} / ${a.password}  (${a.condition})`);
  }
  console.log(`\nDone. Total wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

function loadAnonKey(): string {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') return trimmed.slice(eq + 1).trim();
  }
  throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY not found in .env');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
