/**
 * Kimi for Coding adapter.
 *
 * The official kimi-cli exposes the plan through `GET {base}/usages` with the
 * account key. The body has changed shape across releases: older responses
 * carry one `usage` bucket plus rate-limit `limits`, newer ones carry a
 * `usages` map whose entries report a 0–1 `used_ratio`. Both shapes are read
 * here, a window this module cannot decode is skipped, and duplicate windows
 * reported by both shapes are merged rather than shown twice.
 */

import {
  asObject,
  bindingWindow,
  defineAdapter,
  KIND_QUOTA,
  parseAmount,
  parseInstant,
  windowLength,
} from './shared.js'
import { statuspageView } from './status.js'

/**
 * Kimi's plan usage lives under 我的 → 设置 → 订阅 in the web app, which is
 * this route. Verified 2026-11-06.
 */
const CONSOLE = 'https://www.kimi.com/settings'

/**
 * Moonshot — the platform behind Kimi — publishes its live status on an
 * Atlassian Statuspage; it is the closest official source for the coding
 * plan's backend. Verified 2026-11-06 against `/api/v2/status.json`.
 */
const STATUS = Object.freeze({
  endpoint: 'https://status.moonshot.cn/api/v2/status.json',
  url: 'https://status.moonshot.cn',
  parse: statuspageView,
})

/**
 * Scale one Kimi window duration to milliseconds.
 * @param {unknown} window The `window` object of a limit entry.
 * @returns {number | undefined} The length, when the unit is known.
 */
function windowMs(window) {
  const record = asObject(window)
  const duration = parseAmount(record.duration)
  if (duration === undefined || duration <= 0) return undefined
  const unit = String(record.timeUnit ?? '').toUpperCase()
  if (unit.endsWith('MINUTE')) return duration * 60_000
  if (unit.endsWith('HOUR')) return duration * 3_600_000
  if (unit.endsWith('DAY')) return duration * 86_400_000
  if (unit.endsWith('WEEK')) return duration * 7 * 86_400_000
  return undefined
}

/** Clamp a percentage into the range a progress bar can show. */
function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100))
}

/**
 * The remaining share one bucket reports.
 *
 * The newer `usages` map reports `used_ratio` as a 0–1 fraction; older buckets
 * report `limit` with `used` or `remaining`; some report a percentage already.
 * Read every form so a renamed response does not blank the card.
 *
 * @param {Record<string, unknown>} bucket One usage bucket.
 * @returns {number | undefined} Remaining percent, when the bucket reports it.
 */
function remainingPercent(bucket) {
  const percent = parseAmount(bucket.remaining_percent ?? bucket.remainingPercent)
  if (percent !== undefined) return clampPercent(percent)

  const ratio = parseAmount(bucket.used_ratio ?? bucket.usedRatio)
  if (ratio !== undefined) {
    if (ratio > 1) return clampPercent(100 - ratio)
    return clampPercent((1 - ratio) * 100)
  }

  const total = parseAmount(bucket.limit)
  const used = parseAmount(bucket.used)
  const remaining = parseAmount(bucket.remaining)
  if (total !== undefined && total > 0) {
    if (used !== undefined) return clampPercent((1 - used / total) * 100)
    if (remaining !== undefined) return clampPercent((remaining / total) * 100)
  }
  return undefined
}

/**
 * The countable fields one bucket reports.
 * @param {Record<string, unknown>} bucket One usage bucket.
 * @returns {{total?: number, used?: number}} The partial window fields.
 */
function counts(bucket) {
  const total = parseAmount(bucket.limit)
  const remaining = parseAmount(bucket.remaining)
  let used = parseAmount(bucket.used)
  if (used === undefined && total !== undefined && remaining !== undefined) used = total - remaining
  return {
    ...(total === undefined ? {} : { total }),
    ...(used === undefined ? {} : { used }),
  }
}

/**
 * The reset instant one bucket reports.
 * @param {Record<string, unknown>} bucket One usage bucket.
 * @returns {{resetAt?: number}} The partial window fields.
 */
function resetOf(bucket) {
  const resetAt = parseInstant(
    bucket.resetTime ?? bucket.reset_time ?? bucket.resetAt ?? bucket.reset_at,
  )
  return resetAt === undefined ? {} : { resetAt }
}

/**
 * The window shape a `usages` key names.
 * @param {string} key Entry key such as `limit_5h` or `monthTotal`.
 * @returns {{id: string, unit: 'hour'|'day'|'week'|'month'|'unknown', count?: number}} The shape.
 */
function usageShape(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (normalized.includes('5h') || normalized.includes('5hour') || normalized.includes('session')) {
    return { id: 'session', unit: 'hour', count: 5 }
  }
  if (normalized.includes('7d') || normalized.includes('weekly') || normalized.includes('week')) {
    return { id: 'weekly', unit: 'week' }
  }
  if (normalized.includes('monthtotal')) return { id: 'monthly-total', unit: 'month' }
  if (normalized.includes('monthcode')) return { id: 'monthly-code', unit: 'month' }
  if (normalized.includes('month')) return { id: 'monthly', unit: 'month' }
  if (normalized.includes('day')) return { id: `usages-${key}`, unit: 'day' }
  if (normalized.includes('hour')) return { id: `usages-${key}`, unit: 'hour' }
  return { id: `usages-${key}`, unit: 'unknown' }
}

/**
 * Project one Kimi usage body.
 * @param {{route: string, body: Record<string, unknown>}} env Projection context.
 * @returns {import('../providers.js').BalanceView} The reading.
 */
function readUsage({ route, body }) {
  /** @type {import('./shared.js').BalanceWindow[]} */
  const windows = []
  /** @type {Map<string, import('./shared.js').BalanceWindow>} */
  const byId = new Map()

  /**
   * Append one window, merging a duplicate reported by another shape.
   * @param {import('./shared.js').BalanceWindow} window The window to append.
   */
  const pushWindow = (window) => {
    const existing = byId.get(window.id)
    if (existing === undefined) {
      byId.set(window.id, window)
      windows.push(window)
      return
    }
    // Prefer the first (newer `usages` map) values, but fill in counts the
    // other shape carries so the panel can still show used / total.
    const existingRecord = /** @type {Record<string, unknown>} */ (existing)
    const windowRecord = /** @type {Record<string, unknown>} */ (window)
    for (const key of ['count', 'total', 'used', 'resetAt']) {
      if (existingRecord[key] === undefined && windowRecord[key] !== undefined) {
        existingRecord[key] = windowRecord[key]
      }
    }
  }

  // Newer responses: one used-ratio entry per plan window.
  const usages = asObject(body.usages)
  for (const [key, entry] of Object.entries(usages)) {
    const raw = asObject(entry)
    const record = { ...asObject(raw.detail), ...raw }
    const percent = remainingPercent(record)
    if (percent === undefined) continue
    pushWindow({
      ...usageShape(key),
      remainingPercent: percent,
      ...resetOf(record),
    })
  }

  // Older responses: one weekly bucket with limit/used/remaining.
  const weekly = asObject(body.usage)
  const weeklyPercent = remainingPercent(weekly)
  if (weeklyPercent !== undefined) {
    pushWindow({
      id: 'weekly',
      unit: 'week',
      ...counts(weekly),
      remainingPercent: weeklyPercent,
      ...resetOf(weekly),
    })
  }

  // Rate-limit windows: `detail` is the older nesting; newer entries carry the
  // fields directly on the entry. A single object is accepted as a one-entry
  // list, which some gateways return.
  const limitEntries = Array.isArray(body.limits)
    ? body.limits
    : body.limits !== null && typeof body.limits === 'object'
      ? [body.limits]
      : []
  for (const entry of limitEntries) {
    const record = asObject(entry)
    const detail = asObject(record.detail)
    const bucket = { ...detail, ...record }
    const percent = remainingPercent(bucket)
    if (percent === undefined) continue
    const length = windowLength(windowMs(record.window))
    const id =
      length.unit === 'hour'
        ? 'session'
        : length.unit === 'day' && length.count === 7
          ? 'weekly'
          : `limit-${String(windows.length)}`
    pushWindow({
      id,
      ...length,
      ...counts(bucket),
      remainingPercent: percent,
      ...resetOf(bucket),
    })
  }

  if (windows.length === 0) {
    return {
      provider: route,
      status: 'failed',
      kind: KIND_QUOTA,
      error: 'no usage in response',
    }
  }
  const binding = bindingWindow(windows)
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    ...(binding?.remainingPercent === undefined ? {} : { percent: binding.remainingPercent }),
    ...(binding?.resetAt === undefined ? {} : { resetsAt: binding.resetAt }),
    windows,
    consoleUrl: CONSOLE,
  }
}

/** Kimi for Coding's route. */
export const kimiAdapters = [
  defineAdapter({
    id: 'kimi-coding',
    routes: ['kimi-coding'],
    kind: KIND_QUOTA,
    endpoint: 'https://api.kimi.com/coding/v1/usages',
    auth: 'bearer',
    credentialRefs: ['KIMI_API_KEY'],
    read: readUsage,
    consoleUrl: CONSOLE,
    status: STATUS,
    display: {
      name: { zh: 'Kimi Coding', en: 'Kimi Coding' },
      mark: { icon: 'kimi', color: '#636ff6' },
    },
    fixtures: [
      {
        name: 'recorded weekly and five-hour windows',
        response: {
          user: { userId: 'u1', membership: { level: 'LEVEL_STANDARD' } },
          usage: {
            limit: '100',
            used: '40',
            remaining: '60',
            resetTime: '2026-08-04T11:05:18Z',
          },
          limits: [
            {
              window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
              detail: {
                limit: '100',
                used: '25',
                remaining: '75',
                resetTime: '2026-07-28T16:05:18Z',
              },
            },
          ],
          parallel: { limit: '30' },
        },
        apiKey: 'sk-test',
        expect: {
          status: 'ready',
          kind: KIND_QUOTA,
          // The weekly window is the binding one at 40% spent.
          percent: 60,
          windows: [
            {
              id: 'weekly',
              unit: 'week',
              total: 100,
              used: 40,
              remainingPercent: 60,
              resetAt: Date.parse('2026-08-04T11:05:18Z'),
            },
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              total: 100,
              used: 25,
              remainingPercent: 75,
              resetAt: Date.parse('2026-07-28T16:05:18Z'),
            },
          ],
        },
      },
      {
        name: 'newer usages map with used ratios',
        response: {
          usages: {
            limit_5h: { used_ratio: 0.2, reset_time: '2026-11-06T06:05:18Z' },
            limit_7d: { used_ratio: 0.45, reset_time: '2026-11-10T00:00:00Z' },
            limit_month_total: { used_ratio: 0.1, reset_time: '2026-12-01T00:00:00Z' },
          },
          // The same 5h window may also arrive in the older limits shape; it
          // must be merged into the existing window, not shown twice.
          limits: [
            {
              window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
              limit: '100',
              used: '20',
              resetTime: '2026-11-06T06:05:18Z',
            },
          ],
        },
        apiKey: 'sk-test',
        expect: {
          status: 'ready',
          percent: 55,
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              remainingPercent: 80,
              resetAt: Date.parse('2026-11-06T06:05:18Z'),
            },
            {
              id: 'weekly',
              unit: 'week',
              remainingPercent: 55,
              resetAt: Date.parse('2026-11-10T00:00:00Z'),
            },
            {
              id: 'monthly-total',
              unit: 'month',
              remainingPercent: 90,
            },
          ],
        },
      },
      {
        name: 'rate limits carry their fields at the top level',
        response: {
          limits: [
            {
              window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
              limit: '100',
              used: '60',
              resetTime: '2026-11-06T06:05:18Z',
            },
          ],
        },
        apiKey: 'sk-test',
        expect: {
          status: 'ready',
          percent: 40,
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              total: 100,
              used: 60,
              remainingPercent: 40,
            },
          ],
        },
      },
      {
        name: 'a remaining-only bucket still yields counts',
        response: {
          usage: { limit: '100', remaining: '60', resetTime: '2026-08-04T11:05:18Z' },
        },
        apiKey: 'sk-test',
        expect: {
          status: 'ready',
          percent: 60,
          windows: [
            {
              id: 'weekly',
              unit: 'week',
              total: 100,
              used: 40,
              remainingPercent: 60,
            },
          ],
        },
      },
      {
        name: 'malformed week, decodable rate limit',
        response: {
          usage: { limit: 'nope', used: '1', resetTime: null },
          limits: [
            {
              window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
              detail: { limit: '100', used: '10', resetTime: '2026-07-28T16:05:18Z' },
            },
          ],
        },
        expect: {
          status: 'ready',
          percent: 90,
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              total: 100,
              used: 10,
              remainingPercent: 90,
            },
          ],
        },
      },
      {
        name: 'no decodable window',
        response: { usage: {}, limits: [] },
        expect: { status: 'failed', error: 'no usage in response' },
      },
      {
        name: 'key rejected',
        httpStatus: 401,
        expect: { status: 'failed', error: 'HTTP 401' },
      },
    ],
  }),
]
