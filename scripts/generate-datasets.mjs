import fs from 'node:fs/promises';
import path from 'node:path';

import { SOURCES } from './sources/index.mjs';

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function warn(message) {
  // eslint-disable-next-line no-console
  console.warn(`WARN: ${message}`);
}

function fail(message) {
  // eslint-disable-next-line no-console
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function uniqPreserveOrder(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function sanitizeAnswers(answers, ctx) {
  if (!Array.isArray(answers)) {
    fail(`${ctx}: answers が配列ではありません`);
    return [];
  }
  const trimmed = answers
    .filter((a) => typeof a === 'string')
    .map((a) => a.trim())
    .filter((a) => a !== '');
  return uniqPreserveOrder(trimmed);
}

function isObject(x) {
  return x != null && typeof x === 'object';
}

async function writeJsonAtomic(targetFile, obj) {
  const dir = path.dirname(targetFile);
  const base = path.basename(targetFile);
  const tmp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  const content = JSON.stringify(obj, null, 2) + '\n';

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, targetFile);

  return { content };
}

async function main() {
  const repoRoot = process.cwd();
  const datasetsDir = path.join(repoRoot, 'datasets');
  const canonicalDir = path.join(datasetsDir, 'canonical');

  // collect
  const collectedThemes = [];
  const collectedDatasets = [];
  for (const mod of SOURCES) {
    const keys = Object.keys(mod);

    if (typeof mod.fetchThemes === 'function') {
      const themes = await mod.fetchThemes();
      if (!Array.isArray(themes)) {
        fail('fetchThemes() の戻り値が配列ではありません');
        continue;
      }
      collectedThemes.push(...themes);
    }

    if (typeof mod.fetchDatasets === 'function') {
      const datasets = await mod.fetchDatasets();
      if (!Array.isArray(datasets)) {
        fail('fetchDatasets() の戻り値が配列ではありません');
        continue;
      }
      collectedDatasets.push(...datasets);
    }

    if (typeof mod.fetchThemes !== 'function' && typeof mod.fetchDatasets !== 'function') {
      fail(`source が fetchThemes()/fetchDatasets() を export していません: ${JSON.stringify(keys)}`);
      continue;
    }
  }

  if (process.exitCode === 1) return;

  // validate + normalize (themes)
  const byId = new Map(); // id -> ThemeSpec/DatasetSpec
  const categoryTitleById = new Map(); // categoryId -> categoryTitle
  const themesOut = [];

  for (const t of collectedThemes) {
    const id = t?.id;
    const title = t?.title;
    const categoryId = t?.categoryId;
    const categoryTitle = t?.categoryTitle;

    const ctx = `ThemeSpec(id=${JSON.stringify(id)})`;

    if (typeof id !== 'string' || id.trim() === '') {
      fail(`${ctx}: id が空です`);
      continue;
    }
    if (!SNAKE_CASE_RE.test(id)) {
      fail(`${ctx}: id が snake_case ではありません: "${id}"`);
      continue;
    }
    if (byId.has(id)) {
      fail(`${ctx}: id が重複しています: "${id}"`);
      continue;
    }
    if (typeof title !== 'string' || title.trim() === '') {
      fail(`${ctx}: title が空です`);
      continue;
    }
    if (typeof categoryId !== 'string' || categoryId.trim() === '') {
      fail(`${ctx}: categoryId が空です`);
      continue;
    }
    if (!SNAKE_CASE_RE.test(categoryId)) {
      fail(`${ctx}: categoryId が snake_case ではありません: "${categoryId}"`);
      continue;
    }
    if (typeof categoryTitle !== 'string' || categoryTitle.trim() === '') {
      fail(`${ctx}: categoryTitle が空です`);
      continue;
    }

    const existingTitle = categoryTitleById.get(categoryId);
    if (existingTitle && existingTitle !== categoryTitle) {
      fail(
        `${ctx}: categoryTitle 表記ゆれ: categoryId="${categoryId}" が "${existingTitle}" と "${categoryTitle}" を持っています`
      );
      continue;
    }
    categoryTitleById.set(categoryId, categoryTitle);

    const answers = sanitizeAnswers(t?.answers, ctx);
    if (answers.length === 0) {
      fail(`${ctx}: answers が空です（trim/空文字除去/重複除去後）`);
      continue;
    }

    const out = {
      id,
      title: title.trim(),
      categoryId: categoryId.trim(),
      categoryTitle: categoryTitle.trim(),
      answers,
    };

    byId.set(id, out);
    themesOut.push(out);
  }

  // validate + normalize (canonical datasets)
  const ISO2_RE = /^[A-Z]{2}$/;
  const datasetsOut = [];

  for (const d of collectedDatasets) {
    const kind = d?.kind;
    const id = d?.id;
    const ctx = `DatasetSpec(id=${JSON.stringify(id)})`;

    if (kind !== 'canonical') {
      fail(`${ctx}: kind が不正です（期待: "canonical"）`);
      continue;
    }

    if (typeof id !== 'string' || id.trim() === '') {
      fail(`${ctx}: id が空です`);
      continue;
    }
    if (!SNAKE_CASE_RE.test(id)) {
      fail(`${ctx}: id が snake_case ではありません: "${id}"`);
      continue;
    }
    if (byId.has(id)) {
      fail(`${ctx}: id が重複しています: "${id}"`);
      continue;
    }

    if (id === 'countries_base') {
      const entities = d?.entities;
      if (!Array.isArray(entities) || entities.length === 0) {
        fail(`${ctx}: entities が空です`);
        continue;
      }

      const seenIso2 = new Set();
      let jaCount = 0;

      const cleanedEntities = [];
      for (const e of entities) {
        const iso2 = typeof e?.id === 'string' ? e.id.trim() : '';
        if (!ISO2_RE.test(iso2)) {
          fail(`${ctx}: entities[].id が ISO2 ではありません: "${iso2}"`);
          break;
        }
        if (seenIso2.has(iso2)) {
          fail(`${ctx}: entities[].id が重複しています: "${iso2}"`);
          break;
        }
        seenIso2.add(iso2);

        const labelJa = typeof e?.label_ja === 'string' ? e.label_ja.trim() : '';
        const labelEn = typeof e?.label_en === 'string' ? e.label_en.trim() : '';
        if (!labelEn) {
          fail(`${ctx}: entities[].label_en が空です（id="${iso2}"）`);
          break;
        }
        if (labelJa) jaCount += 1;

        cleanedEntities.push({
          id: iso2,
          label_ja: labelJa || labelEn,
          label_en: labelEn,
          continent: typeof e?.continent === 'string' ? e.continent : null,
          region: typeof e?.region === 'string' ? e.region : null,
          landlocked: Boolean(e?.landlocked),
        });
      }

      if (process.exitCode === 1) continue;

      cleanedEntities.sort((a, b) => a.id.localeCompare(b.id));

      const out = {
        id,
        schema: 'countries_base_v1',
        generatedAt: new Date().toISOString(),
        entities: cleanedEntities,
      };

      byId.set(id, out);
      datasetsOut.push(out);

      // eslint-disable-next-line no-console
      console.log(`INFO: countries_base entities=${cleanedEntities.length} (jaFilled=${jaCount})`);
    } else {
      fail(`${ctx}: 未対応のcanonical dataset idです: "${id}"`);
      continue;
    }
  }

  if (process.exitCode === 1) return;

  // write (themes + canonical datasets)
  let createdOrUpdated = 0;

  // themes -> datasets/{id}.json
  for (const t of themesOut.sort((a, b) => a.id.localeCompare(b.id))) {
    const outPath = path.join(datasetsDir, `${t.id}.json`);
    let before = null;
    try {
      before = await fs.readFile(outPath, 'utf8');
    } catch {
      // new file
    }

    const { content: afterContent } = await writeJsonAtomic(outPath, t);
    const count = Array.isArray(t.answers) ? t.answers.length : 0;

    if (before == null) {
      createdOrUpdated += 1;
      // eslint-disable-next-line no-console
      console.log(`CREATED: datasets/${t.id}.json (count=${count})`);
    } else if (before !== afterContent) {
      createdOrUpdated += 1;
      // eslint-disable-next-line no-console
      console.log(`UPDATED: datasets/${t.id}.json (count=${count})`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`UNCHANGED: datasets/${t.id}.json (count=${count})`);
    }
  }

  // canonical -> datasets/canonical/{id}.json
  for (const t of datasetsOut.sort((a, b) => a.id.localeCompare(b.id))) {
    const outPath = path.join(canonicalDir, `${t.id}.json`);
    let before = null;
    try {
      before = await fs.readFile(outPath, 'utf8');
    } catch {
      // new file
    }

    const { content: afterContent } = await writeJsonAtomic(outPath, t);
    const count = Array.isArray(t.entities) ? t.entities.length : 0;

    if (before == null) {
      createdOrUpdated += 1;
      // eslint-disable-next-line no-console
      console.log(`CREATED: datasets/canonical/${t.id}.json (count=${count})`);
    } else if (before !== afterContent) {
      createdOrUpdated += 1;
      // eslint-disable-next-line no-console
      console.log(`UPDATED: datasets/canonical/${t.id}.json (count=${count})`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`UNCHANGED: datasets/canonical/${t.id}.json (count=${count})`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`OK: generated ${themesOut.length} themes + ${datasetsOut.length} canonical (${createdOrUpdated} changed)`);
}

main().catch((e) => {
  fail(String(e));
});


