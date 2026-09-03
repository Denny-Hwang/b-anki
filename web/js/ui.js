// Rendering helpers: escaping template tag, shared chrome, toast, confetti,
// font size and theme control.

import * as storage from './lib/storage.js';

const MIN_FONT = 16;
const MAX_FONT = 60;
const FONT_STEP = 4;
const DEFAULT_FONT = 28;

// ---------- templating ----------

function format(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(format).join('');
  if (value && value.__raw) return value.value;
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tagged template that escapes every interpolation unless wrapped in raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += format(values[i]) + strings[i + 1];
  return out;
}

/** Mark already-safe markup so html`` leaves it alone. */
export function raw(value) {
  return { __raw: true, value };
}

/**
 * Escape a value for a raw`` fragment.
 *
 * html`` escapes its interpolations already; use this inside the hand-built
 * strings passed to raw(), where nothing else will.
 */
export function esc(value) {
  return format(value);
}

// ---------- font size ----------

export function getFontSize() {
  const saved = storage.getPrefs().fontSize;
  return saved || DEFAULT_FONT;
}

export function setFontSize(size) {
  const clamped = Math.max(MIN_FONT, Math.min(MAX_FONT, size));
  storage.setPref('fontSize', clamped);
  document.documentElement.style.setProperty('--verse-size', `${clamped}px`);
  return clamped;
}

export function stepFontSize(direction) {
  return setFontSize(getFontSize() + direction * FONT_STEP);
}

export function applyStoredFontSize() {
  setFontSize(getFontSize());
}

// ---------- theme ----------

export function currentTheme() {
  return storage.getPrefs().theme || 'auto';
}

function resolveTheme(choice) {
  if (choice === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return choice;
}

export function applyTheme(choice = currentTheme()) {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

/** Cycles auto → light → dark → auto. */
export function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
  storage.setPref('theme', next);
  applyTheme(next);
  return next;
}

const THEME_ICON = { auto: '🌗', light: '☀️', dark: '🌙' };
const THEME_LABEL = { auto: '시스템 설정', light: '밝은 화면', dark: '어두운 화면' };

// ---------- chrome ----------

/**
 * Sticky top bar. `home` adds a back-to-themes button, `font` the A-/A+ pair.
 */
export function appbar({ title, sub = '', home = true, font = false }) {
  return html`
    <header class="appbar">
      ${home ? raw(`<button class="iconbtn" data-act="home" title="테마 선택으로" aria-label="테마 선택으로">←</button>`) : ''}
      <div>
        <div class="appbar__title">${title}</div>
        ${sub ? raw(`<div class="appbar__sub">${format(sub)}</div>`) : ''}
      </div>
      <div class="spacer"></div>
      ${font ? raw(`
        <button class="iconbtn" data-act="font-down" data-key="fontdown" title="글자 작게" aria-label="글자 작게">A−</button>
        <button class="iconbtn" data-act="font-up" data-key="fontup" title="글자 크게" aria-label="글자 크게">A+</button>
      `) : ''}
      <button class="iconbtn" data-act="theme" title="화면 테마: ${THEME_LABEL[currentTheme()]}"
        aria-label="화면 테마 바꾸기">${THEME_ICON[currentTheme()]}</button>
    </header>
  `;
}

export function progress(done, total) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  return html`
    <div class="progress" role="progressbar" aria-valuenow="${done}" aria-valuemin="0"
      aria-valuemax="${total}">
      <div class="progress__bar" style="width:${pct}%"></div>
    </div>
  `;
}

export function segmented(name, options, selected) {
  return html`
    <div class="segmented" role="group">
      ${options.map((opt) => raw(`
        <button type="button" class="segmented__item" data-act="${name}"
          data-value="${format(opt.value)}" aria-pressed="${opt.value === selected}">
          ${format(opt.label)}
          ${opt.desc ? `<span class="segmented__desc">${format(opt.desc)}</span>` : ''}
        </button>
      `))}
    </div>
  `;
}

export function toggle(action, label, on, desc = '') {
  return html`
    <button type="button" class="switch" data-act="${action}" aria-pressed="${!!on}">
      <span>
        <span class="label" style="color:var(--text)">${label}</span>
        ${desc ? raw(`<span class="segmented__desc">${format(desc)}</span>`) : ''}
      </span>
      <span class="switch__track" aria-hidden="true"></span>
    </button>
  `;
}

// ---------- toast ----------

let toastTimer = null;

export function toast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('toast--on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('toast--on'), 2200);
}

// ---------- confetti ----------

/** Small self-contained celebration; no library, respects reduced motion. */
export function celebrate(durationMs = 2200) {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.scale(dpr, dpr);

  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.5,
    w: 5 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    vy: 1.6 + Math.random() * 2.6,
    vx: -0.9 + Math.random() * 1.8,
    spin: -0.12 + Math.random() * 0.24,
    angle: Math.random() * Math.PI,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const started = performance.now();
  function frame(now) {
    const elapsed = now - started;
    ctx.clearRect(0, 0, width, height);
    const fade = Math.max(0, 1 - Math.max(0, elapsed - durationMs * 0.6) / (durationMs * 0.4));
    ctx.globalAlpha = fade;
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }
  requestAnimationFrame(frame);
}

// ---------- misc ----------

export function scoreClass(score) {
  if (score >= 80) return 'score--good';
  if (score >= 50) return 'score--ok';
  return 'score--bad';
}

const GRADE_THRESHOLDS = [[95, 'S'], [85, 'A+'], [75, 'A'], [65, 'B'], [55, 'C'], [0, 'D']];

export function computeGrade(score) {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return 'D';
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}분 ${total % 60}초`;
}

export function todayLabel(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Preserve a textarea/input value across a re-render. */
export function readInput(id) {
  const node = document.getElementById(id);
  return node ? node.value : '';
}

export function focusInput(id) {
  const node = document.getElementById(id);
  if (node) node.focus();
}
