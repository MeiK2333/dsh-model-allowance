/**
 * Exercise the Host provider adapters against stubbed transports.
 *
 * Each case answers from a recorded real response shape, so this proves the
 * parsers and the two quantity dimensions without touching the network.
 */
import { findAdapter, KIND_AMOUNT, KIND_QUOTA, PROVIDER_ADAPTERS } from '../lib/providers.js'

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
// The plan meters a 5-hour window and a 7-day window, and reports both as
// percentages plus the closing timestamp of each.
{
  const adapter = findAdapter('minimax-cn')
  const intervalStart = 1793937039924
  const intervalEnd = intervalStart + 5 * 3_600_000
  const weeklyStart = 1793727425969
  const weeklyEnd = weeklyStart + 7 * 86_400_000
  const { result, seen } = await withFetch(
    {
      model_remains: [
        {
          start_time: intervalStart,
          end_time: intervalEnd,
          remains_time: 16380448,
          current_interval_total_count: 0,
          current_interval_usage_count: 0,
          current_interval_remaining_percent: 82,
          weekly_start_time: weeklyStart,
          weekly_end_time: weeklyEnd,
          weekly_remains_time: 393566493,
          current_weekly_total_count: 0,
          current_weekly_usage_count: 0,
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
    windows: result.windows,
    auth: seen.init.headers.authorization,
    intervalEnd,
    weeklyEnd,
  })
}

// --- Zhipu quota: real recorded response -----------------------------------
// `unit` is a length code and `number` counts them: unit 3 + 5 is the 5-hour
// window, unit 6 + 1 the weekly one. The quota is `usage` and
// `currentValue` is what has been spent.
{
  const adapter = findAdapter('zai')
  const { result } = await withFetch(
    {
      code: 200,
      data: {
        limits: [
          {
            type: 'CREDIT_LIMIT',
            unit: 3,
            number: 5,
            usage: 2000,
            currentValue: 0,
            remaining: 2000,
            percentage: 0,
          },
          {
            type: 'CREDIT_LIMIT',
            unit: 6,
            number: 1,
            usage: 10000,
            currentValue: 10071,
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
    percent: result.percent,
    windows: result.windows,
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
if (byName['deepseek-account (host service)'].amount !== 46.71) {
  throw new Error('account wallet sum mismatch')
}
if (byName['unknown route'].adapter !== null) throw new Error('unknown route should not resolve')

const minimax = byName['minimax-cn token plan']
if (minimax.kind !== KIND_QUOTA) throw new Error('minimax kind mismatch')
if (minimax.percent !== 82) throw new Error('minimax percent mismatch')
if (minimax.windows?.length !== 2) {
  throw new Error(`minimax should report two windows, got ${minimax.windows?.length}`)
}
{
  const [session, weekly] = minimax.windows
  if (session.id !== 'session') throw new Error('minimax window 0 is not the session window')
  if (session.unit !== 'hour' || session.count !== 5) {
    throw new Error(`minimax session window length wrong: ${session.unit} ${session.count}`)
  }
  if (session.remainingPercent !== 82) throw new Error('minimax session percent mismatch')
  if (session.resetAt !== minimax.intervalEnd) throw new Error('minimax session reset mismatch')

  // The plan's long window is seven days. Calling it a month would be wrong.
  if (weekly.id !== 'weekly') throw new Error('minimax window 1 is not the weekly window')
  if (weekly.unit !== 'day' || weekly.count !== 7) {
    throw new Error(`minimax weekly window length wrong: ${weekly.unit} ${weekly.count}`)
  }
  if (weekly.remainingPercent !== 66) throw new Error('minimax weekly percent mismatch')
  if (weekly.resetAt !== minimax.weeklyEnd) throw new Error('minimax weekly reset mismatch')
  // A coding-plan key reports no request counts, so no used/total is invented.
  if (session.total !== undefined) throw new Error('minimax invented a total')
}

const zhipu = byName['zhipu quota']
if (zhipu.kind !== KIND_QUOTA) throw new Error('zhipu kind mismatch')
if (zhipu.windows?.length !== 2) {
  throw new Error(`zhipu should report two windows, got ${zhipu.windows?.length}`)
}
{
  const session = zhipu.windows.find((window) => window.id === 'session')
  const weekly = zhipu.windows.find((window) => window.id === 'weekly')
  if (!session || !weekly) throw new Error('zhipu windows are not session + weekly')
  if (session.unit !== 'hour' || session.count !== 5) {
    throw new Error(`zhipu session window length wrong: ${session.unit} ${session.count}`)
  }
  // `usage` is the quota and `currentValue` is what was spent.
  if (session.total !== 2000) throw new Error(`zhipu session total should be 2000, got ${session.total}`)
  if (session.used !== 0) throw new Error(`zhipu session used should be 0, got ${session.used}`)
  if (session.remainingPercent !== 100) throw new Error('zhipu session percent mismatch')
  if (weekly.total !== 10000) throw new Error(`zhipu weekly total should be 10000, got ${weekly.total}`)
  if (weekly.used !== 10071) throw new Error(`zhipu weekly used should be 10071, got ${weekly.used}`)
  if (weekly.unit !== 'week') throw new Error(`zhipu long window unit should be week, got ${weekly.unit}`)
  if (weekly.remainingPercent !== 0) throw new Error('zhipu weekly percent mismatch')
  if (weekly.resetAt === undefined) throw new Error('zhipu weekly reset missing')
  // The exhausted window is the binding constraint on the account.
  if (zhipu.percent !== 0) throw new Error('zhipu binding percent should be the exhausted window')
}

// --- console links must not point at retired pages ------------------------
// A dead console link is a dead end the user cannot fix, and these paths have
// already moved once: Zhipu split API keys from plan keys in October 2026 and
// retired the old usercenter path, and MiniMax redirects off the older host.
{
  const urls = PROVIDER_ADAPTERS.map((adapter) => adapter.consoleUrl)
  if (urls.some((url) => typeof url !== 'string' || !url.startsWith('https://'))) {
    throw new Error('every adapter needs an https console link')
  }
  const retired = ['open.bigmodel.cn/usercenter/apikeys', 'platform.minimaxi.com']
  for (const fragment of retired) {
    if (urls.some((url) => url.includes(fragment))) {
      throw new Error(`a console link still points at the retired path ${JSON.stringify(fragment)}`)
    }
  }
  // Each brand keeps one destination, so the registry cannot drift per route.
  const zhipuUrls = new Set(
    PROVIDER_ADAPTERS.filter((adapter) => adapter.id === 'zhipu-quota').map((a) => a.consoleUrl),
  )
  if (zhipuUrls.size !== 1) throw new Error('the zhipu adapter declares more than one console link')
}

console.log(JSON.stringify(cases, null, 2))
console.log('OK: all provider adapters parse their recorded responses')
