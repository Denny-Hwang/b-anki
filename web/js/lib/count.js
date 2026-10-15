// How many verses one study session covers. 0 stands for "all of them".

/** Quick picks offered as chips; only those smaller than the set are shown. */
export const COUNT_PRESETS = [5, 10, 15, 20];

/**
 * A stored or chosen count, made to make sense for a set of `total` cards.
 *
 * Anything that is not a positive whole number — or that would cover the whole
 * set anyway — is 0, so a saved "20" quietly means "all" on a 13-verse set
 * without the saved choice having to be rewritten.
 */
export function normalizeCount(raw, total = Infinity) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n >= total) return 0;
  return n;
}

/** How many cards a session over this set will actually hold. */
export function sessionSize(count, total) {
  return normalizeCount(count, total) || total;
}

/** One press of the stepper's − or +. Reaching the size of the set means "all". */
export function stepCount(count, total, delta) {
  const next = Math.max(1, Math.min(total, sessionSize(count, total) + delta));
  return normalizeCount(next, total);
}

/** The chips offered for a set of `total` cards. */
export function countPresets(total) {
  return COUNT_PRESETS.filter((n) => n < total);
}

/** The first `count` entries of an already ordered queue, or all of it. */
export function limitQueue(order, count) {
  const n = normalizeCount(count, order.length);
  return n ? order.slice(0, n) : order;
}
