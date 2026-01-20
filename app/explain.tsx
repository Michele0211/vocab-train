import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getExplainAdapter } from '@/src/explain/registry';
import type { ExplainBuilt, ExplainContext, ExplainMessage } from '@/src/explain/types';

/**
 * ExplainScreen（/explain）
 *
 * 役割:
 * - 画面（UI）は「汎用」。テーマ固有の判断や事実データ参照はしない。
 * - params を ExplainContext に整形し、registry→adapter を通して表示/会話を構築する。
 *
 * データの流れ:
 * Quiz（index.tsx） → router.push(params)
 *   - themeId, themeTitle, correctJson, themeAnswersJson(任意)
 * ExplainScreen:
 *   1) params を parse して ctx を作る
 *   2) getExplainAdapter(ctx.themeId) で adapter を選ぶ（無ければ対象外）
 *   3) adapter.build(ctx) で selection/prompts/intro を得て描画
 *   4) チップ押下 → adapter.answer(...) を呼び、messages に積む
 */
function asStringParam(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function parseStringArray(json: string): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function ExplainScreen() {
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');
  const background = useThemeColor({}, 'background');

  // message id を衝突なく生成するためのカウンタ（短く、かつ安定）
  const msgSeqRef = useRef(0);

  const params = useLocalSearchParams();
  const themeId = asStringParam(params.themeId);
  const themeTitle = asStringParam(params.themeTitle) || '（不明）';
  const correctJson = asStringParam(params.correctJson);
  const themeAnswersJson = asStringParam(params.themeAnswersJson);

  // params(JSON文字列) → string[] に復元
  const correct = useMemo(() => parseStringArray(correctJson), [correctJson]);
  const all = useMemo(() => parseStringArray(themeAnswersJson), [themeAnswersJson]);

  // 画面がadapterに渡す入力（テーマ固有判断は adapter に閉じ込める）
  const ctx: ExplainContext = useMemo(
    () => ({
      themeId,
      themeTitle,
      correct,
      all,
    }),
    [all, correct, themeId, themeTitle]
  );

  // themeId から adapter を選ぶ（無ければ対象外）
  const adapter = useMemo(() => getExplainAdapter(ctx.themeId), [ctx.themeId]);

  // adapter が描画に必要な情報を組み立てる（selection/prompts/intro/facts）
  const built: ExplainBuilt | null = useMemo(() => {
    if (!adapter) return null;
    return adapter.build(ctx);
  }, [adapter, ctx]);

  const scrollRef = useRef<ScrollView>(null);
  const [selectionValue, setSelectionValue] = useState<string>('');
  const [messages, setMessages] = useState<ExplainMessage[]>(() => [
    { id: 'intro', role: 'assistant', text: '読み込み中…' },
  ]);

  // params/facts が変わったら初期化
  useEffect(() => {
    if (!built || !adapter) {
      setSelectionValue('');
      setMessages([{ id: 'intro', role: 'assistant', text: 'このテーマは解説対象外です。' }]);
      return;
    }
    const sel = built.selection;
    const nextSelection =
      sel && sel.type === 'entity'
        ? sel.defaultValue ?? sel.options[0] ?? ''
        : '';
    setSelectionValue(nextSelection);
    setMessages([{ id: 'intro', role: 'assistant', text: built.intro }]);
  }, [adapter, built]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages]);

  const appendQA = (questionText: string, answerText: string) => {
    // チャットログ: ユーザー質問→アシスタント回答 の2つを追加
    setMessages((prev) => [
      ...prev,
      { id: `q-${prev.length}`, role: 'user', text: questionText },
      { id: `a-${prev.length}`, role: 'assistant', text: answerText },
    ]);
  };

  const ask = (promptId: string, label: string, needsSelection?: boolean) => {
    if (!adapter || !built) {
      appendQA(label, 'このテーマは解説対象外です。');
      return;
    }
    if (needsSelection && !selectionValue) {
      const selLabel = built.selection?.label;
      appendQA(label, selLabel ? `まず「${selLabel}」で選んでください。` : 'このテーマは解説対象外です。');
      return;
    }
    const question = needsSelection && selectionValue ? `${label}（${selectionValue}）` : label;

    // MVP: promptText は「テーマ名 / 対象(あれば) / 質問ラベル」を1つの文字列にまとめて送るだけ
    // - 余計な整形や推測はしない
    // - promptText が空なら API を呼ばない（品質ゲート）
    const promptText = [
      `テーマ：${themeTitle}`,
      selectionValue ? `対象：${selectionValue}` : '',
      `質問：${label}について教えて`,
    ]
      .filter(Boolean)
      .join('。');

    if (!promptText.trim()) {
      appendQA(question, '（エラー）promptText が空のため AI を呼び出せません');
      return;
    }

    // まず「質問」を積み、その直後に assistant の「（生成中…）」を追加する
    const seq = msgSeqRef.current++;
    const answerId = `a-ai-${Date.now()}-${seq}`;
    setMessages((prev) => [
      ...prev,
      { id: `q-${Date.now()}-${seq}`, role: 'user', text: question },
      { id: answerId, role: 'assistant', text: '（生成中…）' },
    ]);

    // API 呼び出し（timeout: 10秒）
    (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch('https://vocab-train-ai-api-vercel.vercel.app/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promptText }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`AI API request failed: ${res.status}`);
        }
        const data = (await res.json()) as unknown;
        const text = (data as { text?: unknown } | null)?.text;
        if (typeof text !== 'string' || !text.trim()) {
          throw new Error('AI API response.text is missing');
        }
        setMessages((prev) => prev.map((m) => (m.id === answerId ? { ...m, text } : m)));
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === answerId ? { ...m, text: '（エラー）AIの解説取得に失敗しました' } : m
          )
        );
      } finally {
        clearTimeout(timeoutId);
      }
    })();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]}>
      <Stack.Screen options={{ title: '解説' }} />

      <View style={styles.body}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled">
          <ThemedView style={[styles.card, { borderColor: icon }]}>
            <ThemedText type="subtitle">解説チャット（MVP）</ThemedText>
            <ThemedText style={{ color: icon }}>
              事実ソースは canonical のみ。未登録は推測しません。
            </ThemedText>
          </ThemedView>

          {/* 国選択（大きくなりすぎないよう、本文側で横スクロールにする） */}
          {built?.selection && built.selection.type === 'entity' ? (
            <ThemedView style={[styles.selector, { borderColor: icon }]}>
              <ThemedText type="defaultSemiBold">{built.selection.label}</ThemedText>
              <ThemedText style={{ color: icon }}>
                選択中: {selectionValue ? selectionValue : '（未選択）'}
              </ThemedText>
              {built.selection.options.length === 0 ? (
                <ThemedText style={{ color: icon }}>候補がありません</ThemedText>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.countryChipsRow}>
                  {built.selection.options.map((opt) => {
                    const selected = opt === selectionValue;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setSelectionValue(opt)}
                        style={({ pressed }) => [
                          styles.countryChip,
                          { borderColor: selected ? tint : icon },
                          pressed ? { opacity: 0.85 } : null,
                        ]}>
                        <ThemedText
                          style={styles.countryChipText}
                          lightColor={selected ? tint : undefined}
                          darkColor={selected ? tint : undefined}>
                          {opt}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </ThemedView>
          ) : null}

          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <View key={m.id} style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
                <ThemedView
                  style={[
                    styles.bubble,
                    { borderColor: icon },
                    isUser ? { backgroundColor: 'rgba(0,0,0,0.04)' } : null,
                  ]}>
                  <ThemedText>{m.text}</ThemedText>
                </ThemedView>
              </View>
            );
          })}
        </ScrollView>

        {/* 質問チップ（フッターは小さく。横スクロールで本文を潰さない） */}
        <View style={[styles.footer, { borderColor: icon, backgroundColor: background }]}>
          <ThemedText type="defaultSemiBold">気になることを選んでください</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {(built?.prompts ?? []).map((p) => {
              const disabled = !adapter || !built || (p.needsSelection && !selectionValue);
              const isPrimary = p.tone === 'primary';
              const border = isPrimary ? tint : icon;
              const textColor = isPrimary ? tint : icon;
              return (
                <Pressable
                  key={String(p.id)}
                  onPress={() => ask(String(p.id), p.label, p.needsSelection)}
                  disabled={disabled}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: border },
                    disabled ? { opacity: 0.5 } : pressed ? { opacity: 0.85 } : null,
                  ]}>
                  <ThemedText
                    lightColor={textColor}
                    darkColor={textColor}
                    style={styles.chipText}>
                    {p.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
  container: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { borderWidth: 1, borderRadius: 14, padding: 12, maxWidth: '92%' },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  selector: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  countryChipsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 6,
  },
  countryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  countryChipText: { fontSize: 14, fontWeight: '700' },
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipText: { fontSize: 14, fontWeight: '700' },
});


