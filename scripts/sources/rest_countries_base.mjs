/**
 * REST Countries canonical dataset source.
 * This runs at generation time only (NOT at app runtime).
 *
 * Endpoint: https://restcountries.com/v3.1/all
 */

// REST Countries now requires `fields` query.
const ENDPOINT =
  'https://restcountries.com/v3.1/all?fields=cca2,name,translations,continents,subregion,landlocked,unMember,capital';
const ISO2_RE = /^[A-Z]{2}$/;

function asTrimmedString(x) {
  return typeof x === 'string' ? x.trim() : '';
}

export async function fetchDatasets() {
  // NOTE:
  // - ここは「生成時」にだけ呼ばれる。アプリ実行時には外部通信しない。
  // - 将来API仕様が変わっても、失敗理由が分かるようにエラーを厚めにしている。
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res;
  try {
    res = await fetch(ENDPOINT, { signal: controller.signal });
  } catch (e) {
    const msg = String(e);
    throw new Error(
      `REST Countries の取得に失敗しました。ネットワーク/TLS設定を確認してください。` +
        `\n- URL: ${ENDPOINT}` +
        `\n- 原因: ${msg}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`REST Countries が失敗しました: ${res.status} ${res.statusText} (${ENDPOINT})`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('REST Countries の形式が想定と違います（配列ではありません）');
  }

  const byIso2 = new Map(); // ISO2 -> entity

  for (const c of data) {
    // cca2（ISO2）が無い/不正なものは canonical としてキーにできないので除外する
    const iso2 = asTrimmedString(c?.cca2);
    if (!iso2) continue;
    if (!ISO2_RE.test(iso2)) continue;

    if (byIso2.has(iso2)) {
      throw new Error(`REST Countries: cca2 が重複しています: "${iso2}"`);
    }

    // 英語名は canonical として必須。日本語名はあれば使い、無ければ英語で埋める。
    const labelEn = asTrimmedString(c?.name?.common);
    const labelJa =
      asTrimmedString(c?.translations?.jpn?.common) || labelEn;

    if (!labelEn) {
      // without English canonical name, skip
      continue;
    }

    // continent/subregion は無い場合があるので null に落とす
    const continent = asTrimmedString(c?.continents?.[0]) || null;
    const region = asTrimmedString(c?.subregion) || null;
    const landlocked = Boolean(c?.landlocked);
    // 欠損を false にしない（存在しない場合は null）
    const unMember = typeof c?.unMember === 'boolean' ? c.unMember : null;
    // 首都（欠損は null、推測しない）
    const capital =
      Array.isArray(c?.capital) && typeof c.capital[0] === 'string'
        ? asTrimmedString(c.capital[0]) || null
        : null;

    byIso2.set(iso2, {
      id: iso2,
      label_ja: labelJa,
      label_en: labelEn,
      continent,
      region,
      landlocked,
      unMember,
      capital,
    });
  }

  const entities = Array.from(byIso2.values()).sort((a, b) => a.id.localeCompare(b.id));

  return [
    {
      kind: 'canonical',
      id: 'countries_base',
      entities,
    },
  ];
}


