# GlucoLens

Clinical-grade blood glucose tracking, built to production standards on Expo/React Native.

![React Native](https://img.shields.io/badge/React_Native-0.81.5-61DAFB?style=flat&logo=react&logoColor=black)
![Expo](https://img.shields.io/badge/Expo_SDK-54-000020?style=flat&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_%2B_Auth-3ECF8E?style=flat&logo=supabase&logoColor=white)

## What is this

GlucoLens is an offline-first iOS/Android app for logging and understanding blood glucose readings, built against ADA 2024 reference ranges rather than a single universal "normal" band — 120 mg/dL means something different for a Type 1 patient than a non-diabetic one, and the app's classification engine treats it that way. It layers meal-response pairing, HbA1c estimation, doctor-ready visit summaries, and AI-generated insight narratives (via the Claude API, called from a server-side Edge Function — never from the client) on top of a synced local/cloud data layer with per-patient row-level security. Built as a portfolio project, engineered to production standards.

## Screenshots

<p float="left">
  <img src="screenshots/dashboard.png" width="19%" alt="Dashboard — Home tab showing the latest reading hero card, 7-day stats grid, and today's reading schedule" />
  <img src="screenshots/log-reading.png" width="19%" alt="Log a reading — numeric input with live status preview, context chips, and meal-pairing preview" />
  <img src="screenshots/trends.png" width="19%" alt="Trends — line chart with status-colored points, key metrics grid, and breakdown by context" />
  <img src="screenshots/visit-summary.png" width="19%" alt="Visit Summary — 30-day doctor-ready report with AGP bar, pattern flags, and notable readings" />
  <img src="screenshots/ai-insights.png" width="19%" alt="AI Insights — streaming Claude-generated narrative with follow-up question input" />
</p>

## Key features

**Clinical engine**
- ADA 2024 reference ranges — 4 conditions × 4 contexts (16 configurations)
- 5-level glucose classification (critical / low / normal / elevated / high) with universal critical thresholds at <54 and >300 mg/dL
- HbA1c estimation (Nathan formula), cross-checked against the ADA's published eAG-to-A1C table
- Time-in-range and trend-direction analysis

**Data layer**
- Offline-first: Expo SQLite is the source of truth, Supabase Postgres syncs in the background
- `client_id`-keyed upsert scheme — insert, update, and delete all key on the same identity, so a sync retry or duplicate push never creates a duplicate row
- Unsynced-reading retry queue for readings logged while offline

**Security**
- Postgres Row Level Security — every table enforces `auth.uid() = user_id` at the database layer, not just in app code
- Supabase session storage via a custom AES-256 encryption adapter (key in `expo-secure-store`, encrypted blob in AsyncStorage) — works around SecureStore's ~2048-byte Keychain/Keystore limit
- Edge Functions verify the caller's JWT with `auth.getUser()` server-side — the platform's JWT check alone isn't enough, since the public anon key also passes it

**AI**
- Claude (via Anthropic API) called only from a Supabase Edge Function — the API key never ships in the client bundle
- Streamed token-by-token to the screen via `expo/fetch` (React Native's built-in `fetch` can't read a streaming response body)
- Conversational follow-up questions, grounded in the same structured patient context sent for the initial narrative
- Static disclaimer footer on every response, independent of model behavior

**Analytics**
- `react-native-gifted-charts` trend line with status-colored points and dashed reference lines
- AGP-style time-in-range bar using fixed international cutoffs (54/70/180/250 mg/dL), independent of condition
- Per-context breakdown, custom date range selection

**Export**
- PDF export of the Visit Summary via `expo-print`, mirroring the on-screen report exactly (inline SVG chart, not a screenshot)
- Native share sheet via `expo-sharing`

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Expo | ~54.0.34 |
| Routing | expo-router | ~6.0.24 |
| UI runtime | React / React Native | 19.1.0 / 0.81.5 |
| Local database | expo-sqlite | ~16.0.10 |
| Backend | Supabase (Postgres, Auth, Edge Functions) | @supabase/supabase-js ^2.107.0 |
| State | Zustand | ^5.0.14 |
| Charts | react-native-gifted-charts | ^1.4.77 |
| AI | Claude, via Supabase Edge Function | — |
| Language | TypeScript (strict) | ~5.9.2 |
| Testing | Jest (jest-expo preset) | ~29.7.0 |

## Architecture

```
iPhone (React Native)
├─ Expo SQLite (offline-first, source of truth)
├─ Zustand (state)
└─ Supabase Client
    ├─ Auth (email/password + AES-encrypted SecureStore session)
    ├─ Postgres (RLS-enforced, client_id upsert sync)
    └─ Edge Functions (JWT-verified)
        └─ Claude API (streaming)
```

## Getting started

Prerequisites: Node.js, Xcode (for iOS), a Supabase project.

```bash
git clone <this-repo>
cd glucolens
npm install
```

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Run `supabase/schema.sql` in your Supabase project's SQL Editor to create the tables, indexes, and RLS policies. Then:

```bash
npx expo run:ios
```

The AI Insights feature additionally requires an `ANTHROPIC_API_KEY` set as a Supabase Edge Function secret and the function in `supabase/functions/ai-insights` deployed (`supabase functions deploy ai-insights`) — everything else works without it.

## Testing

```bash
npx jest
```

137 unit tests, covering:
- `classifyGlucose()` across all 4 conditions × 5 reading contexts, boundary values, and the universal 54/300 critical thresholds
- `estimateHbA1c()` cross-checked against the ADA's published eAG-to-A1C conversion table
- `computeStats()` against hand-verified fixtures
- `toChartData()` sort order and status mapping

Two additional local-only scripts exist outside the Jest suite, for load and security testing against a real Supabase project:

- **`scripts/load-test-seed.ts`** — creates 100 real authenticated users across all 4 conditions and seeds 300 readings each (30,000 rows total) via the Supabase Admin API. Requires a `service_role` key, read from an environment variable at run time only — never committed, never in app code:
  ```
  SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/load-test-seed.ts
  ```
  Measured results: 30,000 rows seeded in 16.5s. Sign-in: 223ms. Sync fetch (patient + 90 days): 146ms. 30-day Trends-equivalent query: 63ms. (Server-side query time, not on-device render time.) A companion `scripts/load-test-cleanup.ts` removes all seeded accounts afterward.

- **`scripts/rls-security-test.ts`** — anon-key only, no elevated privileges. Signs in as two real seeded accounts and attempts 5 different cross-account read vectors in each direction (10 attempts total) against Patient A's data while authenticated as Patient B and vice versa. Result: 10/10 blocked, zero data leaked.

### Manual on-device verification

The results above are automated. The following were checked by hand on-device — not run by a script or CI — and are reported here as manual verification, not automated test results:

- **`client_id` upsert round-trip** — confirmed: a logged reading appears in Supabase with `client_id` populated, editing it updates the same cloud row, deleting it removes it.
- **SecureStore AES migration** — confirmed: a fresh sign-in produces no "2048 bytes" warning, and the session persists across a force-quit and relaunch.
- **Custom date range on Trends** — confirmed working on-device.
- **AGP time-in-range bar on Visit Summary** — confirmed rendering correctly.
- **AI Insights follow-up question** — confirmed grounded in real patient data.
- **Local reminder notifications** — confirmed: the permission prompt fires once on first enable, a scheduled reminder fires on time, and disabling a reminder cancels the OS-level schedule.
- **PDF export** — confirmed: generates correctly, the share sheet opens, and the file saves to Files.
- **Condition-change cascade** — confirmed: changing a patient's diabetes condition correctly updates target ranges, reading classifications, and time-in-range everywhere they're shown (Dashboard, Trends, Visit Summary), while HbA1c and the AGP bar correctly remain unchanged, since both are condition-independent by design.
- **Password reset deep link** — built and configured, pending final verification. Blocked by a Supabase free-tier email rate limit during testing, not a known code issue.

## Project structure

```
app/                    expo-router screens (tabs, auth, modals)
src/
  constants/            ADA reference ranges, HbA1c formula, design tokens (theme.ts)
  db/                    Expo SQLite schema + queries
  lib/                    Supabase client, cloud sync, PDF export, notifications, AI streaming
  store/                 Zustand stores (app state, auth, reminders)
  utils/                  Classification engine, meal pairing, visit summary composition
scripts/                 Local-only dev/test scripts (seed data, load test, RLS test)
supabase/
  schema.sql             Postgres schema + RLS policies
  functions/ai-insights/ Edge Function proxying the Claude API
```

## License

Not yet chosen — add one here before treating this repo as reusable by others.
