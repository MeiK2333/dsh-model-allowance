/**
 * MiniMax (CN) adapter.
 *
 * The coding plan answers a GET with bearer auth; a POST with a `key` body is
 * the pay-as-you-go shape and returns 404 for a plan key, so the GET is the
 * only form worth asking. The plan meters a 5-hour window and a 7-day window
 * and reports both as remaining percentages plus the closing timestamp of
 * each — a single "remaining" number cannot express that.
 *
 * A token-plan key can carry several `model_remains` buckets: MiniMax reports
 * `general` beside `video` on the same account. The session's model picks the
 * bucket when it matches; otherwise the canonical text plan wins.
 */

import {
  asObject,
  bindingWindow,
  defineAdapter,
  KIND_QUOTA,
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
 * Normalize a model name for matching.
 *
 * DSH's provider-owned model id and MiniMax's `model_name` come from different
 * catalogs — `MiniMax-M2` and `general`, for instance — so the comparison
 * ignores case and separators before falling back to a substring match.
 *
 * @param {unknown} value Raw model name.
 * @returns {string} Normalized name, or an empty string.
 */
function normalizeModelName(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, '') : ''
}

/**
 * The model name one plan entry declares.
 * @param {Record<string, unknown>} plan One `model_remains` entry.
 * @returns {string} The name, or an empty string.
 */
function planName(plan) {
  for (const key of ['model_name', 'model', 'model_id']) {
    if (typeof plan[key] === 'string' && plan[key] !== '') return /** @type {string} */ (plan[key])
  }
  return ''
}

/**
 * The remaining share a plan entry reports, used to pick the most constrained
 * entry when the caller's model matches none.
 * @param {Record<string, unknown>} plan One plan entry.
 * @returns {number} Remaining percent, or Infinity when the entry reports none.
 */
function constraintOf(plan) {
  if (typeof plan.current_interval_remaining_percent === 'number') {
    return plan.current_interval_remaining_percent
  }
  if (typeof plan.current_weekly_remaining_percent === 'number') {
    return plan.current_weekly_remaining_percent
  }
  return Number.POSITIVE_INFINITY
}

/**
 * Pick the plan entry the badge should speak for.
 *
 * The session's model is authoritative when it matches an entry. A provider
 * id such as `MiniMax-M2` rarely equals MiniMax's own bucket name, so an exact
 * normalized match is followed by a substring match. With no match — and for
 * callers that only know the route — the canonical `general` plan is preferred
 * (MiniMax reports `video` beside it on the same account), then the most
 * constrained entry. This keeps the reading deterministic instead of
 * depending on response order.
 *
 * @param {Record<string, unknown>[]} plans Usable plan entries.
 * @param {string | undefined} model Provider-owned model id, when known.
 * @returns {Record<string, unknown>} The chosen entry.
 */
function pickPlan(plans, model) {
  const wanted = normalizeModelName(model)
  if (wanted !== '') {
    const exact = plans.find((plan) => normalizeModelName(planName(plan)) === wanted)
    if (exact !== undefined) return exact
    const partial = plans.find((plan) => {
      const name = normalizeModelName(planName(plan))
      return name !== '' && (name.includes(wanted) || wanted.includes(name))
    })
    if (partial !== undefined) return partial
  }
  const general = plans.find((plan) => normalizeModelName(planName(plan)) === 'general')
  if (general !== undefined) return general
  return plans.reduce(
    (best, plan) => (constraintOf(plan) < constraintOf(best) ? plan : best),
    plans[0],
  )
}

/**
 * Project one MiniMax plan body.
 *
 * A model bucket carries an interval window and a weekly window, each with its
 * own status flag. A zero status means that window does not apply to this
 * account (an old plan without a weekly limit, for instance), so its
 * percentage must be skipped rather than reported as `0%` left.
 *
 * @param {{route: string, body: Record<string, unknown>, model?: string}} env Projection context.
 * @returns {import('../providers.js').BalanceView} The reading.
 */
function readTokenPlan({ route, body, model }) {
  const base = asObject(body.base_resp)
  if (typeof base.status_code === 'number' && base.status_code !== 0) {
    return {
      provider: route,
      status: 'failed',
      kind: KIND_QUOTA,
      error: String(base.status_msg ?? base.status_code),
    }
  }
  const plans = (Array.isArray(body.model_remains) ? body.model_remains : [])
    .map((plan) => asObject(plan))
    .filter((plan) => planName(plan) !== '' || constraintOf(plan) !== Number.POSITIVE_INFINITY)
  if (plans.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no plan in response' }
  }
  const best = pickPlan(plans, model)

  /** A window is active unless its status flag explicitly says otherwise. */
  const activeWindow = (status) => status === undefined || status === null || status !== 0

  /**
   * Project one MiniMax window onto the shared shape.
   * @param {string} id Window identity.
   * @param {string} prefix Field prefix, `current_interval` or `current_weekly`.
   * @param {string} startKey Start timestamp field.
   * @param {string} endKey End timestamp field.
   * @param {string} percentKey Remaining-percent field.
   * @param {string} statusKey Window status flag.
   * @returns {import('./shared.js').BalanceWindow | undefined} The window, when the plan reports it.
   */
  const windowOf = (id, prefix, startKey, endKey, percentKey, statusKey) => {
    if (!activeWindow(best[statusKey])) return undefined
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

  const windows = /** @type {import('./shared.js').BalanceWindow[]} */ (
    [
      windowOf(
        'session',
        'current_interval',
        'start_time',
        'end_time',
        'current_interval_remaining_percent',
        'current_interval_status',
      ),
      windowOf(
        'weekly',
        'current_weekly',
        'weekly_start_time',
        'weekly_end_time',
        'current_weekly_remaining_percent',
        'current_weekly_status',
      ),
    ].filter((window) => window !== undefined)
  )

  if (windows.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no usage in response' }
  }
  const binding = bindingWindow(windows)
  const session = windows.find((window) => window.id === 'session')
  // The badge speaks for the short interval window; the top-level fields are
  // its fallback when a reader ignores `windows`.
  const percent = session?.remainingPercent ?? binding?.remainingPercent
  const resetsAt = session?.resetAt ?? binding?.resetAt
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    remainingMs: parseAmount(best.remains_time),
    ...(percent === undefined ? {} : { percent }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    windows,
    consoleUrl: CONSOLE,
  }
}

/** MiniMax (CN)'s coding-plan route. */
export const minimaxCnAdapters = [
  defineAdapter({
    id: 'minimax-cn',
    routes: ['minimax-cn'],
    kind: KIND_QUOTA,
    modelScoped: true,
    endpoint: 'https://api.minimaxi.com/v1/token_plan/remains',
    auth: 'bearer',
    credentialRefs: ['MINIMAX_CN_API_KEY'],
    read: readTokenPlan,
    consoleUrl: CONSOLE,
    status: STATUS,
    display: {
      name: { zh: 'MiniMax (国内)', en: 'MiniMax (CN)' },
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
        name: 'multiple model buckets choose the requested model',
        response: {
          model_remains: [
            {
              model_name: 'video',
              start_time: 1793937039924,
              end_time: 1793937039924 + 2 * 3_600_000,
              current_interval_status: 1,
              current_interval_remaining_percent: 100,
              current_weekly_status: 1,
              weekly_start_time: 1793727425969,
              weekly_end_time: 1793727425969 + 7 * 86_400_000,
              current_weekly_remaining_percent: 100,
            },
            {
              model_name: 'general',
              start_time: 1793937039924,
              end_time: 1793937039924 + 5 * 3_600_000,
              current_interval_status: 1,
              current_interval_remaining_percent: 98,
              current_weekly_status: 1,
              weekly_start_time: 1793727425969,
              weekly_end_time: 1793727425969 + 7 * 86_400_000,
              current_weekly_remaining_percent: 67,
            },
          ],
          base_resp: { status_code: 0, status_msg: 'success' },
        },
        apiKey: 'sk-cp-test',
        // The session model (MiniMax-M2) does not equal MiniMax's own bucket
        // names; `general` is the canonical text plan beside `video`.
        model: 'MiniMax-M2',
        expect: {
          status: 'ready',
          percent: 98,
          windows: [
            { id: 'session', remainingPercent: 98 },
            { id: 'weekly', remainingPercent: 67 },
          ],
        },
      },
      {
        name: 'a model name that matches a non-canonical bucket wins',
        response: {
          model_remains: [
            {
              model_name: 'general',
              current_interval_remaining_percent: 98,
              current_interval_status: 1,
            },
            {
              model_name: 'video',
              current_interval_remaining_percent: 40,
              current_interval_status: 1,
            },
          ],
          base_resp: { status_code: 0, status_msg: 'success' },
        },
        apiKey: 'sk-cp-test',
        model: 'video',
        expect: { status: 'ready', percent: 40 },
      },
      {
        name: 'an inactive weekly window is omitted',
        response: {
          model_remains: [
            {
              model_name: 'general',
              start_time: 1793937039924,
              end_time: 1793937039924 + 5 * 3_600_000,
              current_interval_status: 1,
              current_interval_remaining_percent: 80,
              current_weekly_status: 0,
              weekly_end_time: 1793727425969 + 7 * 86_400_000,
              current_weekly_remaining_percent: 0,
            },
          ],
          base_resp: { status_code: 0, status_msg: 'success' },
        },
        apiKey: 'sk-cp-test',
        expect: {
          status: 'ready',
          percent: 80,
          windows: [{ id: 'session', remainingPercent: 80 }],
        },
        // A window the plan marks inactive must not read as 0% left.
        absent: ['windows[1]'],
      },
      {
        name: 'plan rejected',
        response: { base_resp: { status_code: 1004, status_msg: 'invalid api key' } },
        expect: { status: 'failed', error: 'invalid api key' },
      },
    ],
  }),
]
