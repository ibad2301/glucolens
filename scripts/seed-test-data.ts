/**
 * One-off dev utility: seeds ~25 realistic glucose readings spread across the
 * last 30 days into Supabase for the currently-authenticated patient, so the
 * Visit Summary screen (and Trends) can be tested with real date spread
 * instead of everything clustered on "today" (which is all the in-app Log
 * screen can produce, since it always timestamps as `new Date()`).
 *
 * Run this yourself, in your own terminal (not via an AI tool call) — it
 * prompts for your GlucoLens email/password locally and never persists them.
 *
 *   npx tsx scripts/seed-test-data.ts
 *
 * After it finishes, sign out and back in (or force-quit and reopen the app)
 * so `syncOnLogin()` pulls the new cloud readings into local SQLite.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import WebSocket from 'ws';

type Condition = 'non_diabetic' | 'prediabetic' | 'type1' | 'type2';
type Context = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';

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

function prompt(question: string, hide = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!hide) {
      rl.question(question, (answer) => { rl.close(); resolve(answer); });
      return;
    }
    // Mask password input while still allowing normal line editing.
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char: string) => {
      if (char === '\n' || char === '\r' || char === '') {
        stdin.setRawMode?.(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(value);
      } else if (char === '') {
        process.exit(1);
      } else if (char === '') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

function daysAgo(n: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function main() {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  // Plain Node (unlike Hermes/RN) has no native WebSocket on v20; supabase-js's
  // realtime client needs one to even construct, though this script never uses it.
  const supabase = createClient(url, anonKey, { realtime: { transport: WebSocket as any } });

  const email = await prompt('GlucoLens email: ');
  const password = await prompt('GlucoLens password: ', true);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    console.error('Sign-in failed:', authError?.message ?? 'unknown error');
    process.exit(1);
  }
  console.log(`Signed in as ${authData.user.email} (${authData.user.id})`);

  const { data: patient, error: patientError } = await supabase.from('patients').select('*').single();
  if (patientError || !patient) {
    console.error('Could not find a patient profile for this account. Complete onboarding in the app first.');
    process.exit(1);
  }
  const condition = patient.condition as Condition;
  console.log(`Seeding data for ${patient.name} (${condition})`);

  type Row = { context: Context; daysAgo: number; hour: number; kind: 'normal' | 'high' | 'hypo' | 'critical_low' };

  const plan: Row[] = [
    // Fasting: mostly normal, spread across the month
    ...[1, 3, 6, 9, 12, 15, 18, 21, 24, 27].map((d): Row => ({ context: 'fasting', daysAgo: d, hour: 7, kind: 'normal' })),
    // After-meal: consistently running high -> should trigger the "runs high" pattern flag
    ...[2, 5, 8, 11, 14, 17, 20, 23].map((d): Row => ({ context: 'after_meal', daysAgo: d, hour: 13, kind: 'high' })),
    // Bedtime: normal, for context-breakdown variety
    ...[4, 10, 16, 22].map((d): Row => ({ context: 'bedtime', daysAgo: d, hour: 22, kind: 'normal' })),
    // Two separate hypoglycemic events on different days
    { context: 'fasting', daysAgo: 7, hour: 6, kind: 'hypo' },
    { context: 'random', daysAgo: 19, hour: 16, kind: 'hypo' },
    // One severe critical-low, to confirm it ranks #1 in notable readings
    { context: 'fasting', daysAgo: 13, hour: 5, kind: 'critical_low' },
    // Same-day cluster (3 notable-worthy readings on daysAgo=2) to exercise the 2-per-day cap
    { context: 'after_meal', daysAgo: 2, hour: 19, kind: 'high' },
  ];

  const rows = plan.map(({ context, daysAgo: d, hour, kind }) => {
    const range = rangeFor(condition, context);
    let value: number;
    if (kind === 'normal') value = Math.round(range.low + (range.high - range.low) * (0.3 + Math.random() * 0.3));
    else if (kind === 'high') value = Math.round(range.high + 20 + Math.random() * 40);
    else if (kind === 'hypo') value = Math.max(1, range.low - Math.round(5 + Math.random() * 15));
    else value = 45; // critical_low, well under the universal critical threshold of 54

    const ts = daysAgo(d, hour);
    return {
      patient_id: patient.id,
      user_id: authData.user!.id,
      value,
      unit: 'mg/dL',
      context,
      notes: null,
      recorded_at: ts,
      created_at: ts,
    };
  });

  const { error: insertError, data: inserted } = await supabase.from('glucose_readings').insert(rows).select('id');
  if (insertError) {
    console.error('Insert failed:', insertError.message);
    process.exit(1);
  }

  console.log(`Inserted ${inserted?.length ?? rows.length} readings spanning the last 30 days.`);
  console.log('Now sign out and back in (or force-quit + reopen) the app in Expo Go to pull this data down.');
  process.exit(0);
}

main();
