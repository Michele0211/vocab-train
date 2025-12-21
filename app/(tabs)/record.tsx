import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { THEMES } from '@/datasets/themes';
import { loadStats, rate, type PlayStatsV1 } from '@/src/lib/records';

export default function RecordScreen() {
  const [stats, setStats] = useState<PlayStatsV1 | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      const s = await loadStats();
      setStats(s);
    })();
  }, []);

  useFocusEffect(refresh);

  const plays = stats?.plays ?? 0;
  const perfects = stats?.perfects ?? 0;
  const overallRate = rate(perfects, plays);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedView style={styles.section}>
          <ThemedText type="title">記録</ThemedText>
          <ThemedText>全体の実施回数: {plays}</ThemedText>
          <ThemedText>成功回数: {perfects}</ThemedText>
          <ThemedText>成功率: {(overallRate * 100).toFixed(1)}%</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">テーマ別</ThemedText>
          {THEMES.map((t) => {
            const p = stats?.playsByTheme?.[t.id] ?? 0;
            const perf = stats?.perfectsByTheme?.[t.id] ?? 0;
            const r = rate(perf, p);
            return (
              <ThemedView key={t.id} style={styles.themeRow}>
                <View style={styles.themeHeader}>
                  <ThemedText type="defaultSemiBold">{t.title}</ThemedText>
                  <ThemedText>{(r * 100).toFixed(1)}%</ThemedText>
                </View>
                <ThemedText>実施: {p} / 成功: {perf}</ThemedText>
              </ThemedView>
            );
          })}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  themeRow: {
    gap: 6,
    paddingVertical: 8,
  },
  themeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
});


