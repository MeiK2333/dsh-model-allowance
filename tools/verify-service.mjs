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

// --- The difference from the turn's baseline --------------------------------
// A finished turn is the only read that reports one, and it must be attached to
// the published reading without being cached, so a later sweep cannot repeat it.
{
  const seen = []
  const route = 'deepseek'
  const stop = service.subscribe(route, (view) => seen.push(view))
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => responses[url],
  })
  try {
    const before = service.peek(route)
    if (before === undefined || typeof before.amount !== 'number') {
      throw new Error('the cached reading was not available as a baseline')
    }
    // Pretend the provider started the turn with a little more money.
    const baseline = { ...before, amount: before.amount + 0.9 }

    const after = await service.read(route, { force: true, baseline })
    if (after.consumption?.kind !== 'amount') {
      throw new Error(`a turn-end read should report its difference, got ${JSON.stringify(after.consumption)}`)
    }
    if (Math.abs(after.consumption.delta + 0.9) > 1e-9) {
      throw new Error(`the difference should be -0.9, got ${String(after.consumption.delta)}`)
    }
    if (!Number.isFinite(after.consumption.at)) throw new Error('the difference has no instant')

    // The subscriber sees the annotated reading, so the badge can show it.
    const published = seen.at(-1)
    if (published?.consumption === undefined) {
      throw new Error('the difference was not published to subscribers')
    }
    // The cache keeps the plain reading, so a later sweep reports no difference.
    const cached = service.peek(route)
    if (cached?.consumption !== undefined) {
      throw new Error('the difference was cached and would be reported again by a sweep')
    }
    // A read with no baseline says nothing about a difference.
    const plain = await service.read(route, { force: true })
    if (plain.consumption !== undefined) {
      throw new Error('a read without a baseline should carry no difference')
    }
    console.log('service: turn-end reads report a difference; sweeps do not')
  } finally {
    stop()
    globalThis.fetch = originalFetch
  }
}

console.log('OK: every adapter reads through a Cordis-strict context')
