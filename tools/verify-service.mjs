/**
 * Run the balance service against a context that behaves like Cordis.
 *
 * Cordis resolves `ctx.something` as a *service* named `something`, and throws
 * when that service was not injected. A plain object stub hides that class of
 * mistake, so this context is a proxy that refuses any property it was not
 * given — exactly like the real thing.
 */
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
    resolve: async (ref) => (credentials[ref] ? { value: credentials[ref], source: 'test' } : undefined),
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
    results.push({ adapter: adapter.id, route, status: view.status, kind: view.kind, error: view.error })
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
      throw new Error(`kimi-coding did not read through its discovered credential: ${JSON.stringify(kimi)}`)
    }
    console.log('credentials: route credentials come from the harness, per route')
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log(JSON.stringify(results, null, 2))

for (const result of results) {
  if (result.status !== 'ready') {
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
      throw new Error(`a sweep should report its movement, got ${JSON.stringify(swept.consumption)}`)
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
      throw new Error(`an unchanged reading should report zero, got ${JSON.stringify(still.consumption)}`)
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

console.log('OK: every adapter reads through a Cordis-strict context')