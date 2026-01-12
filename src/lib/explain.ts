/**
 * src/lib/explain.ts
 *
 * 共通ユーティリティのみを置く（ドメイン固有の概念は置かない）
 * - 国/首都などの文章生成は adapter 側に閉じ込める
 */

export function firstNChars(s: string, n: number): string {
  if (typeof s !== 'string' || n <= 0) return '';
  return Array.from(s).slice(0, n).join('');
}


