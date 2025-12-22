/**
 * Demo source (no external API).
 * Each source must export:
 *   export async function fetchThemes(): Promise<ThemeSpec[]>
 *
 * ThemeSpec:
 *   { id, title, categoryId, categoryTitle, answers: string[] }
 */

export async function fetchThemes() {
  return [
    {
      id: 'demo_fruits',
      title: 'フルーツ',
      categoryId: 'demo',
      categoryTitle: 'デモ',
      answers: ['りんご', 'バナナ', 'みかん', 'ぶどう', '  ', 'りんご'],
    },
    {
      id: 'demo_colors',
      title: '色',
      categoryId: 'demo',
      categoryTitle: 'デモ',
      answers: ['赤', '青', '緑', '黄', '黒', '白', '青'],
    },
  ];
}


