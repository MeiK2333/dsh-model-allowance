/**
 * Exercise the Host provider adapters against stubbed transports.
 *
 * Each case answers from a recorded real response shape, so this proves the
 * parsers and the two quantity dimensions without touching the network.
 */
import { findAdapter, KIND_AMOUNT, KIND_QUOTA } from '../lib/providers.js'

const cases = []

/** Run one adapter with a stubbed global fetch. */
async function withFetch(responseBody, run) {
  const original = globalThis.fetch
  let seen
  globalThis.fetch = async (url, init) => {
    seen = { url, init }
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    }
  }
  try {
    return { result: await run(), seen }
  } finally {
    globalThis.fetch = original
  }
}

// --- DeepSeek API key: real recorded response -------------------------------
{
  const adapter = findAdapter('deepseek')
  const { result, seen } = await withFetch(
    {
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '46.71', granted_balance: '0.00', topped_up_balance: '46.71' },
      ],
    },
    () => adapter.read('deepseek', 'sk-test', AbortSignal.timeout(5000)),
  )
  cases.push({
    name: 'deepseek api-key',
    status: result.status,
    kind: result.kind,
    amount: result.amount,
    currency: result.currency,
    auth: seen.init.headers.authorization,
    url: seen.url,
  })
}

// --- MiniMax coding plan: real recorded response ---------------------------
{
  const adapter = findAdapter('minimax-cn')
  const { result, seen } = await withFetch(
    {
      model_remains: [
        {
          remains_time: 16380448,
          current_interval_remaining_percent: 82,
          current_weekly_remaining_percent: 66,
        },
      ],
      base_resp: { status_code: 0, status_msg: 'success' },
    },
    () => adapter.read('minimax-cn', 'sk-cp-test', AbortSignal.timeout(5000)),
  )
  cases.push({
    name: 'minimax-cn token plan',
    status: result.status,
    kind: result.kind,
    percent: result.percent,
    remainingMs: result.remainingMs,
    auth: seen.init.headers.authorization,
  })
}

// --- Zhipu quota: real recorded response -----------------------------------
{
  const adapter = findAdapter('zai')
  const { result } = await withFetch(
    {
      code: 200,
      data: {
        limits: [
          { type: 'CREDIT_LIMIT', number: 5, usage: 2000, remaining: 2000, percentage: 0 },
          {
            type: 'CREDIT_LIMIT',
            number: 1,
            usage: 10000,
            remaining: 0,
            percentage: 100,
            nextResetTime: 1794305132998,
          },
        ],
        level: 'lite',
      },
    },
    () => adapter.read('zai', 'test-key', AbortSignal.timeout(5000)),
  )
  cases.push({
    name: 'zhipu quota',
    status: result.status,
    kind: result.kind,
    remaining: result.remaining,
    total: result.total,
    percent: result.percent,
    resetsAt: result.resetsAt,
  })
}

// --- DeepSeek account: forwarded to the Host service ----------------------
{
  const adapter = findAdapter('deepseek-account')
  const ctx = {
    get: (key) =>
      key === 'deepseekAccount'
        ? {
            getBalance: async (client) => ({
              status: 'ready',
              value: [{ currency: 'CNY', balance: '40.00' }],
              bonusWallets: [{ currency: 'CNY', balance: '6.71' }],
              client,
            }),
          }
        : undefined,
  }
  const result = await adapter.readWithEnv({
    route: 'deepseek-account',
    apiKey: undefined,
    ctx,
    signal: AbortSignal.timeout(5000),
  })
  cases.push({
    name: 'deepseek-account (host service)',
    status: result.status,
    kind: result.kind,
    amount: result.amount,
    currency: result.currency,
  })
}

// --- Unknown route --------------------------------------------------------
cases.push({ name: 'unknown route', adapter: findAdapter('openai') ?? null })

// --- Assertions -----------------------------------------------------------
const byName = Object.fromEntries(cases.map((entry) => [entry.name, entry]))

if (byName['deepseek api-key'].amount !== 46.71) throw new Error('deepseek amount mismatch')
if (byName['deepseek api-key'].kind !== KIND_AMOUNT) throw new Error('deepseek kind mismatch')
if (byName['deepseek api-key'].auth !== 'Bearer sk-test') throw new Error('deepseek auth mismatch')
if (byName['minimax-cn token plan'].kind !== KIND_QUOTA) throw new Error('minimax kind mismatch')
if (byName['minimax-cn token plan'].percent !== 82) throw new Error('minimax percent mismatch')
if (byName['zhipu quota'].remaining !== 0) throw new Error('zhipu remaining mismatch')
// The nearly spent limit is the binding constraint, so it is reported.
if (byName['zhipu quota'].percent !== 0) throw new Error('zhipu percent mismatch')
if (byName['deepseek-account (host service)'].amount !== 46.71) {
  throw new Error('account wallet sum mismatch')
}
if (byName['unknown route'].adapter !== null) throw new Error('unknown route should not resolve')

console.log(JSON.stringify(cases, null, 2))
console.log('OK: all provider adapters parse their recorded responses')
