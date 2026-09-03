// Theme 2 — put the bible books back in order, by clicking or by typing.

import {
  html, raw, appbar, progress, segmented, toast, readInput, celebrate, formatDuration,
} from '../ui.js';
import * as router from '../router.js';
import * as hints from '../lib/hints.js';
import * as audio from '../lib/audio.js';
import * as datasets from '../lib/datasets.js';
import { BIBLE_BOOK_EMOJIS, BIBLE_BOOK_HINTS, getBookEmoji } from '../lib/bible-data.js';
import { orderingCertificate } from '../lib/certificate.js';
import { shuffle } from '../lib/util.js';

const DATASETS = {
  '구약 39권': ['bible_books_ot.csv'],
  '신약 27권': ['bible_books_nt.csv'],
  '구약+신약 66권': ['bible_books_ot.csv', 'bible_books_nt.csv'],
};

const CLICK = '클릭 배열';
const TYPING = '받아쓰기';
const MAX_HINT = 2;

const state = {};

function reset() {
  Object.assign(state, {
    stage: 'setup',
    userName: '',
    datasetName: '구약 39권',
    uploadedWords: null,
    uploadedName: '',
    useUpload: false,
    mode: CLICK,
    maxWrong: 3,
    words: [],
    shuffled: [],
    cursor: 0,
    wrong: 0,
    correctSoFar: [],
    hintLevel: 0,
    feedback: null,
    startedAt: 0,
    outcome: null,
    celebrated: false,
  });
}

// ---------- lifecycle ----------

function startGame(words, label) {
  state.words = words;
  state.datasetLabel = label;
  state.shuffled = shuffle(words.map((_, i) => i));
  state.cursor = 0;
  state.wrong = 0;
  state.correctSoFar = [];
  state.hintLevel = 0;
  state.feedback = null;
  state.startedAt = Date.now();
  state.outcome = null;
  state.celebrated = false;
  state.stage = 'play';
}

function answerCorrect(word) {
  state.correctSoFar.push(word);
  state.cursor++;
  state.hintLevel = 0;
  audio.playSound('success');
  state.feedback = {
    kind: 'success',
    message: `✅ 정답! ${state.cursor}. ${getBookEmoji(word)} ${word}`,
  };
  if (state.cursor >= state.words.length) state.outcome = 'clear';
}

function answerWrong(message) {
  state.wrong++;
  audio.playSound('fail');
  state.feedback = { kind: 'error', message };
  if (state.wrong >= state.maxWrong) state.outcome = 'over';
}

// ---------- setup ----------

function renderSetup() {
  const datasetOptions = Object.keys(DATASETS).map((name) => ({ value: name, label: name }));

  return html`
    ${raw(appbar({ title: '🔢 단어 순서 외우기', sub: '성경 66권의 순서' }))}

    <div class="stack">
      <div class="card stack">
        <div class="field">
          <label class="label" for="ord-name">닉네임 (선택)</label>
          <input class="input" id="ord-name" data-change="name" value="${state.userName}"
            placeholder="닉네임을 입력하세요" autocomplete="off">
        </div>
      </div>

      <div class="stack-sm stack">
        <span class="section-label">데이터셋</span>
        ${raw(segmented('dataset', datasetOptions,
          state.useUpload ? null : state.datasetName))}
        <label class="btn btn--sm" style="cursor:pointer">
          ${state.useUpload ? `📄 ${state.uploadedName}` : '📄 내 CSV 올리기 (order, name_ko, name_en)'}
          <input type="file" accept=".csv,text/csv" data-change="upload" class="sr-only">
        </label>
      </div>

      <div class="stack-sm stack">
        <span class="section-label">게임 방식</span>
        ${raw(segmented('mode', [
          { value: CLICK, label: '🖱️ 클릭 배열', desc: '순서대로 눌러 배열합니다' },
          { value: TYPING, label: '✍️ 받아쓰기', desc: '순서대로 직접 입력합니다' },
        ], state.mode))}
      </div>

      <div class="card">
        <div class="row-between">
          <span class="label" style="margin:0">허용 오답 수</span>
          <div class="stepper" style="width:150px">
            <button class="btn btn--sm btn--ghost" data-act="lives-down" aria-label="줄이기">−</button>
            <span class="stepper__value">${state.maxWrong}</span>
            <button class="btn btn--sm btn--ghost" data-act="lives-up" aria-label="늘리기">+</button>
          </div>
        </div>
      </div>

      <button class="btn btn--primary btn--block" data-act="start" data-key="space">
        🎮 게임 시작
      </button>
    </div>
  `;
}

// ---------- play ----------

function header() {
  const remaining = state.maxWrong - state.wrong;
  const hearts = '❤️'.repeat(Math.max(0, remaining)) + '🖤'.repeat(state.wrong);
  return html`
    ${raw(appbar({
      title: '🔢 단어 순서 외우기',
      sub: `${state.datasetLabel} · ${state.mode === CLICK ? '🖱️ 클릭 배열' : '✍️ 받아쓰기'}`,
    }))}
    <div class="hearts" aria-label="남은 기회 ${remaining} / ${state.maxWrong}">${hearts}</div>
    ${raw(progress(state.cursor, state.words.length))}
    <p class="meta">진행 ${state.cursor} / ${state.words.length}</p>
  `;
}

function feedbackBlock() {
  if (!state.feedback) return '';
  return html`<div class="flash flash--${state.feedback.kind}">${state.feedback.message}</div>`;
}

function criticalHint() {
  const remaining = state.maxWrong - state.wrong;
  if (remaining !== 1 || state.cursor >= state.words.length) return '';
  const text = hints.bookHint(state.words[state.cursor], 3, BIBLE_BOOK_EMOJIS, BIBLE_BOOK_HINTS);
  return html`<div class="flash flash--error keep-all">${text}</div>`;
}

function hintBlock() {
  if (!state.hintLevel || state.cursor >= state.words.length) return '';
  const text = hints.bookHint(state.words[state.cursor], state.hintLevel,
    BIBLE_BOOK_EMOJIS, BIBLE_BOOK_HINTS);
  return html`<div class="hintbox keep-all" style="font-size:15px">${text}</div>`;
}

function chainBlock(label) {
  if (!state.correctSoFar.length) return '';
  const chain = state.correctSoFar
    .map((w, i) => `${i + 1}.${getBookEmoji(w)} ${w}`)
    .join(' → ');
  return html`<div class="chain keep-all">${label}<br>${chain}</div>`;
}

function renderClickMode() {
  const remaining = state.maxWrong - state.wrong;
  const choices = state.shuffled.filter((i) => i >= state.cursor);

  return html`
    ${raw(header())}
    <div class="stack">
      ${raw(feedbackBlock())}
      ${raw(criticalHint())}
      <div class="wordgrid">
        ${choices.map((i) => {
          const word = state.words[i];
          const emoji = getBookEmoji(word);
          const isNext = remaining === 1 && i === state.cursor;
          return raw(`<button class="btn${isNext ? ' btn--next' : ''}" data-act="pick" data-index="${i}">
            ${emoji ? `${emoji} ` : ''}${word}
          </button>`);
        })}
      </div>
      ${raw(chainBlock('✅ 정답 배열'))}
      <button class="btn btn--block" data-act="hint" data-key="hint">💡 힌트 보기</button>
      ${raw(hintBlock())}
    </div>
  `;
}

function renderTypingMode() {
  return html`
    ${raw(header())}
    <div class="stack">
      ${raw(feedbackBlock())}
      ${raw(criticalHint())}
      ${raw(chainBlock('✅ 지금까지 맞춘 단어'))}
      <div class="field">
        <label class="label" for="ord-input">📝 ${state.cursor + 1}번째 단어를 입력하세요</label>
        <input class="input" id="ord-input" placeholder="단어를 입력하세요…" autocomplete="off">
      </div>
      <div class="grid-2">
        <button class="btn" data-act="hint" data-key="hint">💡 힌트 보기</button>
        <button class="btn btn--primary" data-act="check" data-key="submit">확인</button>
      </div>
      ${raw(hintBlock())}
    </div>
  `;
}

function renderGameOver() {
  const items = state.words.map((w, i) => `${i + 1}.${getBookEmoji(w)} ${w}`);
  return html`
    ${raw(appbar({ title: '🔢 단어 순서 외우기' }))}
    <div class="stack">
      <div class="card" style="text-align:center">
        <div style="font-size:38px">😢</div>
        <h2 style="margin-top:8px">게임 오버</h2>
        <p class="meta" style="margin-top:6px">
          ${state.correctSoFar.length} / ${state.words.length} 단어까지 맞췄습니다
        </p>
      </div>
      <details class="accordion">
        <summary>📋 전체 정답 보기</summary>
        <div class="accordion__body">
          <p class="keep-all" style="line-height:2;color:var(--text-2)">${items.join('  ·  ')}</p>
        </div>
      </details>
      <div class="grid-2">
        <button class="btn btn--primary" data-act="restart" data-key="space">🔄 다시 도전</button>
        <button class="btn" data-act="home">🏠 처음으로</button>
      </div>
    </div>
  `;
}

function renderClear() {
  if (!state.celebrated) {
    state.celebrated = true;
    audio.playSound('complete');
    celebrate();
  }
  return html`
    ${raw(appbar({ title: '🔢 단어 순서 외우기' }))}
    <div class="stack">
      ${raw(orderingCertificate({
        name: state.userName,
        dataset: state.datasetLabel,
        mode: state.mode,
        elapsedSeconds: (Date.now() - state.startedAt) / 1000,
        wrongCount: state.wrong,
      }))}
      <div class="grid-2">
        <button class="btn btn--primary" data-act="restart" data-key="space">🔄 다시 도전</button>
        <button class="btn" data-act="home">🏠 처음으로</button>
      </div>
    </div>
  `;
}

// ---------- view ----------

export default {
  name: 'ordering',

  enter() {
    reset();
  },

  render() {
    if (state.stage === 'setup') return renderSetup();
    if (state.outcome === 'clear') return renderClear();
    if (state.outcome === 'over') return renderGameOver();
    return state.mode === CLICK ? renderClickMode() : renderTypingMode();
  },

  afterRender() {
    const input = document.getElementById('ord-input');
    if (input) input.focus();
  },

  onChange(action, el) {
    if (action === 'name') {
      state.userName = el.value.trim();
      return;
    }
    if (action !== 'upload') return;
    const file = el.files && el.files[0];
    if (!file) return;
    file.text()
      .then((text) => {
        const words = datasets.parseOrderingUpload(text);
        if (!words) {
          toast('CSV에 order, name_ko, name_en 열이 필요합니다');
          return;
        }
        state.uploadedWords = words;
        state.uploadedName = file.name;
        state.useUpload = true;
        toast(`${words.length}개 단어를 불러왔습니다`);
        router.rerender();
      })
      .catch((err) => toast(err.message));
  },

  onAction(action, el) {
    switch (action) {
      case 'dataset':
        state.datasetName = el.dataset.value;
        state.useUpload = false;
        break;

      case 'mode':
        state.mode = el.dataset.value;
        break;

      case 'lives-up':
        state.maxWrong = Math.min(10, state.maxWrong + 1);
        break;

      case 'lives-down':
        state.maxWrong = Math.max(1, state.maxWrong - 1);
        break;

      case 'start': {
        if (state.useUpload && state.uploadedWords) {
          startGame([...state.uploadedWords], state.uploadedName);
          break;
        }
        const files = DATASETS[state.datasetName];
        Promise.all(files.map(datasets.loadOrdering))
          .then((lists) => {
            const words = lists.flat();
            if (!words.length) {
              toast('데이터를 불러오지 못했습니다');
              return;
            }
            startGame(words, state.datasetName);
            router.rerender();
          })
          .catch((err) => toast(err.message));
        return;
      }

      case 'pick': {
        const index = Number(el.dataset.index);
        const word = state.words[index];
        if (index === state.cursor) {
          answerCorrect(word);
        } else {
          answerWrong(`❌ '${getBookEmoji(word)} ${word}'는 ${state.cursor + 1}번이 아닙니다`);
        }
        break;
      }

      case 'check': {
        const typed = readInput('ord-input').trim();
        if (!typed) return;
        if (typed === state.words[state.cursor]) answerCorrect(state.words[state.cursor]);
        else answerWrong('❌ 틀렸습니다!');
        break;
      }

      case 'hint':
        state.hintLevel = Math.min(MAX_HINT, state.hintLevel + 1);
        break;

      case 'restart':
        startGame(state.words, state.datasetLabel);
        break;

      default:
        return;
    }
    router.rerender();
  },
};
