// Response-time difficulty ("자동 난이도"): how long a card took, how accurate
// the answer was and whether hints were used decide the SM-2 rating, so the
// learner does not have to grade themselves.
//
// Speed is judged against the learner's own recent pace rather than a fixed
// clock: a slow typist is not marked "slow" on every card, and a fast one does
// not get "easy" for free. JS only — there is no Python counterpart.

import { AGAIN, HARD, GOOD, EASY } from './srs.js';

export const MODE_RECITE = '암송';
export const MODE_DICTATION = '받아쓰기';
export const MODE_FIND = '구절찾기';

/** Seconds ÷ expected seconds for a typical learner; used until history exists. */
export const DEFAULT_BASELINE = 1.6;
/** How many "typical" samples the default counts for when blending with history. */
const BASELINE_WEIGHT = 5;
const HISTORY_WINDOW = 30;
/** Ratios above this are an interruption, not a pace (and never feed the baseline). */
const MAX_PLAUSIBLE_RATIO = 12;

const FAST_BELOW = 0.8;
const SLOW_ABOVE = 1.5;

/**
 * Pausable stopwatch. `now` is injectable so tests (and the e2e suite) can move
 * the clock; pause()/resume() keep time spent in another tab out of the answer.
 */
export class Stopwatch {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.startedAt = this.now();
    this.pausedMs = 0;
    this.pausedAt = null;
  }

  pause() {
    if (this.pausedAt === null) this.pausedAt = this.now();
  }

  resume() {
    if (this.pausedAt !== null) {
      this.pausedMs += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  elapsedMs() {
    const until = this.pausedAt === null ? this.now() : this.pausedAt;
    return Math.max(0, until - this.startedAt - this.pausedMs);
  }
}

function countWords(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function countChars(text) {
  return (text || '').replace(/\s+/g, '').length;
}

/**
 * Seconds a fluent answer takes, which grows with the verse.
 *   암송      a moment to start, then reciting at about 1.5 words a second
 *   받아쓰기  a moment to start, then typing at about 2 syllables a second
 *   구절찾기  reading the verse, recalling where it is from, typing the address
 */
export function expectedSeconds(mode, text) {
  switch (mode) {
    case MODE_RECITE: return 3 + 0.65 * countWords(text);
    case MODE_DICTATION: return 5 + 0.5 * countChars(text);
    case MODE_FIND: return 6 + 0.3 * countWords(text);
    default: return 8 + 0.5 * countWords(text);
  }
}

export function paceRatio(seconds, expected) {
  return expected > 0 ? seconds / expected : 0;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The learner's usual ratio, from their latest successful answers (oldest
 * first). With little history it leans on DEFAULT_BASELINE; with plenty it is
 * simply their median.
 */
export function paceBaseline(ratios = []) {
  const usable = ratios
    .filter((r) => Number.isFinite(r) && r > 0 && r < MAX_PLAUSIBLE_RATIO)
    .slice(-HISTORY_WINDOW);
  if (!usable.length) return DEFAULT_BASELINE;
  const blended = (median(usable) * usable.length + DEFAULT_BASELINE * BASELINE_WEIGHT)
    / (usable.length + BASELINE_WEIGHT);
  return Math.min(4, Math.max(0.6, blended));
}

/** 'fast' | 'normal' | 'slow', relative to the learner's own baseline. */
export function speedTier(ratio, baseline = DEFAULT_BASELINE) {
  const relative = ratio / baseline;
  if (relative <= FAST_BELOW) return 'fast';
  if (relative >= SLOW_ABOVE) return 'slow';
  return 'normal';
}

export const TIER_LABELS = { fast: '빠름', normal: '보통', slow: '느림' };

/** 'solid' | 'okay' | 'weak' | 'fail' from a 0-100 score. */
export function accuracyFromScore(score) {
  if (score >= 95) return 'solid';
  if (score >= 80) return 'okay';
  if (score >= 50) return 'weak';
  return 'fail';
}

/** What a learner says about a recitation, as an accuracy class. */
export const SELF_REPORT = { perfect: 'solid', shaky: 'weak', forgot: 'fail' };

/**
 * The SM-2 rating for one answer.
 *
 * Wrong stays wrong however fast, and a shaky answer never rates above "hard".
 * Only a good answer is graded on speed — fast earns "easy", slow drops to
 * "hard" — and hints cap the result because they were part of the recall.
 */
export function autoRating({ accuracy, tier, hints = 0 }) {
  let rating;
  if (accuracy === 'fail') return AGAIN;
  if (accuracy === 'weak') {
    rating = HARD;
  } else if (tier === 'slow') {
    rating = HARD;
  } else if (accuracy === 'solid' && tier === 'fast') {
    rating = EASY;
  } else {
    rating = GOOD;
  }
  if (hints >= 2) rating = Math.min(rating, HARD);
  else if (hints === 1) rating = Math.min(rating, GOOD);
  return rating;
}

/** "14초" / "1분 5초". */
export function formatSeconds(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}초`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${minutes}분 ${rest}초` : `${minutes}분`;
}

/**
 * How many cards later a card should come back in the same session, or 0 for
 * "not again". A miss returns sooner than a struggle; each card is repeated at
 * most twice so a session always ends.
 */
export function repeatGap(rating, timesRepeated = 0) {
  if (rating === AGAIN && timesRepeated < 2) return 3;
  if (rating === HARD && timesRepeated < 1) return 6;
  return 0;
}
