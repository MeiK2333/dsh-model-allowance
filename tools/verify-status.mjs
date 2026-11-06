/**
 * Exercise the status service against recorded source payloads.
 *
 * Every status source is a public page, so the service is parsing plus
 * caching: this stubs fetch with the shapes the vendors actually answer and
 * asserts that each one lands on the shared vocabulary, that one page is
 * fetched once however many routes share it, and that a source this plugin
 * cannot read answers `unknown` instead of throwing.
 */

import { findAdapter, PROVIDER_ADAPTERS } from '../lib/providers.js'
import { StatusService } from '../lib/status.js'

const originalFetch = globalThis.fetch
let fetches = 0

/**
 * Install one stub responder keyed by URL.
 * @param {Record<string, {body: string, contentType: string, status?: number}>} responses
 *   What each URL answers.
 */
function stubFetch(responses) {
  fetches = 0
  globalThis.fetch = async (url) => {
    fetches += 1
    const entry = responses[url]
    if (entry === undefined) throw new Error(`unexpected fetch ${url}`)
    return {
      ok: (entry.status ?? 200) < 400,
      status: entry.status ?? 200,
      headers: new Headers({ 'content-type': entry.contentType }),
      text: async () => entry.body,
    }
  }
}

/**
 * Build the flight-payload document a FlashCat status page renders from.
 *
 * The real page is a Next.js server-rendered document; the state it renders
 * comes from `initialData.active_changes` inside the embedded flight payload.
 * @param {object[]} changes Active changes.
 * @returns {string} The page source.
 */
function flashcatPage(changes) {
  const pageRow = `3b:${JSON.stringify([
    '$',
    '$L44',
    null,
    { pageId: 1, initialData: { page: { name: 'DeepSeek' }, active_changes: changes } },
  ])}`
  const chunk = JSON.stringify([1, pageRow])
  return `<html><body><script>self.__next_f.push(${chunk})</script></body></html>`
}

/** One Statuspage `/api/v2/status.json` body. */
function statuspage(indicator, description) {
  return JSON.stringify({
    page: { name: 'Provider' },
    status: { indicator, description },
  })
}

/** One OpenCode `/api/status` body. */
function opencode(status, components) {
  return JSON.stringify({ updatedAt: 1793953888549, status, components })
}

// --- cases ------------------------------------------------------------------
const cases = [
  {
    name: 'deepseek: nothing active is operational',
    route: 'deepseek',
    contentType: 'text/html',
    body: flashcatPage([]),
    expect: { state: 'operational' },
  },
  {
    name: 'deepseek: an active incident carries its impact',
    route: 'deepseek-account',
    contentType: 'text/html',
    body: flashcatPage([
      { type: 'incident', title: 'API latency elevated', status: 'partial_outage' },
    ]),
    expect: { state: 'partial-outage', summary: 'API latency elevated' },
  },
  {
    name: 'deepseek: a maintenance change without an impact',
    route: 'deepseek',
    contentType: 'text/html',
    body: flashcatPage([{ type: 'maintenance', title: 'Scheduled maintenance' }]),
    expect: { state: 'maintenance', summary: 'Scheduled maintenance' },
  },
  {
    name: 'deepseek: a page without a payload',
    route: 'deepseek',
    contentType: 'text/html',
    body: '<html>not a status page</html>',
    expect: { state: 'unknown', error: 'no status payload in page' },
  },
  {
    name: 'minimax: Statuspage operational',
    route: 'minimax-cn',
    contentType: 'application/json',
    body: statuspage('none', 'All Systems Operational'),
    expect: { state: 'operational' },
  },
  {
    name: 'moonshot: Statuspage maintenance',
    route: 'kimi-coding',
    contentType: 'application/json',
    body: statuspage('maintenance', 'Scheduled maintenance'),
    expect: { state: 'maintenance', summary: 'Scheduled maintenance' },
  },
  {
    name: 'opencode: degraded names the affected services',
    route: 'opencode-go',
    contentType: 'application/json',
    body: opencode('degraded', [
      { service: 'go', status: 'degraded', reason: 'upstream' },
      { service: 'inference', status: 'operational', reason: 'none' },
      { service: 'free', status: 'degraded', reason: 'latency' },
    ]),
    expect: { state: 'degraded', summary: 'go · upstream, free · latency' },
  },
  {
    name: 'opencode: operational',
    route: 'opencode-go',
    contentType: 'application/json',
    body: opencode('operational', [{ service: 'go', status: 'operational', reason: 'none' }]),
    expect: { state: 'operational' },
  },
  {
    name: 'source answers 500',
    route: 'minimax-cn',
    contentType: 'application/json',
    status: 500,
    body: '{}',
    expect: { state: 'unknown', error: 'HTTP 500' },
  },
]

const results = []
for (const testCase of cases) {
  const adapter = findAdapter(testCase.route)
  const source = adapter.status
  if (source === undefined) throw new Error(`${testCase.route} has no status source`)
  stubFetch({
    [source.endpoint]: {
      body: testCase.body,
      contentType: testCase.contentType,
      ...(testCase.status === undefined ? {} : { status: testCase.status }),
    },
  })
  const service = new StatusService({ ctx: {}, options: { ttlMs: 1000, timeoutMs: 2000 } })
  const view = await service.read(testCase.route)
  for (const [key, expected] of Object.entries(testCase.expect)) {
    if (view[key] !== expected) {
      throw new Error(
        `${testCase.name}: expected ${key} = ${JSON.stringify(expected)}, got ${JSON.stringify(view[key])}`,
      )
    }
  }
  if (view.provider !== testCase.route) {
    throw new Error(`${testCase.name}: the reading does not name its route`)
  }
  if (view.url !== source.url)
    throw new Error(`${testCase.name}: the reading does not carry the page`)
  results.push({ case: testCase.name, state: view.state, summary: view.summary })
}

// --- one page serves every route that shares it ----------------------------
// The two DeepSeek routes share one status page; asking about both must not
// fetch it twice.
{
  const source = findAdapter('deepseek').status
  stubFetch({ [source.endpoint]: { contentType: 'text/html', body: flashcatPage([]) } })
  const service = new StatusService({ ctx: {}, options: { ttlMs: 60_000, timeoutMs: 2000 } })
  await service.read('deepseek')
  await service.read('deepseek-account')
  if (fetches !== 1)
    throw new Error(`two routes sharing a page fetched it ${String(fetches)} times`)
  console.log('status: two routes sharing a status page fetched it once')
}

// --- routes without a source answer unknown without a request --------------
{
  stubFetch({})
  const service = new StatusService({ ctx: {} })
  const view = await service.read('zai')
  if (view.state !== 'unknown')
    throw new Error('a route without a status source should answer unknown')
  if (fetches !== 0) throw new Error('a route without a status source made a request')
  const missing = await service.read('__none__')
  if (missing.state !== 'unknown') throw new Error('an unknown route should answer unknown')
  console.log('status: a route without a source answers unknown without a request')
}

// --- a source that cannot be reached answers unknown, not a throw ----------
{
  globalThis.fetch = async () => {
    throw new Error('offline')
  }
  const service = new StatusService({ ctx: {}, options: { timeoutMs: 1000 } })
  const view = await service.read('minimax-cn')
  if (view.state !== 'unknown' || view.error !== 'offline') {
    throw new Error(`an unreachable source should answer unknown, got ${JSON.stringify(view)}`)
  }
  console.log('status: an unreachable source answers unknown')
}

// --- a failed source is remembered briefly --------------------------------
// Without a negative cache, a down status page is fetched again on every badge
// mount and every clock tick; the short failure window keeps that bounded.
{
  const source = findAdapter('minimax-cn').status
  stubFetch({
    [source.endpoint]: { contentType: 'application/json', status: 500, body: '{}' },
  })
  const service = new StatusService({
    ctx: {},
    options: { ttlMs: 1000, failureTtlMs: 60_000, timeoutMs: 2000 },
  })
  const first = await service.read('minimax-cn')
  const second = await service.read('minimax-cn')
  if (first.state !== 'unknown' || second.state !== 'unknown') {
    throw new Error('a failing source should answer unknown')
  }
  if (fetches !== 1) {
    throw new Error(`a cached failure was fetched ${String(fetches)} times`)
  }
  console.log('status: a failed source is remembered instead of refetched')
}

// --- every adapter that declares a source declares a usable one ------------
for (const adapter of PROVIDER_ADAPTERS) {
  if (adapter.status === undefined) continue
  if (!adapter.status.endpoint.startsWith('https://'))
    throw new Error(`${adapter.id} has a non-https status endpoint`)
  if (!adapter.status.url.startsWith('https://'))
    throw new Error(`${adapter.id} has a non-https status page`)
}
const withStatus = PROVIDER_ADAPTERS.filter((adapter) => adapter.status !== undefined).map(
  (adapter) => adapter.id,
)
console.log('status sources:', withStatus.join(', '))

globalThis.fetch = originalFetch
console.log(JSON.stringify(results, null, 2))
console.log('OK: every status source lands on the shared vocabulary')
