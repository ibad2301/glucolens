import 'react-native-get-random-values'; // polyfills crypto.getRandomValues, needed by _encrypt below
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { Platform } from 'react-native';

// ─── SecureStore adapter for Supabase session ────────────────────────────────
// Supabase needs a storage adapter to persist sessions.
// On web we use localStorage. On iOS/Android, SecureStore (the Keychain/
// Keystore) caps values at ~2048 bytes — smaller than a session, which
// carries a JWT plus a refresh token — so instead of storing the session
// there directly, this follows Supabase's own recommended pattern: generate
// a small AES-256 key, keep *that* in SecureStore, and store the
// AES-CTR-encrypted session in AsyncStorage (which has no size ceiling).
class LargeSecureStore {
  private async _encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (encrypted) {
      const decrypted = await this._decrypt(key, encrypted);
      if (decrypted !== null) return decrypted;
      // Encrypted blob exists but its key is missing/corrupt — fall through
      // to the legacy path rather than treating this as "no session."
    }

    // Migration path: a session written by the previous plain-SecureStore
    // adapter lives as the actual (unencrypted) session JSON directly under
    // `key` in SecureStore — not the small AES key this class now stores
    // there. If we find one, adopt it into the new scheme and clean up, so
    // an already-signed-in user is never bounced to login by this change.
    const legacyRaw = await SecureStore.getItemAsync(key);
    if (!legacyRaw) return null;
    try {
      const parsed = JSON.parse(legacyRaw);
      if (typeof parsed !== 'object' || parsed === null) return null; // e.g. a stray AES key hex string, not a session
    } catch {
      return null;
    }

    await this.setItem(key, legacyRaw);
    return legacyRaw;
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

const largeSecureStore = new LargeSecureStore();

const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return await largeSecureStore.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    await largeSecureStore.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    await largeSecureStore.removeItem(key);
  },
};

// ─── Environment variables ───────────────────────────────────────────────────
// These come from your .env file — never hardcode keys in source code.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[GlucoLens] Supabase env vars missing.\n' +
    'Create a .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
    'Get these from: https://supabase.com → your project → Settings → API'
  );
}

// ─── Supabase client ─────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Required for React Native
  },
});

export type SupabaseClient = typeof supabase;
