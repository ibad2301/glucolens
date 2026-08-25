import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/useAppStore';
import { streamAiInsight, type AiInsightContext, type AiInsightTurn } from '@/lib/aiInsights';
import { computeVisitSummary } from '@/utils/visitSummary';
import { classifyGlucose, mgToMmol } from '@/utils/helpers';
import { THEME_COLORS, TYPE, SPACE, SCREEN_PADDING, SECTION_GAP, THEME_RADIUS } from '@/constants/theme';
import { Icon } from '@/components/Icon';

const WINDOW_DAYS = 30;

type Status = 'idle' | 'streaming' | 'done' | 'error';

interface FollowUp {
  question: string;
  answer: string;
  streaming: boolean;
}

export default function AiInsightsScreen() {
  const { activePatient, readings, unit } = useAppStore();
  const insets = useSafeAreaInsets();

  const [status, setStatus]     = useState<Status>('idle');
  const [narrative, setNarrative] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory]   = useState<AiInsightTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking]     = useState(false);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  if (!activePatient) return null;

  function buildContext(): AiInsightContext {
    const summary = computeVisitSummary(activePatient!, readings, WINDOW_DAYS);
    const toDisplay = (mgDl: number) => (unit === 'mmol/L' ? mgToMmol(mgDl) : mgDl);
    return {
      condition: activePatient!.condition,
      unit,
      stats: {
        average: toDisplay(summary.stats.average),
        timeInRange: summary.stats.timeInRange,
        readingCount: summary.stats.readingCount,
        trend: summary.stats.trend,
      },
      hba1cEstimate: summary.hba1cEstimate,
      patternFlags: summary.patternFlags.map((f) => f.render(unit)),
      contextInsights: summary.contextInsights.map((c) => ({ ...c, avg: toDisplay(c.avg) })),
      notableReadings: summary.notableReadings.map((r) => ({
        value: toDisplay(r.value), context: r.context, recordedAt: r.recordedAt, status: r.status,
      })),
      recentReadings: readings.slice(0, 20).map((r) => ({
        value: toDisplay(r.value), context: r.context, recordedAt: r.recordedAt,
        status: classifyGlucose(r.value, r.context, activePatient!.condition),
      })),
    };
  }

  async function handleGenerate() {
    setStatus('streaming');
    setNarrative('');
    setErrorMsg('');
    try {
      const full = await streamAiInsight(buildContext(), {}, (chunk) => {
        setNarrative((prev) => prev + chunk);
      });
      setHistory([
        { role: 'user', content: 'Give me an overview of my glucose data for my next doctor visit.' },
        { role: 'assistant', content: full },
      ]);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong generating your insight.');
      setStatus('error');
    }
  }

  async function handleAsk() {
    const q = question.trim();
    if (!q || asking) return;
    setQuestion('');
    setAsking(true);
    setFollowUps((prev) => [...prev, { question: q, answer: '', streaming: true }]);

    try {
      const answer = await streamAiInsight(buildContext(), { question: q, history }, (chunk) => {
        setFollowUps((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], answer: next[next.length - 1].answer + chunk };
          return next;
        });
      });
      setHistory((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: answer }]);
      setFollowUps((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], streaming: false };
        return next;
      });
    } catch {
      setFollowUps((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], answer: "Couldn't get an answer — please try again.", streaming: false };
        return next;
      });
    } finally {
      setAsking(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="auto" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>AI Insights</Text>
            <Text style={styles.subtitle}>Last {WINDOW_DAYS} days</Text>
          </View>
          <Pressable style={styles.doneBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {status === 'idle' && (
          <View style={styles.card}>
            <Text style={styles.bodyText}>
              Get a short summary of your recent glucose patterns, generated from your logged readings — useful to review before your next doctor visit.
            </Text>
            <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]} onPress={handleGenerate}>
              <Text style={styles.primaryBtnText}>Generate Insight</Text>
            </Pressable>
          </View>
        )}

        {(status === 'streaming' || status === 'done') && (
          <>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.card}>
              {narrative.length === 0 && status === 'streaming' ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={THEME_COLORS.primary} />
                  <Text style={styles.loadingText}>Thinking…</Text>
                </View>
              ) : (
                <Text style={styles.bodyText}>{narrative}</Text>
              )}
            </View>
          </>
        )}

        {status === 'error' && (
          <View style={styles.errorBanner}>
            <Icon ios="exclamationmark.triangle.fill" android="warning-outline" size={16} color={THEME_COLORS.danger} />
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
            <Pressable onPress={handleGenerate} hitSlop={8}>
              <Text style={styles.errorBannerRetry}>Retry</Text>
            </Pressable>
          </View>
        )}

        {followUps.map((f, i) => (
          <View key={i}>
            <Text style={styles.sectionTitle}>{f.question}</Text>
            <View style={styles.card}>
              {f.answer.length === 0 && f.streaming ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={THEME_COLORS.primary} />
                  <Text style={styles.loadingText}>Thinking…</Text>
                </View>
              ) : (
                <Text style={styles.bodyText}>{f.answer}</Text>
              )}
            </View>
          </View>
        ))}

        {status === 'done' && (
          <>
            <Text style={styles.sectionTitle}>Ask a follow-up</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.questionInput}
                placeholder="e.g. Why was I high on Tuesday?"
                placeholderTextColor={THEME_COLORS.textTertiary}
                value={question}
                onChangeText={setQuestion}
                multiline
                numberOfLines={2}
                editable={!asking}
              />
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, (asking || !question.trim()) && styles.primaryBtnDisabled, pressed && !asking && question.trim() && styles.primaryBtnPressed]}
                onPress={handleAsk}
                disabled={asking || !question.trim()}
              >
                <Text style={[styles.primaryBtnText, (asking || !question.trim()) && styles.primaryBtnTextDisabled]}>
                  {asking ? 'Asking…' : 'Ask'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            AI-generated from your logged readings. Not medical advice — always consult your doctor about changes to your care.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: THEME_COLORS.background },
  header:           { backgroundColor: THEME_COLORS.background, paddingHorizontal: SCREEN_PADDING, paddingBottom: 16 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:            { ...TYPE.title2, color: THEME_COLORS.textPrimary },
  subtitle:         { ...TYPE.footnote, color: THEME_COLORS.textSecondary, marginTop: 2 },
  doneBtn:          { minHeight: 36, paddingVertical: 8, paddingHorizontal: 16, borderRadius: THEME_RADIUS.pill, backgroundColor: THEME_COLORS.primaryTint },
  doneBtnText:      { ...TYPE.footnote, color: THEME_COLORS.primary, fontWeight: '700' },

  content:          { padding: SCREEN_PADDING, paddingBottom: 40 },
  sectionTitle:     { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.textPrimary, marginBottom: SPACE.space3, textTransform: 'uppercase', letterSpacing: 0.5 },
  card:             { backgroundColor: THEME_COLORS.surface, borderRadius: THEME_RADIUS.lg, padding: SPACE.space4, marginBottom: SECTION_GAP, borderWidth: 1, borderColor: THEME_COLORS.border },
  bodyText:         { ...TYPE.body, color: THEME_COLORS.textPrimary, lineHeight: 22 },

  loadingRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2, paddingVertical: SPACE.space2 },
  loadingText:      { ...TYPE.footnote, color: THEME_COLORS.textSecondary },

  errorBanner:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.space2, backgroundColor: THEME_COLORS.dangerBg, borderRadius: THEME_RADIUS.md, padding: SPACE.space3, marginBottom: SPACE.space4 },
  errorBannerText:  { flex: 1, ...TYPE.footnote, color: THEME_COLORS.danger },
  errorBannerRetry: { ...TYPE.footnote, fontWeight: '700', color: THEME_COLORS.danger },

  questionInput:    { backgroundColor: THEME_COLORS.background, borderRadius: THEME_RADIUS.md, padding: 14, ...TYPE.body, color: THEME_COLORS.textPrimary, borderWidth: 1.5, borderColor: THEME_COLORS.border, minHeight: 60, textAlignVertical: 'top', marginBottom: SPACE.space4 },

  primaryBtn:            { minHeight: 52, justifyContent: 'center', backgroundColor: THEME_COLORS.primary, borderRadius: THEME_RADIUS.md, alignItems: 'center', marginTop: SPACE.space4 },
  primaryBtnPressed:     { backgroundColor: THEME_COLORS.primaryPressed },
  primaryBtnDisabled:    { backgroundColor: THEME_COLORS.border },
  primaryBtnTextDisabled:{ color: THEME_COLORS.textTertiary },
  primaryBtnText:        { color: THEME_COLORS.textInverse, ...TYPE.headline },

  disclaimer:       { paddingHorizontal: 4, marginTop: 4 },
  disclaimerText:   { ...TYPE.caption3, color: THEME_COLORS.textTertiary, lineHeight: 16, textAlign: 'center' },
});
