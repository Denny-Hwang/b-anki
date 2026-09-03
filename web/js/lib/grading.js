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
  const answerWords = splitWords(answerText);
  const userWords = splitWords(userText);

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
    if (i < userWords.length) {
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
