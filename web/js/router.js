// Minimal view registry and re-render loop.
//
// Kept separate from app.js so views can import navigate()/rerender() without
// an import cycle back through the module that registers them.

const views = new Map();
let active = null;
let mount = null;

export function register(view) {
  views.set(view.name, view);
}

export function setMount(node) {
  mount = node;
}

export function current() {
  return active;
}

export function rerender() {
  if (!active || !mount) return;
  const scroll = window.scrollY;
  mount.innerHTML = active.render();
  if (active.afterRender) active.afterRender();
  // Re-rendering replaces the whole subtree; keep the viewport where it was
  // unless the view asked to start from the top.
  if (active.resetScroll) {
    window.scrollTo({ top: 0 });
    active.resetScroll = false;
  } else {
    window.scrollTo({ top: scroll });
  }
}

export function navigate(name, params = {}) {
  const view = views.get(name);
  if (!view) return;
  active = view;
  active.resetScroll = true;
  if (active.enter) active.enter(params);
  const hash = name === 'home' ? '' : `#/${name}`;
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', hash || window.location.pathname);
  }
  rerender();
}

export function routeFromHash() {
  const name = (window.location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return views.has(name) ? name : 'home';
}
