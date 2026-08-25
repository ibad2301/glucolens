/**
 * Removes every account created by scripts/load-test-seed.ts, using the
 * credentials file it wrote (scripts/.load-test-accounts.json). Deleting
 * each auth user cascades to their patient row and readings (both have
 * `ON DELETE CASCADE` back to auth.users / patients in schema.sql), so this
 * alone is sufficient cleanup — no separate table deletes needed.
 *
 * Same service_role requirement as the seed script:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/load-test-cleanup.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';

function loadSupabaseUrl(): string {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() === 'EXPO_PUBLIC_SUPABASE_URL') return trimmed.slice(eq + 1).trim();
  }
  throw new Error('EXPO_PUBLIC_SUPABASE_URL not found in .env');
}

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Run:');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/load-test-cleanup.ts');
    process.exit(1);
  }

  const accountsPath = join(__dirname, '.load-test-accounts.json');
  if (!existsSync(accountsPath)) {
    console.error(`No ${accountsPath} found — nothing to clean up (or load-test-seed.ts never ran).`);
    process.exit(1);
  }
  const accounts: { email: string; userId: string }[] = JSON.parse(readFileSync(accountsPath, 'utf-8'));

  const supabase = createClient(loadSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as any },
  });

  console.log(`Deleting ${accounts.length} load-test users (cascades to their patients + readings)...`);
  let deleted = 0, failed = 0;
  for (const account of accounts) {
    const { error } = await supabase.auth.admin.deleteUser(account.userId);
    if (error) {
      console.error(`  failed to delete ${account.email}:`, error.message);
      failed++;
    } else {
      deleted++;
    }
  }

  console.log(`\nDeleted ${deleted}/${accounts.length} users (${failed} failures).`);
  if (failed === 0) {
    unlinkSync(accountsPath);
    console.log(`Removed ${accountsPath}.`);
  } else {
    console.log(`Left ${accountsPath} in place since some deletions failed — re-run this script to retry.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
