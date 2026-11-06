/**
 * MiniMax adapter.
 *
 * The coding plan answers a GET with bearer auth; a POST with a `key` body is
 * the pay-as-you-go shape and returns 404 for a plan key, so the GET is the
 * only form worth asking. The plan meters a 5-hour window and a 7-day window
 * and reports both as remaining percentages plus the closing timestamp of
 * each — a single "remaining" number cannot express that.
 */

import {
  KIND_QUOTA,
  asObject,
  defineAdapter,
  parseAmount,
  windowLength,
} from './shared.js'
import { statuspageView } from './status.js'

/**
 * MiniMax's plan usage page. Verified 2026-11-06 — the docs name this console
 * path and redirect away from the older `platform.minimaxi.com` host.
 */
const CONSOLE = 'https://platform.minimax.cn/console/usage'

/**
 * MiniMax publishes its live status on an Atlassian Statuspage. Verified
 * 2026-11-06 against `/api/v2/status.json`.
 */
const STATUS = Object.freeze({
  endpoint: 'https://status.minimaxi.com/api/v2/status.json',
  url: 'https://status.minimaxi.com',
  parse: statuspageView,
})

/**
 * Project one MiniMax plan body.
 * @param {{route: string, body: object}} env Projection context.
 * @returns {object} The reading.
 */
function readTokenPlan({ route, body }) {
  const base = asObject(body.base_resp)
  if (typeof base.status_code === 'number' && base.status_code !== 0) {
    return {
      provider: route,
      status: 'failed',
      kind: KIND_QUOTA,
      error: String(base.status_msg ?? base.status_code),
    }
  }
  const plans = Array.isArray(body.model_remains) ? body.model_remains : []
  if (plans.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no plan in response' }
  }
  // Prefer the plan carrying the most specific remaining percentage.
  let best = asObject(plans[0])
  for (const plan of plans.slice(1)) {
    const record = asObject(plan)
    if (typeof record.current_interval_remaining_percent === 'number') best = record
  }

  /**
   * Project one MiniMax window onto the shared shape.
   * @param {string} id Window identity.
   * @param {string} prefix Field prefix, `current_interval` or `current_weekly`.
   * @param {string} startKey Start timestamp field.
   * @param {string} endKey End timestamp field.
   * @param {string} percentKey Remaining-percent field.
   * @returns {object | undefined} The window, when the plan reports it.
   */
  const windowOf = (id, prefix, startKey, endKey, percentKey) => {
    const end = parseAmount(best[endKey])
    const start = parseAmount(best[startKey])
    const remainingPercent = parseAmount(best[percentKey])
    if (end === undefined && remainingPercent === undefined) return undefined
    const length = windowLength(end !== undefined && start !== undefined ? end - start : undefined)
    // The coding plan reports percentage only; the count fields are zero
    // unless the account also meters by request count.
    const total = parseAmount(best[`${prefix}_total_count`])
    const used = parseAmount(best[`${prefix}_usage_count`])
    return {
      id,
      ...length,
      ...(total !== undefined && total > 0 ? { total, used: used ?? 0 } : {}),
      ...(remainingPercent === undefined ? {} : { remainingPercent }),
      ...(end === undefined ? {} : { resetAt: end }),
    }
  }

  const windows = [
    windowOf(
      'session',
      'current_interval',
      'start_time',
      'end_time',
      'current_interval_remaining_percent',
    ),
    windowOf(
      'weekly',
      'current_weekly',
      'weekly_start_time',
      'weekly_end_time',
      'current_weekly_remaining_percent',
    ),
  ].filter((window) => window !== undefined)

  const remainingMs = parseAmount(best.remains_time)
  const percent = parseAmount(best.current_interval_remaining_percent)
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    remainingMs,
    percent,
    resetsAt: parseAmount(best.end_time),
    windows,
    consoleUrl: CONSOLE,
  }
}

/** MiniMax's coding-plan route. */
export const minimaxAdapters = [
  defineAdapter({
    id: 'minimax-token-plan',
    routes: ['minimax-cn'],
    kind: KIND_QUOTA,
    endpoint: 'https://api.minimaxi.com/v1/token_plan/remains',
    auth: 'bearer',
    credentialRefs: ['MINIMAX_CN_API_KEY'],
    read: readTokenPlan,
    consoleUrl: CONSOLE,
    status: STATUS,
    display: {
      name: { zh: 'MiniMax', en: 'MiniMax' },
      mark: { icon: 'minimax', color: '#e21680' },
    },
    fixtures: [
      {
        name: 'recorded five-hour and weekly windows',
        response: {
          model_remains: [
            {
              start_time: 1793937039924,
              end_time: 1793937039924 + 5 * 3_600_000,
              remains_time: 16380448,
              current_interval_total_count: 0,
              current_interval_usage_count: 0,
              current_interval_remaining_percent: 82,
              weekly_start_time: 1793727425969,
              weekly_end_time: 1793727425969 + 7 * 86_400_000,
              weekly_remains_time: 393566493,
              current_weekly_total_count: 0,
              current_weekly_usage_count: 0,
              current_weekly_remaining_percent: 66,
            },
          ],
          base_resp: { status_code: 0, status_msg: 'success' },
        },
        apiKey: 'sk-cp-test',
        expect: {
          status: 'ready',
          kind: KIND_QUOTA,
          percent: 82,
          // Two windows, and the long one is seven days — calling it a month
          // would be wrong.
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              remainingPercent: 82,
              resetAt: 1793937039924 + 5 * 3_600_000,
            },
            {
              id: 'weekly',
              unit: 'day',
              count: 7,
              remainingPercent: 66,
              resetAt: 1793727425969 + 7 * 86_400_000,
            },
          ],
        },
        // A coding-plan key reports no request counts, so no used/total is invented.
        absent: ['windows[0].total', 'windows[1].total'],
      },
      {
        name: 'plan rejected',
        response: { base_resp: { status_code: 1004, status_msg: 'invalid api key' } },
        expect: { status: 'failed', error: 'invalid api key' },
      },
    ],
  }),
]
