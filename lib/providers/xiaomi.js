/**
 * Xiaomi MiMo adapters.
 *
 * Two authorizations exist and they do not mix: the pay-as-you-go route reads
 * the account wallet with an `sk-` key, and each Token Plan cluster reads its
 * subscription credits with a region-scoped `tp-` key. A plan key asked for the
 * wallet answers 401, so every route keeps its own credential.
 *
 * The wallet reports one `balance_infos` entry whose `total_available` already
 * sums cash, gift, and available credit with the frozen part added back — the
 * reading takes that figure instead of adding the components itself.
 *
 * The plan reports one credit quota per billing period. The period timestamps
 * are UTC wall clocks without a zone marker, so they are parsed as UTC here
 * rather than through the shared local-time reader.
 */

import { defineSchedule } from './schedule.js'
import {
  asObject,
  defineAdapter,
  KIND_AMOUNT,
  KIND_QUOTA,
  parseAmount,
  windowLength,
} from './shared.js'

/** MiMo's wallet page. Verified 2026-11-16. */
const BALANCE_CONSOLE = 'https://platform.xiaomimimo.com/console/balance'

/** MiMo's plan management page. Verified 2026-11-16. */
const PLAN_CONSOLE = 'https://platform.xiaomimimo.com/console/plan-manage'

/**
 * The CN plan consumes credits at 0.8x between 00:00 and 08:00 Beijing time
 * every day, so the peak window — full-rate consumption — runs 08:00 to
 * midnight, every day of the week.
 */
const CN_SCHEDULE = defineSchedule({
  timezone: 'Asia/Shanghai',
  timezoneLabel: { zh: '北京时间', en: 'Beijing time' },
  days: [0, 1, 2, 3, 4, 5, 6],
  windows: [{ from: '08:00', to: '24:00' }],
  holidays: [],
  note: {
    zh: '低谷时段（每日 00:00–08:00）积分按 0.8 倍消耗',
    en: 'Credits are consumed at 0.8x off-peak, daily 00:00–08:00',
  },
})

/**
 * Project one MiMo wallet body.
 * @param {{route: string, body: Record<string, unknown>}} env Projection context.
 * @returns {import('../providers.js').BalanceView} The reading.
 */
function readBalance({ route, body }) {
  const infos = Array.isArray(body.balance_infos) ? body.balance_infos : []
  if (infos.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_AMOUNT, error: 'no balance in response' }
  }
  const primary = asObject(infos[0])
  const amount = parseAmount(primary.total_available)
  if (amount === undefined) {
    return { provider: route, status: 'failed', kind: KIND_AMOUNT, error: 'no balance in response' }
  }
  const currency = typeof primary.currency === 'string' ? primary.currency : 'CNY'
  return {
    provider: route,
    status: 'ready',
    kind: KIND_AMOUNT,
    amount,
    currency,
    consoleUrl: BALANCE_CONSOLE,
  }
}

/**
 * Parse a MiMo period timestamp: `YYYY-MM-DD HH:mm:ss` in UTC, with no zone
 * marker. The shared instant reader would take it as host local time and shift
 * the reset by the host's offset, so the zone is pinned here.
 * @param {unknown} value Raw timestamp.
 * @returns {number | undefined} Epoch milliseconds, or undefined when unparsable.
 */
function parseUtcInstant(value) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return undefined
  const parsed = Date.parse(`${text.replace(' ', 'T')}Z`)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Project one MiMo Token Plan body.
 *
 * The plan meters a single billing period, so the reading carries one window:
 * the period's credits with its closing instant as the reset. A missing period
 * still reports the quota, as an unsized window.
 *
 * @param {{route: string, body: Record<string, unknown>}} env Projection context.
 * @returns {import('../providers.js').BalanceView} The reading.
 */
function readTokenPlan({ route, body }) {
  const quota = asObject(body.quota)
  const total = parseAmount(quota.total_credits)
  if (total === undefined || total <= 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no quota in response' }
  }
  const used = parseAmount(quota.used_credits)
  const remaining = parseAmount(quota.remaining_credits)
  const remainingPercent = remaining === undefined ? undefined : (remaining / total) * 100
  const period = asObject(body.period)
  const start = parseUtcInstant(period.start_at)
  const end = parseUtcInstant(period.end_at)
  const window = {
    id: 'monthly',
    ...windowLength(start !== undefined && end !== undefined ? end - start : undefined),
    total,
    ...(used === undefined ? {} : { used }),
    ...(remainingPercent === undefined ? {} : { remainingPercent }),
    ...(end === undefined ? {} : { resetAt: end }),
  }
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    ...(remainingPercent === undefined ? {} : { percent: remainingPercent }),
    ...(end === undefined ? {} : { resetsAt: end }),
    windows: [window],
    consoleUrl: PLAN_CONSOLE,
  }
}

/** The recorded CN plan body, shared by the three cluster fixtures. */
const RECORDED_PLAN = {
  object: 'token_plan',
  plan_code: 'lite',
  period: { start_at: '2026-11-16 06:42:34', end_at: '2026-12-16 23:59:59' },
  quota: { total_credits: 4100000000, used_credits: 4042860, remaining_credits: 4095957140 },
  auto_renew: false,
  claw_enabled: false,
}

/** What the recorded plan body must project to, on any cluster. */
const RECORDED_PLAN_EXPECT = {
  status: 'ready',
  kind: KIND_QUOTA,
  percent: (4095957140 / 4100000000) * 100,
  // The period is a UTC wall clock: reading it as local time would shift the
  // reset by the host's offset and fail here.
  resetsAt: Date.parse('2026-12-16T23:59:59Z'),
  windows: [
    {
      id: 'monthly',
      unit: 'month',
      count: 1,
      total: 4100000000,
      used: 4042860,
      remainingPercent: (4095957140 / 4100000000) * 100,
      resetAt: Date.parse('2026-12-16T23:59:59Z'),
    },
  ],
}

/**
 * Declare one Token Plan cluster adapter. The clusters share the projection
 * and differ only in endpoint, credential, and name.
 * @param {object} spec Cluster specification.
 * @param {string} spec.id Adapter identity.
 * @param {string} spec.cluster Cluster host prefix, e.g. `token-plan-cn`.
 * @param {string} spec.credentialRef Credential reference for the bare-host fallback.
 * @param {{zh: string, en: string}} spec.name Display name.
 * @param {import('./schedule.js').Schedule} [spec.schedule] Pricing schedule, when this cluster has one.
 * @param {readonly import('./shared.js').AdapterFixture[]} [spec.extraFixtures] Additional fixtures for this cluster.
 * @returns {import('../providers.js').ProviderAdapter} The adapter.
 */
function tokenPlanAdapter({ id, cluster, credentialRef, name, schedule, extraFixtures = [] }) {
  return defineAdapter({
    id,
    routes: [id],
    kind: KIND_QUOTA,
    endpoint: `https://${cluster}.xiaomimimo.com/v1/platform/token_plan`,
    auth: 'bearer',
    credentialRefs: [credentialRef],
    read: readTokenPlan,
    consoleUrl: PLAN_CONSOLE,
    schedule,
    display: {
      name,
      mark: { icon: 'xiaomi', color: '#1F2329' },
    },
    fixtures: [
      {
        name: 'recorded billing period',
        response: RECORDED_PLAN,
        apiKey: 'tp-test',
        expect: RECORDED_PLAN_EXPECT,
      },
      ...extraFixtures,
    ],
  })
}

/** Xiaomi MiMo's wallet route and three Token Plan clusters. */
export const xiaomiAdapters = [
  defineAdapter({
    id: 'xiaomi',
    routes: ['xiaomi'],
    kind: KIND_AMOUNT,
    endpoint: 'https://api.xiaomimimo.com/v1/platform/balance',
    auth: 'bearer',
    credentialRefs: ['XIAOMI_API_KEY'],
    read: readBalance,
    consoleUrl: BALANCE_CONSOLE,
    display: {
      name: { zh: 'Xiaomi MiMo', en: 'Xiaomi MiMo' },
      mark: { icon: 'xiaomi', color: '#1F2329' },
    },
    fixtures: [
      {
        name: 'recorded wallet',
        response: {
          object: 'balance',
          is_available: true,
          balance_infos: [
            {
              currency: 'CNY',
              cash_balance: '0.00',
              gift_balance: '5.00',
              frozen_balance: '0.00',
              credit_limit: '0.00',
              credit_available: '0.00',
              total_available: '5.00',
            },
          ],
        },
        apiKey: 'sk-test',
        // total_available already sums the components; the reading takes it whole.
        expect: { status: 'ready', kind: KIND_AMOUNT, amount: 5, currency: 'CNY' },
      },
      {
        name: 'empty balance list',
        response: { object: 'balance', is_available: false, balance_infos: [] },
        expect: { status: 'failed', error: 'no balance in response' },
      },
      {
        name: 'key rejected',
        httpStatus: 401,
        expect: { status: 'failed', error: 'HTTP 401' },
      },
    ],
  }),
  tokenPlanAdapter({
    id: 'xiaomi-token-plan-cn',
    cluster: 'token-plan-cn',
    credentialRef: 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    name: { zh: 'Xiaomi MiMo Token Plan (国内)', en: 'Xiaomi MiMo Token Plan (CN)' },
    schedule: CN_SCHEDULE,
    // The projection is shared, so one cluster proving the failure paths
    // proves all three.
    extraFixtures: [
      {
        name: 'no quota in response',
        response: { object: 'token_plan', plan_code: 'lite' },
        expect: { status: 'failed', error: 'no quota in response' },
      },
      {
        name: 'key rejected',
        httpStatus: 401,
        expect: { status: 'failed', error: 'HTTP 401' },
      },
    ],
  }),
  tokenPlanAdapter({
    id: 'xiaomi-token-plan-ams',
    cluster: 'token-plan-ams',
    credentialRef: 'XIAOMI_TOKEN_PLAN_AMS_API_KEY',
    name: { zh: 'Xiaomi MiMo Token Plan (阿姆斯特丹)', en: 'Xiaomi MiMo Token Plan (AMS)' },
  }),
  tokenPlanAdapter({
    id: 'xiaomi-token-plan-sgp',
    cluster: 'token-plan-sgp',
    credentialRef: 'XIAOMI_TOKEN_PLAN_SGP_API_KEY',
    name: { zh: 'Xiaomi MiMo Token Plan (新加坡)', en: 'Xiaomi MiMo Token Plan (SGP)' },
  }),
]
