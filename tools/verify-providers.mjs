/**
 * Exercise every provider adapter against its recorded response fixtures.
 *
 * Adding a vendor means adding one file under `lib/providers/`, and that file
 * carries its own recorded response and expectations. This runner walks the
 * registry and turns each fixture into an assertion, so a new adapter is
 * covered without touching this file. Only the rules that hold for every
 * adapter live here: https console links, no retired console paths, complete
 * display metadata, and globally unique routes.
 */

import { holidayCoverage } from '../lib/providers/schedule.js'
import { readEndpointAdapter } from '../lib/providers/shared.js'
import { findAdapter, PROVIDER_ADAPTERS } from '../lib/providers.js'

/**
 * Stub fetch with one recorded response, and record the request it answered.
 * @param {object} fixture Recorded fixture.
 * @param {() => Promise<object>} run The read to perform.
 * @returns {Promise<{result: object, seen: Array<{url: string, init: object}>}>}
 *   The reading and the requests it made.
 */
async function withFetch(fixture, run) {
  const original = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return {
      ok: (fixture.httpStatus ?? 200) < 400,
      status: fixture.httpStatus ?? 200,
      json: async () => fixture.response ?? {},
    }
  }
  try {
    return { result: await run(), seen }
  } finally {
    globalThis.fetch = original
  }
}

/**
 * Assert that every expected field is present and equal.
 *
 * Nested objects are walked key by key and arrays compare element-wise on the
 * expected length, so a fixture states only the fields it cares about.
 *
 * @param {unknown} actual The reading.
 * @param {unknown} expect Expected fields.
 * @param {string} path Where the comparison is, for the failure message.
 * @param {string} where Fixture identity, for the failure message.
 */
function expectSubset(actual, expect, path, where) {
  if (Array.isArray(expect)) {
    if (!Array.isArray(actual) || actual.length !== expect.length) {
      const got = Array.isArray(actual) ? actual.length : typeof actual
      throw new Error(
        `${where}: expected ${String(expect.length)} entries at ${path}, got ${String(got)}`,
      )
    }
    expect.forEach((entry, index) => {
      expectSubset(actual[index], entry, `${path}[${String(index)}]`, where)
    })
    return
  }
  if (expect !== null && typeof expect === 'object') {
    if (actual === null || typeof actual !== 'object') {
      throw new Error(`${where}: expected an object at ${path}`)
    }
    for (const [key, value] of Object.entries(expect)) {
      expectSubset(
        /** @type {Record<string, unknown>} */ (actual)[key],
        value,
        `${path}.${key}`,
        where,
      )
    }
    return
  }
  if (!Object.is(actual, expect)) {
    throw new Error(
      `${where}: expected ${path} = ${JSON.stringify(expect)}, got ${JSON.stringify(actual)}`,
    )
  }
}

/**
 * Read one dotted path, including array indices such as `windows[0].total`.
 * @param {unknown} value Root value.
 * @param {string} path Dotted path.
 * @returns {unknown} The value at the path, or undefined.
 */
function valueAt(value, path) {
  let current = value
  for (const segment of path.split('.')) {
    const match = /^([^[\]]+)(?:\[(\d+)\])?$/.exec(segment)
    if (!match) return undefined
    if (current === null || typeof current !== 'object') return undefined
    current = /** @type {Record<string, unknown>} */ (current)[match[1]]
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) return undefined
      current = current[Number(match[2])]
    }
  }
  return current
}

// --- fixtures ---------------------------------------------------------------
const cases = []
for (const adapter of PROVIDER_ADAPTERS) {
  for (const fixture of adapter.fixtures) {
    const where = `${adapter.id} / ${fixture.name}`
    const route = fixture.route ?? adapter.routes[0]
    let result

    if (adapter.readWithEnv) {
      // A host-service adapter reads through services rather than the network.
      const services = fixture.services ?? {}
      result = await adapter.readWithEnv({
        route,
        apiKey: undefined,
        ctx: { get: (key) => services[key] },
        signal: AbortSignal.timeout(5000),
        model: fixture.model,
      })
    } else {
      const apiKey = fixture.apiKey ?? 'test-key'
      const { result: read, seen } = await withFetch(fixture, () =>
        readEndpointAdapter(adapter, {
          route,
          apiKey,
          signal: AbortSignal.timeout(5000),
          model: fixture.model,
        }),
      )
      result = read
      // The endpoint and the signing style are part of the contract, so check
      // what the request actually carried.
      const request = seen[0]
      if (!request) throw new Error(`${where}: the adapter performed no request`)
      if (request.url !== adapter.http.endpoint) {
        throw new Error(`${where}: read ${request.url}, expected ${adapter.http.endpoint}`)
      }
      const authorization = request.init?.headers?.authorization
      const expected = adapter.http.auth === 'bearer' ? `Bearer ${apiKey}` : apiKey
      if (authorization !== expected) {
        throw new Error(
          `${where}: signed with ${JSON.stringify(authorization)}, expected ${JSON.stringify(expected)}`,
        )
      }
    }

    expectSubset(result, fixture.expect, 'reading', where)
    for (const path of fixture.absent ?? []) {
      const present = valueAt(result, path)
      if (present !== undefined) {
        throw new Error(`${where}: ${path} should be absent, got ${JSON.stringify(present)}`)
      }
    }
    cases.push({
      adapter: adapter.id,
      fixture: fixture.name,
      route,
      status: result.status,
      kind: result.kind,
    })
  }
}

// --- every adapter keeps its contract --------------------------------------
// The route registry already refuses duplicates at import time; these checks
// cover the metadata a fixture cannot see.
const routes = new Set()
for (const adapter of PROVIDER_ADAPTERS) {
  if (typeof adapter.consoleUrl !== 'string' || !adapter.consoleUrl.startsWith('https://')) {
    throw new Error(`adapter ${adapter.id} needs an https console link`)
  }
  if (typeof adapter.display?.name?.zh !== 'string' || adapter.display.name.zh === '') {
    throw new Error(`adapter ${adapter.id} needs a zh display name`)
  }
  if (typeof adapter.display?.name?.en !== 'string' || adapter.display.name.en === '') {
    throw new Error(`adapter ${adapter.id} needs an en display name`)
  }
  if (typeof adapter.display?.mark?.color !== 'string' || adapter.display.mark.color === '') {
    throw new Error(`adapter ${adapter.id} needs a brand colour`)
  }
  for (const route of adapter.routes) {
    if (routes.has(route)) throw new Error(`two adapters declare the route ${route}`)
    routes.add(route)
  }
}

// A dead console link is a dead end the user cannot fix, and these paths have
// already moved once: Zhipu split API keys from plan keys in October 2026 and
// retired the old usercenter path, and MiniMax redirects off the older host.
const retired = ['open.bigmodel.cn/usercenter/apikeys', 'platform.minimaxi.com']
for (const adapter of PROVIDER_ADAPTERS) {
  for (const fragment of retired) {
    if (adapter.consoleUrl.includes(fragment)) {
      throw new Error(
        `adapter ${adapter.id} points at the retired path ${JSON.stringify(fragment)}`,
      )
    }
  }
}

// An unknown route is not an adapter, but the client may still ask.
if (findAdapter('__none__') !== undefined) throw new Error('an unknown route should not resolve')

// --- vendors that price by the wall clock declare their windows -----------
// The schedule is data the card renders, so a wrong window is a wrong card;
// these are the vendors whose docs state one.
{
  const ranges = (schedule) => schedule.windows.map((window) => `${window.from}-${window.to}`)
  const deepseek = findAdapter('deepseek')?.schedule
  if (deepseek === undefined) throw new Error('deepseek should declare its peak schedule')
  if (ranges(deepseek).join(',') !== '09:00-12:00,14:00-18:00') {
    throw new Error(`deepseek windows changed: ${ranges(deepseek).join(',')}`)
  }
  if (deepseek.holidays.length === 0) throw new Error('deepseek declares no holidays')

  const zhipu = findAdapter('zai')?.schedule
  if (zhipu === undefined) throw new Error('zhipu should declare its peak schedule')
  if (ranges(zhipu).join(',') !== '14:00-18:00') {
    throw new Error(`zhipu windows changed: ${ranges(zhipu).join(',')}`)
  }
  // Zhipu's rule has no holiday exception.
  if (zhipu.holidays.length !== 0) throw new Error('zhipu should not declare holidays')
  console.log('schedule: deepseek and zhipu declare their peak windows')
}

// --- a holiday list must cover the current year ---------------------------
// The list is vendor data that changes annually. Failing here is the reminder
// to extend it; a stale list silently prices every holiday as a peak day.
{
  const thisYear = new Date().getFullYear()
  for (const adapter of PROVIDER_ADAPTERS) {
    const coverage = holidayCoverage(adapter.schedule ?? { holidays: [] })
    if (coverage === undefined) continue
    if (coverage.to < thisYear) {
      throw new Error(
        `adapter ${adapter.id} holiday data ends in ${String(coverage.to)}; ` +
          `extend it for ${String(thisYear)} before the next holiday`,
      )
    }
  }
  console.log(`schedule: holiday data covers ${String(thisYear)}`)
}

console.log(JSON.stringify(cases, null, 2))
console.log(`OK: ${String(PROVIDER_ADAPTERS.length)} adapters parse their recorded responses`)
