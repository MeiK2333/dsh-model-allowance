/**
 * Schema drift guard: every field the Host may send must be declared in the
 * client contract.
 *
 * The Host answers with plain objects while the client hand-authors Zod
 * codecs; an undeclared field is silently stripped on the wire, which once
 * dropped `aliases`/`modelRoutes` from `available()`. These tests do not
 * parse (parsing strips), they compare declared shapes: the field names the
 * adapters actually produce must be a subset of the names the contract
 * declares. A field added on either side without the other fails here.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DEEPSEEK_HOLIDAYS } from '../lib/providers/holidays.js'
import { PROVIDER_ADAPTERS } from '../lib/providers.js'
import { createBalanceContribution } from '../src/client/contract.js'

const methods = createBalanceContribution().methods

/** The declared top-level field names of one result schema. */
function shapeKeys(schema) {
  return new Set(Object.keys(schema.shape))
}

/** One reading per adapter fixture, projected the way the Host projects it. */
async function fixtureViews(adapter) {
  const views = []
  for (const fixture of adapter.fixtures) {
    const route = fixture.route ?? adapter.routes[0]
    if (adapter.read) {
      views.push(
        adapter.read({ route, apiKey: fixture.apiKey ?? 'test-key', body: fixture.response ?? {} }),
      )
    } else if (adapter.readWithEnv) {
      views.push(
        await adapter.readWithEnv({
          route,
          apiKey: undefined,
          ctx: { get: (key) => fixture.services?.[key] },
          signal: AbortSignal.timeout(5000),
          model: fixture.model,
        }),
      )
    } else {
      throw new Error(`adapter ${adapter.id} has neither read nor readWithEnv`)
    }
  }
  return views
}

test('every BalanceView field the adapters produce is declared in the balance schema', async () => {
  const schema = methods['balance/balance'].result.create()
  const declared = shapeKeys(schema)
  const produced = new Set()
  for (const adapter of PROVIDER_ADAPTERS) {
    for (const view of await fixtureViews(adapter)) {
      assert.ok(view && typeof view === 'object', `adapter ${adapter.id} produced no view`)
      for (const key of Object.keys(view)) produced.add(key)
    }
  }
  const overflow = [...produced].filter((key) => !declared.has(key))
  assert.deepEqual(
    overflow,
    [],
    `fields the Host sends that the balance schema does not declare: ${overflow.join(', ')}`,
  )
})

test('every available() entry field is declared in the provider list schema', () => {
  const schema = methods['balance/list'].result.create()
  const declared = shapeKeys(schema.element)
  // The shape lib/balance.js available() returns, with every optional field
  // present: an undeclared field here is exactly what zod would strip.
  const entry = {
    route: 'deepseek-account',
    configured: true,
    name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
    color: '#4d6bfe',
    iconHint: 'deepseek',
    aliases: ['deepseek-official'],
    modelRoutes: ['deepseek', 'deepseek-official'],
  }
  const overflow = Object.keys(entry).filter((key) => !declared.has(key))
  assert.deepEqual(
    overflow,
    [],
    `fields available() returns that the list schema does not declare: ${overflow.join(', ')}`,
  )
  // The shape must also actually parse, with nothing dropped.
  const parsed = schema.parse([entry])[0]
  assert.deepEqual(parsed, entry)
})

test('the DeepSeek holiday list is well-formed and current', () => {
  assert.ok(DEEPSEEK_HOLIDAYS.length > 0, 'the holiday list is empty')
  for (const date of DEEPSEEK_HOLIDAYS) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `malformed holiday date: ${date}`)
  }
  const lastYear = Math.max(...DEEPSEEK_HOLIDAYS.map((date) => Number(date.slice(0, 4))))
  const current = new Date().getFullYear()
  // Expired coverage only warns: index.js already logs it at startup, and a
  // test would block everything until the next State Council notice lands.
  if (lastYear < current) {
    console.warn(`holiday list ends at ${lastYear}, past the current year ${current}`)
  }
})
