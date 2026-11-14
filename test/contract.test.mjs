/**
 * The browser contract and the Host readings must agree.
 *
 * `client.js` hand-authors the Zod codec the generated Typert artifact would
 * normally supply. This test loads the real bundle with the real Zod runtime,
 * mounts its descriptors, and validates every recorded provider fixture
 * against the result schema — so a field the Host adds (or the badge reads)
 * cannot silently drift out of the contract.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as z from 'zod'
import { readEndpointAdapter } from '../lib/providers/shared.js'
import { findAdapter, PROVIDER_ADAPTERS } from '../lib/providers.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

/** Load the bundle the way the browser module loader does, with real Zod. */
function loadContribution() {
  let registration
  const fakeWindow = {
    __ModuleLoader__: {
      load(value) {
        registration = value
      },
    },
  }
  // The bundle registers a factory; it is the only global it touches at load.
  new Function('window', source)(fakeWindow)
  assert.equal(registration?.id, 'dsh-model-allowance')
  const React = {
    createElement: () => null,
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn(),
  }
  const plugin = registration.factory((specifier) => {
    if (specifier === 'react') return React
    if (specifier === 'zod') return z
    throw new Error(`unexpected module request: ${specifier}`)
  })
  let info
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
    },
    remote: {
      $mount(contribution) {
        info = contribution
        return async () => {}
      },
    },
    slots: {
      inject: (_key, callback) => {
        callback()
        return () => {}
      },
      register: () => () => {},
    },
    get: (key) => (key === 'remote.balance' ? { balance: async () => ({}) } : undefined),
  }
  plugin.apply(ctx)
  assert.ok(info, 'the plugin did not mount its Remote contribution')
  return { info, descriptors: info.descriptors }
}

const { descriptors } = loadContribution()

/** Find one endpoint descriptor. */
function descriptor(endpoint) {
  const found = descriptors.find(
    (candidate) => `${candidate.namespace}/${candidate.method}` === endpoint,
  )
  assert.ok(found, `missing descriptor ${endpoint}`)
  return found
}

/** Read one adapter fixture's view exactly as the Host would. */
async function readFixture(adapter, fixture) {
  const route = fixture.route ?? adapter.routes[0]
  if (adapter.readWithEnv) {
    return await adapter.readWithEnv({
      route,
      apiKey: undefined,
      ctx: { get: (key) => fixture.services?.[key] },
      signal: AbortSignal.timeout(5000),
      model: fixture.model,
    })
  }
  const original = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: (fixture.httpStatus ?? 200) < 400,
    status: fixture.httpStatus ?? 200,
    json: async () => fixture.response ?? {},
  })
  try {
    return await readEndpointAdapter(adapter, {
      route,
      apiKey: fixture.apiKey ?? 'test-key',
      signal: AbortSignal.timeout(5000),
      model: fixture.model,
    })
  } finally {
    globalThis.fetch = original
  }
}

test('the balance result schema keeps the movement the badge renders', () => {
  const schema = descriptor('balance/balance').result.create()
  const view = {
    provider: 'deepseek',
    status: 'ready',
    kind: 'amount',
    amount: 46.71,
    currency: 'CNY',
    consoleUrl: 'https://platform.deepseek.com/top_up',
    updatedAt: Date.now(),
    consumption: { kind: 'amount', delta: -0.9, at: Date.now() },
  }
  const parsed = schema.parse(view)
  assert.deepEqual(parsed.consumption, view.consumption)
  assert.equal(parsed.amount, 46.71)
})

test('every balance, refresh, and watch parameter carries the optional model', () => {
  for (const endpoint of ['balance/balance', 'balance/refresh', 'balance/watch']) {
    const found = descriptor(endpoint)
    const model = found.parameters.find((parameter) => parameter.wire === 'model')
    assert.ok(model, `${endpoint} does not declare a model parameter`)
    assert.equal(model.acceptsUndefined, true)
    assert.equal(model.codec.mode, 'strict')
    // The codec must accept the undefined a route-only caller sends, and the
    // null an older client may send.
    assert.equal(model.codec.create().parse(undefined), undefined)
    assert.equal(model.codec.create().parse(null), null)
  }
})

test('every recorded provider fixture satisfies the browser result schema', async () => {
  const schema = descriptor('balance/balance').result.create()
  for (const adapter of PROVIDER_ADAPTERS) {
    for (const fixture of adapter.fixtures) {
      const view = await readFixture(adapter, fixture)
      assert.doesNotThrow(
        () => schema.parse(view),
        `${adapter.id} / ${fixture.name} does not satisfy the wire schema`,
      )
    }
  }
})

test('the schedule and status result schemas accept the Host declarations', () => {
  const scheduleSchema = descriptor('balance/schedule').result.create()
  const deepseek = findAdapter('deepseek')
  assert.ok(deepseek?.schedule)
  assert.doesNotThrow(() => scheduleSchema.parse({ provider: 'deepseek', ...deepseek.schedule }))

  const statusSchema = descriptor('balance/status').result.create()
  assert.doesNotThrow(() =>
    statusSchema.parse({
      provider: 'deepseek',
      state: 'operational',
      url: 'https://status.deepseek.com',
      updatedAt: Date.now(),
    }),
  )
})

test('the provider list schema keeps the alias and model-route fields', () => {
  const list = descriptor('balance/list').result.create()
  const entry = {
    route: 'deepseek-account',
    configured: true,
    aliases: ['deepseek-official'],
    modelRoutes: ['deepseek-chat'],
  }
  const parsed = list.parse([entry])
  assert.deepEqual(parsed[0].aliases, ['deepseek-official'])
  assert.deepEqual(parsed[0].modelRoutes, ['deepseek-chat'])
})

test('the route list and default-provider schemas accept the Host payloads', () => {
  const list = descriptor('balance/list').result.create()
  assert.doesNotThrow(() =>
    list.parse([
      {
        route: 'deepseek-account',
        configured: true,
        name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
        color: '#4d6bfe',
        iconHint: 'deepseek',
      },
    ]),
  )
  const fallback = descriptor('balance/defaultProvider').result.create()
  assert.doesNotThrow(() => fallback.parse({ provider: 'deepseek-account' }))
  assert.doesNotThrow(() => fallback.parse({}))
})
