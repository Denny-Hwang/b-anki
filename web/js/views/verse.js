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
import * as audio from '../lib/audio.js';
import * as datasets from '../lib/datasets.js';
import { verseCertificate } from '../lib/certificate.js';
import { shuffle, todayISO } from '../lib/util.js';
import { statsPanel, hardCardsPanel } from './stats.js';

const VERSIONS = { 개역개정: 'verse_krv', NIV: 'verse_niv' };
const BOTH = '둘 다';
const MAX_HINT = 4;

const state = {};

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
    shuffle: false,
    useSrs: true,
    rows: [],
    verseCol: 'verse_krv',
    order: [],
    cursor: 0,
    completed: new Set(),
    skipped: new Set(),
    history: [],
    results: {},
    hintLevel: 0,
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
  } else if (state.useSrs && state.userName) {
    const locations = state.rows.map((r) => r.location);
    const saved = storage.loadCardStates(state.userName, state.file, locations);
    const cardStates = {};
    indices.forEach((i) => { cardStates[i] = saved[locations[i]] || srs.newCardState(); });
    order = srs.sortForSession(cardStates, indices);
  } else if (state.shuffle) {
    order = shuffle([...indices]);
  }

  state.order = order;
  state.cursor = 0;
  state.completed = new Set();
  state.skipped = new Set();
  state.history = [];
  state.results = {};
  state.hintLevel = 0;
  state.learnPhase = 'reading';
  state.submitted = false;
  state.draft = '';
  state.allDone = false;
  state.sessionEnded = false;
  state.celebrated = false;
  state.hasSession = true;
  state.startedAt = Date.now();

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

function recordCompletion(score, rating) {
  const { index, location } = currentCard();
  state.history.push(index);
  state.completed.add(index);
  state.skipped.delete(index);
  state.results[location] = score === null
    ? { completed: true, rating }
    : { completed: true, rating, score };

  if (state.userName) {
    const previous = storage.getCardState(state.userName, state.file, location)
      || srs.newCardState();
    storage.saveCardState(state.userName, state.file, location,
      srs.review(previous, rating, todayISO()));
    storage.logReview(state.userName, state.file, location, rating, score);
  }

  state.cursor++;
  resetCardUi();
}

function resetCardUi() {
  state.hintLevel = 0;
  state.learnPhase = 'reading';
  state.submitted = false;
  state.draft = '';
  state.shown = false;
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
  const at = state.order.indexOf(previous);
  if (at >= 0) state.cursor = at;
  else state.order.splice(state.cursor, 0, previous);
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
    ${raw(appbar({ title: '📖 성경구절 암기', sub: '학습 · 암송 · 받아쓰기' }))}

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
        ], state.appMode === '학습' ? '학습' : state.testMode))}
      </div>

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
        ${raw(toggle('toggle-shuffle', '랜덤 순서', state.shuffle,
          'SRS가 켜져 있으면 복습 일정이 우선합니다'))}
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

function ratingRow(score) {
  if (!state.useSrs || !state.userName) {
    return html`
      <button class="btn btn--primary btn--block" data-act="done" data-key="next"
        data-score="${score === null ? '' : score}">
        ${score === null ? '✅ 완료' : '➡️ 다음'}
      </button>
    `;
  }
  const buttons = [
    [srs.AGAIN, '🔁 다시', 'again', 'again'],
    [srs.HARD, '😅 어려움', 'hard', ''],
    [srs.GOOD, '🙂 괜찮음', 'good', 'next'],
    [srs.EASY, '🎉 쉬움', 'easy', ''],
  ];
  return html`
    <p class="meta" style="text-align:center">난이도를 고르면 다음 복습 일정이 조정됩니다</p>
    <div class="grid-4">
      ${buttons.map(([rating, label, tone, key]) => raw(
        `<button class="btn btn--${tone} btn--wordy" data-act="rate" data-rating="${rating}"
          data-score="${score === null ? '' : score}"${key ? ` data-key="${key}"` : ''}>${label}</button>`,
      ))}
    </div>
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

  const result = grading.computeWordMatch(state.lastAnswer, card.text);
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
    ${raw(ratingRow(null))}
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

  const result = grading.computeWordMatch(state.lastAnswer, card.text);
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
  const modeLabel = state.appMode === '학습' ? '학습' : `테스트 · ${state.testMode}`;

  let body;
  if (state.appMode === '학습') body = renderLearning(card);
  else if (state.testMode === '암송') body = renderRecitation(card);
  else body = renderDictation(card);

  return html`
    ${raw(appbar({ title: '📖 성경구절 암기', sub: modeLabel, font: true }))}
    <div class="stack">
      ${raw(progress(done, total))}
      <p class="meta">진행 ${done} / ${total}</p>
      <div class="stack stack-xs">
        ${card.topic ? raw(`<div class="topic">${esc(card.topic)}</div>`) : ''}
        <div class="location">📍 ${card.location}</div>
      </div>
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
        break;

      case 'toggle-shuffle':
        state.shuffle = !state.shuffle;
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
          const score = grading.computeWordMatch(state.lastAnswer, card.text).score;
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
        state.order = state.shuffle ? shuffle(remaining) : remaining;
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
