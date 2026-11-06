/**
 * Run the balance service against a context that behaves like Cordis.
 *
 * Cordis resolves `ctx.something` as a *service* named `something`, and throws
 * when that service was not injected. A plain object stub hides that class of
 * mistake, so this context is a proxy that refuses any property it was not
 * given — exactly like the real thing.
 */

import { Context } from '@deepseek-ai/cordis'
import ModelAllowanceService from '../index.js'
import { BalanceService } from '../lib/balance.js'
import { PROVIDER_ADAPTERS } from '../lib/providers.js'

/** Build a context that only answers the properties a plugin may read. */
function strictContext(services) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === 'symbol') return undefined
        if (property === 'get') return (name) => services[name]
        if (property in services) return services[property]
        throw new Error(`cannot get property "${String(property)}" without inject`)
      },
    },
  )
}

const credentials = {
  MINIMAX_CN_API_KEY: 'sk-cp-test',
  ZAI_API_KEY: 'zhipu-test',
  ZAI_CODING_CN_API_KEY: 'zhipu-cn-test',
  DEEPSEEK_API_KEY: 'sk-test',
  KIMI_API_KEY: 'kimi-test',
  OPENCODE_API_KEY: 'opencode-test',
}

const ctx = strictContext({
  credentials: {
    resolve: async (ref) =>
      credentials[ref] ? { value: credentials[ref], source: 'test' } : undefined,
  },
  deepseekAccount: {
    async getBalance() {
      return {
        status: 'ready',
        value: [{ currency: 'CNY', balance: '40.00' }],
        bonusWallets: [{ currency: 'CNY', balance: '6.71' }],
      }
    },
  },
})

const service = new BalanceService({
  ctx,
  resolveCredential: async (ref) => credentials[ref],
  options: { ttlMs: 1000, requestTimeoutMs: 5000 },
})

// One recorded shape per adapter, so no case depends on the network.
const responses = {
  'https://api.deepseek.com/user/balance': {
    balance_infos: [{ currency: 'CNY', total_balance: '46.71' }],
  },
  'https://api.minimaxi.com/v1/token_plan/remains': {
    model_remains: [{ remains_time: 16380448, current_interval_remaining_percent: 82 }],
    base_resp: { status_code: 0 },
  },
  'https://open.bigmodel.cn/api/monitor/usage/quota/limit': {
    code: 200,
    data: { limits: [{ unit: 3, number: 5, usage: 2000, remaining: 2000, percentage: 0 }] },
  },
  'https://api.kimi.com/coding/v1/usages': {
    usage: { limit: '100', used: '40', resetTime: '2026-08-04T11:05:18Z' },
    limits: [
      {
        window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
        detail: { limit: '100', used: '25', resetTime: '2026-07-28T16:05:18Z' },
      },
    ],
  },
  'https://opencode.ai/zen/go/v1/usage': {
    usage: {
      rolling: { status: 'ok', percent: 1 },
      weekly: { status: 'ok', percent: 12 },
      monthly: { status: 'ok', percent: 35 },
    },
  },
}

const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  json: async () => responses[url],
})

const results = []
try {
  for (const adapter of PROVIDER_ADAPTERS) {
    const route = adapter.routes[0]
    const view = await service.read(route, { force: true })
    results.push({
      adapter: adapter.id,
      route,
      status: view.status,
      kind: view.kind,
      error: view.error,
    })
  }

  // --- credential discovery -----------------------------------------------
  // The harness names the credential for every route it serves; the plugin
  // must ask it rather than keep a table that rots. These stubs mirror what
  // `llm.listConfigurableProviders()` and `settings.describe()` answer, and
  // the stored map only holds what a real Models page would have written.
  {
    const llm = {
      listConfigurableProviders: () => [
        {
          provider: 'kimi-coding',
          displayName: 'Kimi Coding',
          settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', 'kimi-coding'],
          nativeAuth: { env: ['KIMI_API_KEY'] },
        },
        {
          provider: 'zai',
          displayName: 'Z.ai',
          settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', 'zai'],
          nativeAuth: { env: ['ZAI_API_KEY'] },
        },
        {
          provider: 'zai-coding-cn',
          displayName: 'Zhipu GLM',
          settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', 'zai-coding-cn'],
          nativeAuth: { env: ['ZAI_CODING_CN_API_KEY'] },
        },
      ],
    }
    const settings = {
      describe: () => [
        {
          ns: 'llm-pi-ai',
          // A profile that names its own reference: this must outrank the
          // catalog default KIMI_API_KEY.
          value: { providers: { 'kimi-coding': { apiKeyEnv: 'KIMI_CODING_API_KEY' } } },
        },
      ],
    }
    const stored = {
      KIMI_CODING_API_KEY: 'sk-kimi-profile',
      ZAI_CODING_CN_API_KEY: 'zhipu-cn-test',
    }
    const chainCtx = strictContext({
      credentials: {
        resolve: async (ref) => (stored[ref] ? { value: stored[ref], source: 'test' } : undefined),
      },
      llm,
      settings,
    })
    const chainService = new BalanceService({
      ctx: chainCtx,
      resolveCredential: async (ref) => stored[ref],
      options: { ttlMs: 1000, requestTimeoutMs: 5000 },
    })

    const directory = await chainService.available()
    const byRoute = Object.fromEntries(directory.map((entry) => [entry.route, entry]))

    // The profile's own apiKeyEnv wins over the catalog default.
    if (byRoute['kimi-coding']?.configured !== true) {
      throw new Error('the profile apiKeyEnv was not resolved for kimi-coding')
    }
    // The route the plugin used to misaddress: zai-coding-cn stores its own
    // key, and only that key exists here.
    if (byRoute['zai-coding-cn']?.configured !== true) {
      throw new Error('zai-coding-cn did not resolve its own credential')
    }
    // zai must not answer for zai-coding-cn's key.
    if (byRoute.zai?.configured !== false) {
      throw new Error('zai should be unconfigured when only the CN plan key exists')
    }
    // The metadata the browser names and draws routes with travels with the list.
    if (byRoute['kimi-coding'].name?.zh !== 'Kimi Coding') {
      throw new Error('the route list did not carry the display name')
    }
    if (byRoute['kimi-coding'].color !== '#636ff6') {
      throw new Error('the route list did not carry the brand colour')
    }
    if (byRoute['kimi-coding'].iconHint !== 'kimi') {
      throw new Error('the route list did not carry the artwork hint')
    }

    // The reading itself uses the discovered credential.
    const kimi = await chainService.read('kimi-coding', { force: true })
    if (kimi.status !== 'ready' || kimi.percent !== 60) {
      throw new Error(
        `kimi-coding did not read through its discovered credential: ${JSON.stringify(kimi)}`,
      )
    }
    console.log('credentials: route credentials come from the harness, per route')
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log(JSON.stringify(results, null, 2))

for (const result of results) {
  // Placeholder adapters return 'unsupported' which is valid for platforms
  // without balance API support. Only fail if the status is neither 'ready'
  // nor 'unsupported'.
  if (result.status !== 'ready' && result.status !== 'unsupported') {
    throw new Error(`${result.adapter} did not read: ${result.error ?? result.status}`)
  }
}

// --- The difference a reading carries ---------------------------------------
// Every read that asks the provider compares its answer with the reading
// published last time — whether a turn ended, the card was refreshed by hand,
// or the sweep ran. The difference rides the published copy only: caching it
// would let a later sweep republish a stale one.
{
  const seen = []
  const route = 'deepseek'
  const stop = service.subscribe(route, (view) => seen.push(view))
  let amount = 46.71
  const respond = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url === 'https://api.deepseek.com/user/balance'
        ? { balance_infos: [{ currency: 'CNY', total_balance: amount.toFixed(2) }] }
        : responses[url],
  })
  globalThis.fetch = respond
  try {
    // No published reading means no anchor, so the first read states nothing.
    service.invalidateAll()
    const first = await service.read(route, { force: true })
    if (first.consumption !== undefined) {
      throw new Error('the first reading has nothing to be measured against')
    }

    // A sweep is a forced read; it reports what it saw move.
    amount = 45.81
    const swept = await service.read(route, { force: true })
    if (swept.consumption?.kind !== 'amount') {
      throw new Error(
        `a sweep should report its movement, got ${JSON.stringify(swept.consumption)}`,
      )
    }
    if (Math.abs(swept.consumption.delta + 0.9) > 1e-9) {
      throw new Error(`the movement should be -0.9, got ${String(swept.consumption.delta)}`)
    }
    if (!Number.isFinite(swept.consumption.at)) throw new Error('the movement has no instant')

    // The subscriber sees the annotated reading, so the badge can show it.
    const published = seen.at(-1)
    if (published?.consumption === undefined) {
      throw new Error('the movement was not published to subscribers')
    }
    // The cache keeps the plain reading, so remembering it cannot replay a
    // movement that this read has already reported.
    if (service.peek(route)?.consumption !== undefined) {
      throw new Error('the movement was cached and would be reported again')
    }

    // An unchanged reading carries a zero movement, which the badge drops at
    // display precision instead of announcing nothing.
    const still = await service.read(route, { force: true })
    if (still.consumption?.delta !== 0) {
      throw new Error(
        `an unchanged reading should report zero, got ${JSON.stringify(still.consumption)}`,
      )
    }

    // A failed read clears the anchor: the gap it spans says nothing about
    // what the next reading is compared with.
    globalThis.fetch = async () => {
      throw new Error('offline')
    }
    const failed = await service.read(route, { force: true })
    if (failed.status !== 'failed') throw new Error('the offline read should fail')

    globalThis.fetch = respond
    const recovered = await service.read(route, { force: true })
    if (recovered.consumption !== undefined) {
      throw new Error('a reading after a failure has no anchor to be measured against')
    }

    console.log('service: every read reports the movement it saw, from its own anchor')
  } finally {
    stop()
    globalThis.fetch = originalFetch
  }
}

// --- one route meters several models separately ----------------------------
// MiniMax reports a bucket per model, so its cache key includes the model.
// Other routes stay route-scoped: the DeepSeek balance is the same whichever
// model asks for it.
{
  const route = 'minimax-cn'
  let percent = 10
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model_remains: [{ model_name: 'general', current_interval_remaining_percent: percent }],
      base_resp: { status_code: 0 },
    }),
  })
  try {
    service.invalidateAll()
    const first = await service.read(route, { force: true, model: 'model-a' })
    if (first.percent !== 10) throw new Error('the first model did not read')
    percent = 20
    const cached = await service.read(route, { model: 'model-a' })
    if (cached.percent !== 10) {
      throw new Error(`model-a should reuse its reading, got ${JSON.stringify(cached.percent)}`)
    }
    const other = await service.read(route, { model: 'model-b' })
    if (other.percent !== 20) {
      throw new Error(`model-b should read its own value, got ${JSON.stringify(other.percent)}`)
    }
    if (service.peek(route, 'model-a')?.percent !== 10) {
      throw new Error('peek did not address the model-specific reading')
    }
    console.log('service: readings are cached per route and model')
  } finally {
    globalThis.fetch = originalFetch
  }
}

// --- a service-backed read is bounded by the request timeout --------------
// The account service cannot be cancelled, so the service races it against
// the timeout instead of leaving the in-flight entry alive forever.
{
  const hanging = new BalanceService({
    ctx: strictContext({
      credentials: { resolve: async () => undefined },
      deepseekAccount: { getBalance: () => new Promise(() => {}) },
    }),
    resolveCredential: async () => undefined,
    options: { ttlMs: 1000, requestTimeoutMs: 50 },
  })
  // AbortSignal.timeout() is unref'd in Node, and the hanging promise holds no
  // handle, so this test needs its own timer to keep the event loop alive long
  // enough for the timeout to fire.
  const keepAlive = setTimeout(() => {}, 1000)
  let view
  try {
    view = await hanging.read('deepseek-account', { force: true })
  } finally {
    clearTimeout(keepAlive)
  }
  if (view.status !== 'failed' || view.error !== 'timeout') {
    throw new Error(`a hanging account read should time out, got ${JSON.stringify(view)}`)
  }
  console.log('service: a service-backed read is bounded by its timeout')
}

// --- sweep only what a browser is still watching --------------------------
// A read keeps its key in the sweep for one cache lifetime; a released stream
// keeps it for one more, then the key is pruned. Previously every route ever
// read stayed in the set forever.
{
  const ctx = new Context()
  ctx.reflect.provide('credentials', { resolve: async () => undefined })
  const allowance = new ModelAllowanceService(ctx, {
    debug: false,
    ttlMs: 40,
    requestTimeoutMs: 1000,
  })
  const calls = []
  allowance.balance.read = async (route, options = {}) => {
    calls.push({ route, model: options.model, force: options.force === true })
    return { provider: route, status: 'ready', kind: 'quota', percent: 50, updatedAt: Date.now() }
  }

  await ctx.modelAllowance.read('minimax-cn', { model: 'model-a' })
  await ctx.modelAllowance.read('minimax-cn', { model: 'model-b' })
  if (allowance.active.size !== 2) {
    throw new Error(`two read keys should be active, got ${String(allowance.active.size)}`)
  }
  calls.length = 0
  await allowance.refreshAll()
  if (calls.length !== 2) {
    throw new Error(`the sweep should refresh two readings, refreshed ${String(calls.length)}`)
  }
  if (!calls.every((call) => call.force)) throw new Error('the sweep must force its reads')

  // A held stream keeps its key alive past the cache lifetime.
  const release = allowance.track('minimax-cn', 'model-c')
  await new Promise((resolve) => setTimeout(resolve, 70))
  calls.length = 0
  await allowance.refreshAll()
  if (!calls.some((call) => call.route === 'minimax-cn')) {
    throw new Error('a held stream should keep its route in the sweep')
  }

  // Releasing it starts the grace period; after it expires the key is pruned.
  release()
  await new Promise((resolve) => setTimeout(resolve, 70))
  calls.length = 0
  await allowance.refreshAll()
  if (calls.length !== 0) {
    throw new Error(`an idle sweep should make no requests, made ${String(calls.length)}`)
  }
  console.log('service: the sweep follows live streams instead of remembering every route')
}

console.log('OK: every adapter reads through a Cordis-strict context')
