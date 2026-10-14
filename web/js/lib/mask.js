// Hiding part of a verse for 구절 찾기, so the learner can be asked to place a
// verse from only its beginning, its ending, or a few scattered gaps.

import { makeRng, shuffle } from './util.js';

export const MASK_MODES = [
  { value: 'full', label: '전체 보기' },
  { value: 'head', label: '앞부분만' },
  { value: 'tail', label: '뒷부분만' },
  { value: 'random', label: '군데군데 가리기' },
];

/** Share of the words that are hidden, in percent. */
export const MASK_RATIOS = [30, 50, 70];

export const DEFAULT_MASK = { mode: 'full', ratio: 50 };

export function normalizeMask(raw) {
  const mode = MASK_MODES.some((m) => m.value === raw?.mode) ? raw.mode : DEFAULT_MASK.mode;
  const ratio = MASK_RATIOS.includes(raw?.ratio) ? raw.ratio : DEFAULT_MASK.ratio;
  return { mode, ratio };
}

/**
 * Split a verse into words, flagging the hidden ones.
 *
 *   head    keeps the opening words and hides the end
 *   tail    hides the opening words and keeps the end
 *   random  hides scattered words
 *
 * At least one word stays visible and at least one is hidden, however short
 * the verse or high the ratio. `seed` keeps the same card's gaps stable across
 * re-renders while a new appearance of the card can differ.
 */
export function maskVerse(text, { mode = 'full', ratio = 50, seed = 'mask' } = {}) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const hidden = new Array(words.length).fill(false);

  if (mode !== 'full' && words.length >= 2) {
    const count = Math.min(words.length - 1, Math.max(1, Math.round((words.length * ratio) / 100)));
    if (mode === 'head') {
      for (let i = words.length - count; i < words.length; i++) hidden[i] = true;
    } else if (mode === 'tail') {
      for (let i = 0; i < count; i++) hidden[i] = true;
    } else {
      shuffle(words.map((_, i) => i), makeRng(String(seed))).slice(0, count)
        .forEach((i) => { hidden[i] = true; });
    }
  }

  return words.map((word, i) => ({ text: word, hidden: hidden[i] }));
}

export function isMasked(parts) {
  return parts.some((p) => p.hidden);
}
