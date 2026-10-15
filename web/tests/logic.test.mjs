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
import * as reference from '../js/lib/reference.js';
import * as pace from '../js/lib/pace.js';
import * as mask from '../js/lib/mask.js';
import * as count from '../js/lib/count.js';
import * as storage from '../js/lib/storage.js';
import { shuffleSpread, makeRng } from '../js/lib/util.js';
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

// ---------- reverse verse lookup (JS only — no Python counterpart) ----------

section('reference.parseReference / gradeReference', () => {
  const cases = [
    ['로마서 12:1', '로마서 12:1', 100],
    ['로마서12:1', '로마서 12:1', 100],
    ['롬 12:1', '로마서 12:1', 100],
    ['로마서 12장 1절', '로마서 12:1', 100],
    ['요한일서 4:8', '요한일서 4:8', 100],
    ['요한1서 4:8', '요한일서 4:8', 100],
    ['요 3:16', '요한복음 3:16', 100],
    ['요일 4:8', '요한일서 4:8', 100],
    ['고전 13:4', '고린도전서 13:4', 100],
    ['에베소서 2:8-9', '에베소서 2:8-9', 100],
    ['에베소서 2:8', '에베소서 2:8-9', 50],
    ['로마서 12:2', '로마서 12:1', 50],
    ['로마서 8:1', '로마서 12:1', 0],
    ['고린도전서 12:1', '로마서 12:1', 0],
    ['', '로마서 12:1', 0],
    ['아무말', '로마서 12:1', 0],
    ['로마서', '로마서 12:1', 0],
  ];
  cases.forEach(([typed, answer, score]) => {
    check(`gradeReference(${typed || '(빈 입력)'}, ${answer})`,
      reference.gradeReference(typed, answer).score, score);
  });
  check('parseReference book', reference.parseReference('빌 4:13'),
    { book: '빌립보서', chapter: 4, verse: '13' });
  check('parseReference unknown book', reference.parseReference('없는책 1:1'), null);
});

section('reference.referenceHint', () => {
  check('hint 0 uses the topic', reference.referenceHint('로마서 12:1', 0, '예배'), '💡 주제: 예배');
  check('hint 1 is the book consonant', reference.referenceHint('로마서 12:1', 1), '💡 책 이름의 초성: ㄹ');
  check('hint 2 is the book', reference.referenceHint('로마서 12:1', 2), '💡 책 이름: 로마서');
  check('hint 3 adds the chapter', reference.referenceHint('로마서 12:1', 3), '💡 로마서 12장');
});

// ---------- ordering (JS only) ----------

const range = (n) => Array.from({ length: n }, (_, i) => i);

section('util.shuffleSpread', () => {
  const touching = (arr) => arr
    .reduce((n, v, i) => n + (i && Math.abs(v - arr[i - 1]) === 1 ? 1 : 0), 0);

  [4, 10, 25, 66].forEach((n) => {
    let clashes = 0;
    let identity = 0;
    let permutation = true;
    for (let seed = 1; seed <= 300; seed++) {
      const out = shuffleSpread(range(n), makeRng(seed));
      clashes += touching(out);
      if (out.every((v, i) => v === i)) identity++;
      if ([...out].sort((a, b) => a - b).some((v, i) => v !== i)) permutation = false;
    }
    check(`n=${n} is still a permutation`, permutation, true);
    check(`n=${n} never leaves neighbours together`, clashes, 0);
    check(`n=${n} never returns the input order`, identity, 0);
  });

  [0, 1, 2, 3].forEach((n) => {
    const out = shuffleSpread(range(n), makeRng(7));
    check(`n=${n} short lists terminate as permutations`, [...out].sort(), range(n));
  });

  const counts = new Array(10).fill(0);
  for (let seed = 1; seed <= 4000; seed++) counts[shuffleSpread(range(10), makeRng(seed))[0]]++;
  check('every item can open the list about equally often',
    counts.every((c) => c > 280 && c < 520), true);
});

section('srs.sortForSession keepOrder', () => {
  const today = '2026-09-10';
  const overdue = {};
  range(5).forEach((i) => {
    overdue[i] = {
      ...srs.newCardState(), repetitions: 1, last_reviewed: '2026-09-07', due_date: '2026-09-08',
    };
  });
  check('default: ties fall back to index order',
    srs.sortForSession(overdue, [3, 1, 4, 0, 2], today), [0, 1, 2, 3, 4]);
  check('keepOrder: ties keep the order given',
    srs.sortForSession(overdue, [3, 1, 4, 0, 2], today, { keepOrder: true }), [3, 1, 4, 0, 2]);

  const fresh = {};
  range(3).forEach((i) => { fresh[i] = srs.newCardState(); });
  check('new cards keep the order given', srs.sortForSession(fresh, [2, 0, 1], today), [2, 0, 1]);

  const mixed = {
    0: srs.newCardState(),
    1: { ...overdue[0], due_date: '2026-09-09' },
    2: { ...overdue[0], due_date: '2026-09-01' },
    3: { ...overdue[0], due_date: '2026-09-30' },
  };
  check('keepOrder still puts overdue first, then new, then future',
    srs.sortForSession(mixed, [3, 0, 1, 2], today, { keepOrder: true }), [2, 1, 0, 3]);
});

// ---------- response-time difficulty (JS only) ----------

section('pace.Stopwatch', () => {
  let t = 1000;
  const watch = new pace.Stopwatch(() => t);
  t = 3000;
  check('counts elapsed time', watch.elapsedMs(), 2000);
  watch.pause();
  t = 10000;
  check('stands still while paused', watch.elapsedMs(), 2000);
  watch.resume();
  t = 11000;
  check('carries on after resume', watch.elapsedMs(), 3000);
  watch.pause();
  watch.pause();
  t = 12000;
  watch.resume();
  watch.resume();
  check('double pause/resume is harmless', watch.elapsedMs(), 3000);
  watch.reset();
  check('reset starts again from zero', watch.elapsedMs(), 0);
});

section('pace.expectedSeconds / formatSeconds', () => {
  const verse = '하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열'; // 10 words, 16 characters
  check('recite', pace.expectedSeconds(pace.MODE_RECITE, verse), 3 + 0.65 * 10);
  check('dictation', pace.expectedSeconds(pace.MODE_DICTATION, verse), 5 + 0.5 * 16);
  check('find', pace.expectedSeconds(pace.MODE_FIND, verse), 6 + 0.3 * 10);
  check('longer verses take longer',
    pace.expectedSeconds(pace.MODE_DICTATION, `${verse} ${verse}`)
      > pace.expectedSeconds(pace.MODE_DICTATION, verse), true);
  check('0초', pace.formatSeconds(0), '0초');
  check('14초', pace.formatSeconds(14.4), '14초');
  check('1분 5초', pace.formatSeconds(65), '1분 5초');
  check('2분', pace.formatSeconds(120), '2분');
});

section('pace.paceBaseline / speedTier', () => {
  check('no history uses the default', pace.paceBaseline([]), pace.DEFAULT_BASELINE);
  check('junk values are ignored', pace.paceBaseline([NaN, -1, 0, 99]), pace.DEFAULT_BASELINE);
  const steady = new Array(30).fill(1.0);
  check('history pulls the baseline toward the learner',
    pace.paceBaseline(steady), (1.0 * 30 + pace.DEFAULT_BASELINE * 5) / 35);
  check('a slow learner gets a slower baseline',
    pace.paceBaseline(new Array(30).fill(3)) > pace.paceBaseline(steady), true);
  check('only the latest 30 count',
    pace.paceBaseline([...new Array(50).fill(3), ...steady]), pace.paceBaseline(steady));
  check('baseline stays in range', pace.paceBaseline(new Array(30).fill(11)) <= 4, true);

  check('well under the usual pace is fast', pace.speedTier(0.5, 1.6), 'fast');
  check('the usual pace is normal', pace.speedTier(1.6, 1.6), 'normal');
  check('far over the usual pace is slow', pace.speedTier(3.0, 1.6), 'slow');
  check('the same time is slower for a quick learner',
    [pace.speedTier(1.6, 1.6), pace.speedTier(1.6, 0.8)], ['normal', 'slow']);
});

section('pace.autoRating', () => {
  const { AGAIN, HARD, GOOD, EASY } = srs;
  ['fast', 'normal', 'slow'].forEach((tier) => {
    check(`wrong is AGAIN whatever the speed (${tier})`, pace.autoRating({ accuracy: 'fail', tier }), AGAIN);
    check(`shaky is HARD whatever the speed (${tier})`, pace.autoRating({ accuracy: 'weak', tier }), HARD);
  });
  check('solid + fast = EASY', pace.autoRating({ accuracy: 'solid', tier: 'fast' }), EASY);
  check('solid + normal = GOOD', pace.autoRating({ accuracy: 'solid', tier: 'normal' }), GOOD);
  check('solid + slow = HARD', pace.autoRating({ accuracy: 'solid', tier: 'slow' }), HARD);
  check('okay + fast tops out at GOOD', pace.autoRating({ accuracy: 'okay', tier: 'fast' }), GOOD);
  check('okay + slow = HARD', pace.autoRating({ accuracy: 'okay', tier: 'slow' }), HARD);
  check('one hint caps at GOOD', pace.autoRating({ accuracy: 'solid', tier: 'fast', hints: 1 }), GOOD);
  check('two hints cap at HARD', pace.autoRating({ accuracy: 'solid', tier: 'fast', hints: 2 }), HARD);
  check('hints never rescue a miss', pace.autoRating({ accuracy: 'fail', tier: 'fast', hints: 3 }), AGAIN);

  check('score → accuracy',
    [100, 95, 94, 80, 79, 50, 49, 0].map(pace.accuracyFromScore),
    ['solid', 'solid', 'okay', 'okay', 'weak', 'weak', 'fail', 'fail']);
  check('recitation reports map to accuracy',
    [pace.SELF_REPORT.perfect, pace.SELF_REPORT.shaky, pace.SELF_REPORT.forgot],
    ['solid', 'weak', 'fail']);
});

section('pace.repeatGap', () => {
  const { AGAIN, HARD, GOOD, EASY } = srs;
  check('a miss comes back after 3 cards', pace.repeatGap(AGAIN, 0), 3);
  check('and again if missed again', pace.repeatGap(AGAIN, 1), 3);
  check('but not more than twice', pace.repeatGap(AGAIN, 2), 0);
  check('a struggle comes back once, later', pace.repeatGap(HARD, 0), 6);
  check('not twice', pace.repeatGap(HARD, 1), 0);
  check('good and easy never repeat', [pace.repeatGap(GOOD, 0), pace.repeatGap(EASY, 0)], [0, 0]);
});

section('storage pace log', () => {
  // Node has no localStorage, so storage falls back to memory and warns once.
  const warn = console.warn;
  console.warn = () => {};
  const name = '페이스테스터';
  storage.getOrCreateUser(name);
  const entry = (rating, mode, ratio, ok, hints) => storage.logReview(
    name, 'set.csv', '요 3:16', rating, 100, { mode, seconds: ratio * 10, ratio, ok, hints });
  entry(3, pace.MODE_DICTATION, 1.0, true, 0);
  entry(3, pace.MODE_DICTATION, 1.2, true, 0);
  entry(1, pace.MODE_DICTATION, 4.0, false, 0); // wrong: not a sample of the learner's pace
  entry(3, pace.MODE_DICTATION, 2.0, true, 1); // hinted: not either
  entry(3, pace.MODE_FIND, 0.5, true, 0); // another mode
  storage.logReview(name, 'set.csv', '요 3:16', 3, null); // an old-style entry with no pace
  check('only good, hint-free answers of that mode count, oldest first',
    storage.getPaceRatios(name, pace.MODE_DICTATION), [1.0, 1.2]);
  check('modes are kept apart', storage.getPaceRatios(name, pace.MODE_FIND), [0.5]);
  check('an unseen mode is empty', storage.getPaceRatios(name, pace.MODE_RECITE), []);
  check('limit keeps the latest', storage.getPaceRatios(name, pace.MODE_DICTATION, 1), [1.2]);
  console.warn = warn;
});

// ---------- masking (JS only) ----------

section('mask.maskVerse', () => {
  const verse = '하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열';
  const hiddenOf = (parts) => parts.map((p, i) => (p.hidden ? i : -1)).filter((i) => i >= 0);

  check('full hides nothing', hiddenOf(mask.maskVerse(verse, { mode: 'full' })), []);
  check('head 50% keeps the opening and hides the end',
    hiddenOf(mask.maskVerse(verse, { mode: 'head', ratio: 50 })), [5, 6, 7, 8, 9]);
  check('tail 30% hides the opening',
    hiddenOf(mask.maskVerse(verse, { mode: 'tail', ratio: 30 })), [0, 1, 2]);
  check('random 70% hides seven words',
    hiddenOf(mask.maskVerse(verse, { mode: 'random', ratio: 70, seed: 'a' })).length, 7);
  check('the same seed hides the same words',
    hiddenOf(mask.maskVerse(verse, { mode: 'random', ratio: 50, seed: 'x1' })),
    hiddenOf(mask.maskVerse(verse, { mode: 'random', ratio: 50, seed: 'x1' })));
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f'].map(
    (seed) => hiddenOf(mask.maskVerse(verse, { mode: 'random', ratio: 50, seed })).join());
  check('different seeds hide different words', new Set(seeds).size > 1, true);
  check('words are kept in order and intact',
    mask.maskVerse(verse, { mode: 'random', ratio: 50, seed: 's' }).map((p) => p.text).join(' '), verse);

  ['head', 'tail', 'random'].forEach((mode) => {
    [30, 50, 70].forEach((ratio) => {
      ['한 줄', '두 단어', '세 단어 짜리', verse].forEach((text) => {
        const parts = mask.maskVerse(text, { mode, ratio, seed: 'k' });
        const hidden = parts.filter((p) => p.hidden).length;
        const wanted = parts.length >= 2;
        check(`${mode} ${ratio}% on ${parts.length} words keeps one word visible and hides at least one`,
          wanted ? hidden >= 1 && hidden <= parts.length - 1 : hidden === 0, true);
      });
    });
  });

  check('an empty verse has no words', mask.maskVerse('', { mode: 'head' }), []);
  check('settings are sanitised', mask.normalizeMask({ mode: 'zig', ratio: 12 }), { mode: 'full', ratio: 50 });
  check('valid settings are kept', mask.normalizeMask({ mode: 'tail', ratio: 70 }), { mode: 'tail', ratio: 70 });
});

// ---------- how many verses a session covers (JS only) ----------

section('count (verses per session)', () => {
  check('a plain count is kept', count.normalizeCount(10, 25), 10);
  check('a count from storage may be a string', count.normalizeCount('7', 25), 7);
  check('a fraction is rounded down', count.normalizeCount(7.9, 25), 7);
  check('the whole set is "all"', count.normalizeCount(25, 25), 0);
  check('more than the set is "all" too', count.normalizeCount(40, 13), 0);
  [0, -3, NaN, null, undefined, '', 'abc', Infinity].forEach((raw) => {
    check(`${String(raw)} is "all"`, count.normalizeCount(raw, 25), 0);
  });
  check('without a set size nothing is clamped', count.normalizeCount(500), 500);

  check('"all" sizes the session to the set', count.sessionSize(0, 25), 25);
  check('a chosen count sizes the session', count.sessionSize(10, 25), 10);
  check('a saved count above a smaller set means the whole set', count.sessionSize(20, 13), 13);

  check('minus from "all" drops one verse', count.stepCount(0, 25, -1), 24);
  check('plus on the last verse is "all" again', count.stepCount(24, 25, 1), 0);
  check('plus on "all" stays "all"', count.stepCount(0, 25, 1), 0);
  check('minus stops at one verse', count.stepCount(1, 25, -1), 1);
  check('plus and minus move one verse at a time', [count.stepCount(10, 25, 1), count.stepCount(10, 25, -1)], [11, 9]);
  check('stepping from a saved count that no longer fits starts at the whole set',
    count.stepCount(20, 13, -1), 12);

  for (let total = 1; total <= 30; total++) {
    let up = 1;
    for (let i = 0; i < total + 2; i++) up = count.stepCount(up, total, 1);
    let down = 0;
    for (let i = 0; i < total + 2; i++) down = count.stepCount(down, total, -1);
    check(`a ${total}-verse set steps up to "all" and down to one verse`,
      [up, count.sessionSize(down, total)], [0, 1]);
    [0, 1, 5, 20, 99].forEach((raw) => {
      const size = count.sessionSize(raw, total);
      check(`a session of ${raw || 'all'} over ${total} verses holds 1..${total}`,
        size >= 1 && size <= total, true);
    });
  }

  check('chips offered for 25 verses', count.countPresets(25), [5, 10, 15, 20]);
  check('chips offered for 13 verses', count.countPresets(13), [5, 10]);
  check('chips offered for 10 verses leave out ten itself', count.countPresets(10), [5]);
  check('no chips for a tiny set', count.countPresets(5), []);
  check('no chips for an empty set', count.countPresets(0), []);

  const queue = [7, 3, 9, 1, 5];
  check('the queue is cut after the chosen count', count.limitQueue(queue, 2), [7, 3]);
  check('0 keeps the whole queue', count.limitQueue(queue, 0), queue);
  check('a count above the queue keeps all of it', count.limitQueue(queue, 12), queue);
  count.limitQueue(queue, 2);
  check('the queue is not modified in place', queue, [7, 3, 9, 1, 5]);
});

// ---------- spacing-tolerant dictation grading (JS only) ----------

section('grading.gradeDictation', () => {
  const verse = '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라';
  const score = (typed) => grading.gradeDictation(typed, verse).score;

  check('exact', score(verse), 100);
  check('one word run together', score(verse.replace('아무 것도', '아무것도')), 100);
  check('no spaces at all', score(verse.replace(/ /g, '')), 100);
  check('extra spaces inside words', score(verse.replace('하나님께', '하나님 께')), 100);
  check('punctuation and case are ignored', score(`${verse.replace('말고', '말고,')}.`), 100);
  check('one wrong word', score(verse.replace('다만', '오직')), 93);
  check('a typo inside a word is partial credit', score(verse.replace('하나님께', '하나님깨')) > 90, true);
  check('stopping half way scores about half',
    Math.abs(score(verse.split(' ').slice(0, 8).join(' ')) - 53) <= 1, true);
  check('nothing typed', score(''), 0);
  check('unrelated text', score('전혀 다른 문장입니다'), 0);

  const skipped = grading.gradeDictation(
    verse.replace('다만 ', ''), verse).word_results.filter((w) => w.match === 'missing').length;
  check('a skipped word is reported missing', skipped, 1);
  check('the old positional grader would have failed the same spacing change',
    grading.computeWordMatch(verse.replace('아무 것도', '아무것도'), verse).score < 50, true);

  const started = Date.now();
  const flood = grading.gradeDictation('가'.repeat(200000), verse);
  check('a flood of text is graded quickly and as a miss',
    flood.score === 0 && Date.now() - started < 2000, true);
  check('a correct verse followed by a flood still earns most of the credit',
    grading.gradeDictation(`${verse} ${'나'.repeat(50000)}`, verse).score >= 90, true);

  check('English works too',
    grading.gradeDictation('forgod so loved the world', 'For God so loved the world').score, 100);
  check('same shape as computeWordMatch',
    Object.keys(grading.gradeDictation('가', '가 나')).sort(),
    Object.keys(grading.computeWordMatch('가', '가 나')).sort());
  check('an empty answer is a full score, like computeWordMatch',
    grading.gradeDictation('아무거나', '').score, 100);
});

// ---------- report ----------

console.log('');
if (failures.length) {
  console.error(`${failures.length} of ${checks} checks failed (a ported function disagreeing with the Python reference, or a JS-only helper):\n`);
  failures.slice(0, 20).forEach((f) => console.error(`  ✗ ${f}\n`));
  if (failures.length > 20) console.error(`  … and ${failures.length - 20} more`);
  process.exit(1);
}
console.log(`✓ all ${checks} checks pass — the ports match the Python reference implementation`);
