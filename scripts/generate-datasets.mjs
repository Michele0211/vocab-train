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

async function writeJsonAtomic(targetFile, obj) {
  const dir = path.dirname(targetFile);
  const base = path.basename(targetFile);
  const tmp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  const content = JSON.stringify(obj, null, 2) + '\n';

  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, targetFile);

  return { content };
}

async function main() {
  const repoRoot = process.cwd();
  const datasetsDir = path.join(repoRoot, 'datasets');

  // collect
  const collected = [];
  for (const mod of SOURCES) {
    if (typeof mod.fetchThemes !== 'function') {
      fail(`source が fetchThemes() を export していません: ${JSON.stringify(Object.keys(mod))}`);
      continue;
    }
    const themes = await mod.fetchThemes();
    if (!Array.isArray(themes)) {
      fail('fetchThemes() の戻り値が配列ではありません');
      continue;
    }
    collected.push(...themes);
  }

  if (process.exitCode === 1) return;

  // validate + normalize
  const byId = new Map(); // id -> ThemeSpec
  const categoryTitleById = new Map(); // categoryId -> categoryTitle
  const themesOut = [];

  for (const t of collected) {
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

  if (process.exitCode === 1) return;

  // write
  themesOut.sort((a, b) => a.id.localeCompare(b.id));

  let createdOrUpdated = 0;
  for (const t of themesOut) {
    const outPath = path.join(datasetsDir, `${t.id}.json`);
    let before = null;
    try {
      before = await fs.readFile(outPath, 'utf8');
    } catch {
      // new file
    }

    const { content: afterContent } = await writeJsonAtomic(outPath, t);

    if (before == null) {
      createdOrUpdated += 1;
      // eslint-disable-next-line no-console
      console.log(`CREATED: datasets/${t.id}.json`);
    } else if (before !== afterContent) {
      createdOrUpdated += 1;
      // eslint-disable-next-line no-console
      console.log(`UPDATED: datasets/${t.id}.json`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`UNCHANGED: datasets/${t.id}.json`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`OK: generated ${themesOut.length} themes (${createdOrUpdated} changed)`);
}

main().catch((e) => {
  fail(String(e));
});


