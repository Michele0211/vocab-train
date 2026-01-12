import countriesBase from '@/datasets/canonical/countries_base.json';
import { THEMES } from '@/datasets/themes';
import type { ExplainAdapter, ExplainBuilt, ExplainContext, ExplainPromptId } from '@/src/explain/types';
import { firstNChars } from '@/src/lib/explain';

type CountriesBaseEntity = {
  label_ja?: string;
  capital?: string | null;
};

type CountryCapitalFact = { country: string; capital: string | null };
type CountriesExplainFacts = { themeTitle: string; correct: CountryCapitalFact[]; all: CountryCapitalFact[] };

// PROMPTS はこのAdapterの「単一の真実」：id/label/tone/needsSelection をここだけに集約する
const PROMPTS = [
  { id: 'whereCapital', label: 'この国の首都はどこ？', tone: 'primary', needsSelection: true },
  { id: 'cityFeature', label: '首都ってどんな都市？', needsSelection: true },
  { id: 'memoryTip', label: '覚えやすいポイントは？', needsSelection: true },
  { id: 'list', label: '正解一覧' },
  { id: 'themeList', label: 'このテーマの国一覧' },
] as const;

type CountriesPromptId = (typeof PROMPTS)[number]['id'];

const PROMPT_ID_SET = new Set<string>(PROMPTS.map((p) => p.id));
function isCountriesPromptId(x: string): x is CountriesPromptId {
  return PROMPT_ID_SET.has(x);
}

function assertNever(x: never): never {
  throw new Error(`Unexpected promptId: ${String(x)}`);
}

// 文字列リテラルの重複を避けるため、id は PROMPTS から参照する
const ID_WHERE_CAPITAL = PROMPTS[0].id;
const ID_CITY_FEATURE = PROMPTS[1].id;
const ID_MEMORY_TIP = PROMPTS[2].id;
const ID_LIST = PROMPTS[3].id;
const ID_THEME_LIST = PROMPTS[4].id;

function uniqPreserveOrder(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function buildCountryToCapital(): Map<string, string | null> {
  const m = new Map<string, string | null>();
  const entities = (countriesBase as any)?.entities as unknown;
  if (!Array.isArray(entities)) return m;
  for (const e of entities as CountriesBaseEntity[]) {
    const name = typeof e?.label_ja === 'string' ? e.label_ja.trim() : '';
    if (!name) continue;
    const cap = typeof e?.capital === 'string' ? e.capital.trim() || null : null;
    m.set(name, cap);
  }
  return m;
}

function resolveAllCountries(ctx: ExplainContext): string[] {
  // 1) Quiz params で渡された all を優先
  if (Array.isArray(ctx.all) && ctx.all.length > 0) return uniqPreserveOrder(ctx.all);

  // 2) フォールバック: themes registry から answers を引く
  const found = THEMES.find((t) => t.dataset?.id === ctx.themeId || t.id === ctx.themeId);
  const answers = found?.dataset?.answers;
  return Array.isArray(answers) ? uniqPreserveOrder(answers) : [];
}

function buildFacts(ctx: ExplainContext): CountriesExplainFacts {
  const countryToCapital = buildCountryToCapital();

  const correctCountries = Array.isArray(ctx.correct) ? uniqPreserveOrder(ctx.correct) : [];
  const allCountries = resolveAllCountries(ctx);

  const correct: CountryCapitalFact[] = correctCountries.map((country) => ({
    country,
    capital: countryToCapital.get(country) ?? null,
  }));
  const all: CountryCapitalFact[] = (allCountries.length > 0 ? allCountries : correctCountries).map((country) => ({
    country,
    capital: countryToCapital.get(country) ?? null,
  }));

  return { themeTitle: ctx.themeTitle, correct, all };
}

function fmtCapital(capital: string | null): string {
  return capital ? capital : '首都データが未登録';
}

function introText(facts: CountriesExplainFacts): string {
  const lines: string[] = [];
  lines.push(`今回のお題：${facts.themeTitle}`);
  const slice = facts.correct.slice(0, 2);
  if (slice.length === 0) {
    lines.push('正解した国がないので、首都の豆知識は出せません。');
    return lines.join('\n');
  }
  lines.push('首都の豆知識：');
  for (const f of slice) {
    lines.push(`- ${f.country} → ${fmtCapital(f.capital)}`);
  }
  return lines.join('\n');
}

function findFactByCountry(facts: CountriesExplainFacts, country: string | undefined): CountryCapitalFact | null {
  const key = typeof country === 'string' ? country.trim() : '';
  if (!key) return null;
  return facts.all.find((f) => f.country === key) ?? null;
}

function whereCapitalText(facts: CountriesExplainFacts, country: string | undefined): string {
  const f = findFactByCountry(facts, country);
  if (!f) return 'その国は今回の対象にありません。';
  return `${f.country} の首都：${fmtCapital(f.capital)}`;
}

function cityFeatureText(facts: CountriesExplainFacts, country: string | undefined): string {
  const f = findFactByCountry(facts, country);
  if (!f) return 'その国は今回の対象にありません。';
  if (!f.capital) return `${f.country} の首都は未登録のため、都市の話はできません。`;
  return [
    `（MVP）${f.country} の首都は「${f.capital}」です。`,
    '都市の特徴は canonical に情報がないため、推測せず表示しません。',
  ].join('\n');
}

function memoryTipText(facts: CountriesExplainFacts, country: string | undefined): string {
  const f = findFactByCountry(facts, country);
  if (!f) return 'その国は今回の対象にありません。';
  const c = firstNChars(f.country, 2);
  const cap = f.capital ? firstNChars(f.capital, 2) : '未登録';
  return [
    '覚えやすいポイント（MVP）：',
    `- 「${c} → ${cap}」のペアで口に出して覚える`,
    f.capital ? `- 例：${f.country} → ${f.capital}` : `- ${f.country} は首都が未登録なので、国名だけ先に覚える`,
  ].join('\n');
}

function listText(facts: CountriesExplainFacts): string {
  if (facts.correct.length === 0) return '正解一覧：なし';
  return ['正解一覧：', ...facts.correct.map((f) => `- ${f.country}`)].join('\n');
}

function themeListText(facts: CountriesExplainFacts): string {
  if (!Array.isArray(facts.all) || facts.all.length === 0) return '一覧データが取得できませんでした。';
  const lines = facts.all.map((f) => `- ${f.country} → ${fmtCapital(f.capital)}`);
  return ['出題対象（国一覧）：', ...lines].join('\n');
}

export const countriesCapitalsAdapter: ExplainAdapter = {
  canHandle(themeId: string) {
    // 暫定: countries_* を「国テーマ」として扱う
    return typeof themeId === 'string' && themeId.startsWith('countries_');
  },

  build(ctx: ExplainContext): ExplainBuilt {
    const facts = buildFacts(ctx);

    const options = Array.isArray(facts.all) ? facts.all.map((f) => f.country) : [];

    return {
      selection: {
        type: 'entity',
        label: 'どの国について聞く？',
        options,
        defaultValue: options[0],
      },
      prompts: PROMPTS.slice(),
      intro: introText(facts),
      facts,
    };
  },

  answer(args: { promptId: ExplainPromptId; selectionValue?: string }, built: ExplainBuilt): string {
    const facts = built.facts as CountriesExplainFacts;
    const country = args.selectionValue;

    // コアは promptId:string なので、まずこのAdapterのpromptかチェックして型を絞る
    if (!isCountriesPromptId(args.promptId)) return '未対応の質問です。';

    // ここから先は CountriesPromptId で型安全に分岐できる
    switch (args.promptId) {
      case ID_WHERE_CAPITAL:
        return whereCapitalText(facts, country);
      case ID_CITY_FEATURE:
        return cityFeatureText(facts, country);
      case ID_MEMORY_TIP:
        return memoryTipText(facts, country);
      case ID_LIST:
        return listText(facts);
      case ID_THEME_LIST:
        return themeListText(facts);
      default:
        // PROMPTS に追加したのに処理を書き忘れると、ここが型エラーになる
        return assertNever(args.promptId);
    }
  },
};


