/**
 * Zhipu ZAI adapter.
 *
 * Zhipu reports credit limits; it publishes no monetary balance. A limit
 * carries `unit` (a length code) and `number` (how many of them), so
 * `unit: 3, number: 5` is the 5-hour window and `unit: 6, number: 1` the
 * weekly one. The quota itself is `usage`, and `currentValue` is what has been
 * spent — not the other way round.
 *
 * Both the CN and international routes read through the CN monitor endpoint
 * today. The routes differ only in the credential the harness stores for
 * them, which the balance service now discovers per route.
 */

import { defineSchedule } from './schedule.js'
import { asObject, bindingWindow, defineAdapter, KIND_QUOTA, parseAmount } from './shared.js'

/**
 * Zhipu's coding-plan overview. Verified 2026-11-06 — Zhipu split API keys
 * from plan keys in October 2026 and retired the old usercenter path.
 */
const CONSOLE = 'https://bigmodel.cn/coding-plan/personal/overview'

/**
 * The plan charges half the credits outside its peak windows, and the docs
 * name them plainly: Monday to Friday, 14:00–18:00 UTC+8, with no holiday
 * exception. Verified 2026-11-06 against the coding-plan overview.
 *
 * Both routes the adapter serves share this schedule: it is a property of the
 * GLM Coding Plan, and the CN and international routes address the same plan
 * family.
 *
 * @type {import('./schedule.js').Schedule}
 */
const SCHEDULE = defineSchedule({
  timezone: 'Asia/Shanghai',
  timezoneLabel: { zh: '北京时间', en: 'Beijing time' },
  days: [1, 2, 3, 4, 5],
  windows: [{ from: '14:00', to: '18:00' }],
  holidays: [],
  note: { zh: '低谷时段积分按 50% 抵扣', en: 'Credits are halved off-peak' },
})

/**
 * Project one Zhipu limit body.
 * @param {{route: string, body: Record<string, unknown>}} env Projection context.
 * @returns {import('../providers.js').BalanceView} The reading.
 */
function readQuota({ route, body }) {
  if (typeof body.code === 'number' && body.code !== 200) {
    return {
      provider: route,
      status: 'failed',
      kind: KIND_QUOTA,
      error: String(body.msg ?? body.code),
    }
  }
  const data = asObject(body.data)
  const limits = Array.isArray(data.limits) ? data.limits : []
  if (limits.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no limits in response' }
  }

  /**
   * Decode one limit entry.
   * @param {Record<string, unknown>} limit One limit entry.
   * @param {number} index Position, used for a stable identity.
   * @returns {import('./shared.js').BalanceWindow} The window.
   */
  const windowOf = (limit, index) => {
    const code = parseAmount(limit.unit)
    const count = parseAmount(limit.number)
    const unit = code === 3 ? 'hour' : code === 6 ? 'week' : 'unknown'
    const total = parseAmount(limit.usage)
    const used = parseAmount(limit.currentValue)
    const spentPercent = parseAmount(limit.percentage)
    const resetAt = parseAmount(limit.nextResetTime)
    const id = unit === 'hour' ? 'session' : unit === 'week' ? 'weekly' : `limit-${String(index)}`
    return {
      id,
      unit,
      ...(count === undefined ? {} : { count }),
      ...(used === undefined ? {} : { used }),
      ...(total === undefined ? {} : { total }),
      ...(spentPercent === undefined ? {} : { remainingPercent: 100 - spentPercent }),
      ...(resetAt === undefined ? {} : { resetAt }),
    }
  }

  const windows = limits.map((limit, index) => windowOf(asObject(limit), index))

  // The most-spent window is the one that actually constrains the account.
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

/** Zhipu ZAI's coding-plan routes: the CN plan and the international route. */
export const zaiAdapters = [
  defineAdapter({
    id: 'zai-coding-cn',
    routes: ['zai', 'zai-coding-cn'],
    kind: KIND_QUOTA,
    endpoint: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
    auth: 'raw',
    credentialRefs: ['ZAI_API_KEY', 'ZAI_CODING_CN_API_KEY'],
    read: readQuota,
    consoleUrl: CONSOLE,
    schedule: SCHEDULE,
    display: {
      name: { zh: '智谱 ZAI', en: 'Zhipu ZAI' },
      mark: { icon: 'zhipu', color: '#5668f5' },
    },
    fixtures: [
      {
        name: 'recorded limits',
        response: {
          code: 200,
          data: {
            limits: [
              {
                type: 'CREDIT_LIMIT',
                unit: 3,
                number: 5,
                usage: 2000,
                currentValue: 0,
                remaining: 2000,
                percentage: 0,
              },
              {
                type: 'CREDIT_LIMIT',
                unit: 6,
                number: 1,
                usage: 10000,
                currentValue: 10071,
                remaining: 0,
                percentage: 100,
                nextResetTime: 1794305132998,
              },
            ],
            level: 'lite',
          },
        },
        apiKey: 'test-key',
        expect: {
          status: 'ready',
          kind: KIND_QUOTA,
          // The exhausted window is the binding constraint on the account.
          percent: 0,
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              total: 2000,
              used: 0,
              remainingPercent: 100,
            },
            {
              id: 'weekly',
              unit: 'week',
              total: 10000,
              used: 10071,
              remainingPercent: 0,
              resetAt: 1794305132998,
            },
          ],
        },
      },
      {
        name: 'envelope rejected',
        response: { code: 1000, msg: 'token expired' },
        expect: { status: 'failed', error: 'token expired' },
      },
    ],
  }),
]
