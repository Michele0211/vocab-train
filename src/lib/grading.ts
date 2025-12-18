import { normalizeAnswer } from '@/src/lib/normalize';

export type GradeResult = {
  score: number;
  wrong: string[];
  missing: string[];
  missingSuggested: string[];
};

const SUGGEST_MAX = 5;

export function gradeAnswers(userAnswers: string[], correctAnswers: string[]): GradeResult {
  const correctAnswersRaw = correctAnswers;

  // normalized -> first original (for set membership)
  const correctNormToFirstOriginal = new Map<string, string>();
  for (const ans of correctAnswersRaw) {
    const norm = normalizeAnswer(ans);
    if (!norm) continue;
    if (!correctNormToFirstOriginal.has(norm)) {
      correctNormToFirstOriginal.set(norm, ans);
    }
  }

  const correctNormSet = new Set(correctNormToFirstOriginal.keys());

  // Correct hits only (wrong answers MUST NOT affect missing)
  const correctHitSet = new Set<string>();
  const seenUserNorms = new Set<string>();
  const wrong: string[] = [];

  for (const raw of userAnswers) {
    const norm = normalizeAnswer(raw);
    if (!norm) continue;
    if (seenUserNorms.has(norm)) continue;
    seenUserNorms.add(norm);

    if (correctNormSet.has(norm)) {
      correctHitSet.add(norm);
    } else {
      wrong.push(raw);
    }
  }

  const score = correctHitSet.size;

  // missing = correct set - correctHitSet (preserve dataset order, dedupe by normalized)
  const missing: string[] = [];
  const seenCorrectNorms = new Set<string>();
  for (const ans of correctAnswersRaw) {
    const norm = normalizeAnswer(ans);
    if (!norm) continue;
    if (seenCorrectNorms.has(norm)) continue;
    seenCorrectNorms.add(norm);

    if (!correctHitSet.has(norm)) {
      missing.push(ans);
    }
  }

  const missingSuggested = missing.slice(0, SUGGEST_MAX);

  // Debug (temporary)
  console.log('[gradeAnswers]', {
    correctAnswersRawLength: correctAnswersRaw.length,
    correctNormSetSize: correctNormSet.size,
    correctHitSetSize: correctHitSet.size,
    missingLength: missing.length,
  });

  return { score, wrong, missing, missingSuggested };
}


