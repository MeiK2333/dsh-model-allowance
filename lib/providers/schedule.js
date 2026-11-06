/**
 * Time-of-day pricing schedules.
 *
 * DeepSeek charges half price outside its peak windows, and its docs define
 * those windows by wall clock in a named zone: Monday to Friday, 09:00–12:00
 * and 14:00–18:00 Beijing time, with Chinese statutory holidays counting as
 * off-peak all day. That is three facts a vendor file should be able to state
 * without writing code — the browser turns them into a phase and a countdown.
 *
 * A schedule is data, not a clock: the Host publishes it, and the browser
 * evaluates it against its own ticking clock, so the countdown is smooth with
 * no extra round trips.
 */

/** HH:MM in 24-hour wall time. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** ISO calendar date, in the schedule's own zone. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse one `HH:MM` string to minutes since midnight.
 * @param {string} value Wall-clock time.
 * @returns {number} Minutes since midnight.
 */
export function timeToMinutes(value) {
  const match = TIME_PATTERN.exec(value)
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * @typedef {object} ScheduleWindow
 * @property {string} from Wall-clock start, `HH:MM`.
 * @property {string} to Wall-clock end, `HH:MM`; must be later than `from`.
 */

/**
 * @typedef {object} Schedule
 * @property {string} timezone IANA zone the wall-clock times refer to.
 * @property {{zh: string, en: string}} timezoneLabel The zone's name for the card.
 * @property {readonly number[]} days Weekdays the peak windows apply to, `0` = Sunday.
 * @property {readonly ScheduleWindow[]} windows Peak windows within those days.
 * @property {readonly string[]} holidays Dates in that zone that are off-peak all day.
 * @property {{zh: string, en: string}} [note] One line about what the phase means.
 */

/**
 * Declare one vendor's time-of-day pricing schedule, refusing an unusable one.
 *
 * Only same-day windows are modeled: a peak period that crosses midnight can
 * be written as two windows, which keeps the phase test a plain comparison.
 *
 * @param {object} spec The declaration.
 * @returns {Schedule} The frozen schedule.
 */
export function defineSchedule(spec) {
  const where = 'schedule'
  if (typeof spec?.timezone !== 'string' || spec.timezone === '') {
    throw new Error(`${where} needs an IANA time zone`)
  }
  try {
    // Throws on a zone this runtime cannot resolve.
    new Intl.DateTimeFormat('en-US', { timeZone: spec.timezone })
  } catch {
    throw new Error(`${where} names an unknown time zone "${spec.timezone}"`)
  }
  for (const key of ['zh', 'en']) {
    const label = spec?.timezoneLabel?.[key]
    if (typeof label !== 'string' || label === '') {
      throw new Error(`${where} needs a time-zone label for ${key}`)
    }
  }
  const days = spec.days
  if (!Array.isArray(days) || days.length === 0) throw new Error(`${where} declares no weekdays`)
  for (const day of days) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(`${where} has an invalid weekday ${String(day)}`)
    }
  }
  if (new Set(days).size !== days.length) throw new Error(`${where} repeats a weekday`)

  const windows = spec.windows
  if (!Array.isArray(windows) || windows.length === 0) throw new Error(`${where} declares no window`)
  for (const window of windows) {
    if (!TIME_PATTERN.test(String(window?.from)) || !TIME_PATTERN.test(String(window?.to))) {
      throw new Error(`${where} has a window that is not HH:MM`)
    }
    if (timeToMinutes(window.from) >= timeToMinutes(window.to)) {
      throw new Error(`${where} has a window that does not end after it starts`)
    }
  }

  const holidays = spec.holidays ?? []
  if (!Array.isArray(holidays)) throw new Error(`${where} holidays must be a list`)
  for (const holiday of holidays) {
    if (!DATE_PATTERN.test(String(holiday))) {
      throw new Error(`${where} has an invalid holiday date ${JSON.stringify(holiday)}`)
    }
    const parsed = Date.parse(`${holiday}T00:00:00Z`)
    if (Number.isNaN(parsed)) throw new Error(`${where} has an invalid holiday date ${holiday}`)
  }

  const note = spec.note
  if (note !== undefined) {
    for (const key of ['zh', 'en']) {
      if (typeof note?.[key] !== 'string' || note[key] === '') {
        throw new Error(`${where} needs a note for ${key}`)
      }
    }
  }

  return Object.freeze({
    timezone: spec.timezone,
    timezoneLabel: Object.freeze({ zh: spec.timezoneLabel.zh, en: spec.timezoneLabel.en }),
    days: Object.freeze([...days]),
    windows: Object.freeze(
      windows.map((window) => Object.freeze({ from: window.from, to: window.to })),
    ),
    holidays: Object.freeze([...holidays]),
    ...(note === undefined ? {} : { note: Object.freeze({ zh: note.zh, en: note.en }) }),
  })
}
