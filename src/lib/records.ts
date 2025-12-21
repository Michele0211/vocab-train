import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlayStatsV1 = {
  plays: number;
  perfects: number;
  playsByTheme: Record<string, number>;
  perfectsByTheme: Record<string, number>;
  updatedAt: number;
};

const STORAGE_KEY = 'vocab-train:play-stats:v1';

export function createEmptyStats(): PlayStatsV1 {
  return {
    plays: 0,
    perfects: 0,
    playsByTheme: {},
    perfectsByTheme: {},
    updatedAt: Date.now(),
  };
}

export async function loadStats(): Promise<PlayStatsV1> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyStats();
    const parsed = JSON.parse(raw) as Partial<PlayStatsV1> | null;
    if (!parsed || typeof parsed !== 'object') return createEmptyStats();

    return {
      plays: typeof parsed.plays === 'number' ? parsed.plays : 0,
      perfects: typeof parsed.perfects === 'number' ? parsed.perfects : 0,
      playsByTheme: parsed.playsByTheme && typeof parsed.playsByTheme === 'object' ? parsed.playsByTheme : {},
      perfectsByTheme:
        parsed.perfectsByTheme && typeof parsed.perfectsByTheme === 'object' ? parsed.perfectsByTheme : {},
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return createEmptyStats();
  }
}

export async function recordPlay(themeId: string, isPerfect: boolean): Promise<PlayStatsV1> {
  const stats = await loadStats();

  stats.plays += 1;
  if (isPerfect) stats.perfects += 1;

  stats.playsByTheme[themeId] = (stats.playsByTheme[themeId] ?? 0) + 1;
  if (isPerfect) {
    stats.perfectsByTheme[themeId] = (stats.perfectsByTheme[themeId] ?? 0) + 1;
  }

  stats.updatedAt = Date.now();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  return stats;
}

export function rate(perfects: number, plays: number): number {
  if (plays <= 0) return 0;
  return perfects / plays;
}


