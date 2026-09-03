// Completion certificates and their PNG export.

import { html, raw, computeGrade, formatDuration, todayLabel, toast } from '../ui.js';

const HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const CERT_ID = 'banki-cert';

function shell(inner) {
  return html`<div class="cert" id="${CERT_ID}">${raw(inner)}</div>`;
}

function saveRow(prefix) {
  return html`
    <div class="row" style="justify-content:center;margin-top:14px">
      <button class="btn btn--sm" data-act="cert-save" data-prefix="${prefix}">📥 PNG로 저장</button>
    </div>
  `;
}

/** Theme 1 — verse memorization. */
export function verseCertificate({ name, results, total, setLabel }) {
  const scores = Object.values(results).filter((r) => typeof r.score === 'number').map((r) => r.score);
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const scoreLine = average === null ? '' : html`
    <p class="cert__big">평균 정확도 ${average}% · 등급 ${computeGrade(average)}</p>
  `;

  return shell(html`
    <div class="cert__mark">🏆</div>
    <h2 class="cert__title">수 료 증</h2>
    <p class="cert__set">${setLabel}</p>
    <hr class="cert__rule">
    <p class="cert__name">${name || '수고하신 분'}</p>
    <p class="cert__line">위 사람은 성경 암송 ${total}구절을 모두 마쳤음을 증명합니다.</p>
    ${raw(scoreLine)}
    <hr class="cert__rule">
    <p class="cert__quote">“이 율법책을 네 입에서 떠나지 말게 하며</p>
    <p class="cert__quote">주야로 그것을 묵상하여</p>
    <p class="cert__quote">그 가운데 기록한 대로 다 지켜 행하라”</p>
    <p class="cert__ref">— 여호수아 1:8</p>
    <p class="cert__big">🎉 축하합니다!</p>
    <p class="cert__line">하나님의 말씀을 마음에 새기는 귀한 시간이었습니다.</p>
    <p class="cert__date">발급일 ${todayLabel()}</p>
  `) + saveRow('성경암송_수료증');
}

/** Theme 2 — bible book ordering. */
export function orderingCertificate({ name, dataset, mode, elapsedSeconds, wrongCount }) {
  let comment = '수고하셨습니다! 다음엔 더 잘할 수 있어요! 💪';
  if (wrongCount === 0) comment = '완벽합니다! 🏆';
  else if (wrongCount <= 2) comment = '훌륭합니다! 거의 완벽한 암기력! ⭐';

  return shell(html`
    <div class="cert__mark">✨</div>
    <h2 class="cert__title">순서 암기 인증서</h2>
    <hr class="cert__rule">
    <p class="cert__name">${name || '익명의 도전자'}</p>
    <p class="cert__line">과목 · <b>${dataset}</b></p>
    <p class="cert__line">모드 · <b>${mode}</b></p>
    <p class="cert__line">소요 시간 · <b>${formatDuration(elapsedSeconds)}</b></p>
    <p class="cert__line">틀린 횟수 · <b>${wrongCount}회</b></p>
    <hr class="cert__rule">
    <p class="cert__big">${comment}</p>
    <p class="cert__date">발급일 ${todayLabel()}</p>
  `) + saveRow('단어순서_수료증');
}

/** Theme 3 — PCUSA constitution quiz result sheet. */
export function quizCertificate({ name, setLabel, mode, summary, elapsedSeconds }) {
  const accuracy = summary.accuracy;
  let comment = '오답노트를 중심으로 한 번 더 도전해 보세요! 💪';
  if (accuracy >= 90) comment = '헌법과 규례서를 훌륭하게 익히셨습니다! 🏆';
  else if (accuracy >= 70) comment = '좋습니다! 오답노트만 한 번 더 보시면 완벽합니다 ⭐';

  const partialLine = summary.partial
    ? html`<p class="cert__line">부분 정답 · <b>${summary.partial}문제</b></p>`
    : '';

  return shell(html`
    <div class="cert__mark">⚖️</div>
    <h2 class="cert__title">학습 결과표</h2>
    <p class="cert__set">${setLabel}</p>
    <hr class="cert__rule">
    <p class="cert__name">${name || '수고하신 분'}</p>
    <p class="cert__line">학습 방식 · <b>${mode}</b></p>
    <p class="cert__line">푼 문제 · <b>${summary.total}문제</b></p>
    <p class="cert__line">정답 <b>${summary.correct}</b> · 오답 <b>${summary.wrong}</b></p>
    ${raw(partialLine)}
    <p class="cert__big">정답률 ${accuracy}% · 등급 ${computeGrade(accuracy)}</p>
    <p class="cert__line">소요 시간 · <b>${formatDuration(elapsedSeconds)}</b></p>
    <hr class="cert__rule">
    <p class="cert__quote">“모든 것을 품위 있게 하고 질서 있게 하라”</p>
    <p class="cert__ref">— 고린도전서 14:40</p>
    <p class="cert__big">${comment}</p>
    <p class="cert__date">발급일 ${todayLabel()}</p>
  `) + saveRow('헌법규례_결과표');
}

// ---------- PNG export ----------

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HTML2CANVAS;
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('라이브러리를 불러오지 못했습니다'));
    document.head.appendChild(script);
  });
}

export async function saveCertificatePng(prefix) {
  const node = document.getElementById(CERT_ID);
  if (!node) return;
  try {
    toast('이미지를 만드는 중…');
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
    });
    const link = document.createElement('a');
    link.download = `${prefix}_${todayLabel()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('저장했습니다');
  } catch (err) {
    toast(`저장 실패 · ${err.message}`);
  }
}
