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
 * @typedef {object} BalanceView
 * @property {string} provider Route the reading belongs to.
 * @property {'ready'|'unsupported'|'unconfigured'|'failed'} status Reading outcome.
 * @property {'amount'|'quota'} kind Quantity dimension of the reading.
 * @property {number} [amount] Monetary balance, for `kind === 'amount'`.
 * @property {string} [currency] Currency of `amount`, e.g. `CNY`.
 * @property {number} [remaining] Remaining allowance, for `kind === 'quota'`.
 * @property {number} [total] Total allowance, for `kind === 'quota'`.
 * @property {number} [percent] Remaining percentage, for `kind === 'quota'`.
 * @property {number} [remainingMs] Remaining allowance in milliseconds, for `kind === 'quota'`.
 * @property {number} [resetsAt] Epoch milliseconds of the next allowance reset.
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
    consoleUrl: 'https://platform.deepseek.com/top_up',
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
  const remainingMs = parseAmount(best.remains_time)
  const percent = parseAmount(best.current_interval_remaining_percent)
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    remaining: remainingMs,
    remainingMs,
    percent,
    consoleUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
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
  // Zhipu publishes several limits. `percentage` is the share already spent,
  // so the most-spent limit is the one that actually constrains the account.
  let best = asObject(limits[0])
  for (const limit of limits.slice(1)) {
    const record = asObject(limit)
    const current = parseAmount(best.percentage) ?? Number.NEGATIVE_INFINITY
    const candidate = parseAmount(record.percentage) ?? Number.NEGATIVE_INFINITY
    if (candidate > current) best = record
  }
  const remaining = parseAmount(best.remaining)
  const total = parseAmount(best.number)
  const used = parseAmount(best.usage)
  const percent = parseAmount(best.percentage)
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    remaining,
    total: total ?? (remaining !== undefined && used !== undefined ? remaining + used : undefined),
    percent: percent !== undefined ? 100 - percent : undefined,
    resetsAt: parseAmount(best.nextResetTime),
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  }
}

/**
 * @typedef {object} ProviderAdapter
 * @property {string} id Adapter identity.
 * @property {readonly string[]} routes Provider routes this adapter serves.
 * @property {string} credentialRef Credential reference resolved through the harness credential seam.
 * @property {(route: string, apiKey: string, signal: AbortSignal) => Promise<BalanceView>} read The query.
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
    consoleUrl: 'https://platform.deepseek.com/top_up',
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
    readWithEnv: readDeepSeekAccount,
    consoleUrl: 'https://platform.deepseek.com/top_up',
  },
  {
    id: 'deepseek-api-key',
    routes: ['deepseek'],
    credentialRef: 'DEEPSEEK_API_KEY',
    read: readDeepSeekApiKey,
    consoleUrl: 'https://platform.deepseek.com/top_up',
  },
  {
    id: 'minimax-token-plan',
    routes: ['minimax-cn'],
    credentialRef: 'MINIMAX_CN_API_KEY',
    read: readMiniMaxTokenPlan,
    consoleUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
  {
    id: 'zhipu-quota',
    routes: ['zai', 'zai-coding-cn'],
    credentialRef: 'ZAI_API_KEY',
    read: readZhipuQuota,
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
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
