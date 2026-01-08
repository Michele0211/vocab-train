/**
 * countries_derived_themes.mjs
 *
 * 目的:
 * - canonical 辞書（datasets/canonical/countries_base.json）から
 *   人手を介さず ThemeSpec（出題テーマ）を決定論的に生成する。
 *
 * ルール（決定論的）:
 * - continent 別 / subregion 別 / landlocked 別 でグルーピング
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
  const byInitial = new Map(); // initial -> string[]

  for (const e of entities) {
    const labelJa = typeof e?.label_ja === 'string' ? e.label_ja.trim() : '';
    if (!labelJa) continue;

    const continent = typeof e?.continent === 'string' ? e.continent : null;
    const subregion = typeof e?.region === 'string' ? e.region : null; // canonical uses "region" for subregion
    const landlockedRaw = e?.landlocked;
    const initial = getInitial(labelJa);

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
    if (initial) {
      const arr = byInitial.get(initial) ?? [];
      arr.push(labelJa);
      byInitial.set(initial, arr);
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
      title: `${label}の国`,
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
      title: `${label}の国`,
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
      title: isLandlocked ? '内陸国' : '沿岸国',
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // d) initial themes
  for (const [initial, names] of byInitial.entries()) {
    const answers = uniqSortedJa(names);
    if (answers.length < 10) continue;

    const token = initialToIdToken(initial);
    if (!token) continue;

    themes.push({
      id: `countries_initial_${token}`,
      title: `${initial}で始まる国`,
      categoryId,
      categoryTitle,
      answers,
    });
  }

  // stable order
  themes.sort((a, b) => a.id.localeCompare(b.id));
  return themes;
}


