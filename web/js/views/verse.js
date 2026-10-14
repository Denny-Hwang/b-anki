// Theme 1 — verse memorization: 학습 (read / hide / recall), 암송, 받아쓰기.

import {
  html, raw, esc, appbar, progress, segmented, toggle, toast,
  scoreClass, readInput, celebrate, wireListFilter,
} from '../ui.js';
import * as router from '../router.js';
import * as storage from '../lib/storage.js';
import * as srs from '../lib/srs.js';
import * as grading from '../lib/grading.js';
import * as hints from '../lib/hints.js';
import * as reference from '../lib/reference.js';
import * as pace from '../lib/pace.js';
import * as mask from '../lib/mask.js';
import * as audio from '../lib/audio.js';
import * as datasets from '../lib/datasets.js';
import { verseCertificate } from '../lib/certificate.js';
import { shuffleSpread, todayISO } from '../lib/util.js';
import { statsPanel, hardCardsPanel } from './stats.js';

const VERSIONS = { 개역개정: 'verse_krv', NIV: 'verse_niv' };
const BOTH = '둘 다';
const MAX_HINT = 4;
const OPTS_KEY = 'verseOpts';
const RATING_EMOJI = { [srs.AGAIN]: '🔁', [srs.HARD]: '😅', [srs.GOOD]: '🙂', [srs.EASY]: '🎉' };

const state = {};

// How long a card has been looked at. Time spent in another tab does not count.
const clock = new pace.Stopwatch();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clock.pause();
  else clock.resume();
});

/** Setup switches that should survive a reload, so they are not re-flipped every visit. */
function savedOpts() {
  const saved = storage.getPrefs()[OPTS_KEY] || {};
  const masking = mask.normalizeMask({ mode: saved.maskMode, ratio: saved.maskRatio });
  return {
    shuffle: saved.shuffle === true,
    useSrs: saved.useSrs !== false,
    autoRate: saved.autoRate !== false,
    maskMode: masking.mode,
    maskRatio: masking.ratio,
  };
}

function saveOpts() {
  storage.setPref(OPTS_KEY, {
    shuffle: state.shuffle,
    useSrs: state.useSrs,
    autoRate: state.autoRate,
    maskMode: state.maskMode,
    maskRatio: state.maskRatio,
  });
}

function reset() {
  Object.assign(state, {
    stage: 'setup',
    loading: true,
    error: '',
    files: [],
    file: '',
    version: '개역개정',
    readVersion: '개역개정',
    readSearch: '',
    focusOnly: false,
    hasSession: false,
    appMode: '학습',
    testMode: '암송',
    userName: storage.getPrefs().lastUser || '',
    ...savedOpts(),
    rows: [],
    verseCol: 'verse_krv',
    order: [],
    cursor: 0,
    completed: new Set(),
    skipped: new Set(),
    history: [],
    results: {},
    hintLevel: 0,
    hintsUsed: 0,
    attempt: null,
    repeats: {},
    reviewed: new Set(),
    maskNonce: '',
    learnPhase: 'reading',
    submitted: false,
    shown: false,
    draft: '',
    lastAnswer: '',
    allDone: false,
    celebrated: false,
    sessionId: null,
    sessionEnded: false,
  });
}

// ---------- session lifecycle ----------

/**
 * Build the queue and enter the run screen.
 *
 * `startIndex` is the verse the learner picked while reading: the session then
 * runs in CSV order from there to the end, or over that one verse alone when
 * 고른 구절만 is on. Picking a starting point beats the SRS/shuffle ordering —
 * the learner just said which verse they want.
 */
function startSession({ startIndex = null } = {}) {
  const indices = state.rows.map((_, i) => i);
  let order = indices;

  if (startIndex !== null) {
    order = state.focusOnly ? [startIndex] : indices.slice(startIndex);
  } else {
    // Shuffle before the SRS sort: the sort is stable, so cards that tie on
    // priority (every card, the first time through) keep the shuffled order
    // instead of falling back to the CSV order.
    const pool = state.shuffle ? shuffleSpread([...indices]) : indices;
    if (state.useSrs && state.userName) {
      const locations = state.rows.map((r) => r.location);
      const saved = storage.loadCardStates(state.userName, state.file, locations);
      const cardStates = {};
      indices.forEach((i) => { cardStates[i] = saved[locations[i]] || srs.newCardState(); });
      order = srs.sortForSession(cardStates, pool, todayISO(), { keepOrder: state.shuffle });
    } else {
      order = pool;
    }
  }

  state.order = order;
  state.cursor = 0;
  state.completed = new Set();
  state.skipped = new Set();
  state.history = [];
  state.results = {};
  state.repeats = {};
  state.reviewed = new Set();
  state.allDone = false;
  state.sessionEnded = false;
  state.celebrated = false;
  state.hasSession = true;
  state.startedAt = Date.now();
  resetCardUi();

  if (state.userName) {
    const mode = state.appMode === '학습' ? '학습' : `테스트-${state.testMode}`;
    state.sessionId = storage.startSession(state.userName, state.file, mode);
  } else {
    state.sessionId = null;
  }
  state.stage = 'run';
}

function currentCard() {
  const index = state.order[state.cursor];
  const row = state.rows[index];
  return {
    index,
    row,
    location: row.location,
    topic: (row.topic || '').trim(),
    text: row[state.verseCol],
  };
}

function advanceCursor() {
  while (state.cursor < state.order.length && state.completed.has(state.order[state.cursor])) {
    state.cursor++;
  }
}

/** SRS ratings only exist when progress is being saved. */
function srsActive() {
  return state.useSrs && !!state.userName;
}

/** Response-time data for the review log, or null outside the test modes. */
function paceLog(attempt, rating) {
  if (!attempt || state.appMode === '학습') return null;
  // A recitation rated by hand has no accuracy of its own: take it from the rating.
  const accuracy = attempt.accuracy
    || (rating >= srs.GOOD ? 'solid' : rating === srs.HARD ? 'weak' : 'fail');
  return {
    mode: state.testMode,
    seconds: Math.round(attempt.ms / 100) / 10,
    ratio: Math.round(attempt.ratio * 100) / 100,
    ok: accuracy === 'solid' || accuracy === 'okay',
    hints: attempt.hints,
  };
}

/**
 * Send the card just finished back into the queue a few cards later, so a
 * miss or a struggle comes round again in the same sitting. Expects the cursor
 * to have moved past the card already.
 */
function requeue(index, rating) {
  if (!srsActive()) return false;
  const gap = pace.repeatGap(rating, state.repeats[index] || 0);
  const at = state.order.lastIndexOf(index);
  if (!gap || at < 0 || at >= state.cursor) return false;

  state.repeats[index] = (state.repeats[index] || 0) + 1;
  state.completed.delete(index);
  state.order.splice(at, 1);
  state.cursor -= 1; // everything after the removed card moved up one place
  state.order.splice(Math.min(state.order.length, state.cursor + gap), 0, index);
  return true;
}

function recordCompletion(score, rating) {
  const { index, location } = currentCard();
  const attempt = state.attempt;
  // The second time round is practice: it must not count as another successful
  // review, or one sitting would push the card's interval out twice.
  const practice = state.reviewed.has(index);

  state.history.push(index);
  state.completed.add(index);
  state.skipped.delete(index);
  state.results[location] = score === null
    ? { completed: true, rating }
    : { completed: true, rating, score };

  if (state.userName && !practice) {
    state.reviewed.add(index);
    const previous = storage.getCardState(state.userName, state.file, location)
      || srs.newCardState();
    storage.saveCardState(state.userName, state.file, location,
      srs.review(previous, rating, todayISO()));
    storage.logReview(state.userName, state.file, location, rating, score,
      paceLog(attempt, rating));
  }

  state.cursor++;
  if (requeue(index, rating)) {
    toast(rating === srs.AGAIN
      ? '🔁 잠시 뒤에 이 구절을 다시 연습합니다'
      : '🔁 어려웠던 구절이라 조금 뒤에 한 번 더 나옵니다');
  }
  resetCardUi();
}

function resetCardUi() {
  state.hintLevel = 0;
  state.hintsUsed = 0;
  state.attempt = null;
  state.learnPhase = 'reading';
  state.submitted = false;
  state.draft = '';
  state.shown = false;
  // A fresh mask each time a card comes up, but stable while it is on screen.
  state.maskNonce = Math.random().toString(36).slice(2, 8);
  clock.reset();
}

/**
 * Freeze the first try at a card: how long it took and whether hints were
 * used. Later tries (다시 도전) do not change what the rating is based on.
 */
function captureAttempt({ score = null, accuracy = null } = {}) {
  if (state.attempt) return;
  const { text } = currentCard();
  const mode = state.testMode;
  const ms = clock.elapsedMs();
  const ratio = pace.paceRatio(ms / 1000, pace.expectedSeconds(mode, text));
  const baseline = state.userName
    ? pace.paceBaseline(storage.getPaceRatios(state.userName, mode))
    : pace.DEFAULT_BASELINE;
  state.attempt = {
    ms, ratio, score, accuracy, hints: state.hintsUsed, tier: pace.speedTier(ratio, baseline),
  };
}

function skipCurrent() {
  const { index } = currentCard();
  state.history.push(index);
  state.skipped.add(index);
  state.cursor++;
  resetCardUi();
}

function goPrevious() {
  if (!state.history.length) return;
  const previous = state.history.pop();
  state.completed.delete(previous);
  state.skipped.delete(previous);
  state.reviewed.delete(previous);
  const at = state.order.indexOf(previous);
  if (at >= 0 && at < state.cursor) {
    state.cursor = at;
  } else {
    // Not behind the cursor: it was sent back for another go (or is not in
    // this queue). Pull it out of its later slot and show it now.
    if (at >= 0) {
      state.order.splice(at, 1);
      if (state.repeats[previous] > 0) state.repeats[previous] -= 1;
    }
    state.order.splice(state.cursor, 0, previous);
  }
  resetCardUi();
}

function finishSession() {
  if (state.sessionId !== null && !state.sessionEnded) {
    const scores = Object.values(state.results)
      .filter((r) => typeof r.score === 'number').map((r) => r.score);
    const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    storage.endSession(state.userName, state.sessionId,
      Object.keys(state.results).length, average);
    state.sessionEnded = true;
  }
  if (!state.celebrated) {
    state.celebrated = true;
    audio.playSound('complete');
    celebrate();
  }
  state.allDone = true;
}

// ---------- setup screen ----------

function findingMode() {
  return state.appMode !== '학습' && state.testMode === '구절찾기';
}

/** 구절 찾기 only: how much of the verse is shown. */
function maskPanel() {
  const partial = state.maskMode !== 'full';
  const chip = (action, value, label, pressed) => `
    <button class="chip" data-act="${action}" data-value="${esc(value)}"
      aria-pressed="${pressed}">${esc(label)}</button>`;
  return html`
    <div class="card stack stack-sm">
      <div class="field">
        <span class="label">구절 보여주기</span>
        <div class="chips">
          ${mask.MASK_MODES.map((m) => raw(chip('mask-mode', m.value, m.label, m.value === state.maskMode)))}
        </div>
      </div>
      ${partial ? raw(html`
        <div class="field">
          <span class="label">가리는 정도</span>
          <div class="chips">
            ${mask.MASK_RATIOS.map((r) => raw(chip('mask-ratio', r, `${r}%`, r === state.maskRatio)))}
          </div>
        </div>
      `) : ''}
      <p class="hint-text keep-all">
        ${partial
          ? '가려진 칸은 빈 상자로 보이고, 정답을 확인하면 가렸던 부분이 강조됩니다.'
          : '구절 전체를 보고 어느 장절인지 맞힙니다.'}
      </p>
    </div>
  `;
}

function renderSetup() {
  if (state.loading) {
    return html`
      ${raw(appbar({ title: '📖 성경구절 암기' }))}
      <div class="empty">불러오는 중…</div>
    `;
  }
  if (state.error) {
    return html`
      ${raw(appbar({ title: '📖 성경구절 암기' }))}
      <div class="card"><p class="keep-all">${state.error}</p></div>
    `;
  }

  const dueCount = state.userName && storage.hasUser(state.userName)
    ? storage.getDueCount(state.userName, state.file, todayISO())
    : 0;

  return html`
    ${raw(appbar({ title: '📖 성경구절 암기', sub: '학습 · 암송 · 받아쓰기 · 구절 찾기' }))}

    <div class="stack">
      <div class="card stack">
        <div class="field">
          <label class="label" for="verse-file">학습할 구절집</label>
          <select class="select" id="verse-file" data-change="file">
            ${state.files.map((f) => raw(
              `<option value="${esc(f)}"${f === state.file ? ' selected' : ''}>${esc(datasets.prettyName(f))}</option>`,
            ))}
          </select>
        </div>

        <div class="field">
          <label class="label" for="verse-version">성경 버전</label>
          <select class="select" id="verse-version" data-change="version">
            ${Object.keys(VERSIONS).map((v) => raw(
              `<option value="${v}"${v === state.version ? ' selected' : ''}>${v}</option>`,
            ))}
          </select>
        </div>
      </div>

      <div class="stack-sm stack">
        <span class="section-label">모드</span>
        ${raw(segmented('mode', [
          { value: '학습', label: '학습', desc: '구절을 보고 가린 뒤 떠올립니다' },
          { value: '암송', label: '테스트 · 암송', desc: '가려진 구절을 기억해 확인합니다' },
          { value: '받아쓰기', label: '테스트 · 받아쓰기', desc: '직접 입력해 정확도를 채점합니다' },
          { value: '구절찾기', label: '테스트 · 구절 찾기', desc: '구절 내용을 보고 어느 장절인지 맞춥니다' },
        ], state.appMode === '학습' ? '학습' : state.testMode))}
      </div>

      ${findingMode() ? raw(maskPanel()) : ''}

      <div class="card stack">
        <div class="field">
          <label class="label" for="verse-name">이름 (선택 · 진도와 통계 저장용)</label>
          <input class="input" id="verse-name" data-change="name" value="${state.userName}"
            placeholder="이름을 입력하세요" autocomplete="off">
        </div>
        ${dueCount > 0
          ? raw(`<div class="flash flash--info">📅 오늘 복습할 카드 ${dueCount}개</div>`)
          : ''}
        ${raw(toggle('toggle-srs', '간격 반복 학습 (SRS)', state.useSrs,
          '어려웠던 카드는 자주, 쉬운 카드는 드물게 나옵니다'))}
        ${state.useSrs && state.appMode !== '학습'
          ? raw(toggle('toggle-auto', '⏱️ 자동 난이도 (반응 시간)', state.autoRate,
            '정답 여부와 걸린 시간으로 난이도를 자동 평가합니다. 틀리거나 어려웠던 카드는 같은 세션에서 다시 나옵니다'))
          : ''}
        ${raw(toggle('toggle-shuffle', '랜덤 순서', state.shuffle,
          state.useSrs
            ? '구절을 무작위로 섞습니다. 복습할 카드가 먼저 나오고, 같은 순위 안에서는 섞입니다'
            : '구절을 무작위로 섞습니다. 이어지는 구절이 붙어 나오지 않게 흩어 놓습니다'))}
      </div>

      <button class="btn btn--primary btn--block" data-act="start" data-key="space">
        시작하기
      </button>
      <button class="btn btn--block" data-act="read">
        📖 전체 구절 읽어보기
      </button>
      <p class="hint-text keep-all" style="text-align:center">
        읽다가 마음에 남는 구절이 있으면 그 자리에서 바로 암기·테스트로 넘어갈 수 있습니다.
      </p>
    </div>
  `;
}

// ---------- reading screen ----------

/** The verse text(s) a reading row shows, given the reading version. */
function readingTexts(row) {
  const krv = (row.verse_krv || '').trim();
  const niv = (row.verse_niv || '').trim();
  if (state.readVersion === 'NIV') return niv ? [niv] : [krv];
  if (state.readVersion === BOTH) return [krv, niv].filter(Boolean);
  return krv ? [krv] : [niv];
}

function readItem(row, index) {
  const texts = readingTexts(row);
  const topic = (row.topic || '').trim();
  const haystack = [row.location, topic, row.verse_krv, row.verse_niv]
    .filter(Boolean).join(' ').toLowerCase();

  const body = texts
    .map((text, i) => `<p class="readitem__text${i ? ' readitem__text--alt' : ''} keep-all">${esc(text)}</p>`)
    .join('');
  const speak = audio.ttsSupported()
    ? `<button class="btn btn--sm btn--ghost" data-act="read-speak" data-index="${index}">🔊 듣기</button>`
    : '';

  return `
    <article class="readitem" data-search="${esc(haystack)}">
      <div class="readitem__head">
        <span class="readitem__num">${index + 1}</span>
        <div class="readitem__ref">
          <div class="location" style="text-align:left">📍 ${esc(row.location)}</div>
          ${topic ? `<div class="topic" style="text-align:left">${esc(topic)}</div>` : ''}
        </div>
      </div>
      ${body}
      <div class="readitem__acts">
        ${speak}
        <button class="btn btn--sm" data-act="read-jump" data-index="${index}" data-mode="학습">📖 학습</button>
        <button class="btn btn--sm" data-act="read-jump" data-index="${index}" data-mode="암송">🎤 암송</button>
        <button class="btn btn--sm" data-act="read-jump" data-index="${index}" data-mode="받아쓰기">✍️ 받아쓰기</button>
        <button class="btn btn--sm" data-act="read-jump" data-index="${index}" data-mode="구절찾기">🔎 구절 찾기</button>
      </div>
    </article>
  `;
}

function renderRead() {
  const scopeLabel = state.focusOnly
    ? '고른 구절 하나만 학습합니다'
    : '고른 구절부터 마지막 구절까지 이어서 학습합니다';

  return html`
    ${raw(appbar({ title: '📖 성경구절 암기', sub: '읽기', font: true }))}

    <div class="stack">
      <div class="card stack stack-sm">
        <div class="field">
          <label class="label" for="read-search">🔎 구절 찾기</label>
          <input class="input" id="read-search" placeholder="장절 · 주제 · 본문으로 검색"
            autocomplete="off">
        </div>
        <div class="field">
          <span class="label">표시할 성경 버전</span>
          <div class="chips">
            ${['개역개정', 'NIV', BOTH].map((v) => raw(
              `<button class="chip" data-act="read-version" data-value="${esc(v)}"
                aria-pressed="${v === state.readVersion}">${esc(v)}</button>`,
            ))}
          </div>
        </div>
        ${raw(toggle('toggle-focus-only', '고른 구절만 학습', state.focusOnly, scopeLabel))}
      </div>

      ${state.hasSession && !state.allDone
        ? raw('<button class="btn btn--primary btn--block" data-act="resume">▶️ 하던 학습 이어서 하기</button>')
        : ''}

      <p class="meta">전체 ${state.rows.length}구절 · 버튼을 누르면 그 구절부터 바로 시작합니다</p>

      <div class="readlist">
        ${state.rows.map((row, i) => raw(readItem(row, i)))}
      </div>
      <div class="empty" id="read-search-empty" hidden>검색 결과가 없습니다</div>

      <button class="btn btn--block" data-act="back-setup">🔙 설정으로 돌아가기</button>
    </div>
  `;
}

// ---------- run screen ----------

function hintOrHidden(idleMessage) {
  if (state.hintLevel > 0) {
    const { text } = currentCard();
    return html`<div class="hintbox keep-all">${hints.verseHint(text, state.hintLevel - 1)}</div>`;
  }
  return html`<div class="verse verse--muted keep-all">${idleMessage}</div>`;
}

function scoreBlock(result) {
  const partial = result.partial_words
    ? ` + 부분일치 ${result.partial_words}개`
    : '';
  return html`
    <div class="score ${scoreClass(result.score)}" aria-live="polite">${result.score}%</div>
    <p class="meta" style="text-align:center">
      ${result.matched_words} / ${result.total_words} 단어 일치${partial}
    </p>
    <div class="diff keep-all">${raw(grading.renderWordComparison(result))}</div>
  `;
}

function speakButton() {
  if (!audio.ttsSupported()) return '';
  return html`
    <div class="row" style="justify-content:center">
      <button class="btn btn--sm btn--ghost" data-act="speak">🔊 구절 듣기</button>
      <button class="btn btn--sm btn--ghost" data-act="stop-speak">⏹️ 정지</button>
    </div>
  `;
}

function navButtons({ extra = '' } = {}) {
  // The list shows every verse in full, so it stays out of the test modes —
  // there it would just be the answer sheet.
  const backToList = state.appMode === '학습'
    ? '<button class="btn btn--sm btn--ghost" data-act="to-read">📖 목록</button>'
    : '';
  return html`
    <div class="row">
      ${state.history.length
        ? raw('<button class="btn btn--sm btn--ghost" data-act="prev" data-key="prev">⬅️ 이전</button>')
        : ''}
      <button class="btn btn--sm btn--ghost" data-act="skip" data-key="skip">⏭️ 건너뛰기</button>
      ${raw(extra)}
      ${raw(backToList)}
    </div>
  `;
}

/** "⏱️ 14초 · 빠름" — what the automatic rating was based on. */
function timeLine(attempt, currentScore = null) {
  const parts = [`⏱️ ${pace.formatSeconds(attempt.ms / 1000)} · ${pace.TIER_LABELS[attempt.tier]}`];
  if (attempt.hints) parts.push(`힌트 ${attempt.hints}회`);
  if (attempt.score !== null && currentScore !== null && attempt.score !== currentScore) {
    parts.push(`자동 평가는 첫 시도(${attempt.score}%) 기준`);
  }
  return parts.join(' · ');
}

/** The four manual ratings. Shortcut keys only on the primary copy of the row. */
function manualRatingButtons(score, { keys = true } = {}) {
  const buttons = [
    [srs.AGAIN, '🔁 다시', 'again', 'again'],
    [srs.HARD, '😅 어려움', 'hard', ''],
    [srs.GOOD, '🙂 괜찮음', 'good', 'next'],
    [srs.EASY, '🎉 쉬움', 'easy', ''],
  ];
  return html`
    <div class="grid-4">
      ${buttons.map(([rating, label, tone, key]) => raw(
        `<button class="btn btn--${tone} btn--wordy" data-act="rate" data-rating="${rating}"
          data-score="${score === null ? '' : score}"${keys && key ? ` data-key="${key}"` : ''}>${label}</button>`,
      ))}
    </div>
  `;
}

function manualRatingDetails(score) {
  return html`
    <details class="accordion">
      <summary>난이도 직접 고르기</summary>
      <div class="accordion__body">${raw(manualRatingButtons(score, { keys: false }))}</div>
    </details>
  `;
}

function ratingRow(score) {
  if (!srsActive()) {
    return html`
      <button class="btn btn--primary btn--block" data-act="done" data-key="next"
        data-score="${score === null ? '' : score}">
        ${score === null ? '✅ 완료' : '➡️ 다음'}
      </button>
    `;
  }

  const attempt = state.attempt;
  if (state.autoRate && attempt && attempt.accuracy) {
    const rating = pace.autoRating({
      accuracy: attempt.accuracy, tier: attempt.tier, hints: attempt.hints,
    });
    return html`
      <p class="meta" style="text-align:center">${timeLine(attempt, score)}</p>
      <button class="btn btn--primary btn--block" data-act="rate" data-rating="${rating}"
        data-score="${score === null ? '' : score}" data-key="next">
        ➡️ 다음 · 자동 평가 ${RATING_EMOJI[rating]} ${srs.RATING_LABELS[rating]}
      </button>
      ${raw(manualRatingDetails(score))}
    `;
  }

  return html`
    <p class="meta" style="text-align:center">난이도를 고르면 다음 복습 일정이 조정됩니다</p>
    ${raw(manualRatingButtons(score))}
  `;
}

/**
 * Recitation has no answer to grade, so the learner says how it went and the
 * clock decides the rest: only a clean recitation is rated on speed.
 */
function reciteReport() {
  const attempt = state.attempt;
  const ifClean = attempt
    ? pace.autoRating({ accuracy: 'solid', tier: attempt.tier, hints: attempt.hints })
    : srs.GOOD;
  return html`
    <p class="meta" style="text-align:center">
      ${attempt ? `${timeLine(attempt)} · ` : ''}막힘없이 외웠다면 ${RATING_EMOJI[ifClean]} ${srs.RATING_LABELS[ifClean]}으로 기록돼요
    </p>
    <button class="btn btn--primary btn--block" data-act="self-report" data-report="perfect"
      data-key="next">✅ 막힘없이 외웠어요</button>
    <div class="grid-2">
      <button class="btn btn--hard" data-act="self-report" data-report="shaky">🤔 조금 막혔어요</button>
      <button class="btn btn--again" data-act="self-report" data-report="forgot"
        data-key="again">❌ 기억 안 났어요</button>
    </div>
    ${raw(manualRatingDetails(null))}
  `;
}

function renderLearning(card) {
  if (state.learnPhase === 'reading') {
    return html`
      <div class="verse keep-all">${card.text}</div>
      ${raw(speakButton())}
      <div class="grid-2">
        <button class="btn" data-act="hide" data-key="space">🙈 가리기</button>
        <button class="btn btn--primary" data-act="done" data-rating="${srs.GOOD}" data-key="next">
          ✅ 학습완료
        </button>
      </div>
      ${raw(navButtons())}
    `;
  }

  if (state.learnPhase === 'hidden') {
    return html`
      ${raw(hintOrHidden('🤔 구절을 떠올려 보세요'))}
      <div class="grid-2">
        <button class="btn" data-act="hint" data-key="hint">💡 힌트</button>
        <button class="btn" data-act="reveal">👀 구절 확인</button>
      </div>
      <hr class="hr">
      <label class="label" for="verse-input">✍️ 기억나는 대로 입력해 확인해 보세요 (선택)</label>
      <textarea class="textarea" id="verse-input" placeholder="기억나는 대로 입력하세요…"></textarea>
      <div class="grid-2">
        <button class="btn" data-act="check" data-key="space">✍️ 확인하기</button>
        <button class="btn btn--primary" data-act="done" data-rating="${srs.GOOD}" data-key="next">
          ✅ 학습완료
        </button>
      </div>
      ${raw(navButtons())}
    `;
  }

  const result = grading.gradeDictation(state.lastAnswer, card.text);
  return html`
    ${raw(scoreBlock(result))}
    <span class="section-label">정답</span>
    <div class="verse keep-all">${card.text}</div>
    ${raw(speakButton())}
    <div class="grid-3">
      <button class="btn" data-act="retry-learn" data-key="again">🔄 다시 연습</button>
      <button class="btn" data-act="reveal">👀 다시 읽기</button>
      <button class="btn btn--primary" data-act="done" data-score="${result.score}" data-key="next">
        ✅ 학습완료
      </button>
    </div>
    ${raw(navButtons())}
  `;
}

function renderRecitation(card) {
  if (!state.shown) {
    return html`
      ${raw(hintOrHidden('👇 아래 버튼을 눌러 구절을 확인하세요'))}
      <div class="grid-2">
        <button class="btn" data-act="hint" data-key="hint">💡 힌트</button>
        <button class="btn btn--primary" data-act="reveal-recite" data-key="space">구절 확인</button>
      </div>
      ${raw(navButtons())}
    `;
  }

  return html`
    <div class="verse keep-all">${card.text}</div>
    ${raw(speakButton())}
    ${raw(srsActive() && state.autoRate ? reciteReport() : ratingRow(null))}
    ${raw(navButtons({
      extra: '<button class="btn btn--sm btn--ghost" data-act="hide-recite">🔄 다시보기</button>',
    }))}
  `;
}

function renderDictation(card) {
  if (!state.submitted) {
    return html`
      ${raw(hintOrHidden('✍️ 아래에 기억나는 구절을 입력하세요'))}
      <textarea class="textarea" id="verse-input" placeholder="기억나는 대로 구절을 입력하세요…"
        style="min-height:150px"></textarea>
      <div class="grid-2">
        <button class="btn" data-act="hint" data-key="hint">💡 힌트</button>
        <button class="btn btn--primary" data-act="submit" data-key="space">제출</button>
      </div>
      ${raw(navButtons())}
    `;
  }

  const result = grading.gradeDictation(state.lastAnswer, card.text);
  return html`
    ${raw(scoreBlock(result))}
    <span class="section-label">정답</span>
    <div class="verse keep-all">${card.text}</div>
    ${raw(speakButton())}
    ${raw(ratingRow(result.score))}
    ${raw(navButtons({
      extra: '<button class="btn btn--sm btn--ghost" data-act="retry-dictation">🔄 다시 도전</button>',
    }))}
  `;
}

/** The words of a verse, with hidden ones as blank boxes — or highlighted once revealed. */
function verseBody(parts, reveal) {
  return parts.map((part) => {
    if (!part.hidden) return esc(part.text);
    if (reveal) return `<mark class="was-hidden">${esc(part.text)}</mark>`;
    const width = (Array.from(part.text).length * 0.95).toFixed(2);
    return `<span class="mask" role="img" aria-label="가려진 단어" style="width:${width}em"></span>`;
  }).join(' ');
}

/** Reverse test: the verse is shown, the learner names where it comes from. */
function renderFind(card) {
  const parts = mask.maskVerse(card.text, {
    mode: state.maskMode, ratio: state.maskRatio, seed: `${state.maskNonce}:${card.index}`,
  });
  const masked = mask.isMasked(parts);
  const verse = (reveal) => html`
    <div class="verse keep-all"><div class="verse__body">${raw(verseBody(parts, reveal))}</div></div>
  `;
  if (!state.submitted) {
    const hint = state.hintLevel > 0
      ? html`<div class="hintbox keep-all">${reference.referenceHint(card.location, state.hintLevel - 1, card.topic)}</div>`
      : '';
    return html`
      ${raw(verse(false))}
      ${masked ? '' : raw(speakButton())}
      ${raw(hint)}
      <label class="label" for="verse-input">🔎 이 구절은 어디에 나올까요? (예: 로마서 12:1)</label>
      <input class="input" id="verse-input" placeholder="책 이름 장:절" autocomplete="off">
      <div class="grid-2">
        <button class="btn" data-act="hint" data-key="hint">💡 힌트</button>
        <button class="btn btn--primary" data-act="submit" data-key="space">제출</button>
      </div>
      ${raw(navButtons())}
    `;
  }

  const result = reference.gradeReference(state.lastAnswer, card.location);
  const verdict = result.score === 100
    ? '✅ 정답입니다!'
    : result.score === 50
      ? '⚠️ 책과 장은 맞았어요. 절을 다시 확인해 보세요'
      : '❌ 아쉽네요';
  return html`
    <div class="score ${scoreClass(result.score)}" aria-live="polite">${verdict}</div>
    <p class="meta" style="text-align:center">
      내 답: ${state.lastAnswer || '(입력 없음)'}
    </p>
    <span class="section-label">정답</span>
    <div class="location">📍 ${card.location}</div>
    ${raw(verse(true))}
    ${raw(speakButton())}
    ${raw(ratingRow(result.score))}
    ${raw(navButtons({
      extra: '<button class="btn btn--sm btn--ghost" data-act="retry-dictation">🔄 다시 도전</button>',
    }))}
  `;
}

function renderQueueEnd() {
  const remaining = [...state.skipped].filter((i) => !state.completed.has(i));
  if (!remaining.length) {
    finishSession();
    return renderDone();
  }
  return html`
    ${raw(appbar({ title: '📖 성경구절 암기', font: true }))}
    <div class="card stack">
      <p class="keep-all">건너뛴 구절이 ${remaining.length}개 있습니다.</p>
      <div class="grid-2">
        <button class="btn" data-act="retry-skipped">건너뛴 구절 다시 학습</button>
        <button class="btn btn--primary" data-act="finish" data-key="next">그냥 완료하기</button>
      </div>
    </div>
  `;
}

function renderDone() {
  // The session's own queue, not the whole file — a 읽기 jump can start
  // partway through, or hold a single verse.
  const total = state.order.length;
  const detail = Object.entries(state.results).filter(([, r]) => typeof r.score === 'number');

  return html`
    ${raw(appbar({ title: '📖 성경구절 암기' }))}
    <div class="stack">
      ${raw(verseCertificate({
        name: state.userName,
        results: state.results,
        total,
        setLabel: datasets.prettyName(state.file),
      }))}

      ${detail.length ? raw(html`
        <details class="accordion">
          <summary>구절별 상세 결과 ${detail.length}개</summary>
          <div class="accordion__body">
            <ul class="list">
              ${detail.map(([location, r]) => raw(
                `<li>${r.score >= 80 ? '✅' : r.score >= 50 ? '⚠️' : '❌'} <b>${esc(location)}</b> — ${r.score}%</li>`,
              ))}
            </ul>
          </div>
        </details>
      `) : ''}

      ${state.userName ? raw(html`
        <details class="accordion">
          <summary>📊 내 학습 통계</summary>
          <div class="accordion__body stack">
            ${raw(statsPanel(state.userName))}
            ${raw(hardCardsPanel(state.userName, state.file))}
          </div>
        </details>
      `) : ''}

      <div class="grid-3">
        <button class="btn" data-act="restart">🔄 다시 학습</button>
        <button class="btn" data-act="to-read">📖 구절 읽기</button>
        <button class="btn btn--primary" data-act="home" data-key="next">🏠 처음으로</button>
      </div>
    </div>
  `;
}

function renderRun() {
  if (state.allDone) return renderDone();

  advanceCursor();
  if (state.cursor >= state.order.length) return renderQueueEnd();

  const card = currentCard();
  const total = state.order.length;
  const done = state.completed.size;
  const finding = state.appMode !== '학습' && state.testMode === '구절찾기';
  const modeLabel = state.appMode === '학습'
    ? '학습'
    : `테스트 · ${finding ? '구절 찾기' : state.testMode}`;

  let body;
  if (state.appMode === '학습') body = renderLearning(card);
  else if (finding) body = renderFind(card);
  else if (state.testMode === '암송') body = renderRecitation(card);
  else body = renderDictation(card);

  return html`
    ${raw(appbar({ title: '📖 성경구절 암기', sub: modeLabel, font: true }))}
    <div class="stack">
      ${raw(progress(done, total))}
      <p class="meta">진행 ${done} / ${total}</p>
      ${finding ? '' : raw(`
        <div class="stack stack-xs">
          ${card.topic ? `<div class="topic">${esc(card.topic)}</div>` : ''}
          <div class="location">📍 ${esc(card.location)}</div>
        </div>
      `)}
      ${raw(body)}
    </div>
  `;
}

// ---------- view ----------

export default {
  name: 'verse',

  enter() {
    reset();
    datasets.loadManifest()
      .then((manifest) => {
        state.files = manifest.verse || [];
        state.file = state.files[0] || '';
        state.loading = false;
        if (!state.files.length) state.error = '구절집 CSV를 찾지 못했습니다.';
        router.rerender();
      })
      .catch((err) => {
        state.loading = false;
        state.error = err.message;
        router.rerender();
      });
  },

  render() {
    if (state.stage === 'setup') return renderSetup();
    if (state.stage === 'read') return renderRead();
    return renderRun();
  },

  afterRender() {
    const input = document.getElementById('verse-input');
    if (input) {
      input.value = state.draft;
      input.focus();
    }
    const search = document.getElementById('read-search');
    if (search) {
      search.value = state.readSearch;
      wireListFilter('read-search', '.readitem', (query) => { state.readSearch = query; });
    }
  },

  onChange(action, el) {
    if (action === 'file') state.file = el.value;
    else if (action === 'version') state.version = el.value;
    else if (action === 'name') {
      state.userName = el.value.trim();
      if (state.userName) storage.setPref('lastUser', state.userName);
    }
    router.rerender();
  },

  onAction(action, el) {
    const card = state.stage === 'run' && !state.allDone
      && state.cursor < state.order.length ? currentCard() : null;

    switch (action) {
      case 'mode':
        if (el.dataset.value === '학습') {
          state.appMode = '학습';
        } else {
          state.appMode = '테스트';
          state.testMode = el.dataset.value;
        }
        break;

      case 'toggle-srs':
        state.useSrs = !state.useSrs;
        saveOpts();
        break;

      case 'toggle-auto':
        state.autoRate = !state.autoRate;
        saveOpts();
        break;

      case 'toggle-shuffle':
        state.shuffle = !state.shuffle;
        saveOpts();
        break;

      case 'mask-mode':
        state.maskMode = mask.normalizeMask({ mode: el.dataset.value }).mode;
        saveOpts();
        break;

      case 'mask-ratio':
        state.maskRatio = mask.normalizeMask({ ratio: Number(el.dataset.value) }).ratio;
        saveOpts();
        break;

      case 'start':
      case 'read': {
        const wantsReading = action === 'read';
        state.verseCol = VERSIONS[state.version];
        datasets.loadVerses(state.file)
          .then((rows) => {
            if (!rows.length || !(state.verseCol in rows[0])) {
              toast(`이 파일에는 '${state.verseCol}' 열이 없습니다`);
              return;
            }
            state.rows = rows;
            if (state.userName) storage.getOrCreateUser(state.userName);
            if (wantsReading) {
              state.readVersion = state.version;
              state.readSearch = '';
              state.hasSession = false;
              state.stage = 'read';
            } else {
              startSession();
            }
            router.rerender();
          })
          .catch((err) => toast(err.message));
        return;
      }

      case 'read-version':
        state.readVersion = el.dataset.value;
        break;

      case 'toggle-focus-only':
        state.focusOnly = !state.focusOnly;
        break;

      case 'read-speak': {
        const row = state.rows[Number(el.dataset.index)];
        if (!row) return;
        const useNiv = state.readVersion === 'NIV' && row.verse_niv;
        audio.speak(useNiv ? row.verse_niv : row.verse_krv, useNiv ? 'en-US' : 'ko-KR');
        return;
      }

      // Jump straight from the verse being read into memorizing that verse.
      case 'read-jump': {
        const mode = el.dataset.mode;
        if (mode === '학습') {
          state.appMode = '학습';
        } else {
          state.appMode = '테스트';
          state.testMode = mode;
        }
        // 둘 다 is a reading-only option; memorize the Korean text then.
        state.version = state.readVersion === 'NIV' ? 'NIV' : '개역개정';
        state.verseCol = VERSIONS[state.version];
        startSession({ startIndex: Number(el.dataset.index) });
        break;
      }

      case 'to-read':
        state.stage = 'read';
        break;

      case 'resume':
        state.stage = 'run';
        clock.reset(); // time spent in the list is not time spent on the card
        break;

      case 'back-setup':
        state.stage = 'setup';
        state.hasSession = false;
        break;

      case 'hide':
        state.learnPhase = 'hidden';
        state.hintLevel = 0;
        break;

      case 'reveal':
        state.learnPhase = 'reading';
        state.hintLevel = 0;
        state.draft = '';
        break;

      case 'reveal-recite':
        captureAttempt();
        state.shown = true;
        state.hintLevel = 0;
        break;

      case 'hide-recite':
        state.shown = false;
        state.hintLevel = 0;
        break;

      case 'hint':
        state.draft = readInput('verse-input') || state.draft;
        state.hintLevel = Math.min(MAX_HINT, state.hintLevel + 1);
        state.hintsUsed += 1;
        break;

      case 'check':
        state.lastAnswer = readInput('verse-input');
        state.learnPhase = 'result';
        state.hintLevel = 0;
        break;

      case 'retry-learn':
        state.learnPhase = 'hidden';
        state.draft = '';
        break;

      case 'submit':
        state.lastAnswer = readInput('verse-input');
        state.submitted = true;
        state.hintLevel = 0;
        if (card) {
          const score = state.testMode === '구절찾기'
            ? reference.gradeReference(state.lastAnswer, card.location).score
            : grading.gradeDictation(state.lastAnswer, card.text).score;
          captureAttempt({ score, accuracy: pace.accuracyFromScore(score) });
          if (score >= 80) audio.playSound('success');
          else if (score < 50) audio.playSound('fail');
        }
        break;

      case 'retry-dictation':
        state.submitted = false;
        state.draft = '';
        break;

      case 'speak':
        if (card) audio.speak(card.text, state.version === '개역개정' ? 'ko-KR' : 'en-US');
        return;

      case 'stop-speak':
        audio.stopSpeaking();
        return;

      case 'rate':
        recordCompletion(
          el.dataset.score === '' ? null : Number(el.dataset.score),
          Number(el.dataset.rating),
        );
        break;

      // Recitation: the learner reports how it went, the clock refines a clean one.
      case 'self-report': {
        const accuracy = pace.SELF_REPORT[el.dataset.report];
        if (!accuracy || !state.attempt) return;
        state.attempt.accuracy = accuracy;
        recordCompletion(null, pace.autoRating({
          accuracy, tier: state.attempt.tier, hints: state.attempt.hints,
        }));
        break;
      }

      case 'done': {
        const score = el.dataset.score === '' || el.dataset.score === undefined
          ? null : Number(el.dataset.score);
        const rating = el.dataset.rating
          ? Number(el.dataset.rating)
          : (score === null ? srs.GOOD : srs.ratingFromScore(score));
        recordCompletion(score, rating);
        break;
      }

      case 'skip':
        skipCurrent();
        break;

      case 'prev':
        goPrevious();
        break;

      case 'retry-skipped': {
        const remaining = [...state.skipped].filter((i) => !state.completed.has(i));
        state.order = state.shuffle ? shuffleSpread(remaining) : remaining;
        state.cursor = 0;
        state.skipped = new Set();
        resetCardUi();
        break;
      }

      case 'finish':
        finishSession();
        break;

      case 'restart':
        state.stage = 'setup';
        state.allDone = false;
        state.hasSession = false;
        break;

      default:
        return;
    }
    router.rerender();
  },
};
