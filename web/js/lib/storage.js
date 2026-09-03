// Per-browser persistence, replacing the server-side SQLite in banki/storage.py.
//
// The Streamlit build kept every learner's progress in one SQLite file on the
// server's ephemeral disk: it was wiped on each redeploy and anyone who knew a
// name could read that person's stats. Here each browser keeps its own data, so
// progress survives redeploys and never leaves the device — at the cost of not
// syncing across devices, which exportAll()/importAll() covers.

const PREFIX = 'banki.v1';
const USERS_KEY = `${PREFIX}.users`;
const PREFS_KEY = `${PREFIX}.prefs`;
const MAX_LOG = 5000;

/** localStorage throws in private mode and when quota is exhausted. */
const memoryFallback = new Map();
let warned = false;

function backendGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryFallback.has(key) ? memoryFallback.get(key) : null;
  }
}

function backendSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    memoryFallback.set(key, value);
    if (!warned) {
      warned = true;
      console.warn('진도 저장에 실패했습니다. 이 탭에서만 기록이 유지됩니다.', err);
    }
  }
}

function backendRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memoryFallback.delete(key);
  }
}

function readJson(key, fallback) {
  const raw = backendGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  backendSet(key, JSON.stringify(value));
}

// ---------- preferences ----------

export function getPrefs() {
  return { lastUser: '', fontSize: null, theme: 'auto', ...readJson(PREFS_KEY, {}) };
}

export function setPref(key, value) {
  writeJson(PREFS_KEY, { ...getPrefs(), [key]: value });
}

// ---------- users ----------

export function normalizeName(name) {
  return (name || '').trim() || '익명';
}

export function listUsers() {
  return readJson(USERS_KEY, []);
}

function userKey(name) {
  return `${PREFIX}.user.${name}`;
}

function emptyUser(name) {
  return { name, created_at: new Date().toISOString(), cards: {}, log: [], sessions: [] };
}

function readUser(name) {
  return { ...emptyUser(name), ...readJson(userKey(name), {}) };
}

function writeUser(name, record) {
  writeJson(userKey(name), record);
}

export function hasUser(name) {
  return listUsers().includes(normalizeName(name));
}

/** Returns the canonical user name, registering it on first use. */
export function getOrCreateUser(rawName) {
  const name = normalizeName(rawName);
  const users = listUsers();
  if (!users.includes(name)) {
    users.push(name);
    users.sort();
    writeJson(USERS_KEY, users);
    writeUser(name, emptyUser(name));
  }
  return name;
}

export function deleteUser(rawName) {
  const name = normalizeName(rawName);
  writeJson(USERS_KEY, listUsers().filter((u) => u !== name));
  backendRemove(userKey(name));
}

// ---------- card review state ----------

/**
 * Card states are keyed by set + card. The separator is a space because both
 * halves already come from a filename and a verse location or question id,
 * neither of which the app generates.
 */
function cardKey(setName, location) {
  return `${setName} ${location}`;
}

export function getCardState(name, setName, location) {
  return readUser(normalizeName(name)).cards[cardKey(setName, location)] || null;
}

export function loadCardStates(name, setName, locations) {
  const record = readUser(normalizeName(name));
  const out = {};
  locations.forEach((location) => {
    const state = record.cards[cardKey(setName, location)];
    if (state) out[location] = state;
  });
  return out;
}

export function saveCardState(name, setName, location, state) {
  const user = normalizeName(name);
  const record = readUser(user);
  record.cards[cardKey(setName, location)] = state;
  writeUser(user, record);
}

export function logReview(name, setName, location, rating, score) {
  const user = normalizeName(name);
  const record = readUser(user);
  record.log.push({
    set_name: setName,
    location,
    rating,
    score: score ?? null,
    reviewed_at: new Date().toISOString(),
  });
  if (record.log.length > MAX_LOG) record.log = record.log.slice(-MAX_LOG);
  writeUser(user, record);
}

// ---------- sessions ----------

export function startSession(name, setName, mode) {
  const user = normalizeName(name);
  const record = readUser(user);
  record.sessions.push({
    set_name: setName,
    mode,
    started_at: new Date().toISOString(),
    ended_at: null,
    cards_reviewed: 0,
    avg_score: null,
  });
  writeUser(user, record);
  return record.sessions.length - 1;
}

export function endSession(name, sessionId, cardsReviewed, avgScore) {
  const user = normalizeName(name);
  const record = readUser(user);
  const session = record.sessions[sessionId];
  if (!session) return;
  session.ended_at = new Date().toISOString();
  session.cards_reviewed = cardsReviewed;
  session.avg_score = avgScore ?? null;
  writeUser(user, record);
}

// ---------- reporting ----------

export function getDueCount(name, setName, today) {
  const record = readUser(normalizeName(name));
  const prefix = `${setName} `;
  return Object.entries(record.cards).filter(
    ([key, state]) => key.startsWith(prefix) && state.due_date && state.due_date <= today,
  ).length;
}

export function getUserStats(name) {
  const record = readUser(normalizeName(name));
  const log = record.log;
  const scored = log.filter((r) => typeof r.score === 'number');

  const perDayMap = new Map();
  log.forEach((r) => {
    const day = r.reviewed_at.slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) || 0) + 1);
  });

  return {
    total_reviews: log.length,
    cards_seen: new Set(log.map((r) => r.location)).size,
    avg_accuracy: scored.length
      ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length)
      : null,
    per_day: [...perDayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    sessions: record.sessions
      .filter((s) => s.ended_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 30),
  };
}

/**
 * Consecutive days of reviews ending today.
 *
 * Matches banki/storage.py: a streak requires a review today, so it reads 0
 * until the first card of the day is done.
 */
export function computeStreak(name, today) {
  const record = readUser(normalizeName(name));
  const days = [...new Set(record.log.map((r) => r.reviewed_at.slice(0, 10)))].sort().reverse();
  if (!days.length) return 0;

  let streak = 0;
  let expected = today;
  for (const day of days) {
    if (day !== expected) break;
    streak++;
    const [y, m, d] = expected.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    expected = [
      prev.getFullYear(),
      String(prev.getMonth() + 1).padStart(2, '0'),
      String(prev.getDate()).padStart(2, '0'),
    ].join('-');
  }
  return streak;
}

/** Cards the learner has lapsed on most, hardest first. */
export function getHardCards(name, setName, limit = 10) {
  const record = readUser(normalizeName(name));
  const prefix = `${setName} `;
  return Object.entries(record.cards)
    .filter(([key, state]) => key.startsWith(prefix) && state.lapses > 0)
    .map(([key, state]) => ({
      location: key.slice(prefix.length),
      lapses: state.lapses,
      ease: state.ease,
    }))
    .sort((a, b) => b.lapses - a.lapses || a.ease - b.ease)
    .slice(0, limit);
}

// ---------- backup ----------

export function exportAll() {
  return {
    format: 'b-anki-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    prefs: getPrefs(),
    users: listUsers().map((name) => readUser(name)),
  };
}

/** Merge a backup into this browser. Returns the number of users restored. */
export function importAll(payload) {
  if (!payload || payload.format !== 'b-anki-backup' || !Array.isArray(payload.users)) {
    throw new Error('B-Anki 백업 파일이 아닙니다.');
  }
  const users = new Set(listUsers());
  payload.users.forEach((incoming) => {
    if (!incoming || !incoming.name) return;
    const name = normalizeName(incoming.name);
    const current = readUser(name);
    writeUser(name, {
      name,
      created_at: incoming.created_at || current.created_at,
      cards: { ...current.cards, ...(incoming.cards || {}) },
      log: [...current.log, ...(incoming.log || [])].slice(-MAX_LOG),
      sessions: [...current.sessions, ...(incoming.sessions || [])],
    });
    users.add(name);
  });
  writeJson(USERS_KEY, [...users].sort());
  return payload.users.length;
}
