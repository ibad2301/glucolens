/**
 * RLS cross-account read test — anon key ONLY, no service_role. Signs in as
 * two different real accounts from the load-test seed set (scripts/load-
 * test-seed.ts must have run first) and, from each side, attempts several
 * different ways to read the other account's data. Every attempt must come
 * back empty or errored — if any of them return real cross-account data,
 * that's a genuine RLS failure and this script exits non-zero.
 *
 *   npx tsx scripts/rls-security-test.ts
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from .env —
 * the same public, non-privileged client config the app itself ships with.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';

interface Account { email: string; password: string; userId: string; patientId: string; condition: string }

interface AttemptResult {
  label: string;
  passed: boolean;
  detail: string;
}

function loadEnv(): Record<string, string> {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function attemptCrossAccountReads(
  client: SupabaseClient, asLabel: string, targetLabel: string, target: Account
): Promise<AttemptResult[]> {
  const results: AttemptResult[] = [];

  // 1. Direct row lookup by the other patient's known id.
  {
    const { data, error } = await client.from('patients').select('*').eq('id', target.patientId);
    const leaked = !error && (data?.length ?? 0) > 0;
    results.push({
      label: `${asLabel} -> SELECT patients WHERE id = ${targetLabel}'s patient id`,
      passed: !leaked,
      detail: error ? `errored: ${error.message}` : `returned ${data?.length ?? 0} row(s)${leaked ? ' — LEAK' : ' (empty, as expected)'}`,
    });
  }

  // 2. Unfiltered select — must only ever come back as the caller's own row, never the target's.
  {
    const { data, error } = await client.from('patients').select('*');
    const containsTarget = !error && (data ?? []).some((r: any) => r.id === target.patientId);
    results.push({
      label: `${asLabel} -> SELECT patients (unfiltered) does not include ${targetLabel}`,
      passed: !containsTarget,
      detail: error ? `errored: ${error.message}` : `returned ${data?.length ?? 0} row(s), contains target: ${containsTarget}`,
    });
  }

  // 3. Readings filtered by the other patient's known patient_id.
  {
    const { data, error } = await client.from('glucose_readings').select('*').eq('patient_id', target.patientId);
    const leaked = !error && (data?.length ?? 0) > 0;
    results.push({
      label: `${asLabel} -> SELECT glucose_readings WHERE patient_id = ${targetLabel}'s patient id`,
      passed: !leaked,
      detail: error ? `errored: ${error.message}` : `returned ${data?.length ?? 0} row(s)${leaked ? ' — LEAK' : ' (empty, as expected)'}`,
    });
  }

  // 4. Readings filtered by the other user's known user_id.
  {
    const { data, error } = await client.from('glucose_readings').select('*').eq('user_id', target.userId);
    const leaked = !error && (data?.length ?? 0) > 0;
    results.push({
      label: `${asLabel} -> SELECT glucose_readings WHERE user_id = ${targetLabel}'s user id`,
      passed: !leaked,
      detail: error ? `errored: ${error.message}` : `returned ${data?.length ?? 0} row(s)${leaked ? ' — LEAK' : ' (empty, as expected)'}`,
    });
  }

  // 5. Unfiltered readings select — must contain zero rows belonging to the target.
  {
    const { data, error } = await client.from('glucose_readings').select('*');
    const leakedRows = !error ? (data ?? []).filter((r: any) => r.patient_id === target.patientId || r.user_id === target.userId) : [];
    results.push({
      label: `${asLabel} -> SELECT glucose_readings (unfiltered) contains zero of ${targetLabel}'s rows`,
      passed: leakedRows.length === 0,
      detail: error ? `errored: ${error.message}` : `returned ${data?.length ?? 0} row(s) total, ${leakedRows.length} belonging to target`,
    });
  }

  return results;
}

async function main() {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  const accountsPath = join(__dirname, '.load-test-accounts.json');
  if (!existsSync(accountsPath)) {
    console.error(`${accountsPath} not found — run scripts/load-test-seed.ts first.`);
    process.exit(1);
  }
  const accounts: Account[] = JSON.parse(readFileSync(accountsPath, 'utf-8'));
  if (accounts.length < 2) {
    console.error('Need at least 2 seeded accounts to run a cross-account test.');
    process.exit(1);
  }

  // Pick two accounts with DIFFERENT conditions, purely so the readings
  // returned are unambiguously distinguishable in a manual review.
  const patientA = accounts[0];
  const patientB = accounts.find((a) => a.condition !== patientA.condition) ?? accounts[1];

  console.log(`Patient A: ${patientA.email} (${patientA.condition})`);
  console.log(`Patient B: ${patientB.email} (${patientB.condition})\n`);

  // Two independent, anon-key-only clients — one signed in as each patient.
  const clientA = createClient(url, anonKey, { realtime: { transport: WebSocket as any } });
  const clientB = createClient(url, anonKey, { realtime: { transport: WebSocket as any } });

  const { error: signInAError } = await clientA.auth.signInWithPassword({ email: patientA.email, password: patientA.password });
  const { error: signInBError } = await clientB.auth.signInWithPassword({ email: patientB.email, password: patientB.password });
  if (signInAError || signInBError) {
    console.error('Sign-in failed:', signInAError?.message ?? signInBError?.message);
    process.exit(1);
  }

  const allResults: AttemptResult[] = [
    ...(await attemptCrossAccountReads(clientA, 'Patient A', 'Patient B', patientB)),
    ...(await attemptCrossAccountReads(clientB, 'Patient B', 'Patient A', patientA)),
  ];

  console.log('Results:\n');
  let anyFailed = false;
  for (const r of allResults) {
    console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.label}`);
    console.log(`         ${r.detail}`);
    if (!r.passed) anyFailed = true;
  }

  console.log(`\n${allResults.length} attempts, ${allResults.filter((r) => r.passed).length} passed, ${allResults.filter((r) => !r.passed).length} failed.`);

  if (anyFailed) {
    console.error('\nRLS FAILURE: at least one cross-account read returned real data. Investigate immediately.');
    process.exit(1);
  }
  console.log('\nEvery cross-account read attempt was correctly rejected or returned empty.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
