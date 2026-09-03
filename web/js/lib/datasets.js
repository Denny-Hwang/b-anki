// Loads the bundled CSV data.
//
// A static host has no directory listing, so the file lists that
// banki/data_loader.py built with os.listdir() come from data/manifest.json,
// written by scripts/build_site.py at deploy time.

import { parseCsv } from './csv.js';
import { normalizeQuestion } from './quiz.js';

const DATA_ROOT = './data';
const cache = new Map();

async function fetchText(file) {
  const url = `${DATA_ROOT}/${encodeURIComponent(file)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file} 를 불러오지 못했습니다 (${response.status})`);
  return response.text();
}

async function cached(key, produce) {
  if (!cache.has(key)) cache.set(key, produce());
  try {
    return await cache.get(key);
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

export function loadManifest() {
  return cached('manifest', async () => {
    const response = await fetch(`${DATA_ROOT}/manifest.json`);
    if (!response.ok) throw new Error('데이터 목록을 불러오지 못했습니다.');
    return response.json();
  });
}

/** Verse rows: { location, verse_krv, verse_niv }. */
export function loadVerses(file) {
  return cached(`verse:${file}`, async () => parseCsv(await fetchText(file)));
}

/** Book names in canonical order. */
export function loadOrdering(file) {
  return cached(`ordering:${file}`, async () => {
    const rows = parseCsv(await fetchText(file));
    return rows
      .slice()
      .sort((a, b) => Number(a.order) - Number(b.order))
      .map((row) => row.name_ko);
  });
}

/** Question bank, normalized and filtered the way load_quiz_csv did. */
export function loadQuiz(file) {
  return cached(`quiz:${file}`, async () => {
    const rows = parseCsv(await fetchText(file));
    if (!rows.length) return [];
    const required = ['id', 'category', 'question', 'answer'];
    if (!required.every((key) => key in rows[0])) return [];
    return rows.map(normalizeQuestion).filter((q) => q.question && q.answer);
  });
}

/** Parse a learner-supplied ordering CSV. Returns null when columns are missing. */
export function parseOrderingUpload(text) {
  const rows = parseCsv(text);
  if (!rows.length) return null;
  const required = ['order', 'name_ko', 'name_en'];
  if (!required.every((key) => key in rows[0])) return null;
  return rows
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((row) => row.name_ko);
}

/** Drop the .csv suffix for display. */
export function prettyName(file) {
  return file.replace(/\.csv$/i, '');
}
