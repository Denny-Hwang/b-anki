// Verse dictation grading with punctuation tolerance and fuzzy matching.
// Ported from banki/grading.py; data shapes keep the original snake_case keys
// so the two implementations can be compared directly by the fixture tests.

import { pyRound, escapeHtml } from './util.js';

const PUNCT = /[　.,;:!?"'`~\-—–…()[\]{}<>\/\\|·•‘’“”]/g;

function stripPunct(text) {
  return text.replace(PUNCT, '');
}

function normalize(text) {
  let out = (text || '').normalize('NFC');
  out = stripPunct(out);
  out = out.replace(/ /g, '').replace(/　/g, '');
  return out.toLowerCase();
}

function splitWords(text) {
  const out = stripPunct((text || '').normalize('NFC'));
  return out.split(/\s+/).filter(Boolean);
}

function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1);
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const an = normalize(a);
  const bn = normalize(b);
  if (!an && !bn) return 1.0;
  if (!an || !bn) return 0.0;
  return 1 - levenshtein(an, bn) / Math.max(an.length, bn.length);
}

/**
 * Compare user input with the answer text word by word.
 *
 * A word counts as matched when it normalizes to the same string, and as a
 * partial match when its similarity clears `fuzzyThreshold`.
 */
export function computeWordMatch(userText, answerText, fuzzyThreshold = 0.6) {
  return matchWords(splitWords(answerText), splitWords(userText), fuzzyThreshold);
}

/**
 * The word-by-word comparison itself. `userWords` is positional: a '' entry
 * means the learner has nothing at that position (computeWordMatch never
 * produces one, gradeDictation does).
 */
function matchWords(answerWords, userWords, fuzzyThreshold = 0.6) {
  if (!answerWords.length) {
    return {
      score: 100,
      total_words: 0,
      matched_words: 0,
      partial_words: 0,
      answer_words: [],
      user_words: [],
      word_results: [],
    };
  }

  let matched = 0;
  let partial = 0;
  const wordResults = [];

  answerWords.forEach((aw, i) => {
    if (i < userWords.length && userWords[i] !== '') {
      const uw = userWords[i];
      const sim = similarity(uw, aw);
      if (sim === 1.0) {
        matched++;
        wordResults.push({ answer: aw, user: uw, match: 'full', similarity: sim });
      } else if (sim >= fuzzyThreshold) {
        partial++;
        wordResults.push({ answer: aw, user: uw, match: 'partial', similarity: sim });
      } else {
        wordResults.push({ answer: aw, user: uw, match: 'miss', similarity: sim });
      }
    } else {
      wordResults.push({ answer: aw, user: '', match: 'missing', similarity: 0.0 });
    }
  });

  for (let i = answerWords.length; i < userWords.length; i++) {
    wordResults.push({ answer: '', user: userWords[i], match: 'extra', similarity: 0.0 });
  }

  const rawScore = ((matched + partial * 0.6) / answerWords.length) * 100;
  const score = Math.max(0, Math.min(100, pyRound(rawScore)));

  return {
    score,
    total_words: answerWords.length,
    matched_words: matched,
    partial_words: partial,
    answer_words: answerWords,
    user_words: userWords,
    word_results: wordResults,
  };
}

/**
 * Cut the learner's text into the answer's words, whatever spacing they typed.
 *
 * The typed characters are lined up with the answer's characters (the same
 * edit-distance path Levenshtein walks), and each answer word takes the typed
 * characters that line up with it. A learner who writes 도와주리라 for
 * "도와 주리라" — or the other way round — is then compared word for word
 * instead of having every later word shifted out of place. Returns one entry
 * per answer word; '' where the learner wrote nothing for it.
 */
export function alignToAnswer(userText, answerText) {
  const answerWords = splitWords(answerText);
  const typed = Array.from(stripPunct((userText || '').normalize('NFC')).replace(/\s+/g, ''));
  const target = Array.from(answerWords.join(''));
  if (!answerWords.length || !typed.length) return answerWords.map(() => '');

  const n = typed.length;
  const m = target.length;
  const width = m + 1;
  const same = (i, j) => typed[i].toLowerCase() === target[j].toLowerCase();

  const cost = new Uint16Array((n + 1) * width);
  for (let j = 0; j <= m; j++) cost[j] = j;
  for (let i = 1; i <= n; i++) {
    cost[i * width] = i;
    for (let j = 1; j <= m; j++) {
      cost[i * width + j] = Math.min(
        cost[(i - 1) * width + (j - 1)] + (same(i - 1, j - 1) ? 0 : 1),
        cost[(i - 1) * width + j] + 1, // a typed character the answer does not have
        cost[i * width + (j - 1)] + 1, // an answer character the learner skipped
      );
    }
  }

  // Walk the path back from the end. cut[j] ends up as how many typed
  // characters had been used when the first j answer characters were done.
  const cut = new Array(m + 1).fill(0);
  let i = n;
  let j = m;
  cut[m] = n;
  while (i > 0 || j > 0) {
    cut[j] = i;
    const here = cost[i * width + j];
    // On a tie, prefer an exact match, then skipping answer characters from the
    // end: text that is wrong or short lines up with the start of the verse.
    if (i > 0 && j > 0 && same(i - 1, j - 1) && here === cost[(i - 1) * width + (j - 1)]) {
      i--;
      j--;
    } else if (j > 0 && here === cost[i * width + (j - 1)] + 1) {
      j--;
    } else if (i > 0 && here === cost[(i - 1) * width + j] + 1) {
      i--;
    } else {
      i--;
      j--;
    }
  }
  cut[j] = i;
  cut[m] = n; // anything typed after the last answer character stays with the last word

  const words = [];
  let end = 0;
  answerWords.forEach((word) => {
    const start = end;
    end += Array.from(word).length;
    words.push(typed.slice(cut[start], cut[end]).join(''));
  });
  return words;
}

/**
 * Dictation score that ignores how the learner spaced the verse.
 *
 * The 개역개정 prints some words apart that people run together (아무 것도,
 * 도와 주리라, 새 것이) and the reverse; positional word matching would score
 * the rest of the verse as wrong after the first such word. Same result shape
 * as computeWordMatch, so renderWordComparison works on it unchanged.
 */
export function gradeDictation(userText, answerText, fuzzyThreshold = 0.6) {
  return matchWords(splitWords(answerText), alignToAnswer(userText, answerText), fuzzyThreshold);
}

/** Word-by-word comparison markup, colour-coded by match kind. */
export function renderWordComparison(result) {
  return result.word_results
    .map((wr) => {
      const answer = escapeHtml(wr.answer);
      const user = escapeHtml(wr.user);
      switch (wr.match) {
        case 'full':
          return `<span class="w-full">${answer}</span>`;
        case 'partial':
          return `<span class="w-partial" title="유사도 ${Math.round(wr.similarity * 100)}%">${user} → ${answer}</span>`;
        case 'missing':
          return `<span class="w-missing">${answer}</span>`;
        case 'extra':
          return `<span class="w-extra"><s>${user}</s></span>`;
        default:
          return `<span class="w-miss"><s>${user}</s> → ${answer}</span>`;
      }
    })
    .join(' ');
}
