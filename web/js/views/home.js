// Home: theme picker, personal stats lookup, and backup import/export.

import { html, raw, appbar, toast, readInput } from '../ui.js';
import * as router from '../router.js';
import * as storage from '../lib/storage.js';
import { statsPanel } from './stats.js';

const THEMES = [
  {
    route: 'verse',
    icon: '📜',
    eyebrow: '테마 1',
    title: '성경구절 암기',
    desc: '구절을 보고 가리고 다시 떠올리는 플래시카드',
    tags: '간격 반복 · 받아쓰기 채점 · 음성 듣기',
  },
  {
    route: 'ordering',
    icon: '🔢',
    eyebrow: '테마 2',
    title: '단어순서 외우기',
    desc: '성경 66권의 순서를 맞추는 게임',
    tags: '구약 39권 · 신약 27권 · 단계별 힌트',
  },
  {
    route: 'quiz',
    icon: '⚖️',
    eyebrow: '테마 3',
    title: 'PCUSA 헌법·규례',
    desc: '미국장로교 헌법·규례서 학습문제',
    tags: '플래시카드 · 객관식 · 주관식 · 오답노트',
  },
];

const state = {
  statsName: '',
  statsOpen: false,
};

function themeCard(theme) {
  return html`
    <button class="theme-card" data-act="go" data-route="${theme.route}">
      <span class="theme-card__icon" aria-hidden="true">${theme.icon}</span>
      <span class="theme-card__body">
        <span class="theme-card__eyebrow">${theme.eyebrow}</span>
        <span class="theme-card__title" style="display:block">${theme.title}</span>
        <span class="theme-card__desc keep-all" style="display:block">${theme.desc}</span>
      </span>
      <span class="theme-card__tags">${theme.tags}</span>
    </button>
  `;
}

export default {
  name: 'home',

  enter() {
    state.statsName = storage.getPrefs().lastUser || '';
  },

  render() {
    const users = storage.listUsers();

    return html`
      ${raw(appbar({ title: 'B-Anki', sub: '성경 암기 · 교회 헌법 학습', home: false }))}

      <div class="stack-lg stack">
        <div class="hero">
          <div class="hero__mark" aria-hidden="true">📖</div>
          <h1 class="hero__title">무엇을 외워볼까요?</h1>
          <p class="hero__sub keep-all">말씀과 교회의 규례를 간격 반복으로 익힙니다.</p>
        </div>

        <div class="themes">
          ${THEMES.map((t) => raw(themeCard(t)))}
        </div>

        <details class="accordion" ${state.statsOpen ? raw('open') : ''}>
          <summary data-act="stats-toggle">📊 내 학습 통계</summary>
          <div class="accordion__body stack">
            <div class="field">
              <label class="label" for="stats-name">이름을 입력하면 이 기기에 저장된 기록을 보여줍니다</label>
              <div class="row">
                <input class="input" id="stats-name" list="known-users" value="${state.statsName}"
                  placeholder="이름 입력" autocomplete="off">
                <button class="btn btn--sm" data-act="stats-lookup" data-key="submit">조회</button>
              </div>
              <datalist id="known-users">
                ${users.map((u) => raw(`<option value="${u.replace(/"/g, '&quot;')}"></option>`))}
              </datalist>
            </div>

            ${state.statsName ? raw(statsPanel(state.statsName)) : ''}

            <hr class="hr">
            <p class="hint-text keep-all">
              학습 기록은 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 백업 파일을 사용하세요.
            </p>
            <div class="grid-2">
              <button class="btn btn--sm" data-act="export">⬇️ 백업 내려받기</button>
              <label class="btn btn--sm" style="cursor:pointer">
                ⬆️ 백업 불러오기
                <input type="file" accept="application/json,.json" data-change="import" class="sr-only">
              </label>
            </div>
          </div>
        </details>

        <p class="footnote">
          단축키 · Space 확인 · ← → 이동 · H 힌트 · A / Z 글자 크기<br>
          기록은 이 브라우저에 저장됩니다
        </p>
      </div>
    `;
  },

  onAction(action, el) {
    switch (action) {
      case 'go':
        router.navigate(el.dataset.route);
        break;

      case 'stats-toggle':
        // The <summary> click toggles <details> itself; just remember the state.
        state.statsOpen = !state.statsOpen;
        break;

      case 'stats-lookup': {
        const name = readInput('stats-name').trim();
        state.statsName = name;
        state.statsOpen = true;
        if (name) storage.setPref('lastUser', name);
        router.rerender();
        break;
      }

      case 'export': {
        const blob = new Blob([JSON.stringify(storage.exportAll(), null, 2)],
          { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `b-anki-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        toast('백업 파일을 내려받았습니다');
        break;
      }

      default:
        break;
    }
  },

  onChange(action, el) {
    if (action !== 'import') return;
    const file = el.files && el.files[0];
    if (!file) return;
    file.text()
      .then((text) => {
        const count = storage.importAll(JSON.parse(text));
        toast(`${count}명의 기록을 불러왔습니다`);
        state.statsOpen = true;
        router.rerender();
      })
      .catch((err) => toast(`불러오기 실패 · ${err.message}`));
  },
};
