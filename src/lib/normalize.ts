/**
 * Answer normalization rules:
 * - Remove all spaces (including full-width spaces)
 * - Lowercase latin letters
 * - Treat full-width/half-width as the same (NFKC)
 * - Treat hiragana/katakana as the same (normalize to hiragana)
 */
export function normalizeAnswer(text: string): string {
  // 1) Remove ALL spaces (half/full width + newlines/tabs)
  const noSpaces = (text ?? '').replace(/[\s\u3000]+/g, '');
  // 2) Half-width kana -> Full-width kana (manual; do NOT rely on NFKC in RN/Hermes)
  const fullwidthKana = halfwidthKanaToFullwidth(noSpaces);
  // 3) NFKC normalize (optional helper for other width variants)
  const nfkc = fullwidthKana.normalize('NFKC');
  // 4) Lowercase latin letters
  const lower = nfkc.toLowerCase();
  // 5) Katakana -> Hiragana
  const normalized = katakanaToHiragana(lower);

  return normalized;
}

function katakanaToHiragana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code == null) {
      continue;
    }

    // Katakana (ァ U+30A1 .. ヶ U+30F6) -> Hiragana (ぁ U+3041 .. ゖ U+3096)
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60);
      continue;
    }

    out += ch;
  }
  return out;
}

/**
 * Convert half-width katakana (FF61-FF9F) to full-width katakana.
 * Handles dakuten/handakuten marks by applying them to the previous kana.
 */
export function halfwidthKanaToFullwidth(input: string): string {
  let out = '';

  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code == null) continue;

    // Dakuten / Handakuten marks
    if (code === 0xff9e || code === 0xff9f) {
      const last = out.slice(-1);
      if (!last) continue;

      const applied =
        code === 0xff9e ? DAKUTEN_MAP[last] ?? null : HANDAKUTEN_MAP[last] ?? null;
      if (applied) {
        out = out.slice(0, -1) + applied;
      }
      continue;
    }

    // Half-width kana & symbols (FF61-FF9D)
    if (code >= 0xff61 && code <= 0xff9d) {
      out += HALFWIDTH_TO_FULLWIDTH[ch] ?? ch;
      continue;
    }

    out += ch;
  }

  return out;
}

const HALFWIDTH_TO_FULLWIDTH: Record<string, string> = {
  '｡': '。',
  '｢': '「',
  '｣': '」',
  '､': '、',
  '･': '・',
  'ｰ': 'ー',
  'ｦ': 'ヲ',
  'ｧ': 'ァ',
  'ｨ': 'ィ',
  'ｩ': 'ゥ',
  'ｪ': 'ェ',
  'ｫ': 'ォ',
  'ｬ': 'ャ',
  'ｭ': 'ュ',
  'ｮ': 'ョ',
  'ｯ': 'ッ',
  'ｱ': 'ア',
  'ｲ': 'イ',
  'ｳ': 'ウ',
  'ｴ': 'エ',
  'ｵ': 'オ',
  'ｶ': 'カ',
  'ｷ': 'キ',
  'ｸ': 'ク',
  'ｹ': 'ケ',
  'ｺ': 'コ',
  'ｻ': 'サ',
  'ｼ': 'シ',
  'ｽ': 'ス',
  'ｾ': 'セ',
  'ｿ': 'ソ',
  'ﾀ': 'タ',
  'ﾁ': 'チ',
  'ﾂ': 'ツ',
  'ﾃ': 'テ',
  'ﾄ': 'ト',
  'ﾅ': 'ナ',
  'ﾆ': 'ニ',
  'ﾇ': 'ヌ',
  'ﾈ': 'ネ',
  'ﾉ': 'ノ',
  'ﾊ': 'ハ',
  'ﾋ': 'ヒ',
  'ﾌ': 'フ',
  'ﾍ': 'ヘ',
  'ﾎ': 'ホ',
  'ﾏ': 'マ',
  'ﾐ': 'ミ',
  'ﾑ': 'ム',
  'ﾒ': 'メ',
  'ﾓ': 'モ',
  'ﾔ': 'ヤ',
  'ﾕ': 'ユ',
  'ﾖ': 'ヨ',
  'ﾗ': 'ラ',
  'ﾘ': 'リ',
  'ﾙ': 'ル',
  'ﾚ': 'レ',
  'ﾛ': 'ロ',
  'ﾜ': 'ワ',
  'ﾝ': 'ン',
};

const DAKUTEN_MAP: Record<string, string> = {
  ウ: 'ヴ',
  カ: 'ガ',
  キ: 'ギ',
  ク: 'グ',
  ケ: 'ゲ',
  コ: 'ゴ',
  サ: 'ザ',
  シ: 'ジ',
  ス: 'ズ',
  セ: 'ゼ',
  ソ: 'ゾ',
  タ: 'ダ',
  チ: 'ヂ',
  ツ: 'ヅ',
  テ: 'デ',
  ト: 'ド',
  ハ: 'バ',
  ヒ: 'ビ',
  フ: 'ブ',
  ヘ: 'ベ',
  ホ: 'ボ',
};

const HANDAKUTEN_MAP: Record<string, string> = {
  ハ: 'パ',
  ヒ: 'ピ',
  フ: 'プ',
  ヘ: 'ペ',
  ホ: 'ポ',
};


