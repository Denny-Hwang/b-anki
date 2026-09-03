// Proves the JavaScript ports agree with the Python reference implementation.
//
// tests/fixtures/logic.json is produced by scripts/gen_fixtures.py from
// banki/{grading,srs,hints,quiz}.py. If a port ever drifts, this fails.
//
//   python3 scripts/gen_fixtures.py && node web/tests/logic.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv } from '../js/lib/csv.js';
import * as grading from '../js/lib/grading.js';
import * as srs from '../js/lib/srs.js';
import * as hints from '../js/lib/hints.js';
import * as quiz from '../js/lib/quiz.js';
import { BIBLE_BOOK_EMOJIS, BIBLE_BOOK_HINTS } from '../js/lib/bible-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtures = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'logic.json'), 'utf8'),
);

const MARKS = { full: 'f', partial: 'p', miss: 'm', missing: 'x', extra: 'e' };
const EPSILON = 1e-9;

let checks = 0;
const failures = [];

function same(actual, expected, trail = '') {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Number.isInteger(expected) ? actual === expected : Math.abs(actual - expected) < EPSILON;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((v, i) => same(actual[i], v, `${trail}[${i}]`));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    const keys = Object.keys(expected);
    return keys.every((k) => same(actual[k], expected[k], `${trail}.${k}`));
  }
  return actual === expected;
}

function check(label, actual, expected) {
  checks++;
  if (!same(actual, expected)) {
    failures.push(
      `${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function section(name, run) {
  const before = failures.length;
  const start = checks;
  run();
  const failed = failures.length - before;
  const status = failed ? `✗ ${failed} failed` : '✓';
  console.log(`  ${status.padEnd(12)} ${name} (${checks - start} checks)`);
}

// ---------- grading ----------

section('grading.computeWordMatch', () => {
  fixtures.grading.forEach((c, i) => {
    const result = grading.computeWordMatch(c.user, c.answer);
    check(`grading[${i}] ${JSON.stringify(c.user.slice(0, 24))}`, {
      score: result.score,
      total_words: result.total_words,
      matched_words: result.matched_words,
      partial_words: result.partial_words,
      marks: result.word_results.map((w) => MARKS[w.match]).join(''),
    }, c.expected);
  });
});

section('grading.computeWordMatch (full detail)', () => {
  fixtures.grading_detail.forEach((c, i) => {
    check(`grading_detail[${i}]`, grading.computeWordMatch(c.user, c.answer), c.expected);
  });
});

// ---------- srs ----------

section('srs.review', () => {
  const today = fixtures.srs.today;
  fixtures.srs.sequences.forEach((c) => {
    let state = srs.newCardState();
    c.ratings.forEach((rating) => { state = srs.review(state, rating, today); });
    check(`srs.review [${c.ratings.join(',')}]`, state, c.expected);
  });
});

section('srs.ratingFromScore', () => {
  fixtures.srs.rating_from_score.forEach((c) => {
    check(`srs.ratingFromScore(${c.score})`, srs.ratingFromScore(c.score), c.expected);
  });
});

section('srs.sortForSession', () => {
  fixtures.srs.sort_for_session.forEach((c, i) => {
    const states = {};
    Object.entries(c.states).forEach(([k, v]) => { states[Number(k)] = v; });
    check(`srs.sortForSession[${i}]`,
      srs.sortForSession(states, c.indices, fixtures.srs.today), c.expected);
  });
});

// ---------- hints ----------

section('hints.verseHint', () => {
  fixtures.hints.verse.forEach((c, i) => {
    check(`verseHint[${i}] level=${c.level}`, hints.verseHint(c.verse, c.level), c.expected);
  });
});

section('hints.bookHint', () => {
  fixtures.hints.book.forEach((c) => {
    check(`bookHint(${c.word}, ${c.level})`,
      hints.bookHint(c.word, c.level, BIBLE_BOOK_EMOJIS, BIBLE_BOOK_HINTS), c.expected);
  });
});

section('hints.getChosung', () => {
  fixtures.hints.chosung.forEach((c) => {
    check(`getChosung(${c.text})`, hints.getChosung(c.text), c.expected);
  });
});

// ---------- quiz ----------

const bankRows = parseCsv(
  fs.readFileSync(path.join(ROOT, 'data', 'quiz_pcusa_constitution.csv'), 'utf8'),
);
const questions = bankRows.map(quiz.normalizeQuestion);
const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

section('quiz.normalizeQuestion (via the JS CSV parser)', () => {
  check('question count', questions.length, fixtures.quiz.normalized.length);
  fixtures.quiz.normalized.forEach((expected, i) => {
    check(`normalizeQuestion[${i}]`, questions[i], expected);
  });
});

section('quiz.categories', () => {
  check('categories', quiz.categories(questions), fixtures.quiz.categories);
});

section('quiz.answerVariants', () => {
  fixtures.quiz.variants.forEach((c, i) => {
    check(`answerVariants[${i}]`, quiz.answerVariants(c.text), c.expected);
  });
});

section('quiz.splitList', () => {
  fixtures.quiz.split_list.forEach((c, i) => {
    check(`splitList[${i}] ${JSON.stringify(c.raw)}`, quiz.splitList(c.raw), c.expected);
  });
});

section('quiz.gradeShortAnswer', () => {
  fixtures.quiz.grade.forEach((c, i) => {
    const result = quiz.gradeShortAnswer(c.attempt, byId[c.id]);
    check(`gradeShortAnswer[${i}] ${c.id} ${JSON.stringify(c.attempt.slice(0, 20))}`,
      { score: result.score, verdict: result.verdict, best: result.best }, c.expected);
  });
});

section('quiz.buildChoices / hasChoiceForm', () => {
  fixtures.quiz.choices.forEach((c) => {
    const q = byId[c.id];
    // Option order comes from a PRNG that differs between the two languages,
    // so compare the option set — which is fully determined by the CSV.
    check(`buildChoices(${c.id})`,
      quiz.buildChoices(q, questions).slice().sort(), c.expected_set);
    check(`hasChoiceForm(${c.id})`, quiz.hasChoiceForm(q, questions), c.has_choice_form);
  });
});

section('quiz.summarize', () => {
  fixtures.quiz.summaries.forEach((c, i) => {
    check(`summarize[${i}]`, quiz.summarize(c.results), c.expected);
  });
});

// ---------- report ----------

console.log('');
if (failures.length) {
  console.error(`${failures.length} of ${checks} checks disagree with the Python reference:\n`);
  failures.slice(0, 20).forEach((f) => console.error(`  ✗ ${f}\n`));
  if (failures.length > 20) console.error(`  … and ${failures.length - 20} more`);
  process.exit(1);
}
console.log(`✓ all ${checks} checks match the Python reference implementation`);
