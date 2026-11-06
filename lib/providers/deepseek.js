/**
 * DeepSeek adapters.
 *
 * Two routes exist because two authorizations exist. The signed-in account
 * route forwards to the Host's own `deepseekAccount` service, which already
 * owns that query — re-implementing the Platform call here would be a second
 * source of truth. The API-key route asks the same public endpoint the key
 * itself can read.
 */

import {
  KIND_AMOUNT,
  asObject,
  defineAdapter,
  parseAmount,
} from './shared.js'
import {
  STATUS_DEGRADED,
  STATUS_MAINTENANCE,
  STATUS_OPERATIONAL,
  normalizeState,
  worstState,
} from './status.js'
import { defineSchedule } from './schedule.js'

/**
 * Where DeepSeek's own console shows the same wallet this plugin reads.
 * Verified 2026-11-06.
 */
const CONSOLE = 'https://platform.deepseek.com/top_up'

/**
 * DeepSeek publishes its live platform status on a FlashCat status page.
 *
 * The page is a Next.js server-rendered document, so the machine-readable
 * answer is the flight payload embedded in the HTML rather than a JSON
 * endpoint: `initialData.active_changes` lists every change in progress, and an
 * empty list is what the page renders as "All Systems Operational". The parser
 * below decodes exactly those two facts and nothing else; anything it cannot
 * decode reads as unknown rather than as a guess.
 *
 * @type {{endpoint: string, url: string, parse: (env: {text?: string}) => {state: string, summary?: string}}}
 */
const STATUS = Object.freeze({
  endpoint: 'https://status.deepseek.com/',
  url: 'https://status.deepseek.com',
  parse: parseStatusPage,
})

/**
 * DeepSeek prices by wall clock: Monday to Friday, 09:00–12:00 and
 * 14:00–18:00 Beijing time are peak, and off-peak prices are half. Chinese
 * statutory holidays are off-peak all day; a working weekend stays a weekend
 * under the rule, which names Monday to Friday.
 *
 * The holiday list is the State Council's 2026 arrangement (国办发明电
 * 〔2025〕7号). Extend it when the next year's notice is published.
 */
const SCHEDULE = defineSchedule({
  timezone: 'Asia/Shanghai',
  timezoneLabel: { zh: '北京时间', en: 'Beijing time' },
  days: [1, 2, 3, 4, 5],
  windows: [
    { from: '09:00', to: '12:00' },
    { from: '14:00', to: '18:00' },
  ],
  holidays: [
    // 元旦
    '2026-01-01', '2026-01-02', '2026-01-03',
    // 春节
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
    '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    // 清明节
    '2026-04-04', '2026-04-05', '2026-04-06',
    // 劳动节
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    // 端午节
    '2026-06-19', '2026-06-20', '2026-06-21',
    // 中秋节
    '2026-09-25', '2026-09-26', '2026-09-27',
    // 国庆节
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    '2026-10-06', '2026-10-07',
  ],
  note: { zh: '低谷时段 API 价格减半', en: 'API prices are halved off-peak' },
})

/**
 * Decode the flight payload a Next.js server-rendered page embeds.
 *
 * Each `self.__next_f.push([1, "..."])` chunk carries one JSON string; the
 * concatenation of those strings is the payload the page rendered from. A
 * chunk that is not such a pair (the bootstrap markers) carries no page data.
 *
 * @param {string} html Page source.
 * @returns {string} The decoded payload text.
 */
function flightText(html) {
  let text = ''
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)/g)) {
    try {
      const chunk = JSON.parse(match[1])
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === 'string') {
        text += chunk[1]
      }
    } catch {
      // Not a [1, text] pair; nothing to add.
    }
  }
  return text
}

/**
 * Find the page-level `initialData` object inside a flight payload.
 * @param {unknown} node Parsed payload node.
 * @param {number} depth Recursion depth.
 * @returns {Record<string, unknown> | undefined} The page data, when found.
 */
function findPageData(node, depth) {
  if (depth > 10 || node === null || typeof node !== 'object') return undefined
  if (!Array.isArray(node) && node.initialData && Array.isArray(node.initialData.active_changes)) {
    return /** @type {Record<string, unknown>} */ (node.initialData)
  }
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const found = findPageData(value, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Read the page-level data row out of one decoded flight payload.
 * @param {string} payload Decoded payload text.
 * @returns {Record<string, unknown> | undefined} The page data, when present.
 */
function pageData(payload) {
  for (const line of payload.split('\n')) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const json = line.slice(separator + 1)
    if (!json.startsWith('[')) continue
    let node
    try {
      node = JSON.parse(json)
    } catch {
      // A payload row that is not JSON is not a page row.
      continue
    }
    const found = findPageData(node, 0)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * The state one active change implies.
 *
 * A change carries its impact either directly (`status`/`impact`) or on the
 * entries beside it (`impacts[]`, `affected_components[]`); the response phase
 * (`investigating`, `monitoring`) describes the handling, not the service, so
 * it is never read as a state. A change this function cannot decode still
 * means something is in progress, and a maintenance window is the mildest
 * thing that could be.
 *
 * @param {unknown} change One entry of `active_changes`.
 * @returns {string} The implied state.
 */
function changeState(change) {
  const record = asObject(change)
  const direct = normalizeState(record.status) ?? normalizeState(record.impact)
  if (direct !== undefined) return direct
  const impacts = []
  for (const key of ['impacts', 'affected_components', 'sections']) {
    const list = Array.isArray(record[key]) ? record[key] : []
    for (const entry of list) impacts.push(asObject(entry).status)
  }
  const worst = worstState(impacts)
  if (worst !== undefined) return worst
  if (record.type === 'maintenance') return STATUS_MAINTENANCE
  return STATUS_DEGRADED
}

/**
 * Project one DeepSeek status page.
 * @param {{text?: string}} env Source payload.
 * @returns {{state: string, summary?: string}} The projected reading.
 */
function parseStatusPage({ text }) {
  const data = pageData(flightText(typeof text === 'string' ? text : ''))
  if (data === undefined) throw new Error('no status payload in page')
  const changes = data.active_changes
  if (changes.length === 0) return { state: STATUS_OPERATIONAL }
  /** @type {string[]} */
  const titles = []
  /** @type {string[]} */
  const states = []
  for (const change of changes) {
    const record = asObject(change)
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (title !== '') titles.push(title)
    states.push(changeState(record))
  }
  return {
    state: worstState(states) ?? STATUS_DEGRADED,
    ...(titles.length === 0 ? {} : { summary: titles.join('; ') }),
  }
}

/**
 * Report the same wallet balances the Account settings page shows, through
 * the Host service that already owns that query.
 *
 * `deepseekAccount` is an optional service: a composition without it simply
 * has no account route.
 *
 * @param {import('../providers.js').AdapterEnv} env Adapter environment.
 * @returns {Promise<object>} The reading.
 */
async function readAccountBalance(env) {
  const { route, ctx } = env
  const account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : undefined
  if (!account || typeof account.getBalance !== 'function') {
    return { provider: route, status: 'unsupported', kind: KIND_AMOUNT }
  }
  const details = await account.getBalance({
    version: '1.0.0',
    locale: 'en',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  })
  if (!details) {
    return { provider: route, status: 'unconfigured', kind: KIND_AMOUNT }
  }
  if (details.status !== 'ready') {
    return { provider: route, status: 'failed', kind: KIND_AMOUNT, error: 'account balance failed' }
  }
  const wallets = [...(details.value ?? []), ...(details.bonusWallets ?? [])]
  if (wallets.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_AMOUNT, error: 'no wallet in response' }
  }
  // The reading is one figure, so sum wallets that share the primary currency.
  const primary = asObject(wallets[0])
  const currency = typeof primary.currency === 'string' ? primary.currency : 'CNY'
  let amount = 0
  for (const wallet of wallets) {
    const record = asObject(wallet)
    if (record.currency !== currency) continue
    amount += parseAmount(record.balance) ?? 0
  }
  return {
    provider: route,
    status: 'ready',
    kind: KIND_AMOUNT,
    amount,
    currency,
    consoleUrl: CONSOLE,
  }
}

/**
 * Project the API-key route's `/user/balance` body.
 *
 * The endpoint reports one entry per currency; the reading is one figure, so
 * entries are summed and the last reported currency wins, which matches how
 * the console presents a single wallet.
 *
 * @param {{route: string, body: object}} env Projection context.
 * @returns {object} The reading.
 */
function readApiKeyBalance({ route, body }) {
  const infos = Array.isArray(body.balance_infos) ? body.balance_infos : []
  if (infos.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_AMOUNT, error: 'no balance in response' }
  }
  let amount = 0
  let currency = 'CNY'
  for (const info of infos) {
    const record = asObject(info)
    amount += parseAmount(record.total_balance) ?? 0
    if (typeof record.currency === 'string') currency = record.currency
  }
  return {
    provider: route,
    status: 'ready',
    kind: KIND_AMOUNT,
    amount,
    currency,
    consoleUrl: CONSOLE,
  }
}

/** DeepSeek's two routes. */
export const deepseekAdapters = [
  defineAdapter({
    id: 'deepseek-account',
    routes: ['deepseek-account'],
    kind: KIND_AMOUNT,
    service: 'deepseekAccount',
    readWithEnv: readAccountBalance,
    consoleUrl: CONSOLE,
    status: STATUS,
    schedule: SCHEDULE,
    display: {
      name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
      mark: { icon: 'deepseek', color: '#4d6bfe' },
    },
    fixtures: [
      {
        name: 'wallet plus bonus wallet',
        services: {
          deepseekAccount: {
            getBalance: async () => ({
              status: 'ready',
              value: [{ currency: 'CNY', balance: '40.00' }],
              bonusWallets: [{ currency: 'CNY', balance: '6.71' }],
            }),
          },
        },
        expect: { status: 'ready', kind: KIND_AMOUNT, amount: 46.71, currency: 'CNY' },
      },
      {
        name: 'service absent',
        services: {},
        expect: { status: 'unsupported', kind: KIND_AMOUNT },
      },
    ],
  }),
  defineAdapter({
    id: 'deepseek-api-key',
    routes: ['deepseek'],
    kind: KIND_AMOUNT,
    endpoint: 'https://api.deepseek.com/user/balance',
    auth: 'bearer',
    credentialRefs: ['DEEPSEEK_API_KEY'],
    read: readApiKeyBalance,
    consoleUrl: CONSOLE,
    status: STATUS,
    schedule: SCHEDULE,
    display: {
      name: { zh: 'DeepSeek API', en: 'DeepSeek API' },
      mark: { icon: 'deepseek', color: '#4d6bfe' },
    },
    fixtures: [
      {
        name: 'recorded balance',
        response: {
          is_available: true,
          balance_infos: [
            {
              currency: 'CNY',
              total_balance: '46.71',
              granted_balance: '0.00',
              topped_up_balance: '46.71',
            },
          ],
        },
        apiKey: 'sk-test',
        expect: { status: 'ready', kind: KIND_AMOUNT, amount: 46.71, currency: 'CNY' },
      },
      {
        name: 'empty balance list',
        response: { is_available: false, balance_infos: [] },
        expect: { status: 'failed', error: 'no balance in response' },
      },
      {
        name: 'key rejected',
        httpStatus: 401,
        expect: { status: 'failed', error: 'HTTP 401' },
      },
    ],
  }),
]
