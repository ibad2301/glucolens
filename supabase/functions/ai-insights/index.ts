// Supabase Edge Function — AI Insights (Tier 5)
//
// Holds the Anthropic API key server-side and streams a grounded clinical
// narrative (or a follow-up answer) back to the app as plain text. The app
// never talks to the Anthropic API directly and never sees this key — see
// ANTHROPIC_API_KEY below, set as a Supabase secret, never in client code.
//
// Deploy with JWT verification ON (the default — do NOT pass
// --no-verify-jwt). That platform check only confirms the Authorization
// header is a *validly-signed Supabase JWT* — the public anon key satisfies
// that too, and anon keys are never secret (they ship inside the app
// bundle). So platform JWT verification alone would let anyone who
// extracted the anon key call this function and spend the Anthropic
// budget. The explicit supabase.auth.getUser() check below is what
// actually restricts this to a real signed-in GlucoLens user.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
// Supabase injects these into every Edge Function automatically — no need
// to set them as secrets ourselves.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

interface ContextInsight {
  context: string;
  avg: number;
  inRangePct: number;
  count: number;
  status: string;
}

interface NotableReading {
  value: number;
  context: string;
  recordedAt: string;
  status: string;
  deviationMgDl: number;
}

interface RecentReading {
  value: number;
  context: string;
  recordedAt: string;
  status: string;
}

interface AiInsightRequest {
  condition: string;
  unit: string;
  stats: { average: number; timeInRange: number; readingCount: number; trend: string };
  hba1cEstimate: number | null;
  patternFlags: string[];
  contextInsights: ContextInsight[];
  notableReadings: NotableReading[];
  recentReadings: RecentReading[];
  question?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

function buildSystemPrompt(ctx: AiInsightRequest): string {
  return `You are a clinical assistant inside GlucoLens, a blood glucose tracking app. You write a short, grounded narrative about a specific patient's glucose data for them to review before a doctor visit, and answer follow-up questions about that same data.

Patient data — this is the ONLY source of truth. Never invent readings, causes, or trends not present here:
- Diabetes condition: ${ctx.condition}
- Display unit: ${ctx.unit}
- Average glucose: ${ctx.stats.average} ${ctx.unit}
- Time in range: ${ctx.stats.timeInRange}%
- Reading count (last 30 days): ${ctx.stats.readingCount}
- Trend: ${ctx.stats.trend}
- Estimated HbA1c: ${ctx.hba1cEstimate !== null ? `${ctx.hba1cEstimate}%` : 'not enough data yet'}
- Pattern flags already detected by the app: ${ctx.patternFlags.length ? ctx.patternFlags.join(' ') : 'none'}
- Breakdown by context: ${JSON.stringify(ctx.contextInsights)}
- Notable out-of-range readings: ${JSON.stringify(ctx.notableReadings)}
- Recent individual readings (most recent first): ${JSON.stringify(ctx.recentReadings)}

Instructions:
- Ground every claim in the data above. Do not speculate about causes (diet, medication, stress, illness) unless the patient's own question raises it, and even then, frame it as a question worth raising with their doctor — not a diagnosis or explanation you're asserting.
- Write in plain, warm, clinical language — no jargon a patient wouldn't understand without explanation.
- For the initial narrative (no question given): 2–4 short paragraphs covering what's happening, any risk flags, and 2–4 concrete points worth raising at the next doctor visit. Keep it under 200 words.
- For a follow-up question: answer directly and concisely, grounded only in the data above. If the data doesn't contain enough detail to answer, say so plainly rather than guessing.
- Never suggest a specific medication, dosage, or treatment change.
- Always end your response with this exact sentence on its own line: "This is not medical advice. Always consult your doctor about changes to your care."`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: AiInsightRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildSystemPrompt(body);
  const history = body.history ?? [];
  const messages = body.question
    ? [...history, { role: 'user' as const, content: body.question }]
    : [{ role: 'user' as const, content: 'Generate the initial insight for this patient now, following the format in your instructions.' }];

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 2048,
      output_config: { effort: 'low' },
      system: systemPrompt,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('[ai-insights] Claude call failed:', err);
    return new Response(JSON.stringify({ error: 'Failed to generate insight' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
