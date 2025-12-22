/**
 * Unicode CLDR territories (ja) source.
 * Read from local node_modules to avoid HTTPS/TLS issues in some environments.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ISO_ALPHA2_RE = /^[A-Z]{2}$/;

export async function fetchThemes() {
  const filePath = path.join(
    process.cwd(),
    'node_modules',
    'cldr-localenames-full',
    'main',
    'ja',
    'territories.json'
  );

  let json;
  try {
    json = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (e) {
    throw new Error(
      `CLDR territories.json を読み込めませんでした。cldr-localenames-full が未インストールの可能性があります。` +
        `\n- 期待パス: ${filePath}` +
        `\n- 対処: npm install` +
        `\n- 原因: ${String(e)}`
    );
  }

  const territories =
    json?.main?.ja?.localeDisplayNames?.territories ?? null;

  if (!territories || typeof territories !== 'object') {
    throw new Error(
      'CLDR territories のパスが見つかりません: main.ja.localeDisplayNames.territories'
    );
  }

  const names = [];
  const seen = new Set();

  for (const [key, value] of Object.entries(territories)) {
    // a) ISO alpha-2 only
    if (!ISO_ALPHA2_RE.test(key)) continue;
    // b) alt keys are excluded by (a)

    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  // deterministic order
  names.sort((a, b) => a.localeCompare(b, 'ja'));

  return [
    {
      id: 'countries_world',
      title: '世界の国',
      categoryId: 'geography',
      categoryTitle: '地理',
      answers: names,
    },
  ];
}


