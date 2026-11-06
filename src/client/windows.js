import { formatNumber } from './format.js'
import { activeLanguage } from './locales.js'

/**
 * One metering window as the Host publishes it.
 * @typedef {object} ClientWindow
 * @property {string} id Window identity.
 * @property {'hour'|'day'|'week'|'month'|'unknown'} unit Length unit.
 * @property {{zh?: string, en?: string}} [label] Vendor-specific display name.
 * @property {number} [count] How many units long the window is.
 * @property {number} [used] Allowance already spent.
 * @property {number} [total] Allowance included in the window.
 * @property {number} [remainingPercent] Share still available.
 * @property {number} [resetAt] Epoch milliseconds of the next reset.
 */

/**
 * Name a metering window.
 *
 * A plan can meter two windows in the same unit — Kimi reports a monthly total
 * and a monthly code quota — so a vendor-supplied label wins over the generic
 * unit name.
 *
 * @param {ClientWindow} window The window.
 * @param {(key: string, params?: object) => string} t Translator.
 * @returns {string} The window title.
 */
export function windowTitle(window, t) {
  const label = window.label?.[activeLanguage()] ?? window.label?.en ?? window.label?.zh
  if (typeof label === 'string' && label !== '') return label
  if (window.unit === 'hour' && window.count) {
    return t('window.title.hour', { count: window.count })
  }
  // A weekly window may be reported as one week or as seven days; both are
  // the same cadence and read best as "weekly".
  if (window.unit === 'week') return t('window.title.week')
  if (window.unit === 'day' && window.count === 7) return t('window.title.week')
  if (window.unit === 'day' && window.count) {
    return t('window.title.day', { count: window.count })
  }
  if (window.unit === 'month') return t('window.title.month')
  return t('window.title.unknown')
}

/**
 * How much of a window's allowance has been spent, as a percentage.
 *
 * The percentage is what the bar and the headline both read, so it is
 * derived once: from the remaining share when the provider reports one, and
 * from used over total otherwise. It may exceed 100 — a plan can be
 * overrun — and the bar clamps while the number stays honest.
 *
 * @param {ClientWindow} window The window.
 * @returns {number | undefined} The consumed percentage.
 */
export function windowUsedPercent(window) {
  if (typeof window.remainingPercent === 'number') return 100 - window.remainingPercent
  if (typeof window.used === 'number' && typeof window.total === 'number' && window.total > 0) {
    return (window.used / window.total) * 100
  }
  return undefined
}

/** Milliseconds per window unit, for ordering windows by their length. */
const UNIT_MS = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
}

/**
 * The window a plan meters most finely: the shortest one it reports.
 *
 * A coding plan meters a short rolling window and a long one, and the
 * short window is the allowance a turn spends first — so it is the number
 * that moves, and the one the badge speaks for. A window whose length the
 * plan does not state cannot be ordered against the others and is skipped;
 * the caller falls back to the reading's own percentage for those.
 *
 * @param {ClientWindow[]} windows Reported windows.
 * @returns {ClientWindow | undefined} The shortest window reporting a percentage.
 */
export function shortestWindow(windows) {
  let shortest
  let shortestMs = Number.POSITIVE_INFINITY
  for (const window of windows) {
    if (typeof window.remainingPercent !== 'number') continue
    const unit = UNIT_MS[window.unit]
    if (unit === undefined) continue
    const count = typeof window.count === 'number' && window.count > 0 ? window.count : 1
    const lengthMs = unit * count
    if (lengthMs < shortestMs) {
      shortest = window
      shortestMs = lengthMs
    }
  }
  return shortest
}

/**
 * The "used / total" label, when the provider meters in countable units.
 * @param {ClientWindow} window The window.
 * @param {(key: string, params?: object) => string} t Translator.
 * @returns {string | undefined} The label, or undefined when the provider
 *   reports only a percentage.
 */
export function windowUsage(window, t) {
  if (typeof window.total !== 'number' || typeof window.used !== 'number') return undefined
  return t('window.usedOfTotal', {
    used: formatNumber(window.used),
    total: formatNumber(window.total),
  })
}

/**
 * Severity of a consumption level, for colouring the bar.
 * @param {number} percent Consumed percentage.
 * @returns {'ok'|'warn'|'error'} The tone.
 */
export function barTone(percent) {
  if (percent >= 85) return 'error'
  if (percent >= 60) return 'warn'
  return 'ok'
}
