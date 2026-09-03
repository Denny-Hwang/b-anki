// Theme 3 — PCUSA 헌법·규례 학습문제: 플래시카드 · 객관식 · 주관식.

import {
  html, raw, esc, appbar, progress, segmented, toggle, toast,
  scoreClass, readInput, celebrate,
} from '../ui.js';
import * as router from '../router.js';
import * as storage from '../lib/storage.js';
import * as srs from '../lib/srs.js';
import * as grading from '../lib/grading.js';
import * as quiz from '../lib/quiz.js';
import * as audio from '../lib/audio.js';
import * as datasets from '../lib/datasets.js';
import { quizCertificate } from '../lib/certificate.js';
import { makeRng, todayISO } from '../lib/util.js';
import { statsPanel } from './stats.js';

const FLASHCARD = '플래시카드';
const CHOICE = '객관식';
const SHORT = '주관식';

const MARKERS = '①②③④⑤';

const VERDICTS = {
  correct: ['✅ 정답', 'correct'],
  partial: ['🟡 부분 정답', 'partial'],
  miss: ['❌ 오답', 'miss'],
};

const state = {};

function reset() {
  Object.assign(state, {
    stage: 'setup',
    loading: true,
    error: '',
    files: [],
    file: '',
    bank: [],
    categories: [],
    picked: [],
    mode: CHOICE,
    limit: 0,
    shuffle: true,
    useSrs: true,
    userName: storage.getPrefs().lastUser || '',
    queue: [],
    index: 0,
    results: {},
    revealed: false,
    submitted: false,
    pickedOption: '',
    typed: '',
    choiceCache: {},
    round: 0,
    startedAt: 0,
    sessionId: null,
    sessionEnded: false,
    celebrated: false,
  });
}

function loadBank(file) {
  state.loading = true;
  datasets.loadQuiz(file)
    .then((questions) => {
      state.bank = questions;
      state.categories = quiz.categories(questions);
      state.picked = [...state.categories];
      state.loading = false;
      if (!questions.length) {
        state.error = '문제집 CSV에 id, category, question, answer 열이 필요합니다.';
      }
      router.rerender();
    })
    .catch((err) => {
      state.loading = false;
      state.error = err.message;
      router.rerender();
    });
}

function countAvailable() {
  const wanted = new Set(state.picked);
  return state.bank.filter((q) => wanted.has(q.category)).length;
}

// ---------- lifecycle ----------

function startRound() {
  let pool = quiz.selectQuestions(state.bank, state.picked, null, state.shuffle);
  if (state.mode === CHOICE) pool = pool.filter((q) => quiz.hasChoiceForm(q, state.bank));

  if (state.useSrs && state.userName) {
    const saved = storage.loadCardStates(state.userName, state.file, pool.map((q) => q.id));
    const byIndex = {};
    pool.forEach((q, i) => { byIndex[i] = saved[q.id] || srs.newCardState(); });
    pool = srs.sortForSession(byIndex, pool.map((_, i) => i)).map((i) => pool[i]);
  }
  if (state.limit > 0) pool = pool.slice(0, state.limit);

  state.queue = pool;
  state.index = 0;
  state.results = {};
  state.revealed = false;
  state.submitted = false;
  state.pickedOption = '';
  state.typed = '';
  state.choiceCache = {};
  state.round = 0;
  state.startedAt = Date.now();
  state.sessionEnded = false;
  state.celebrated = false;

  if (state.userName) {
    storage.getOrCreateUser(state.userName);
    state.sessionId = storage.startSession(state.userName, state.file, `헌법문제-${state.mode}`);
  } else {
    state.sessionId = null;
  }
  state.stage = 'run';
}

/**
 * Store the outcome and move on.
 *
 * `record: false` keeps a question out of the summary entirely (it has no form
 * in this mode); `logSrs: false` keeps it in the summary but out of the review
 * schedule, which is what a skip means — no evidence either way.
 */
function advance(question, { verdict, score, rating, record = true, logSrs = true }) {
  if (record) {
    state.results[question.id] = {
      verdict,
      score,
      question: question.question,
      answer: question.answer,
      category: question.category,
    };
    if (state.userName && logSrs) {
      const previous = storage.getCardState(state.userName, state.file, question.id)
        || srs.newCardState();
      storage.saveCardState(state.userName, state.file, question.id,
        srs.review(previous, rating, todayISO()));
      storage.logReview(state.userName, state.file, question.id, rating, score);
    }
  }
  state.index++;
  state.revealed = false;
  state.submitted = false;
  state.pickedOption = '';
  state.typed = '';
}

function optionsFor(question, index) {
  const key = `${question.id}#${state.round}`;
  if (!state.choiceCache[key]) {
    const rng = makeRng(`${question.id}-${state.startedAt}-${index}`);
    state.choiceCache[key] = quiz.buildChoices(question, state.bank, quiz.CHOICE_COUNT, rng);
  }
  return state.choiceCache[key];
}

// ---------- setup ----------

function renderSetup() {
  if (state.loading) {
    return html`
      ${raw(appbar({ title: '⚖️ PCUSA 헌법·규례' }))}
      <div class="empty">불러오는 중…</div>
    `;
  }
  if (state.error) {
    return html`
      ${raw(appbar({ title: '⚖️ PCUSA 헌법·규례' }))}
      <div class="card"><p class="keep-all">${state.error}</p></div>
    `;
  }

  const counts = {};
  state.categories.forEach((c) => {
    counts[c] = state.bank.filter((q) => q.category === c).length;
  });
  const available = countAvailable();
  const due = state.userName && storage.hasUser(state.userName)
    ? storage.getDueCount(state.userName, state.file, todayISO())
    : 0;

  return html`
    ${raw(appbar({
      title: '⚖️ PCUSA 헌법·규례',
      sub: '미국장로교 헌법·규례서 학습문제',
    }))}

    <div class="stack">
      ${state.files.length > 1 ? raw(html`
        <div class="card field">
          <label class="label" for="quiz-file">문제집</label>
          <select class="select" id="quiz-file" data-change="file">
            ${state.files.map((f) => raw(
              `<option value="${esc(f)}"${f === state.file ? ' selected' : ''}>${esc(datasets.prettyName(f))}</option>`,
            ))}
          </select>
        </div>
      `) : ''}

      <div class="stack-sm stack">
        <span class="section-label">출제 분야</span>
        <div class="chips">
          ${state.categories.map((c) => raw(
            `<button class="chip" data-act="category" data-value="${esc(c)}"
              aria-pressed="${state.picked.includes(c)}">${esc(c)} ${counts[c]}</button>`,
          ))}
        </div>
        <p class="meta">선택한 분야의 문제 ${available}개</p>
      </div>

      <div class="stack-sm stack">
        <span class="section-label">학습 방식</span>
        ${raw(segmented('mode', [
          { value: FLASHCARD, label: '📖 플래시카드', desc: '답을 가리고 스스로 평가합니다' },
          { value: CHOICE, label: '🔤 객관식', desc: '4개 보기 중에서 고릅니다' },
          { value: SHORT, label: '✍️ 주관식', desc: '답을 직접 입력해 채점받습니다' },
        ], state.mode))}
      </div>

      <div class="card stack">
        <div class="field">
          <label class="label" for="quiz-name">이름 (선택 · 진도와 통계 저장용)</label>
          <input class="input" id="quiz-name" data-change="name" value="${state.userName}"
            placeholder="이름을 입력하세요" autocomplete="off">
        </div>
        ${due > 0 ? raw(`<div class="flash flash--info">📅 오늘 복습할 문제 ${due}개</div>`) : ''}
        <div class="row-between">
          <span class="label" style="margin:0">출제 문항 수<br>
            <span class="segmented__desc">0이면 선택한 분야 전체</span>
          </span>
          <div class="stepper" style="width:170px">
            <button class="btn btn--sm btn--ghost" data-act="limit-down" aria-label="줄이기">−</button>
            <span class="stepper__value">${state.limit === 0 ? '전체' : state.limit}</span>
            <button class="btn btn--sm btn--ghost" data-act="limit-up" aria-label="늘리기">+</button>
          </div>
        </div>
        ${raw(toggle('toggle-srs', '간격 반복 학습 (SRS)', state.useSrs,
          '틀린 문제를 더 자주 출제합니다'))}
        ${raw(toggle('toggle-shuffle', '랜덤 순서', state.shuffle))}
      </div>

      <button class="btn btn--primary btn--block" data-act="start" data-key="space"
        ${available ? '' : raw('disabled')}>
        🚀 학습 시작
      </button>

      <details class="accordion">
        <summary>📚 문제집 미리보기</summary>
        <div class="accordion__body stack-sm stack">
          ${state.picked.map((category) => {
            const inCategory = state.bank.filter((q) => q.category === category);
            const preview = inCategory.slice(0, 3)
              .map((q) => `<li>${esc(q.question)}</li>`).join('');
            const more = inCategory.length > 3 ? `<li>… 외 ${inCategory.length - 3}문제</li>` : '';
            return raw(`<div><b>${esc(category)}</b> (${inCategory.length}문제)
              <ul class="list" style="margin-top:6px">${preview}${more}</ul></div>`);
          })}
        </div>
      </details>
    </div>
  `;
}

// ---------- run ----------

function answerBlock(question) {
  const accept = question.accept.length
    ? html`<p class="meta">이렇게 답해도 정답 · ${question.accept.join(' / ')}</p>`
    : '';
  const explanation = question.explanation
    ? html`<div class="explanation keep-all">📌 ${question.explanation}</div>`
    : '';
  return html`
    <div class="answerbox keep-all">
      <span class="answerbox__tag">정답</span>${question.answer}
    </div>
    ${raw(accept)}
    ${raw(explanation)}
  `;
}

function verdictBlock(verdict) {
  const [label, tone] = VERDICTS[verdict];
  return html`<div class="verdict verdict--${tone}">${label}</div>`;
}

function renderFlashcard(question) {
  if (!state.revealed) {
    return html`
      <div class="verse verse--muted keep-all">🤔 답을 떠올려 보세요</div>
      <div class="grid-2">
        <button class="btn btn--primary" data-act="reveal" data-key="space">👀 정답 확인</button>
        <button class="btn btn--ghost" data-act="skip" data-key="skip">⏭️ 건너뛰기</button>
      </div>
    `;
  }
  const ratings = [
    [srs.AGAIN, '🔁 몰랐음', 'miss', 'again', 'again'],
    [srs.HARD, '😅 애매함', 'partial', 'hard', ''],
    [srs.GOOD, '🙂 알았음', 'correct', 'good', 'next'],
    [srs.EASY, '🎉 확실함', 'correct', 'easy', ''],
  ];
  return html`
    ${raw(answerBlock(question))}
    <p class="meta" style="text-align:center">스스로 평가하면 다음 복습 일정이 조정됩니다</p>
    <div class="grid-4">
      ${ratings.map(([rating, label, verdict, tone, key]) => raw(
        `<button class="btn btn--${tone} btn--wordy" data-act="self-rate" data-rating="${rating}"
          data-verdict="${verdict}"${key ? ` data-key="${key}"` : ''}>${label}</button>`,
      ))}
    </div>
  `;
}

function renderChoice(question, index) {
  const options = optionsFor(question, index);
  if (!options.length) {
    return html`
      <div class="flash flash--info">이 문제는 객관식으로 낼 수 없어 건너뜁니다.</div>
      <button class="btn btn--primary btn--block" data-act="skip-unusable" data-key="space">
        ➡️ 다음 문제
      </button>
    `;
  }

  if (!state.submitted) {
    return html`
      <div class="stack-sm stack">
        ${options.map((option, i) => raw(
          `<button class="btn btn--wordy btn--block" style="justify-content:flex-start;text-align:left"
            data-act="pick" data-value="${esc(option)}">
            <span style="color:var(--accent);font-weight:800;margin-right:8px">${MARKERS[i] || i + 1}</span>
            ${esc(option)}
          </button>`,
        ))}
      </div>
    `;
  }

  const correct = state.pickedOption === question.answer;
  const pickedLine = correct ? '' : html`
    <p class="meta" style="text-align:center;color:var(--bad)">내가 고른 답 · ${state.pickedOption}</p>
  `;
  return html`
    ${raw(verdictBlock(correct ? 'correct' : 'miss'))}
    ${raw(pickedLine)}
    ${raw(answerBlock(question))}
    <button class="btn btn--primary btn--block" data-act="next-choice" data-key="next">
      ➡️ 다음 문제
    </button>
  `;
}

function renderShort(question) {
  if (!state.submitted) {
    return html`
      <textarea class="textarea" id="quiz-input" placeholder="답을 입력하세요…"></textarea>
      <div class="grid-2">
        <button class="btn btn--primary" data-act="submit" data-key="space">제출</button>
        <button class="btn btn--ghost" data-act="skip" data-key="skip">⏭️ 건너뛰기</button>
      </div>
    `;
  }

  const result = quiz.gradeShortAnswer(state.typed, question);
  const detail = result.detail
    ? html`<div class="diff keep-all">${raw(grading.renderWordComparison(result.detail))}</div>`
    : '';

  return html`
    <div class="score ${scoreClass(result.score)}" aria-live="polite">${result.score}%</div>
    ${raw(verdictBlock(result.verdict))}
    ${raw(detail)}
    ${raw(answerBlock(question))}
    <div class="grid-2">
      <button class="btn" data-act="retry">🔄 다시 입력</button>
      <button class="btn btn--primary" data-act="next-short" data-key="next">➡️ 다음 문제</button>
    </div>
  `;
}

function renderRun() {
  if (!state.queue.length) {
    return html`
      ${raw(appbar({ title: '⚖️ PCUSA 헌법·규례' }))}
      <div class="card stack">
        <p>선택한 조건에 해당하는 문제가 없습니다.</p>
        <button class="btn btn--primary" data-act="back-setup">🔙 설정으로 돌아가기</button>
      </div>
    `;
  }
  if (state.index >= state.queue.length) return renderResult();

  const question = state.queue[state.index];
  const summary = quiz.summarize(state.results);
  const accuracy = state.index
    ? Math.round(((summary.correct + summary.partial) / state.index) * 100)
    : null;

  let body;
  if (state.mode === FLASHCARD) body = renderFlashcard(question);
  else if (state.mode === CHOICE) body = renderChoice(question, state.index);
  else body = renderShort(question);

  return html`
    ${raw(appbar({ title: '⚖️ PCUSA 헌법·규례', sub: state.mode, font: true }))}
    <div class="stack">
      ${raw(progress(state.index, state.queue.length))}
      <p class="meta">
        진행 ${state.index} / ${state.queue.length} · 정답 ${summary.correct}${
          summary.partial ? ` · 부분 ${summary.partial}` : ''
        } · 오답 ${summary.wrong}${accuracy === null ? '' : ` · 정답률 ${accuracy}%`}
      </p>
      <div class="category">📂 ${question.category}</div>
      <div class="question keep-all">
        <span class="question__num">Q${state.index + 1}.</span>${question.question}
      </div>
      ${raw(body)}
    </div>
  `;
}

function renderResult() {
  const summary = quiz.summarize(state.results);

  if (state.sessionId !== null && !state.sessionEnded) {
    storage.endSession(state.userName, state.sessionId, summary.total, summary.avg_score);
    state.sessionEnded = true;
  }
  if (!state.celebrated) {
    state.celebrated = true;
    audio.playSound('complete');
    if (summary.total && summary.accuracy >= 80) celebrate();
  }

  const wrong = Object.entries(state.results)
    .filter(([, r]) => r.verdict === 'miss' || r.verdict === 'partial');

  return html`
    ${raw(appbar({ title: '⚖️ PCUSA 헌법·규례' }))}
    <div class="stack">
      ${raw(quizCertificate({
        name: state.userName,
        setLabel: datasets.prettyName(state.file),
        mode: state.mode,
        summary,
        elapsedSeconds: (Date.now() - state.startedAt) / 1000,
      }))}

      ${wrong.length ? raw(html`
        <details class="accordion" open>
          <summary>📝 오답노트 ${wrong.length}문제</summary>
          <div class="accordion__body stack-sm stack">
            ${wrong.map(([, r]) => raw(`
              <div class="card card--flat">
                <p class="keep-all"><b>${r.verdict === 'partial' ? '🟡' : '❌'} ${
                  esc(r.question)}</b></p>
                <p class="keep-all" style="margin-top:6px;color:var(--good)">정답 · ${
                  esc(r.answer)}</p>
                <p class="meta" style="margin-top:4px">분야 · ${esc(r.category)}</p>
              </div>
            `))}
          </div>
        </details>
      `) : ''}

      ${state.userName ? raw(html`
        <details class="accordion">
          <summary>📊 내 학습 통계</summary>
          <div class="accordion__body">${raw(statsPanel(state.userName))}</div>
        </details>
      `) : ''}

      <div class="${wrong.length ? 'grid-3' : 'grid-2'}">
        ${wrong.length ? raw(
          '<button class="btn btn--primary" data-act="retry-wrong" data-key="space">📝 오답만 다시</button>',
        ) : ''}
        <button class="btn" data-act="back-setup">🔄 새로 풀기</button>
        <button class="btn" data-act="home">🏠 처음으로</button>
      </div>
    </div>
  `;
}

// ---------- view ----------

export default {
  name: 'quiz',

  enter() {
    reset();
    datasets.loadManifest()
      .then((manifest) => {
        state.files = manifest.quiz || [];
        state.file = state.files[0] || '';
        if (!state.file) {
          state.loading = false;
          state.error = '문제집 CSV를 찾지 못했습니다.';
          router.rerender();
          return;
        }
        loadBank(state.file);
      })
      .catch((err) => {
        state.loading = false;
        state.error = err.message;
        router.rerender();
      });
  },

  render() {
    return state.stage === 'setup' ? renderSetup() : renderRun();
  },

  afterRender() {
    const input = document.getElementById('quiz-input');
    if (input) {
      input.value = state.typed;
      input.focus();
    }
  },

  onChange(action, el) {
    if (action === 'file') {
      state.file = el.value;
      loadBank(state.file);
      return;
    }
    if (action === 'name') {
      state.userName = el.value.trim();
      if (state.userName) storage.setPref('lastUser', state.userName);
      router.rerender();
    }
  },

  onAction(action, el) {
    const question = state.stage === 'run' && state.index < state.queue.length
      ? state.queue[state.index] : null;

    switch (action) {
      case 'category': {
        const value = el.dataset.value;
        state.picked = state.picked.includes(value)
          ? state.picked.filter((c) => c !== value)
          : [...state.picked, value];
        if (!state.picked.length) state.picked = [...state.categories];
        state.limit = Math.min(state.limit, countAvailable());
        break;
      }

      case 'mode':
        state.mode = el.dataset.value;
        break;

      case 'toggle-srs':
        state.useSrs = !state.useSrs;
        break;

      case 'toggle-shuffle':
        state.shuffle = !state.shuffle;
        break;

      case 'limit-up':
        state.limit = Math.min(countAvailable(), state.limit + 1);
        break;

      case 'limit-down':
        state.limit = Math.max(0, state.limit - 1);
        break;

      case 'start':
        startRound();
        break;

      case 'reveal':
        state.revealed = true;
        break;

      case 'self-rate':
        advance(question, {
          verdict: el.dataset.verdict,
          score: null,
          rating: Number(el.dataset.rating),
        });
        break;

      case 'skip':
        advance(question, { verdict: 'miss', score: null, rating: srs.AGAIN, logSrs: false });
        break;

      case 'skip-unusable':
        advance(question, {
          verdict: 'miss', score: null, rating: srs.AGAIN, record: false, logSrs: false,
        });
        break;

      case 'pick':
        state.pickedOption = el.dataset.value;
        state.submitted = true;
        audio.playSound(state.pickedOption === question.answer ? 'success' : 'fail');
        break;

      case 'next-choice': {
        const correct = state.pickedOption === question.answer;
        advance(question, {
          verdict: correct ? 'correct' : 'miss',
          score: correct ? 100 : 0,
          rating: correct ? srs.GOOD : srs.AGAIN,
        });
        break;
      }

      case 'submit': {
        state.typed = readInput('quiz-input');
        state.submitted = true;
        const result = quiz.gradeShortAnswer(state.typed, question);
        if (result.verdict === 'correct') audio.playSound('success');
        else if (result.verdict === 'miss') audio.playSound('fail');
        break;
      }

      case 'retry':
        state.submitted = false;
        state.typed = '';
        break;

      case 'next-short': {
        const result = quiz.gradeShortAnswer(state.typed, question);
        advance(question, {
          verdict: result.verdict,
          score: result.score,
          rating: srs.ratingFromScore(result.score),
        });
        break;
      }

      case 'retry-wrong': {
        const byId = Object.fromEntries(state.bank.map((q) => [q.id, q]));
        state.queue = Object.keys(state.results)
          .filter((id) => ['miss', 'partial'].includes(state.results[id].verdict))
          .map((id) => byId[id])
          .filter(Boolean);
        state.index = 0;
        state.results = {};
        state.revealed = false;
        state.submitted = false;
        state.typed = '';
        state.round += 1;
        state.startedAt = Date.now();
        state.sessionEnded = true;
        state.celebrated = false;
        break;
      }

      case 'back-setup':
        state.stage = 'setup';
        break;

      default:
        return;
    }
    router.rerender();
  },
};
