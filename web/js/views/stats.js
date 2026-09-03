// Stats panel shared by the home screen and the end-of-session sheets.

import { html, raw, esc, todayLabel } from '../ui.js';
import * as storage from '../lib/storage.js';
import { addDays } from '../lib/util.js';

const CHART_DAYS = 30;

function tile(label, value) {
  return html`
    <div class="tile">
      <div class="tile__num">${value}</div>
      <div class="tile__label">${label}</div>
    </div>
  `;
}

function dailyChart(perDay) {
  const counts = new Map(perDay.map((d) => [d.date, d.count]));
  const today = todayLabel();
  const days = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    days.push({ date, count: counts.get(date) || 0 });
  }
  const peak = Math.max(1, ...days.map((d) => d.count));

  return html`
    <div class="bars" role="img" aria-label="최근 ${CHART_DAYS}일 복습 횟수">
      ${days.map((d) => raw(`<div class="bars__col${d.count ? '' : ' bars__col--empty'}"
        style="height:${d.count ? Math.max(6, (d.count / peak) * 100) : 4}%"
        title="${d.date} · ${d.count}회"></div>`))}
    </div>
    <div class="row-between meta">
      <span>${days[0].date}</span>
      <span>최대 ${peak}회 / 일</span>
      <span>오늘</span>
    </div>
  `;
}

/** Full dashboard for one learner. Returns '' when the name is unknown. */
export function statsPanel(name) {
  if (!name || !storage.hasUser(name)) {
    return html`<div class="empty">아직 학습 기록이 없습니다. 학습을 시작해 보세요.</div>`;
  }

  const stats = storage.getUserStats(name);
  const streak = storage.computeStreak(name, todayLabel());

  const sessions = stats.sessions.length ? html`
    <details class="accordion">
      <summary>최근 세션 ${stats.sessions.length}개</summary>
      <div class="accordion__body">
        <ul class="list">
          ${stats.sessions.map((s) => raw(`<li>${
            esc(s.started_at.slice(0, 16).replace('T', ' '))
          } · ${esc(s.set_name.replace(/\.csv$/i, ''))} · ${esc(s.mode)} · ${
            Number(s.cards_reviewed)}장${
            s.avg_score === null ? '' : ` · 평균 ${Math.round(s.avg_score)}%`
          }</li>`))}
        </ul>
      </div>
    </details>
  ` : '';

  return html`
    <div class="stack">
      <div class="tiles">
        ${raw(tile('🔥 연속', `${streak}일`))}
        ${raw(tile('📚 총 복습', String(stats.total_reviews)))}
        ${raw(tile('🃏 학습 카드', String(stats.cards_seen)))}
        ${raw(tile('🎯 평균', stats.avg_accuracy === null ? '—' : `${stats.avg_accuracy}%`))}
      </div>
      ${stats.total_reviews
        ? raw(dailyChart(stats.per_day))
        : raw('<div class="empty">아직 복습 기록이 없습니다.</div>')}
      ${raw(sessions)}
    </div>
  `;
}

/** "You keep missing these" list for one set. */
export function hardCardsPanel(name, setName) {
  if (!name) return '';
  const cards = storage.getHardCards(name, setName, 10);
  if (!cards.length) return '';
  return html`
    <details class="accordion">
      <summary>🔁 자주 틀린 항목 ${cards.length}개</summary>
      <div class="accordion__body">
        <ul class="list">
          ${cards.map((c) => raw(
            `<li>${esc(c.location)} — 실수 ${Number(c.lapses)}회 · 난이도 ${c.ease.toFixed(2)}</li>`,
          ))}
        </ul>
      </div>
    </details>
  `;
}
