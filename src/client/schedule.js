import { createElement as h } from 'react'
import { activeLanguage } from './locales.js'

/**
 * The pricing schedule the Host publishes for one route.
 * @typedef {object} ClientSchedule
 * @property {string} provider Route the schedule belongs to.
 * @property {string} timezone IANA zone the wall-clock times refer to.
 * @property {{zh?: string, en?: string}} timezoneLabel Localized zone name.
 * @property {number[]} days Weekdays the peak windows apply to.
 * @property {{from: string, to: string}[]} windows Peak windows.
 * @property {string[]} [holidays] Off-peak dates.
 * @property {{zh?: string, en?: string}} [note] One line about the phase.
 */

/**
 * Format a countdown as `dd.HH:MM:SS`, or `HH:MM:SS` within a day.
 *
 * The day prefix only appears when there is a whole day to count, so a
 * window inside 24 hours is not padded with a `00.` that reads as noise.
 * Beyond a day the field is zero-padded and always present, so the string
 * does not change width as the clock ticks.
 *
 * @param {number} ms Remaining milliseconds.
 * @returns {string} The countdown.
 */
export function formatCountdown(ms) {
  const remaining = Number.isFinite(ms) && ms > 0 ? ms : 0
  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return days > 0 ? `${pad(days)}.${clock}` : clock
}

/** Two-digit clock segment. */
const pad2 = (value) => String(value).padStart(2, '0')

/** Zone formatters, built once: constructing one is not free. */
const ZONE_FORMATTERS = new Map()

/**
 * The formatter for one zone, built once.
 * @param {string} timeZone IANA zone.
 * @returns {Intl.DateTimeFormat} The formatter.
 */
function zoneFormatter(timeZone) {
  let formatter = ZONE_FORMATTERS.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    })
    ZONE_FORMATTERS.set(timeZone, formatter)
  }
  return formatter
}

/**
 * The wall-clock parts of one instant in a named zone.
 * @param {number} ms The instant.
 * @param {string} timeZone IANA zone.
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: number}}
 *   The zone's calendar and clock at that instant.
 */
function zoneParts(ms, timeZone) {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(ms))
  const value = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    // Some runtimes render midnight as 24 with hour12 turned off.
    hour: Number(value('hour')) % 24,
    minute: Number(value('minute')),
    second: Number(value('second')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday')),
  }
}

/**
 * A zone's offset from UTC at one instant, in milliseconds.
 * @param {number} ms The instant.
 * @param {string} timeZone IANA zone.
 * @returns {number} The offset.
 */
function zoneOffsetMs(ms, timeZone) {
  const parts = zoneParts(ms, timeZone)
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return wall - Math.floor(ms / 1000) * 1000
}

/**
 * The instant at which a wall-clock time occurs in a zone.
 *
 * Two passes: the first lands within a day of the answer, the second
 * corrects for a DST transition between the guess and the answer.
 *
 * @param {string} timeZone IANA zone.
 * @param {number} year Calendar year.
 * @param {number} month Calendar month, 1-based.
 * @param {number} day Calendar day.
 * @param {number} hour Wall-clock hour.
 * @param {number} minute Wall-clock minute.
 * @returns {number} Epoch milliseconds.
 */
function zoneInstant(timeZone, year, month, day, hour, minute) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0)
  const first = wall - zoneOffsetMs(wall, timeZone)
  return wall - zoneOffsetMs(first, timeZone)
}

/**
 * Minutes since midnight for one `HH:MM` wall time.
 * @param {string} time Wall-clock time.
 * @returns {number} Minutes since midnight.
 */
function wallMinutes(time) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

/**
 * A position within a day, as the percentage string a timeline needs.
 * @param {number} minutes Minutes since midnight.
 * @returns {string} The percentage, two decimals at most.
 */
function dayPercent(minutes) {
  return `${String(Number(((minutes / 1440) * 100).toFixed(2)))}%`
}

/**
 * The schedule's phase at one instant.
 * @param {ClientSchedule} schedule The schedule.
 * @param {number} now The instant.
 * @returns {'peak'|'off-peak'} The phase.
 */
export function schedulePhase(schedule, now) {
  const parts = zoneParts(now, schedule.timezone)
  const date = `${String(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`
  if ((schedule.holidays ?? []).includes(date)) return 'off-peak'
  if (!schedule.days.includes(parts.weekday)) return 'off-peak'
  const minutes = parts.hour * 60 + parts.minute
  for (const window of schedule.windows) {
    if (minutes >= wallMinutes(window.from) && minutes < wallMinutes(window.to)) return 'peak'
  }
  return 'off-peak'
}

/**
 * The next instant at which the phase flips.
 *
 * Only window edges are transitions: outside the windows the phase is
 * always off-peak, so a weekend or a holiday needs no boundary of its own.
 * Ten days reach past the longest statutory break to the next window.
 *
 * @param {ClientSchedule} schedule The schedule.
 * @param {number} now The instant.
 * @returns {number | undefined} The next change, when one is within reach.
 */
export function nextScheduleChange(schedule, now) {
  const parts = zoneParts(now, schedule.timezone)
  let next
  for (let offset = 0; offset <= 10; offset += 1) {
    const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + offset * 86_400_000)
    const year = day.getUTCFullYear()
    const month = day.getUTCMonth() + 1
    const date = day.getUTCDate()
    const key = `${String(year)}-${pad2(month)}-${pad2(date)}`
    if ((schedule.holidays ?? []).includes(key)) continue
    if (!schedule.days.includes(day.getUTCDay())) continue
    for (const window of schedule.windows) {
      for (const time of [window.from, window.to]) {
        const [hour, minute] = time.split(':').map(Number)
        const at = zoneInstant(schedule.timezone, year, month, date, hour, minute)
        if (at > now && (next === undefined || at < next)) next = at
      }
    }
  }
  return next
}

/**
 * The time-of-day pricing block.
 *
 * A 24-hour strip for the vendor's day: the peak windows are drawn on it,
 * and a cursor marks where the clock is, so the schedule, the current
 * position, and the countdown read as one picture. The rule itself sits
 * behind the help mark.
 *
 * @param {ClientSchedule} schedule The schedule.
 * @param {number} now The instant the card is showing.
 * @param {(key: string, params?: object) => string} t Translator.
 * @returns {object} The block.
 */
export function scheduleView(schedule, now, t) {
  const language = activeLanguage()
  const phase = schedulePhase(schedule, now)
  const change = nextScheduleChange(schedule, now)
  const separator = language === 'zh' ? '、' : ', '
  const windows = schedule.windows.map((window) => `${window.from}–${window.to}`).join(separator)
  const days =
    schedule.days.length === 7
      ? t('schedule.daysDaily')
      : [1, 2, 3, 4, 5].every((day) => schedule.days.includes(day))
        ? t('schedule.daysWeekdays')
        : t('schedule.daysOther')
  const timezone =
    schedule.timezoneLabel?.[language] ?? schedule.timezoneLabel?.en ?? schedule.timezone
  const note = schedule.note?.[language] ?? schedule.note?.en ?? schedule.note?.zh
  const rules = [t('schedule.ranges', { days, windows, timezone })]
  if ((schedule.holidays ?? []).length > 0) rules.push(t('schedule.holidays'))
  if (note !== undefined) rules.push(note)

  // The strip describes the vendor's own day, so a window sits where its
  // wall-clock time says it does. A day that is off-peak all along — a
  // weekend or a statutory holiday — draws no blocks at all.
  const parts = zoneParts(now, schedule.timezone)
  const date = `${String(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`
  const offToday =
    (schedule.holidays ?? []).includes(date) || !schedule.days.includes(parts.weekday)
  const segments = offToday
    ? []
    : schedule.windows.map((window) => ({
        left: dayPercent(wallMinutes(window.from)),
        width: dayPercent(wallMinutes(window.to) - wallMinutes(window.from)),
      }))
  const cursor = dayPercent(parts.hour * 60 + parts.minute + parts.second / 60)

  return h(
    'div',
    { className: 'dsh-model-allowance-schedule', 'data-phase': phase },
    h(
      'div',
      { className: 'dsh-model-allowance-schedule-head' },
      h(
        'span',
        { className: 'dsh-model-allowance-schedule-title' },
        phase === 'peak' ? t('schedule.peakTitle') : t('schedule.offPeakTitle'),
      ),
      // The rule itself is one hover — or one keyboard focus — away.
      h(
        'span',
        {
          className: 'dsh-model-allowance-schedule-help',
          tabIndex: 0,
          role: 'note',
          'aria-label': rules.join(' '),
        },
        h('span', { 'aria-hidden': true }, '?'),
        h(
          'span',
          { className: 'dsh-model-allowance-schedule-tip', role: 'tooltip' },
          ...rules.map((line, index) =>
            h(
              'span',
              {
                key: `rule-${String(index)}`,
                className: 'dsh-model-allowance-schedule-tip-line',
              },
              line,
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'dsh-model-allowance-schedule-timeline', role: 'img', 'aria-label': rules[0] },
      ...segments.map((segment, index) =>
        h('span', {
          key: `peak-${String(index)}`,
          className: 'dsh-model-allowance-schedule-timeline-peak',
          style: { left: segment.left, width: segment.width },
        }),
      ),
      h('span', {
        className: 'dsh-model-allowance-schedule-timeline-now',
        style: { left: cursor },
      }),
    ),
    // Quarter ticks: the strip is the vendor's day, so the scale is its
    // wall clock, matching the windows drawn on it.
    h(
      'div',
      { className: 'dsh-model-allowance-schedule-ticks' },
      ...['00:00', '06:00', '12:00', '18:00', '24:00'].map((tick) =>
        h('span', { key: tick, className: 'dsh-model-allowance-schedule-tick' }, tick),
      ),
    ),
    change === undefined
      ? null
      : h(
          'div',
          { className: 'dsh-model-allowance-schedule-countdown' },
          t(phase === 'peak' ? 'schedule.toOffPeak' : 'schedule.toPeak', {
            duration: formatCountdown(change - now),
          }),
        ),
  )
}
