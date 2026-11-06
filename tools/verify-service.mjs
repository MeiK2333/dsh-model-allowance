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
console.log('OK: every adapter reads through a Cordis-strict context')
