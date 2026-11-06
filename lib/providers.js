/**
 * Provider balance adapters.
 *
 * Every adapter declares the routes it serves, the credential reference that
 * authorizes the query, how the request is authenticated, and how the response
 * is projected onto the shared {@link BalanceView} shape.
 *
 * The quantity a provider reports is not always money. DeepSeek reports a
 * currency balance; MiniMax and Zhipu report a subscription allowance. The
 * `kind` field keeps the two apart so the UI can say the right thing.
 */

/** A provider reports a monetary balance. */
export const KIND_AMOUNT = 'amount'

/** A provider reports a remaining allowance (quota, time, call count). */
export const KIND_QUOTA = 'quota'

/**
 * Where each provider's own console shows the same numbers this plugin reads.
 *
 * Declared once because the reading and the failure fallback both carry one,
 * and because these paths rot: a stale link is a dead end a user cannot fix.
 * Verified 2026-11-06 — Zhipu split API keys from plan keys on 2026-10-16 and
 * retired `open.bigmodel.cn/usercenter/apikeys`; MiniMax's docs name
 * `platform.minimax.cn/console/usage` as the plan usage page and redirect
 * away from the older `platform.minimaxi.com` host.
 *
 * @type {Readonly<Record<'deepseek'|'minimax'|'zhipu', string>>}
 */
const CONSOLE = Object.freeze({
  deepseek: 'https://platform.deepseek.com/top_up',
  minimax: 'https://platform.minimax.cn/console/usage',
  zhipu: 'https://bigmodel.cn/coding-plan/personal/overview',
})

/**
 * One metering window a subscription plan enforces.
 *
 * A coding plan usually meters the same account over several periods — a short
 * rolling window and a long one — and each period has its own allowance and
 * reset. A single "remaining" number cannot express that, so a reading carries
 * one of these per window.
 *
 * @typedef {object} BalanceWindow
 * @property {string} id Stable identity: `session`, `weekly`, or a positional fallback.
 * @property {'hour'|'day'|'week'|'month'|'unknown'} unit Length unit of the window.
 * @property {number} [count] How many `unit`s long the window is, e.g. 5 hours.
 * @property {number} [used] Allowance already spent in this window.
 * @property {number} [total] Allowance included in this window.
 * @property {number} [remainingPercent] Share of the allowance still available.
 * @property {number} [resetAt] Epoch milliseconds of the next reset.
 */

/**
 * @typedef {object} BalanceView
 * @property {string} provider Route the reading belongs to.
 * @property {'ready'|'unsupported'|'unconfigured'|'failed'} status Reading outcome.
 * @property {'amount'|'quota'} kind Quantity dimension of the reading.
 * @property {number} [amount] Monetary balance, for `kind === 'amount'`.
 * @property {string} [currency] Currency of `amount`, e.g. `CNY`.
 * @property {number} [remaining] Remaining allowance, for `kind === 'quota'`.
 * @property {number} [total] Total allowance, for `kind === 'quota'`.
 * @property {number} [percent] Remaining percentage, for `kind === 'quota'`.
 * @property {number} [remainingMs] Remaining time in the reported window, in milliseconds.
 * @property {number} [resetsAt] Epoch milliseconds of the next allowance reset.
 * @property {readonly BalanceWindow[]} [windows] Per-window detail for a metered plan.
 * @property {string} [consoleUrl] Provider console for a manual top-up or quota check.
 * @property {number} [updatedAt] Epoch milliseconds of the reading.
 * @property {string} [error] Failure detail for `status === 'failed'`.
 */

/**
 * Read a JSON body, tolerating the `{ code, msg }` envelope Zhipu uses.
 * @param {unknown} payload Decoded response body.
 * @returns {Record<string, unknown>} The body as a plain object.
 */
function asObject(payload) {
  return payload && typeof payload === 'object' ? /** @type {Record<string, unknown>} */ (payload) : {}
}

/**
 * Parse a numeric string the providers use for money amounts.
 * @param {unknown} value Raw amount.
 * @returns {number | undefined} The amount, or undefined when unparsable.
 */
function parseAmount(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Name a window length from its duration.
 *
 * Reporting the window the provider actually enforces matters: MiniMax meters
 * a 7-day window, not a calendar month, and saying "month" would be wrong.
 *
 * @param {number | undefined} ms Window length in milliseconds.
 * @returns {{unit: 'hour'|'day'|'month'|'unknown', count?: number}} The unit and count.
 */
function windowLength(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return { unit: 'unknown' }
  const hours = ms / 3_600_000
  if (hours < 24) return { unit: 'hour', count: Math.round(hours) }
  const days = ms / 86_400_000
  if (days < 28) return { unit: 'day', count: Math.round(days) }
  return { unit: 'month', count: Math.round(days / 30) }
}

/**
 * DeepSeek's API-key route reports a currency balance at `/user/balance`.
 * @param {string} route Provider route being read.
 * @param {string} apiKey Resolved API key.
 * @param {AbortSignal} signal Cancellation.
 * @returns {Promise<BalanceView>} The reading.
 */
async function readDeepSeekApiKey(route, apiKey, signal) {
  const response = await fetch('https://api.deepseek.com/user/balance', {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!response.ok) {
    return { provider: route, status: 'failed', kind: KIND_AMOUNT, error: `HTTP ${response.status}` }
  }
  const body = asObject(await response.json())
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
    consoleUrl: CONSOLE.deepseek,
  }
}

/**
 * MiniMax's coding-plan route reports a remaining time allowance.
 * The endpoint answers a GET with bearer auth; a POST with a `key` body is
 * the pay-as-you-go shape and returns 404 for a plan key.
 * @param {string} route Provider route being read.
 * @param {string} apiKey Resolved API key.
 * @param {AbortSignal} signal Cancellation.
 * @returns {Promise<BalanceView>} The reading.
 */
async function readMiniMaxTokenPlan(route, apiKey, signal) {
  const response = await fetch('https://api.minimaxi.com/v1/token_plan/remains', {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!response.ok) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: `HTTP ${response.status}` }
  }
  const body = asObject(await response.json())
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
   * @returns {BalanceWindow | undefined} The window, when the plan reports it.
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
    consoleUrl: CONSOLE.minimax,
  }
}

/**
 * Zhipu reports credit limits; it publishes no monetary balance.
 * @param {string} route Provider route being read.
 * @param {string} apiKey Resolved API key.
 * @param {AbortSignal} signal Cancellation.
 * @returns {Promise<BalanceView>} The reading.
 */
async function readZhipuQuota(route, apiKey, signal) {
  const response = await fetch('https://open.bigmodel.cn/api/monitor/usage/quota/limit', {
    headers: { authorization: apiKey },
    signal,
  })
  if (!response.ok) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: `HTTP ${response.status}` }
  }
  const body = asObject(await response.json())
  if (typeof body.code === 'number' && body.code !== 200) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: String(body.msg ?? body.code) }
  }
  const data = asObject(body.data)
  const limits = Array.isArray(data.limits) ? data.limits : []
  if (limits.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no limits in response' }
  }

  /**
   * Decode Zhipu's window-length code.
   *
   * A limit carries `unit` (a length unit) and `number` (how many of them), so
   * `unit: 3, number: 5` is the 5-hour window and `unit: 6, number: 1` the
   * weekly one. The quota itself is `usage`, and `currentValue` is what has
   * been spent — not the other way round.
   *
   * @param {Record<string, unknown>} limit One limit entry.
   * @param {number} index Position, used for a stable identity.
   * @returns {BalanceWindow} The window.
   */
  const windowOf = (limit, index) => {
    const code = parseAmount(limit.unit)
    const count = parseAmount(limit.number)
    const unit = code === 3 ? 'hour' : code === 6 ? 'week' : 'unknown'
    const total = parseAmount(limit.usage)
    const used = parseAmount(limit.currentValue)
    const spentPercent = parseAmount(limit.percentage)
    const resetAt = parseAmount(limit.nextResetTime)
    const id =
      unit === 'hour' ? 'session' : unit === 'week' ? 'weekly' : `limit-${String(index)}`
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
  const binding = windows.reduce((current, candidate) => {
    const a = current.remainingPercent ?? Number.POSITIVE_INFINITY
    const b = candidate.remainingPercent ?? Number.POSITIVE_INFINITY
    return b < a ? candidate : current
  })

  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    ...(binding.remainingPercent === undefined ? {} : { percent: binding.remainingPercent }),
    resetsAt: binding.resetAt,
    windows,
    consoleUrl: CONSOLE.zhipu,
  }
}

/**
 * @typedef {object} ProviderAdapter
 * @property {string} id Adapter identity.
 * @property {readonly string[]} routes Provider routes this adapter serves.
 * @property {string} [credentialRef] Credential reference resolved through the harness credential seam.
 * @property {string} [service] Host service this adapter reads through, when it needs no key.
 * @property {(route: string, apiKey: string, signal: AbortSignal) => Promise<BalanceView>} [read] The query.
 * @property {string} [consoleUrl] Console link shown when the route has no balance endpoint.
 * @property {(env: AdapterEnv) => Promise<BalanceView>} [readWithEnv] Query form for adapters that
 *   need more than an API key, such as a Host service.
 */

/**
 * What an adapter may use to answer one reading.
 * @typedef {object} AdapterEnv
 * @property {string} route Provider route being read.
 * @property {string | undefined} apiKey Resolved credential value, when the adapter needs one.
 * @property {import('@deepseek-ai/cordis').Context} ctx Host context, for service-backed adapters.
 * @property {AbortSignal} signal Cancellation.
 */

/**
 * DeepSeek's account route reports the same wallet balances the Account
 * settings page shows. The Host already owns that query, so this adapter
 * forwards to it rather than re-implementing the Platform call.
 *
 * `deepseekAccount` is an optional service: a composition without it simply
 * has no account route.
 *
 * @param {AdapterEnv} env Adapter environment.
 * @returns {Promise<BalanceView>} The reading.
 */
async function readDeepSeekAccount(env) {
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
    consoleUrl: CONSOLE.deepseek,
  }
}

/**
 * The registry of provider balance adapters.
 * @type {readonly ProviderAdapter[]}
 */
export const PROVIDER_ADAPTERS = [
  {
    id: 'deepseek-account',
    routes: ['deepseek-account'],
    service: 'deepseekAccount',
    readWithEnv: readDeepSeekAccount,
    consoleUrl: CONSOLE.deepseek,
  },
  {
    id: 'deepseek-api-key',
    routes: ['deepseek'],
    credentialRef: 'DEEPSEEK_API_KEY',
    read: readDeepSeekApiKey,
    consoleUrl: CONSOLE.deepseek,
  },
  {
    id: 'minimax-token-plan',
    routes: ['minimax-cn'],
    credentialRef: 'MINIMAX_CN_API_KEY',
    read: readMiniMaxTokenPlan,
    consoleUrl: CONSOLE.minimax,
  },
  {
    id: 'zhipu-quota',
    routes: ['zai', 'zai-coding-cn'],
    credentialRef: 'ZAI_API_KEY',
    read: readZhipuQuota,
    consoleUrl: CONSOLE.zhipu,
  },
]

/**
 * Find the adapter serving one provider route.
 * @param {string} route Provider route, e.g. `minimax-cn`.
 * @returns {ProviderAdapter | undefined} The adapter, when one serves the route.
 */
export function findAdapter(route) {
  return PROVIDER_ADAPTERS.find((adapter) => adapter.routes.includes(route))
}

/**
 * Find the adapter serving one provider route, accepting an alias.
 * The DeepSeek account route shares its vendor with the API-key route but has
 * its own Host-backed reader, so it is resolved by the caller instead.
 * @param {string} route Provider route.
 * @returns {ProviderAdapter | undefined} The adapter, when one serves the route.
 */
export function adapterForRoute(route) {
  return findAdapter(route)
}
