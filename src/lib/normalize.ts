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
  // 2) NFKC normalize (e.g. half-width katakana -> full-width)
  const nfkc = noSpaces.normalize('NFKC');
  // 3) Lowercase latin letters
  const lower = nfkc.toLowerCase();
  // 4) Katakana -> Hiragana
  return katakanaToHiragana(lower);
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


