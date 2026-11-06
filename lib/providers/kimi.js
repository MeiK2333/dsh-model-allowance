/**
 * Kimi for Coding adapter.
 *
 * The official kimi-cli exposes the plan through `GET {base}/usages` with the
 * account key. The body carries one weekly usage bucket plus the rate-limit
 * windows the plan enforces — a 5-hour window, for instance — and every
 * number arrives as a string, so both are read defensively: a window this
 * module cannot decode is skipped rather than failing the whole reading.
 */

import {
  KIND_QUOTA,
  asObject,
  bindingWindow,
  defineAdapter,
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

/**
 * The share of one `{ limit, used }` bucket already spent.
 * @param {Record<string, unknown>} bucket The usage bucket.
 * @returns {number | undefined} Used percentage, when both numbers parse.
 */
function usedShare(bucket) {
  const limit = parseAmount(bucket.limit)
  const used = parseAmount(bucket.used)
  if (limit === undefined || used === undefined || limit <= 0) return undefined
  return (used / limit) * 100
}

/**
 * Project one Kimi usage body.
 * @param {{route: string, body: object}} env Projection context.
 * @returns {object} The reading.
 */
function readUsage({ route, body }) {
  /** @type {Array<object>} */
  const windows = []
  const usedIds = new Set()

  /**
   * Append one window, keeping its identity unique.
   * @param {object} window The window to append.
   */
  const pushWindow = (window) => {
    let id = window.id
    if (usedIds.has(id)) id = `limit-${String(windows.length)}`
    usedIds.add(id)
    windows.push({ ...window, id })
  }

  /**
   * Append the countable fields a bucket reports.
   * @param {Record<string, unknown>} bucket The usage bucket.
   * @returns {object} The partial window fields.
   */
  const counts = (bucket) => {
    const total = parseAmount(bucket.limit)
    const used = parseAmount(bucket.used)
    return {
      ...(total === undefined ? {} : { total }),
      ...(used === undefined ? {} : { used }),
    }
  }

  /**
   * Append the reset instant a bucket reports.
   * @param {Record<string, unknown>} bucket The usage bucket.
   * @returns {object} The partial window fields.
   */
  const reset = (bucket) => {
    const resetAt = parseInstant(bucket.resetTime)
    return resetAt === undefined ? {} : { resetAt }
  }

  // The `usage` bucket is the plan's weekly window.
  const weekly = asObject(body.usage)
  const weeklyUsed = usedShare(weekly)
  if (weeklyUsed !== undefined) {
    pushWindow({
      id: 'weekly',
      unit: 'week',
      ...counts(weekly),
      remainingPercent: Math.max(0, 100 - weeklyUsed),
      ...reset(weekly),
    })
  }

  // The `limits` array is the plan's rate-limit windows.
  for (const entry of Array.isArray(body.limits) ? body.limits : []) {
    const record = asObject(entry)
    const detail = asObject(record.detail)
    const spent = usedShare(detail)
    if (spent === undefined) continue
    const length = windowLength(windowMs(record.window))
    const id =
      length.unit === 'hour'
        ? 'session'
        : length.unit === 'week' || (length.unit === 'day' && length.count === 7)
          ? 'weekly'
          : `limit-${String(windows.length)}`
    pushWindow({
      id,
      ...length,
      ...counts(detail),
      remainingPercent: Math.max(0, 100 - spent),
      ...reset(detail),
    })
  }

  if (windows.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no usage in response' }
  }
  const binding = bindingWindow(windows)
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    ...(binding.remainingPercent === undefined ? {} : { percent: binding.remainingPercent }),
    ...(binding.resetAt === undefined ? {} : { resetsAt: binding.resetAt }),
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
