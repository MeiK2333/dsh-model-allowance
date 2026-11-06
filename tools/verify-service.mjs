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
  DEEPSEEK_API_KEY: 'sk-test',
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
    data: { limits: [{ number: 5, usage: 2000, remaining: 2000, percentage: 0 }] },
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