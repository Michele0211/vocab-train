/**
 * countries_derived_themes.mjs
 *
 * 目的:
 * - canonical 辞書（datasets/canonical/countries_base.json）から
 *   人手を介さず ThemeSpec（出題テーマ）を決定論的に生成する。
 *
 * ルール（決定論的）:
 * - continent 別 / subregion 別 / landlocked 別 でグルーピング
 * - （追加）initial（頭文字）別でグルーピング
 *   - char: 先頭1文字（表示上の文字）
 *   - row: 五十音の行（あ行/か行/...） ※簡易判定でOK
 * - answers は label_ja を使う（空は除外）
 * - answers は重複除去→昇順ソート（安定性）
 * - answers.length < 10 のテーマは生成しない
 * - id は衝突しない規則的命名（snake_case）
 * - categoryId/categoryTitle は geography/地理
 *
 * 注意:
 * - 推測やAIは使わない。タイトルの日本語化はマップにあるものだけ置換し、
 *   無いものは英語（原文）をそのまま使う。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const CANONICAL_PATH = path.join(
  process.cwd(),
  'datasets',
  'canonical',
  'countries_base.json'
);

const LABEL_JA_MAP = {
  Asia: 'アジア',
  Europe: 'ヨーロッパ',
  Africa: 'アフリカ',
  Oceania: 'オセアニア',
  Americas: 'アメリカ大陸',
  'South-Eastern Asia': '東南アジア',
  'Eastern Asia': '東アジア',
  'Western Asia': '西アジア',
  'North America': '北アメリカ',
  'South America': '南アメリカ',
  Antarctica: '南極',
};

/**
 * 表示上の「先頭1文字」を安定に切り出す。
 * - trim する
 * - 先頭の括弧/引用符/記号は連続してスキップし、その次の1文字（1コードポイント）を返す
 * - 最終的に取れなければ '' を返す
 *
 * 注意: 絵文字などの完全網羅は目的外（ただし括弧・引用符起点は確実に潰す）
 */
function getInitial(labelJa) {
  if (typeof labelJa !== 'string') return '';
  // 先に Unicode 正規化（NFKC）→その後 trim
  // 半角カナ/全角カナなどの表記ゆれによるテーマ分裂を防ぐ
  const s = labelJa.normalize('NFKC').trim();
  if (!s) return '';

  // 先頭に来やすい「括弧・引用符・記号」をスキップ対象にする
  // 要件: ( ) （ ） [ ] 「 」 『 』 " ' ・ - — – . , 、 。 　（全角スペース）
  const SKIP = new Set([
    '(', ')',
    '（', '）',
    '[', ']',
    '「', '」',
    '『', '』',
    '"', "'",
    '・',
    '-', '—', '–',
    '.', ',', '、', '。',
    '　', // 全角スペース（念のため。trimで落ちるケースもある）
  ]);

  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i);
    if (cp == null) break;
    const ch = String.fromCodePoint(cp);

    // インデックス進行は code point が BMP か surrogate pair かで明示分岐する
    const step = cp > 0xffff ? 2 : 1;

    if (SKIP.has(ch)) {
      i += step;
      continue;
    }
    return ch;
  }
  return '';
}

/**
 * initial（表示1文字）から、安全な snake_case 用トークンを作る。
 * - 英数字: そのまま小文字化（a, b, 1...）
 * - それ以外: Unicode code point を uXXXX 形式にする（例: ア -> u30a2）
 */
function initialToIdToken(initial) {
  if (typeof initial !== 'string') return '';
  const s = initial.trim();
  if (!s) return '';

  // 先頭1コードポイントを採用（念のため）
  const cp = s.codePointAt(0);
  if (cp == null) return '';
  const ch = String.fromCodePoint(cp);

  // ASCII 英数字のみ「そのまま」
  if (/^[A-Za-z0-9]$/.test(ch)) return ch.toLowerCase();

  // それ以外は code point を hex で表現（u30a2 など）
  const hex = cp.toString(16).toLowerCase();
  const padded = hex.length >= 4 ? hex : hex.padStart(4, '0');
  return `u${padded}`;
}

/**
 * 五十音「行」判定用に、1文字をできるだけ揃える。
 * - NFKC は getInitial 側で済んでいる前提だが、念のためここでも適用
 * - カタカナ→ひらがな
 * - 濁点/半濁点は NFD で分解して除去（が→か、ぱ→は）
 * - 小書き（ぁ等）は大きい仮名に寄せる
 */
function normalizeKanaForRow(ch) {
  if (typeof ch !== 'string') return '';
  const s = ch.normalize('NFKC').trim();
  if (!s) return '';

  const cp = s.codePointAt(0);
  if (cp == null) return '';

  // カタカナ→ひらがな（U+30A1..U+30F6 を -0x60 する）
  let hira = '';
  if (cp >= 0x30a1 && cp <= 0x30f6) {
    hira = String.fromCodePoint(cp - 0x60);
  } else {
    hira = String.fromCodePoint(cp);
  }

  // 濁点/半濁点を除去（NFD: が / ぱ の結合文字を落とす）
  const decomp = hira.normalize('NFD').replace(/[\u3099\u309A]/g, '').normalize('NFC');

  const SMALL_TO_BIG = {
    ぁ: 'あ',
    ぃ: 'い',
    ぅ: 'う',
    ぇ: 'え',
    ぉ: 'お',
    ゃ: 'や',
    ゅ: 'ゆ',
    ょ: 'よ',
    っ: 'つ',
    ゎ: 'わ',
  };
  return SMALL_TO_BIG[decomp] ?? decomp;
}

const ROWS = [
  { token: 'a', nameJa: 'あ行', rep: 'ア', chars: 'あいうえおゔ' }, // ヴは暫定であ行に寄せる
  { token: 'ka', nameJa: 'か行', rep: 'カ', chars: 'かきくけこ' },
  { token: 'sa', nameJa: 'さ行', rep: 'サ', chars: 'さしすせそ' },
  { token: 'ta', nameJa: 'た行', rep: 'タ', chars: 'たちつてと' },
  { token: 'na', nameJa: 'な行', rep: 'ナ', chars: 'なにぬねの' },
  { token: 'ha', nameJa: 'は行', rep: 'ハ', chars: 'はひふへほ' },
  { token: 'ma', nameJa: 'ま行', rep: 'マ', chars: 'まみむめも' },
  { token: 'ya', nameJa: 'や行', rep: 'ヤ', chars: 'やゆよ' },
  { token: 'ra', nameJa: 'ら行', rep: 'ラ', chars: 'らりるれろ' },
  { token: 'wa', nameJa: 'わ行', rep: 'ワ', chars: 'わを' },
];

function getRowMetaFromInitial(initialChar) {
  const hira = normalizeKanaForRow(initialChar);
  if (!hira) return null;
  // ひらがな以外（英字など）は行テーマ対象外
  const cp = hira.codePointAt(0);
  if (cp == null || cp < 0x3040 || cp > 0x309f) return null;

  for (const row of ROWS) {
    if (row.chars.includes(hira)) return row;
  }
  return null;
}

function slugifySnake(value) {
  // "South-Eastern Asia" -> "south_eastern_asia"
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function uniqSortedJa(values) {
  const set = new Set();
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s) continue;
    set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
}

function labelJaOrEnglish(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '';
  return LABEL_JA_MAP[s] ?? s;
}

export async function fetchThemes() {
  let json;
  try {
    json = JSON.parse(await fs.readFile(CANONICAL_PATH, 'utf8'));
  } catch (e) {
    throw new Error(
      `countries_base（canonical）を読み込めませんでした。先に canonical を生成してください。` +
        `\n- 期待パス: ${CANONICAL_PATH}` +
        `\n- 対処: npm run datasets:generate` +
        `\n- 原因: ${String(e)}`
    );
  }

  const entities = json?.entities;
  if (!Array.isArray(entities)) {
    throw new Error(`countries_base の形式が不正です（entities が配列ではありません）: ${CANONICAL_PATH}`);
  }

  const categoryId = 'geography';
  const categoryTitle = '地理';

  // Extract label_ja for each grouping key.
  const byContinent = new Map(); // continent -> string[]
  const bySubregion = new Map(); // subregion -> string[]
  const byLandlocked = new Map(); // boolean -> string[]
  const byInitialChar = new Map(); // initial(char) -> string[]
  const byInitialRow = new Map(); // rowToken -> string[]

  for (const e of entities) {
    // UN加盟国に寄せる（欠損/null/false は除外）
    if (e?.unMember !== true) continue;

    const labelJa = typeof e?.label_ja === 'string' ? e.label_ja.trim() : '';
    if (!labelJa) continue;

    const continent = typeof e?.continent === 'string' ? e.continent : null;
    const subregion = typeof e?.region === 'string' ? e.region : null; // canonical uses "region" for subregion
    const landlockedRaw = e?.landlocked;
    const initialChar = getInitial(labelJa);
    const rowMeta = initialChar ? getRowMetaFromInitial(initialChar) : null;

    if (continent) {
      const arr = byContinent.get(continent) ?? [];
      arr.push(labelJa);
      byContinent.set(continent, arr);
    }
    if (subregion) {
      const arr = bySubregion.get(subregion) ?? [];
      arr.push(labelJa);
      bySubregion.set(subregion, arr);
    }
    // landlocked は boolean のときだけ採用する（欠損/未定義を false に誤分類しない）
    if (typeof landlockedRaw === 'boolean') {
      const arr = byLandlocked.get(landlockedRaw) ?? [];
      arr.push(labelJa);
      byLandlocked.set(landlockedRaw, arr);
    }
    if (initialChar) {
      const arr = byInitialChar.get(initialChar) ?? [];
      arr.push(labelJa);
      byInitialChar.set(initialChar, arr);
    }
    if (rowMeta) {
      const arr = byInitialRow.get(rowMeta.token) ?? [];
      arr.push(labelJa);
      byInitialRow.set(rowMeta.token, arr);
    }
  }

  const themes = [];

  // a) continent themes
  for (const [continent, names] of byContinent.entries()) {
    const answers = uniqSortedJa(names);
    if (answers.length < 10) continue;

    const slug = slugifySnake(continent);
    const label = labelJaOrEnglish(continent);

    themes.push({
      id: `countries_continent_${slug}`,
      title: `${label}の国連加盟国`,
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // b) subregion themes
  for (const [subregion, names] of bySubregion.entries()) {
    const answers = uniqSortedJa(names);
    if (answers.length < 10) continue;

    const slug = slugifySnake(subregion);
    const label = labelJaOrEnglish(subregion);

    themes.push({
      id: `countries_subregion_${slug}`,
      title: `${label}の国連加盟国`,
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // c) landlocked themes
  for (const [isLandlocked, names] of byLandlocked.entries()) {
    const answers = uniqSortedJa(names);
    if (answers.length < 10) continue;

    themes.push({
      id: `countries_landlocked_${isLandlocked ? 'true' : 'false'}`,
      title: isLandlocked ? '内陸の国連加盟国' : '沿岸の国連加盟国',
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // d) initial themes
  // d-1) initial themes (char)
  for (const [initial, names] of byInitialChar.entries()) {
    const answers = uniqSortedJa(names);
    if (answers.length < 10) continue;

    const token = initialToIdToken(initial);
    if (!token) continue;

    themes.push({
      id: `countries_initial_char_${token}`,
      title: `${initial}で始まる国連加盟国`,
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // d-2) initial themes (row)
  for (const row of ROWS) {
    const names = byInitialRow.get(row.token);
    if (!names) continue;
    const answers = uniqSortedJa(names);
    if (answers.length < 10) continue;

    themes.push({
      id: `countries_initial_row_${row.token}`,
      title: `${row.rep}（${row.nameJa}）で始まる国連加盟国`,
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // stable order
  themes.sort((a, b) => a.id.localeCompare(b.id));
  return themes;
}


