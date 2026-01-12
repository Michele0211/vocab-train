import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
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
import { CATEGORIES, THEMES, type ThemeMeta } from '@/datasets/themes';
import { useThemeColor } from '@/hooks/use-theme-color';
import { gradeAnswers, type GradeResult } from '@/src/lib/grading';
import { normalizeAnswer } from '@/src/lib/normalize';
import { recordPlay } from '@/src/lib/records';
import { router } from 'expo-router';

export default function HomeScreen() {
  const tint = useThemeColor({}, 'tint');
  const icon = useThemeColor({}, 'icon');
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const insets = useSafeAreaInsets();
  const FOOTER_MIN_HEIGHT = 64;

  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [items, setItems] = useState<{ raw: string; norm: string }[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState<number>(
    FOOTER_MIN_HEIGHT + insets.bottom + 12
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(CATEGORIES[0]?.id ?? 'geography');
  const [activeTheme, setActiveTheme] = useState<ThemeMeta>(THEMES[0]);
  const lastThemeIdRef = useRef<string>(THEMES[0]?.id ?? '');

  const dataset = activeTheme.dataset;

  // Animations
  const questionAnim = useRef(new Animated.Value(0)).current; // 0..1 => opacity/scale
  const questionLift = useRef(new Animated.Value(12)).current; // translateY: 12 -> 0
  const questionScale = useRef(new Animated.Value(1)).current; // overshoot: 1 -> 1.02 -> 1
  const resultAnim = useRef(new Animated.Value(1)).current; // scale
  const resultOpacity = useRef(new Animated.Value(0)).current; // opacity
  const successFlash = useRef(new Animated.Value(0)).current; // 0..1
  const celebrateAnim = useRef(new Animated.Value(0)).current; // 0..1 (appear -> hide)

  const inputNorm = useMemo(() => normalizeAnswer(input), [input]);
  const normSet = useMemo(() => new Set(items.map((x) => x.norm)), [items]);

  const canAdd = items.length < 10 && inputNorm.length > 0 && !normSet.has(inputNorm);

  const runQuestionAnimation = useCallback(() => {
    questionAnim.stopAnimation();
    questionLift.stopAnimation();
    questionScale.stopAnimation();
    questionAnim.setValue(0);
    questionLift.setValue(12);
    questionScale.setValue(1);

    const base = Animated.parallel([
      Animated.timing(questionAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(questionLift, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const overshoot = Animated.sequence([
      Animated.timing(questionScale, {
        toValue: 1.02,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(questionScale, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    Animated.sequence([base, overshoot]).start();
  }, [questionAnim, questionLift, questionScale]);

  useEffect(() => {
    runQuestionAnimation();
  }, [activeTheme.id, runQuestionAnimation]);

  const resetPlay = () => {
    setItems([]);
    setInput('');
    setError(null);
    setResult(null);
  };

  const drawTheme = () => {
    const pool = THEMES.filter((t) => t.categoryId === selectedCategoryId);
    if (pool.length === 0) {
      setError('このカテゴリにテーマがありません');
      return;
    }

    const lastId = lastThemeIdRef.current;
    const candidates =
      pool.length >= 2 && lastId ? pool.filter((t) => t.id !== lastId) : pool;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    lastThemeIdRef.current = picked.id;
    setActiveTheme(picked);
    resetPlay();
    runQuestionAnimation();
  };

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

    // Record play (AsyncStorage). Perfect is score===10 by spec.
    void recordPlay(activeTheme.id, r.score === 10);
  };

  const openExplain = () => {
    if (!result) return;

    // correct normalized -> first original (from dataset answers) for stable names
    const correctNormToFirstOriginal = new Map<string, string>();
    for (const ans of dataset.answers) {
      const norm = normalizeAnswer(ans);
      if (!norm) continue;
      if (!correctNormToFirstOriginal.has(norm)) correctNormToFirstOriginal.set(norm, ans);
    }
    const correctNormSet = new Set(correctNormToFirstOriginal.keys());

    const correctHitNorms = new Set<string>();
    const correctHitNames: string[] = [];
    for (const it of items) {
      if (!it.norm) continue;
      if (correctHitNorms.has(it.norm)) continue;
      if (!correctNormSet.has(it.norm)) continue;
      correctHitNorms.add(it.norm);
      const name = correctNormToFirstOriginal.get(it.norm);
      if (name) correctHitNames.push(name);
    }

    router.push({
      pathname: '/explain',
      params: {
        themeId: dataset.id,
        themeTitle: dataset.title,
        correctJson: JSON.stringify(correctHitNames),
        // MVP: 出題対象の一覧（=answers）も渡す（ただしURLパラメータ肥大を避ける）
        ...(function () {
          const themeAnswers = Array.isArray(dataset.answers) ? dataset.answers : [];
          const answersJson = JSON.stringify(themeAnswers);
          // expo-router の環境差を考慮して安全寄りの上限にする
          return answersJson.length <= 6000 ? { themeAnswersJson: answersJson } : {};
        })(),
      },
    });
  };

  useEffect(() => {
    if (!result) return;

    resultAnim.stopAnimation();
    resultOpacity.stopAnimation();
    successFlash.stopAnimation();
    celebrateAnim.stopAnimation();

    // Safety: never leave result invisible even if animation is interrupted
    resultOpacity.setValue(1);

    // Base: fade in + tiny scale-up
    resultOpacity.setValue(0);
    resultAnim.setValue(0.995);
    successFlash.setValue(0);
    celebrateAnim.setValue(0);

    const base = Animated.parallel([
      Animated.timing(resultOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(resultAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    if (result.score === 10) {
      base.start(({ finished }) => {
        if (!finished) return;

        const bounce = Animated.sequence([
          Animated.timing(resultAnim, {
            toValue: 1.04,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(resultAnim, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);

        const flash = Animated.sequence([
          Animated.timing(successFlash, {
            toValue: 1,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(successFlash, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]);

        const celebrate = Animated.sequence([
          Animated.timing(celebrateAnim, {
            toValue: 1,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          // Keep the badge visible for ~1s total (including fade-in/out)
          Animated.delay(820),
          Animated.timing(celebrateAnim, {
            toValue: 0,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);

        Animated.parallel([bounce, flash, celebrate]).start();
      });
    } else {
      base.start();
    }

    // Final safety: force visible after animations
    const t = setTimeout(() => resultOpacity.setValue(1), 600);
    return () => clearTimeout(t);
  }, [result, resultAnim, resultOpacity, successFlash, celebrateAnim]);

  useEffect(() => {
    if (!result) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [result]);

  // bottom inset is applied ONLY here (footer). SafeAreaView excludes bottom.
  const footerPaddingBottom = 10 + insets.bottom;
  // Keep results visible above the fixed footer
  const scrollPaddingBottom = footerHeight + 16;

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={[styles.safe, { backgroundColor: background }]}>
        {/* [A] Scrollable area (送信ボタンは絶対に含めない) */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.container, { paddingBottom: scrollPaddingBottom }]}
          keyboardShouldPersistTaps="handled">
          {/* カテゴリ選択 */}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">カテゴリ</ThemedText>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((c) => {
                const selected = c.id === selectedCategoryId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setSelectedCategoryId(c.id)}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      { borderColor: selected ? tint : icon },
                      pressed ? { opacity: 0.85 } : null,
                    ]}>
                    <ThemedText
                      style={styles.categoryChipText}
                      lightColor={selected ? tint : undefined}
                      darkColor={selected ? tint : undefined}>
                      {c.title}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>

          {/* 出題アクション */}
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">出題</ThemedText>
            <View style={styles.quizActionsRow}>
              <Pressable
                onPress={drawTheme}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: tint },
                  pressed ? { opacity: 0.85 } : null,
                ]}>
                <ThemedText style={styles.secondaryButtonText} lightColor={tint} darkColor={tint}>
                  出題
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  resetPlay();
                  runQuestionAnimation();
                }}
                style={({ pressed }) => [
                  styles.ghostButton,
                  { borderColor: icon },
                  pressed ? { opacity: 0.85 } : null,
                ]}>
                <ThemedText style={styles.ghostButtonText} lightColor={icon} darkColor={icon}>
                  同じ問題をもう一度
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          {/* 出題カード */}
          <Animated.View
            style={{
              opacity: questionAnim,
              transform: [
                { translateY: questionLift },
                {
                  scale: Animated.multiply(
                    questionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                    questionScale
                  ),
                },
              ],
            }}>
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
              </View>
            </ThemedView>
          </Animated.View>

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
            <Animated.View
              style={{
                opacity: resultOpacity,
                transform: [{ scale: resultAnim }],
              }}>
              <ThemedView style={styles.section}>
                <ThemedText type="subtitle">結果</ThemedText>

                <Animated.View
                  style={[
                    styles.resultSummaryBox,
                    {
                      backgroundColor: successFlash.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['rgba(0,0,0,0)', 'rgba(46, 204, 113, 0.18)'],
                      }),
                      borderColor: icon,
                    },
                  ]}>
                  {result.score === 10 ? (
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        opacity: celebrateAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 1],
                        }),
                        transform: [
                          {
                            scale: celebrateAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.6, 1.1],
                            }),
                          },
                        ],
                      }}>
                      <ThemedText style={styles.celebrateBadge}>🎉</ThemedText>
                    </Animated.View>
                  ) : null}
                  <ThemedText>正解数: {result.score}</ThemedText>
                  <ThemedText>不足数（10 - 入力数）: {Math.max(0, 10 - items.length)}</ThemedText>
                </Animated.View>

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

                <View style={styles.resultsBlock}>
                  <Pressable
                    onPress={openExplain}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: tint },
                      pressed ? { opacity: 0.85 } : null,
                    ]}>
                    <ThemedText style={styles.secondaryButtonText} lightColor={tint} darkColor={tint}>
                      解説
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            </Animated.View>
          ) : null}
        </ScrollView>

        {/* [B] Fixed footer (送信ボタンのみ) */}
        <View
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          style={[
            styles.footer,
            {
              minHeight: FOOTER_MIN_HEIGHT,
              paddingBottom: footerPaddingBottom,
              borderColor: icon,
              backgroundColor: background,
            },
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
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  quizActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
  resultSummaryBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  celebrateBadge: {
    fontSize: 20,
    lineHeight: 22,
  },
});
