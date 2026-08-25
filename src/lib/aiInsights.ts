// React Native's built-in global fetch doesn't expose a streaming
// ReadableStream response body — expo/fetch does (WinterCG-compliant),
// which is what makes word-by-word streaming from the Edge Function possible.
import { fetch } from 'expo/fetch';
import { supabase } from '@/lib/supabase';
import type { DiabetesCondition, GlucoseUnit } from '@/types';

// Slim, wire-shaped subsets of ContextInsight/NotableReading — only the
// fields actually sent to the Edge Function, not the full app-internal types.
export interface AiInsightContext {
  condition: DiabetesCondition;
  unit: GlucoseUnit;
  stats: { average: number; timeInRange: number; readingCount: number; trend: string };
  hba1cEstimate: number | null;
  patternFlags: string[];
  contextInsights: { context: string; avg: number; inRangePct: number; count: number; status: string }[];
  notableReadings: { value: number; context: string; recordedAt: string; status: string }[];
  recentReadings: { value: number; context: string; recordedAt: string; status: string }[];
}

export interface AiInsightTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Streams the response body as it arrives, calling onDelta for each chunk,
// and resolves with the full accumulated text once the stream ends.
export async function streamAiInsight(
  context: AiInsightContext,
  opts: { question?: string; history?: AiInsightTurn[] },
  onDelta: (chunk: string) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You need to be signed in to request an insight.');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify({
      ...context,
      question: opts.question,
      history: opts.history ?? [],
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    onDelta(chunk);
  }
  return full;
}
