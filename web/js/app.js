// Entry point: registers views, wires global actions and keyboard shortcuts.

import * as router from './router.js';
import * as ui from './ui.js';
import { saveCertificatePng } from './lib/certificate.js';

import homeView from './views/home.js';
import verseView from './views/verse.js';
import orderingView from './views/ordering.js';
import quizView from './views/quiz.js';

[homeView, verseView, orderingView, quizView].forEach(router.register);

const app = document.getElementById('app');
router.setMount(app);

// ---------- global actions ----------
// Handled here so every view gets the app bar, theme and certificate buttons
// for free; anything else falls through to the active view.

const GLOBAL_ACTIONS = {
  home() {
    router.navigate('home');
  },
  theme() {
    ui.applyTheme(ui.cycleTheme());
    router.rerender();
  },
  'font-up'() {
    ui.stepFontSize(1);
  },
  'font-down'() {
    ui.stepFontSize(-1);
  },
  'cert-save'(el) {
    saveCertificatePng(el.dataset.prefix || 'b-anki');
  },
};

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.disabled) return;
  const action = target.dataset.act;

  const globalHandler = GLOBAL_ACTIONS[action];
  if (globalHandler) {
    globalHandler(target, event);
    return;
  }
  const view = router.current();
  if (view && view.onAction) view.onAction(action, target, event);
});

// A change event covers <select> and file inputs, which never emit clicks.
app.addEventListener('change', (event) => {
  const target = event.target.closest('[data-change]');
  if (!target) return;
  const view = router.current();
  if (view && view.onChange) view.onChange(target.dataset.change, target, event);
});

// ---------- keyboard shortcuts ----------
// Buttons declare the key they answer to with data-key, so a shortcut is a
// property of the button rather than a fragile match on its label.

const KEY_MAP = {
  ' ': 'space',
  Spacebar: 'space',
  ArrowRight: 'next',
  ArrowLeft: 'prev',
  h: 'hint',
  H: 'hint',
  r: 'again',
  R: 'again',
  s: 'skip',
  S: 'skip',
};

function pressKey(name) {
  const button = app.querySelector(`[data-key="${name}"]:not([disabled])`);
  if (!button) return false;
  button.click();
  return true;
}

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target;
  const typing = target
    && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  if (typing) {
    // Enter submits a single-line answer; a textarea keeps Enter for newlines.
    if (event.key === 'Enter' && target.tagName === 'INPUT') {
      if (pressKey('submit') || pressKey('space')) event.preventDefault();
    }
    return;
  }

  if (event.key === '+' || event.key === '=' || event.key === 'a') {
    ui.stepFontSize(1);
    return;
  }
  if (event.key === '-' || event.key === 'z') {
    ui.stepFontSize(-1);
    return;
  }

  const slot = KEY_MAP[event.key];
  if (!slot) return;
  // Space and the arrows would otherwise scroll the page.
  if (pressKey(slot) && (slot === 'space' || slot === 'next' || slot === 'prev')) {
    event.preventDefault();
  }
});

// ---------- boot ----------

ui.applyTheme();
ui.applyStoredFontSize();

window.addEventListener('hashchange', () => {
  const name = router.routeFromHash();
  if (!router.current() || router.current().name !== name) router.navigate(name);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (ui.currentTheme() === 'auto') ui.applyTheme();
});

router.navigate(router.routeFromHash());
