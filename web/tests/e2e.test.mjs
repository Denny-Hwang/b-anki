// End-to-end smoke test: walks each theme the way a learner does, so a broken
// route or a missing state key fails here instead of in someone's browser.
//
//   python3 scripts/build_site.py
//   python3 -m http.server -d _site 8123 &
//   node web/tests/e2e.test.mjs [baseUrl]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOT_DIR || '';

let passed = 0;
const failures = [];

function ok(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Click the first visible control whose text contains `text`. */
async function click(page, text) {
  const target = page.locator('button, label, summary', { hasText: text }).first();
  await target.waitFor({ state: 'visible', timeout: 5000 });
  await target.click();
  await page.waitForTimeout(120);
}

async function bodyText(page) {
  return page.locator('#app').innerText();
}

// A nested html`` template interpolated without raw() gets escaped and renders
// as visible markup. It shipped once; this catches the whole class.
const LEAKED_MARKUP = /class="|<\/?(?:p|div|span|button|b|s|ul|li|hr|br)\b/;

async function assertNoLeakedMarkup(page, where) {
  const text = await bodyText(page);
  const match = text.match(LEAKED_MARKUP);
  ok(`${where}: 마크업이 글자로 새지 않는다`, !match,
    match ? text.slice(Math.max(0, match.index - 60), match.index + 90) : '');
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    // The web font is a progressive enhancement served from a CDN; a sandbox
    // without egress must not fail the run over it.
    const text = msg.text();
    const externalAsset = /Failed to load resource/.test(text) && !text.includes('127.0.0.1');
    if (msg.type() === 'error' && !externalAsset) errors.push(text);
  });

  // ---------- home ----------
  console.log('\nhome');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const home = await bodyText(page);
  ok('세 테마가 모두 보인다',
    home.includes('성경구절 암기') && home.includes('단어순서') && home.includes('PCUSA'));
  await assertNoLeakedMarkup(page, '홈');
  await shot(page, '01-home');

  // ---------- theme 1: dictation ----------
  console.log('\n테마 1 · 받아쓰기');
  await click(page, '성경구절 암기');
  await page.waitForSelector('#verse-file');
  ok('구절집 목록을 불러왔다', (await page.locator('#verse-file option').count()) >= 3);

  await page.fill('#verse-name', '테스트학습자');
  await page.locator('#verse-name').blur();
  await page.waitForTimeout(120);
  await click(page, '테스트 · 받아쓰기');
  await click(page, '시작하기');
  await page.waitForSelector('#verse-input');
  ok('받아쓰기 화면이 열렸다', (await bodyText(page)).includes('진행 0 /'));
  await shot(page, '02-verse-dictation');

  // hint ladder
  await click(page, '💡 힌트');
  ok('힌트가 나타난다', (await bodyText(page)).includes('첫 단어의 초성'));

  // answer with the real verse text, read straight out of the CSV
  const verse = await page.evaluate(async () => {
    const res = await fetch('./data/manifest.json');
    const manifest = await res.json();
    const csv = await (await fetch(`./data/${encodeURIComponent(manifest.verse[0])}`)).text();
    const mod = await import('./js/lib/csv.js');
    const rows = mod.parseCsv(csv);
    const location = document.querySelector('.location').textContent.replace('📍', '').trim();
    return rows.find((r) => r.location === location).verse_krv;
  });
  await page.fill('#verse-input', verse);
  await click(page, '제출');
  const graded = await bodyText(page);
  ok('정확히 입력하면 100%', graded.includes('100%'), graded.slice(0, 120));
  ok('SRS 난이도 버튼이 나온다', graded.includes('괜찮음'));
  await assertNoLeakedMarkup(page, '받아쓰기 채점');
  await shot(page, '03-verse-graded');

  await click(page, '🙂 괜찮음');
  ok('다음 카드로 넘어간다', (await bodyText(page)).includes('진행 1 /'));

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('banki.v1.user.테스트학습자');
    return raw ? JSON.parse(raw) : null;
  });
  ok('진도가 localStorage에 저장된다',
    stored && Object.keys(stored.cards).length === 1 && stored.log.length === 1);
  ok('SM-2 일정이 잡힌다', stored && Object.values(stored.cards)[0].due_date > '2000-01-01');

  // ---------- theme 1: learning mode ----------
  console.log('\n테마 1 · 학습 모드');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '성경구절 암기');
  await page.waitForSelector('#verse-file');
  await click(page, '시작하기');
  await page.waitForTimeout(200);
  ok('학습 모드가 기본이다', (await bodyText(page)).includes('가리기'));
  await click(page, '🙈 가리기');
  ok('구절이 가려진다', (await bodyText(page)).includes('구절을 떠올려'));
  await click(page, '👀 구절 확인');
  ok('다시 보여진다', (await bodyText(page)).includes('가리기'));

  // ---------- theme 1: the NIV column ----------
  console.log('\n테마 1 · NIV');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '성경구절 암기');
  await page.waitForSelector('#verse-version');
  await page.selectOption('#verse-version', 'NIV');
  await page.waitForTimeout(120);
  await click(page, '시작하기');
  await page.waitForTimeout(200);
  const niv = await page.locator('.verse').innerText();
  ok('NIV를 고르면 영문 구절이 나온다', /^[\sA-Za-z0-9,.'"“”‘’;:!?()\-—–]+$/.test(niv), niv.slice(0, 80));

  // ---------- theme 2: click mode ----------
  console.log('\n테마 2 · 클릭 배열');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '단어순서 외우기');
  await click(page, '🎮 게임 시작');
  await page.waitForSelector('.wordgrid');
  const grid = await bodyText(page);
  ok('39권이 모두 나온다', (await page.locator('.wordgrid button').count()) === 39);
  ok('하트가 3개다', grid.includes('❤️❤️❤️'));
  await shot(page, '04-ordering');

  await click(page, '창세기');
  const afterFirst = await bodyText(page);
  ok('첫 순서를 맞추면 정답 처리', afterFirst.includes('정답!') && afterFirst.includes('진행 1 / 39'));

  await click(page, '레위기');
  ok('틀리면 하트가 준다', (await bodyText(page)).includes('🖤'));

  await click(page, '💡 힌트 보기');
  ok('책 힌트가 나온다', (await bodyText(page)).includes('힌트'));

  // ---------- theme 3: multiple choice ----------
  console.log('\n테마 3 · 객관식');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '헌법·규례');
  await page.waitForSelector('.chips button');
  ok('분야 칩이 6개', (await page.locator('.chips button').count()) === 6);

  // 3 questions is enough to reach the result sheet quickly
  for (let i = 0; i < 3; i++) await click(page, '+');
  ok('문항 수를 3으로 지정했다', (await page.locator('.stepper__value').innerText()) === '3');
  await shot(page, '05-quiz-setup');

  await click(page, '🚀 학습 시작');
  await page.waitForTimeout(200);
  ok('4지선다가 나온다', (await page.locator('[data-act="pick"]').count()) === 4);
  await shot(page, '06-quiz-choice');

  for (let i = 0; i < 3; i++) {
    await page.locator('[data-act="pick"]').first().click();
    await page.waitForTimeout(120);
    await click(page, '다음 문제');
  }
  const result = await bodyText(page);
  ok('결과표에 도달한다', result.includes('학습 결과표'));
  await assertNoLeakedMarkup(page, '헌법 결과표');
  ok('등급이 표시된다', /등급 [SAB+CD]/.test(result));
  await shot(page, '07-quiz-result');

  // ---------- theme 3: short answer ----------
  console.log('\n테마 3 · 주관식');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '헌법·규례');
  await page.waitForSelector('.chips button');
  await click(page, '✍️ 주관식');
  await click(page, '+');
  await click(page, '🚀 학습 시작');
  await page.waitForSelector('#quiz-input');

  const answer = await page.evaluate(() => {
    // the queue lives in the view module's state; read the answer off the DOM
    // by re-grading against the bank instead
    return document.querySelector('.question').innerText;
  });
  ok('문제가 보인다', answer.includes('Q1.'));

  await page.fill('#quiz-input', '전혀 관계 없는 답변입니다');
  await click(page, '제출');
  ok('엉뚱한 답은 오답 처리', (await bodyText(page)).includes('오답'));
  await shot(page, '08-quiz-short');

  // ---------- theme 1: recitation + going back ----------
  console.log('\n테마 1 · 암송 · 이전');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '성경구절 암기');
  await page.waitForSelector('#verse-name');
  await page.fill('#verse-name', '암송테스터');
  await page.locator('#verse-name').blur();
  await page.waitForTimeout(120);
  await click(page, '테스트 · 암송');
  await click(page, '시작하기');
  await page.waitForTimeout(200);
  ok('암송 모드는 구절을 가린다', (await bodyText(page)).includes('버튼을 눌러 구절을 확인'));
  await click(page, '구절 확인');
  ok('확인하면 구절과 평가 버튼이 나온다', (await bodyText(page)).includes('쉬움'));
  await click(page, '🎉 쉬움');
  ok('평가하면 다음 카드로 간다', (await bodyText(page)).includes('진행 1 /'));
  await click(page, '⬅️ 이전');
  ok('이전 버튼이 되돌린다', (await bodyText(page)).includes('진행 0 /'));

  // ---------- theme 3: wrong-answer notes ----------
  console.log('\n테마 3 · 오답노트');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '헌법·규례');
  await page.waitForSelector('.chips button');
  await click(page, '✍️ 주관식');
  await click(page, '+');
  await click(page, '+');
  await click(page, '🚀 학습 시작');
  await page.waitForSelector('#quiz-input');

  for (let i = 0; i < 2; i++) {
    await page.fill('#quiz-input', '틀린 답');
    await click(page, '제출');
    await click(page, '다음 문제');
  }
  const notes = await bodyText(page);
  ok('오답노트에 두 문제가 담긴다', notes.includes('오답노트 2문제'));
  await click(page, '오답만 다시');
  const requeued = await bodyText(page);
  ok('오답만 다시 풀기가 큐를 되돌린다',
    requeued.includes('진행 0 / 2') && requeued.includes('Q1.'));

  // ---------- stats and backup ----------
  console.log('\n통계 · 백업');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '내 학습 통계');
  await page.fill('#stats-name', '테스트학습자');
  await click(page, '조회');
  const dash = await bodyText(page);
  ok('통계 타일이 보인다', dash.includes('총 복습') && dash.includes('학습 카드'));
  await assertNoLeakedMarkup(page, '통계');

  // The name is remembered between themes, so this learner also owns the
  // reviews logged by the quiz rounds above — assert against storage, not a
  // hard-coded count.
  const logged = await page.evaluate(async () => {
    const mod = await import('./js/lib/storage.js');
    return mod.getUserStats('테스트학습자').total_reviews;
  });
  const tiles = await page.locator('.tile__num').allInnerTexts();
  ok('복습 기록이 집계된다', logged > 0 && tiles[1] === String(logged),
    `logged=${logged} tiles=${JSON.stringify(tiles)}`);
  ok('일자별 그래프가 그려진다', (await page.locator('.bars__col').count()) === 30);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12-stats.png`, fullPage: true });

  const backup = await page.evaluate(async () => {
    const mod = await import('./js/lib/storage.js');
    const payload = mod.exportAll();
    return { users: payload.users.length, format: payload.format };
  });
  ok('백업을 만들 수 있다', backup.format === 'b-anki-backup' && backup.users >= 1);

  const roundTrip = await page.evaluate(async () => {
    const mod = await import('./js/lib/storage.js');
    const payload = mod.exportAll();
    localStorage.clear();
    mod.importAll(payload);
    return mod.getUserStats('테스트학습자').total_reviews;
  });
  ok('백업을 되돌려 복원할 수 있다', roundTrip === logged,
    `${logged} → ${roundTrip}`);

  // ---------- theme 3: flashcard ----------
  console.log('\n테마 3 · 플래시카드');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '헌법·규례');
  await page.waitForSelector('.chips button');
  ok('출제 문항 수 기본값은 전체',
    (await page.locator('.stepper__value').innerText()) === '전체');

  await click(page, '📖 플래시카드');
  await click(page, '🚀 학습 시작');
  await page.waitForTimeout(200);
  ok('플래시카드는 답을 가린다', (await bodyText(page)).includes('답을 떠올려'));
  ok('전체 문항이 출제된다', (await bodyText(page)).includes('/ 34'));

  await click(page, '정답 확인');
  const revealed = await bodyText(page);
  ok('정답과 자기평가 버튼이 나온다', revealed.includes('정답') && revealed.includes('확실함'));
  await assertNoLeakedMarkup(page, '플래시카드 정답');
  await click(page, '🙂 알았음');
  ok('자기평가가 다음 문제로 넘긴다', (await bodyText(page)).includes('진행 1 / 34'));

  // ---------- theme 3: the wrong-pick line that used to leak markup ----------
  console.log('\n테마 3 · 오답 선택 표시');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '헌법·규례');
  await page.waitForSelector('.chips button');
  await click(page, '🚀 학습 시작');
  await page.waitForTimeout(200);

  // pick a deliberately wrong option so the "내가 고른 답" line renders
  const wrongPicked = await page.evaluate(() => {
    const answer = document.querySelectorAll('[data-act="pick"]');
    return [...answer].map((b) => b.dataset.value);
  });
  const correctAnswer = await page.evaluate(async () => {
    const mod = await import('./js/lib/csv.js');
    const csv = await (await fetch('./data/quiz_pcusa_constitution.csv')).text();
    const rows = mod.parseCsv(csv);
    const q = document.querySelector('.question').innerText.replace(/^Q\d+\.\s*/, '').trim();
    const row = rows.find((r) => r.question.trim() === q);
    return row ? row.answer : null;
  });
  const wrongOption = wrongPicked.find((v) => v !== correctAnswer);
  await page.locator(`[data-act="pick"][data-value="${wrongOption.replace(/"/g, '\\"')}"]`).click();
  await page.waitForTimeout(150);
  const missed = await bodyText(page);
  ok('오답이면 고른 답을 보여준다', missed.includes('내가 고른 답 · ' + wrongOption),
    missed.slice(0, 160));
  await assertNoLeakedMarkup(page, '객관식 오답');

  // ---------- theme 2: typing, hearts running out ----------
  console.log('\n테마 2 · 받아쓰기 · 게임오버');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '단어순서 외우기');
  await click(page, '✍️ 받아쓰기');
  await click(page, '−');
  await click(page, '−');
  ok('허용 오답을 1로 줄였다', (await page.locator('.stepper__value').innerText()) === '1');
  await click(page, '🎮 게임 시작');
  await page.waitForSelector('#ord-input');

  await page.fill('#ord-input', '창세기');
  await click(page, '확인');
  ok('받아쓰기 정답이 처리된다', (await bodyText(page)).includes('진행 1 / 39'));

  await page.fill('#ord-input', '아무말');
  await click(page, '확인');
  const over = await bodyText(page);
  ok('하트를 다 쓰면 게임 오버', over.includes('게임 오버') && over.includes('1 / 39'));
  await assertNoLeakedMarkup(page, '게임 오버');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/13-ordering-over.png`, fullPage: true });

  // ---------- theme 2: uploaded set, played to the certificate ----------
  console.log('\n테마 2 · CSV 업로드 · 완주');
  const uploadPath = path.join(os.tmpdir(), 'banki-e2e-order.csv');
  fs.writeFileSync(uploadPath, 'order,name_ko,name_en\n2,둘째,Second\n1,첫째,First\n3,셋째,Third\n', 'utf8');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '단어순서 외우기');
  await page.setInputFiles('input[type=file]', uploadPath);
  await page.waitForTimeout(250);
  ok('업로드한 CSV를 읽는다', (await bodyText(page)).includes('banki-e2e-order.csv'));
  await click(page, '🎮 게임 시작');
  await page.waitForSelector('.wordgrid');
  ok('업로드 단어만 출제된다', (await page.locator('.wordgrid button').count()) === 3);

  for (const word of ['첫째', '둘째', '셋째']) await click(page, word);
  const cleared = await bodyText(page);
  ok('완주하면 인증서가 나온다', cleared.includes('순서 암기 인증서'));
  ok('인증서는 확장자 없이 과목을 적는다',
    cleared.includes('banki-e2e-order') && !cleared.includes('banki-e2e-order.csv'));
  ok('인증서에 기록이 담긴다', cleared.includes('틀린 횟수') && cleared.includes('소요 시간'));
  await assertNoLeakedMarkup(page, '순서 인증서');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/14-ordering-cert.png`, fullPage: true });

  // ---------- theme 1: typing check inside 학습, skip queue, certificate ----------
  console.log('\n테마 1 · 학습 채점 · 건너뛰기 · 수료증');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click(page, '성경구절 암기');
  await page.waitForSelector('#verse-file');
  await page.selectOption('#verse-file', 'sample_verses.csv');
  await page.waitForTimeout(120);
  await click(page, '시작하기');
  await page.waitForTimeout(200);

  await click(page, '🙈 가리기');
  await page.fill('#verse-input', '전혀 다른 문장');
  await click(page, '확인하기');
  const learnGraded = await bodyText(page);
  ok('학습 모드 타이핑도 채점된다', /%/.test(learnGraded) && learnGraded.includes('단어 일치'));
  await assertNoLeakedMarkup(page, '학습 채점');
  await click(page, '👀 다시 읽기');

  const totalVerses = Number((await bodyText(page)).match(/진행 0 \/ (\d+)/)[1]);
  for (let i = 0; i < totalVerses; i++) await click(page, '건너뛰기');
  const queueEnd = await bodyText(page);
  ok('건너뛴 구절을 모아 보여준다', queueEnd.includes(`건너뛴 구절이 ${totalVerses}개`));
  await click(page, '건너뛴 구절 다시 학습');
  ok('건너뛴 구절을 다시 큐에 넣는다', (await bodyText(page)).includes('진행 0 /'));

  for (let i = 0; i < totalVerses; i++) await click(page, '건너뛰기');
  await click(page, '그냥 완료하기');
  const finished = await bodyText(page);
  ok('완료하면 수료증이 나온다', finished.includes('수 료 증'));
  ok('수료증에 구절 수가 들어간다', finished.includes(`${totalVerses}구절`));
  await assertNoLeakedMarkup(page, '성경암송 수료증');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/15-verse-cert.png`, fullPage: true });

  // ---------- dark mode ----------
  console.log('\n다크 모드 · 키보드');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('[data-act="theme"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-act="theme"]').click();
  await page.waitForTimeout(150);
  ok('테마 토글이 dark까지 순환한다',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await shot(page, '09-home-dark');

  await click(page, '성경구절 암기');
  await page.waitForSelector('#verse-file');
  await click(page, '시작하기');
  await page.waitForTimeout(200);
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--verse-size'));
  await page.keyboard.press('a');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--verse-size'));
  ok('A 키로 글자가 커진다', parseInt(after, 10) === parseInt(before, 10) + 4,
    `${before} → ${after}`);

  await page.keyboard.press('z');
  await page.waitForTimeout(100);
  const shrunk = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--verse-size'));
  ok('Z 키로 글자가 작아진다', parseInt(shrunk, 10) === parseInt(before, 10),
    `${after} → ${shrunk}`);

  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  ok('스페이스가 기본 동작을 누른다', (await bodyText(page)).includes('구절을 떠올려'));
  await shot(page, '10-verse-dark');

  // ---------- mobile ----------
  console.log('\n모바일 레이아웃');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  const overflow = await mobile.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('가로 스크롤이 없다', overflow <= 0, `overflow ${overflow}px`);
  if (SHOTS) await mobile.screenshot({ path: `${SHOTS}/11-mobile.png`, fullPage: true });
  await mobile.close();

  ok('자바스크립트 오류가 없다', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.error(`  ✗ ${f}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
