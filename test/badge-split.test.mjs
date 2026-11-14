/**
 * Unit tests for the pure logic extracted from the badge during the split:
 * the directory-entry matcher and the switcher strip's row/overflow split.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { entryCovers } = await import('../src/client/hooks/use-provider-directory.js')
const { splitStrip } = await import('../src/client/components/provider-strip.js')

test('entryCovers answers for a route and its aliases', () => {
  const entry = { route: 'deepseek', aliases: ['deepseek-official'] }
  assert.equal(entryCovers(entry, 'deepseek'), true)
  assert.equal(entryCovers(entry, 'deepseek-official'), true)
  assert.equal(entryCovers(entry, 'kimi-coding'), false)
  assert.equal(entryCovers(undefined, 'deepseek'), false)
  assert.equal(entryCovers(null, 'deepseek'), false)
  assert.equal(entryCovers({ route: 'zai' }, 'zai'), true)
  assert.equal(entryCovers({ route: 'zai' }, 'zai-coding-cn'), false)
})

const routes = ['alpha', 'beta', 'gamma', 'delta']
const entries = routes.map((route) => ({ route, configured: true }))
// Four marks cost 4 * 30 - 4 = 116px; 100px only fits two.
const NARROW = 100

test('a strip that fits keeps every mark on the row', () => {
  const { shown, overflow } = splitStrip(entries, 0, null)
  assert.deepEqual(
    shown.map((entry) => entry.route),
    routes,
  )
  assert.deepEqual(overflow, [])

  const wide = splitStrip(entries, 500, null)
  assert.deepEqual(
    wide.shown.map((entry) => entry.route),
    routes,
  )
  assert.deepEqual(wide.overflow, [])
})

test('a narrow strip moves the tail into the overflow menu', () => {
  const { shown, overflow } = splitStrip(entries, NARROW, null)
  assert.deepEqual(
    shown.map((entry) => entry.route),
    ['alpha', 'beta'],
  )
  assert.deepEqual(
    overflow.map((entry) => entry.route),
    ['gamma', 'delta'],
  )
})

test('the provider being read is promoted onto the row', () => {
  const { shown, overflow } = splitStrip(entries, NARROW, 'delta')
  assert.deepEqual(
    shown.map((entry) => entry.route),
    ['alpha', 'delta'],
  )
  assert.deepEqual(
    overflow.map((entry) => entry.route),
    ['gamma', 'beta'],
  )
})

test('the row never empties, however narrow the strip is', () => {
  const { shown } = splitStrip(entries, 30, null)
  assert.equal(shown.length, 1)
})

test('the badge module still exports the names the tests and host read', async () => {
  const badge = await import('../src/client/badge.js')
  assert.equal(typeof badge.statusDisplayState, 'function')
  assert.equal(typeof badge.entryCovers, 'function')
  assert.equal(typeof badge.BalanceBadge, 'function')
  assert.equal(badge.entryCovers({ route: 'x' }, 'x'), true)
  assert.equal(badge.statusDisplayState(null), 'loading')
})
