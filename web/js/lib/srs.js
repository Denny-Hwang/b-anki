// SM-2 spaced repetition, ported from banki/srs.py.
//
// Anki-style four-button rating; card state keeps the Python field names so it
// round-trips through storage and the fixture tests unchanged. Dates are
// YYYY-MM-DD strings in the learner's local calendar.

import { pyRound, todayISO, addDays, daysBetween } from './util.js';

export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

export const RATING_LABELS = {
  [AGAIN]: '다시',
  [HARD]: '어려움',
  [GOOD]: '괜찮음',
  [EASY]: '쉬움',
};

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;

export function newCardState() {
  return {
    ease: DEFAULT_EASE,
    interval_days: 0,
    repetitions: 0,
    last_reviewed: null,
    due_date: null,
    lapses: 0,
  };
}

export function isNew(state) {
  return state.repetitions === 0 && !state.last_reviewed;
}

export function isDue(state, today = todayISO()) {
  if (!state.due_date) return true;
  return state.due_date <= today;
}

/** Apply a rating to a card and return its new state. */
export function review(state, rating, today = todayISO()) {
  const next = { ...state, last_reviewed: today };

  if (rating === AGAIN) {
    next.repetitions = 0;
    next.interval_days = 1;
    next.lapses = state.lapses + 1;
    next.ease = Math.max(MIN_EASE, state.ease - 0.2);
  } else {
    next.repetitions = state.repetitions + 1;
    if (next.repetitions === 1) {
      next.interval_days = 1;
    } else if (next.repetitions === 2) {
      next.interval_days = 6;
    } else {
      let multiplier = state.ease;
      if (rating === HARD) multiplier = Math.max(MIN_EASE, state.ease * 0.8);
      else if (rating === EASY) multiplier = state.ease * 1.3;
      next.interval_days = Math.max(1, pyRound(state.interval_days * multiplier));
    }

    if (rating === HARD) next.ease = Math.max(MIN_EASE, state.ease - 0.15);
    else if (rating === GOOD) next.ease = state.ease;
    else if (rating === EASY) next.ease = Math.min(MAX_EASE, state.ease + 0.15);
  }

  next.due_date = addDays(today, next.interval_days);
  return next;
}

/** Suggest a rating from a dictation score percentage. */
export function ratingFromScore(score) {
  if (score >= 95) return EASY;
  if (score >= 80) return GOOD;
  if (score >= 50) return HARD;
  return AGAIN;
}

/** Learning order: due cards first (most overdue first), then new, then future. */
export function sortForSession(cardStates, allIndices, today = todayISO()) {
  const due = [];
  const fresh = [];
  const future = [];

  allIndices.forEach((idx) => {
    const state = cardStates[idx];
    if (!state || isNew(state)) {
      fresh.push(idx);
    } else if (isDue(state, today)) {
      const overdue = daysBetween(state.due_date || today, today);
      due.push([-overdue, idx]);
    } else {
      future.push(idx);
    }
  });

  due.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [...due.map(([, idx]) => idx), ...fresh, ...future];
}
