import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import dataset from '@/datasets/sea_asia_countries.json';
import { useThemeColor } from '@/hooks/use-theme-color';
import { gradeAnswers, type GradeResult } from '@/src/lib/grading';
import { normalizeAnswer } from '@/src/lib/normalize';

export default function HomeScreen() {
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const insets = useSafeAreaInsets();
  const FOOTER_HEIGHT = 64;

  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [items, setItems] = useState<{ raw: string; norm: string }[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputNorm = useMemo(() => normalizeAnswer(input), [input]);
  const normSet = useMemo(() => new Set(items.map((x) => x.norm)), [items]);

  const canAdd = items.length < 10 && inputNorm.length > 0 && !normSet.has(inputNorm);

  const add = () => {
    const norm = normalizeAnswer(input);
    if (!norm) {
      setError('入力してください');
      return;
    }
    if (items.length >= 10) {
      setError('10個までです');
      return;
    }
    if (normSet.has(norm)) {
      setError('同じ回答は入力できません');
      return;
    }

    setItems((prev) => [...prev, { raw: input, norm }]);
    setInput('');
    setError(null);
    setResult(null);
  };

  const remove = (norm: string) => {
    setItems((prev) => prev.filter((x) => x.norm !== norm));
    setError(null);
    setResult(null);
  };

  const submit = () => {
    Keyboard.dismiss();
    const userAnswers = items.map((x) => x.raw);
    const r = gradeAnswers(userAnswers, dataset.answers);
    setResult(r);
    setError(null);
  };

  useEffect(() => {
    if (!result) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [result]);

  const footerPaddingBottom = 10 + insets.bottom;
  const scrollPaddingBottom = FOOTER_HEIGHT + footerPaddingBottom + 16;

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={[styles.safe, { backgroundColor: background }]}>
        {/* [A] Scrollable area (送信ボタンは絶対に含めない) */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.container, { paddingBottom: scrollPaddingBottom }]}
          keyboardShouldPersistTaps="handled">
          {/* 出題カード */}
          <ThemedView style={[styles.card, { borderColor: icon }]}>
            <ThemedText style={styles.cardLabel} lightColor={icon} darkColor={icon}>
              今日のお題
            </ThemedText>
            <ThemedText style={styles.cardTitle}>{dataset.title}</ThemedText>
            <ThemedText style={styles.cardSub} lightColor={icon} darkColor={icon}>
              10個、思い出せる？
            </ThemedText>

            <View style={styles.cardMetaRow}>
              <ThemedText type="defaultSemiBold">
                {items.length} / 10
              </ThemedText>
              <ThemedText style={styles.cardExample} lightColor={icon} darkColor={icon}>
                例：{dataset.title}
              </ThemedText>
            </View>
          </ThemedView>

          {/* 入力 */}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">入力</ThemedText>
            <ThemedView style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={(t) => {
                  setInput(t);
                  setError(null);
                }}
                placeholder="国名を入力"
                placeholderTextColor={icon}
                style={[styles.input, { borderColor: icon, color: textColor }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={add}
              />
              <Pressable
                onPress={add}
                // disabledにすると「何も起きない」状態が生まれるので押せるままにする
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: canAdd ? tint : icon,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText style={styles.primaryButtonText} lightColor="#fff" darkColor="#151718">
                  追加
                </ThemedText>
              </Pressable>
            </ThemedView>
            {error ? (
              <ThemedView style={[styles.message, { borderColor: icon }]}>
                <ThemedText>{error}</ThemedText>
              </ThemedView>
            ) : null}
          </ThemedView>

          {/* 回答チップ */}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">回答</ThemedText>
            <View style={styles.chipsRow}>
              {items.length === 0 ? (
                <ThemedText style={{ color: icon }}>まだ追加されていません</ThemedText>
              ) : (
                items.map((item) => (
                  <Pressable
                    key={item.norm}
                    onPress={() => remove(item.norm)}
                    style={({ pressed }) => [
                      styles.chip,
                      { borderColor: icon },
                      pressed ? { opacity: 0.8 } : null,
                    ]}>
                    <ThemedText style={styles.chipText}>{item.raw}</ThemedText>
                    <ThemedText style={styles.chipX} lightColor={tint} darkColor={tint}>
                      ×
                    </ThemedText>
                  </Pressable>
                ))
              )}
            </View>
            <ThemedText type="default" lightColor={icon} darkColor={icon}>
              チップをタップすると削除できます（重複/上限は正規化後に判定）
            </ThemedText>
          </ThemedView>

          {/* 結果 */}
          {result ? (
            <ThemedView style={styles.section}>
              <ThemedText type="subtitle">結果</ThemedText>
              <ThemedText>正解数: {result.score}</ThemedText>
              <ThemedText>不足数（10 - 入力数）: {Math.max(0, 10 - items.length)}</ThemedText>

              <ThemedView style={styles.resultsBlock}>
                <ThemedText type="defaultSemiBold">不正解</ThemedText>
                {result.wrong.length === 0 ? (
                  <ThemedText>なし</ThemedText>
                ) : (
                  result.wrong.map((w, i) => <ThemedText key={`${w}-${i}`}>- {w}</ThemedText>)
                )}
              </ThemedView>

              <ThemedView style={styles.resultsBlock}>
                <ThemedText type="defaultSemiBold">模範解答（最大5件）</ThemedText>
                {result.missingSuggested.length === 0 ? (
                  <ThemedText>なし</ThemedText>
                ) : (
                  result.missingSuggested.map((a) => <ThemedText key={a}>- {a}</ThemedText>)
                )}
              </ThemedView>
            </ThemedView>
          ) : null}
        </ScrollView>

        {/* [B] Fixed footer (送信ボタンのみ) */}
        <View
          style={[
            styles.footer,
            { paddingBottom: footerPaddingBottom, borderColor: icon, backgroundColor: background },
          ]}>
          <Pressable
            onPress={submit}
            style={({ pressed }) => [
              styles.submitButton,
              { borderColor: tint },
              pressed ? { opacity: 0.85 } : null,
            ]}>
            <ThemedText style={styles.submitButtonText} lightColor={tint} darkColor={tint}>
              送信
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  safe: { flex: 1 },
  container: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardLabel: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  cardSub: {
    fontSize: 14,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 6,
  },
  cardExample: {
    fontSize: 12,
  },
  section: {
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
  },
  chipX: {
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    height: 64,
    justifyContent: 'center',
  },
  submitButton: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  resultsBlock: {
    gap: 6,
    paddingTop: 6,
  },
});
