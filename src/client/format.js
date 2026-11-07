/**
 * The glyph a currency is read with on the badge.
 *
 * Unknown codes fall back to the code itself rather than to a yen sign:
 * showing the wrong currency symbol on a money figure is worse than showing
 * none.
 */
const CURRENCY_SYMBOLS = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  KRW: '₩',
}

/**
 * Format a monetary amount with its currency.
 * @param {number} amount The amount.
 * @param {string | undefined} currency Currency code.
 * @returns {string} The formatted amount.
 */
function formatAmount(amount, currency) {
  const value = Math.abs(amount) >= 0.01 ? amount.toFixed(2) : amount.toFixed(4)
  const code = typeof currency === 'string' && currency !== '' ? currency : 'CNY'
  const symbol = CURRENCY_SYMBOLS[code]
  return symbol === undefined ? `${code} ${value}` : `${symbol}${value}`
}

/**
 * Format a span in milliseconds as a readable duration.
 *
 * A plan window is hours or days away, so a raw millisecond count says
 * nothing; the units come from the locale.
 *
 * @param {number} ms Duration in milliseconds.
 * @param {(key: string, params?: object) => string} t Translator.
 * @returns {string} The readable duration.
 */
function formatDuration(ms, t) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  // Round rather than floor: a window 4d 2h 59m 59s away is four days and
  // three hours for every practical purpose, and flooring would report it
  // a whole unit short for the final minute of every window.
  const totalMinutes = Math.round(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return t('duration.daysHours', { days, hours })
  if (hours > 0) return t('duration.hoursMinutes', { hours, minutes })
  if (minutes > 0) return t('duration.minutes', { minutes })
  return t('duration.lessThanMinute')
}

/**
 * Format a reset instant as a full local date and time.
 *
 * The countdown says how soon; this says exactly when, so a reset that is
 * days away is unambiguous without counting on your fingers.
 *
 * @param {number} epochMs Reset instant.
 * @returns {string} `YYYY-MM-DD HH:MM:SS` in local time.
 */
function formatResetAt(epochMs) {
  const at = new Date(epochMs)
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    ` ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  )
}

/**
 * Group digits so a five-figure quota stays readable.
 * @param {number} value The number.
 * @returns {string} The formatted number.
 */
function formatNumber(value) {
  return Number.isInteger(value) ? value.toLocaleString() : String(value)
}

/** How long a finished turn's difference stays on the badge. */
const CONSUMPTION_MS = 10 * 1000

/**
 * How often the badge re-reads the platform status.
 *
 * The dot speaks for the platform at a glance, so it cannot wait for the
 * panel to open. The Host caches each status source for the same minute,
 * so this cadence costs at most one upstream fetch per source per minute
 * however many browser tabs are open.
 */
const STATUS_REFRESH_MS = 60 * 1000

/**
 * Whether a reading's difference is still worth showing.
 *
 * A difference with nothing to say — none at all, or a magnitude that
 * rounds away at display precision — is treated as absent, so the badge
 * does not flicker through a `↓0.00` that carries no information.
 *
 * @param {{kind: string, delta: number, at: number} | undefined} consumption The difference.
 * @param {number} now The current instant.
 * @returns {boolean} True while it should be shown.
 */
function consumptionFreshAt(consumption, now) {
  if (!consumption) return false
  if (!Number.isFinite(consumption.delta)) return false
  if (formatDelta(consumption) === '') return false
  return now - consumption.at < CONSUMPTION_MS
}

/**
 * The magnitude of a difference, without its sign.
 * @param {{kind: string, delta: number}} consumption The difference.
 * @returns {string} The formatted magnitude, or an empty string when it
 *   rounds away.
 */
function formatDelta(consumption) {
  const magnitude = Math.abs(consumption.delta)
  if (consumption.kind === 'percent') {
    // A plan window moves in whole points at most turns, so a whole number
    // is right — but a turn that moves a fifth of a point is still a real
    // cost, and rounding it to 0% would hide it.
    if (magnitude >= 0.95) return `${String(Math.round(magnitude))}%`
    if (magnitude >= 0.05) return `${magnitude.toFixed(1)}%`
    return ''
  }
  // Filter out floating-point noise: values smaller than 0.00005 round to
  // 0.0000 at 4 decimal places and carry no meaningful information. This
  // catches artifacts like -0.00002 from IEEE 754 subtraction.
  if (magnitude < 0.00005) return ''
  // Matches how the balance itself is rendered: two decimals once they mean
  // something, four while the amounts are fractional cents.
  const value = magnitude >= 0.01 ? magnitude.toFixed(2) : magnitude.toFixed(4)
  return value
}

/**
 * Format an instant as a wall clock, for the footer's reading time.
 * @param {number} epochMs The instant.
 * @returns {string} `HH:MM:SS` in local time.
 */
function formatClock(epochMs) {
  const at = new Date(epochMs)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

export {
  consumptionFreshAt,
  formatAmount,
  formatClock,
  formatDelta,
  formatDuration,
  formatNumber,
  formatResetAt,
  STATUS_REFRESH_MS,
}
