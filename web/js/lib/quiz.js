// Theme 3 core logic: question-bank parsing, option building, answer grading.
// Ported from banki/quiz.py. Pure functions — no DOM access — so the fixture
// tests can compare them against the Python reference directly.
//
// A question is a plain object:
//   id · category · question · answer · accept[] · distractors[] · explanation

import * as grading from './grading.js';
import { pyRound, shuffle } from './util.js';

/** A short answer at or above this score counts as fully correct. */
export const CORRECT_THRESHOLD = 70;
/** At or above this (but below CORRECT_THRESHOLD) counts as partially correct. */
export const PARTIAL_THRESHOLD = 45;
/** Options shown per multiple-choice question, correct answer included. */
export const CHOICE_COUNT = 4;

const LIST_SEP = '|';
/** Punctuation joining the parts of a list-style answer ("총회, 대회, 노회"). */
const SEPARATORS = /[·,\/;+~]/g;
/** Parenthesised glosses, e.g. the "(one)" in "하나(one)". */
const PARENS = /\([^)]*\)/g;
/** Circled enumeration markers used in multi-part answers. */
const ENUM = /[①②③④⑤⑥⑦⑧⑨⑩]/g;

/** Code-point length, so a stray emoji can't skew the length heuristics. */
function charLength(text) {
  return Array.from(text).length;
}

/**
 * Spelling variants of one answer that should all grade the same.
 *
 * The dictation matcher compares whitespace-separated words, so a learner who
 * types "총회 대회 노회 당회" must not be punished for the CSV writing
 * "총회, 대회, 노회, 당회". Each variant drops one more layer of separators,
 * enumeration markers, and parenthesised glosses.
 */
export function answerVariants(text) {
  const out = [];
  const add = (candidate) => {
    const collapsed = candidate.split(/\s+/).filter(Boolean).join(' ');
    if (collapsed && !out.includes(collapsed)) out.push(collapsed);
  };

  add(text);
  const noSep = text.replace(SEPARATORS, ' ');
  add(noSep);
  const noEnum = noSep.replace(ENUM, ' ');
  add(noEnum);
  add(noEnum.replace(PARENS, ' '));
  return out;
}

/** Split a `|`-separated CSV cell into a clean list of strings. */
export function splitList(raw) {
  if (raw === null || raw === undefined) return [];
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === 'nan') return [];
  return text
    .split(LIST_SEP)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Coerce one raw CSV row into the question object used across theme 3. */
export function normalizeQuestion(row) {
  const cell = (key) => {
    const value = row[key];
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    return text.toLowerCase() === 'nan' ? '' : text;
  };

  return {
    id: cell('id'),
    category: cell('category') || '기타',
    question: cell('question'),
    answer: cell('answer'),
    accept: splitList(row.accept),
    distractors: splitList(row.distractors),
    explanation: cell('explanation'),
  };
}

/** Categories in first-seen order, so the CSV controls the ordering. */
export function categories(questions) {
  const seen = [];
  questions.forEach((q) => {
    if (!seen.includes(q.category)) seen.push(q.category);
  });
  return seen;
}

/** Filter by category, optionally shuffle, then cut down to `limit` items. */
export function selectQuestions(questions, selectedCategories = null, limit = null,
  doShuffle = false, rng = Math.random) {
  let pool = [...questions];
  if (selectedCategories && selectedCategories.length) {
    const wanted = new Set(selectedCategories);
    pool = pool.filter((q) => wanted.has(q.category));
  }
  if (doShuffle) pool = shuffle([...pool], rng);
  if (limit !== null && limit > 0) pool = pool.slice(0, limit);
  return pool;
}

/**
 * Borrow other questions' answers as options, closest in length first.
 * Used for list-style questions that ship without authored distractors.
 */
function autoDistractors(question, pool, needed) {
  const answer = question.answer;
  const target = Math.max(charLength(answer), 1);

  const unique = [];
  pool.forEach((q) => {
    if (q.id === question.id || !q.answer || q.answer === answer) return;
    if (!unique.includes(q.answer)) unique.push(q.answer);
  });

  const sameCategory = new Set(
    pool.filter((q) => q.category === question.category && q.id !== question.id)
      .map((q) => q.answer),
  );

  unique.sort((a, b) => {
    const da = Math.abs(charLength(a) - target) / target;
    const db = Math.abs(charLength(b) - target) / target;
    if (da !== db) return da - db;
    // Python sorted False (in same category) before True; mirror that.
    return (sameCategory.has(a) ? 0 : 1) - (sameCategory.has(b) ? 0 : 1);
  });

  return unique.slice(0, needed);
}

/**
 * Shuffled options for a multiple-choice question.
 *
 * Authored distractors are used first; other questions' answers fill in when
 * there aren't enough. Returns [] when the question has no usable
 * multiple-choice form.
 */
export function buildChoices(question, pool, count = CHOICE_COUNT, rng = Math.random) {
  const answer = question.answer;
  if (!answer) return [];

  const authored = [];
  question.distractors.forEach((d) => {
    if (d && d !== answer && !authored.includes(d)) authored.push(d);
  });
  shuffle(authored, rng);
  const picked = authored.slice(0, count - 1);

  if (picked.length < count - 1) {
    autoDistractors(question, pool, count - 1 - picked.length).forEach((extra) => {
      if (!picked.includes(extra)) picked.push(extra);
    });
  }
  if (!picked.length) return [];

  return shuffle([answer, ...picked], rng);
}

/** Whether the question can be asked as multiple choice at all. */
export function hasChoiceForm(question, pool) {
  if (!question.answer) return false;
  if (question.distractors.length) return true;
  return autoDistractors(question, pool, 1).length > 0;
}

/**
 * Grade a typed answer against the canonical answer and its alternates.
 *
 * Every accepted form is scored with the verse-dictation matcher and the best
 * one kept, so partial credit works exactly as it does in theme 1.
 */
export function gradeShortAnswer(userText, question) {
  const candidates = [];
  [question.answer, ...question.accept].forEach((accepted) => {
    answerVariants(accepted).forEach((variant) => {
      if (!candidates.includes(variant)) candidates.push(variant);
    });
  });
  if (!candidates.length) {
    return { score: 0, verdict: 'miss', best: '', detail: null };
  }

  let bestResult = null;
  let bestTarget = candidates[0];
  candidates.forEach((target) => {
    const result = grading.computeWordMatch(userText, target);
    if (bestResult === null || result.score > bestResult.score) {
      bestResult = result;
      bestTarget = target;
    }
  });

  const typed = userText.trim() !== '';
  const score = typed ? bestResult.score : 0;
  let verdict = 'miss';
  if (score >= CORRECT_THRESHOLD) verdict = 'correct';
  else if (score >= PARTIAL_THRESHOLD) verdict = 'partial';

  return { score, verdict, best: bestTarget, detail: typed ? bestResult : null };
}

/**
 * Aggregate per-question results into a session summary.
 * `results` maps question id -> { verdict, score }.
 */
export function summarize(results) {
  const values = Object.values(results);
  const total = values.length;
  const correct = values.filter((r) => r.verdict === 'correct').length;
  const partial = values.filter((r) => r.verdict === 'partial').length;
  const wrong = total - correct - partial;
  const scores = values.filter((r) => r.score !== null && r.score !== undefined).map((r) => r.score);
  const avgScore = scores.length
    ? pyRound(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const accuracy = total ? pyRound((correct / total) * 100) : 0;
  return { total, correct, partial, wrong, avg_score: avgScore, accuracy };
}
