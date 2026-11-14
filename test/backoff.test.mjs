/**
 * The failure backoff of force reads.
 *
 * A route whose provider keeps failing is retried on an exponential backoff
 * instead of once per TTL sweep and once per turn end; the manual refresh
 * bypasses the backoff, and one success resets the streak.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { BalanceService } from '../lib/balance.js'

/**
 * A service that reads the `deepseek` route through a mocked `fetch`, so the
 * failure and success of each read is decided by the test.
 * @param {{ttlMs?: number}} [options] Service options.
 * @returns {{service: BalanceService, calls: () => number, fail: () => void, succeed: () => void}}
 */
function serviceWithMockedFetch(options = {}) {
  const service = new BalanceService({
    ctx: { get: () => undefined },
    resolveCredential: async () => 'sk-test',
    options: { ttlMs: options.ttlMs ?? 50, requestTimeoutMs: 5000 },
  })
  let calls = 0
  let ok = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    return {
      ok,
      status: ok ? 200 : 503,
      json: async () => ({
        balance_infos: [{ currency: 'CNY', total_balance: '46.71' }],
      }),
    }
  }
  test.after(() => {
    globalThis.fetch = originalFetch
  })
  return {
    service,
    calls: () => calls,
    fail: () => {
      ok = false
    },
    succeed: () => {
      ok = true
    },
  }
}

test('a single failure does not start the backoff', async () => {
  const t = serviceWithMockedFetch()
  t.fail()
  const first = await t.service.read('deepseek', { force: true })
  assert.equal(first.status, 'failed')
  assert.equal(t.calls(), 1)
  // One failure is below the threshold: the next force read still retries.
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), 2)
})

test('two consecutive failures start the backoff and a force read answers from cache', async () => {
  const t = serviceWithMockedFetch({ ttlMs: 200 })
  t.fail()
  await t.service.read('deepseek', { force: true })
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), 2)
  const cached = t.service.peek('deepseek')
  assert.equal(cached?.status, 'failed')

  // Inside the backoff window the force read is served from the cache and the
  // provider is not contacted again.
  const before = t.calls()
  const view = await t.service.read('deepseek', { force: true })
  assert.equal(view.status, 'failed')
  assert.equal(t.calls(), before)
})

test('after the backoff window the force read retries the provider', async () => {
  const t = serviceWithMockedFetch({ ttlMs: 40 })
  t.fail()
  await t.service.read('deepseek', { force: true })
  await t.service.read('deepseek', { force: true })
  const before = t.calls()
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), before, 'inside the window no request is sent')
  // Window = ttlMs * 2^(failures-1) = 40 * 2 = 80ms; wait past it.
  await new Promise((resolve) => setTimeout(resolve, 100))
  await t.service.read('deepseek', { force: true })
  assert.ok(t.calls() > before, 'past the window the read reaches the provider again')
})

test('the backoff grows exponentially with the failure streak, capped at 30 minutes', async () => {
  const t = serviceWithMockedFetch({ ttlMs: 1000 })
  t.fail()
  // Build a streak of two failures so backoff applies.
  await t.service.read('deepseek', { force: true })
  await t.service.read('deepseek', { force: true })

  const setStreak = (failures, failedAt) => {
    const entry = t.service.cache.get('deepseek')
    t.service.cache.set('deepseek', { ...entry, failures, failedAt })
  }

  // failures=2 → window = 1000 * 2^1 = 2s: 1s in, still backed off; 3s past, retry.
  setStreak(2, Date.now() - 1000)
  const before = t.calls()
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), before, 'failures=2 is backed off for 2s')
  setStreak(2, Date.now() - 3000)
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), before + 1, 'failures=2 retries after 2s')

  // failures=4 → window = 1000 * 2^3 = 8s.
  setStreak(4, Date.now() - 7000)
  const afterFirstRetry = t.calls()
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), afterFirstRetry, 'failures=4 is backed off for 8s')

  // failures=16 → window would be 1000 * 2^15 ≈ 9.1h, but the cap is 30min.
  setStreak(16, Date.now() - 35 * 60 * 1000)
  const afterSecondRetry = t.calls()
  await t.service.read('deepseek', { force: true })
  assert.ok(t.calls() > afterSecondRetry, 'the capped window of 30min has expired')

  // Still inside the 30min cap, even though the uncapped window is hours.
  setStreak(16, Date.now() - 20 * 60 * 1000)
  const afterThirdRetry = t.calls()
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), afterThirdRetry, 'the window is capped at 30 minutes')
})

test('a ready reading resets the failure streak', async () => {
  const t = serviceWithMockedFetch()
  t.fail()
  await t.service.read('deepseek', { force: true })
  await t.service.read('deepseek', { force: true })
  assert.equal(t.service.peek('deepseek')?.status, 'failed')

  // The success must arrive after the backoff window (ttlMs * 2 = 100ms),
  // exactly as it would in a running installation.
  await new Promise((resolve) => setTimeout(resolve, 120))
  t.succeed()
  const view = await t.service.read('deepseek', { force: true })
  assert.equal(view.status, 'ready')
  assert.equal(t.service.cache.get('deepseek')?.failures, 0)
  assert.equal(t.service.cache.get('deepseek')?.failedAt, undefined)

  // A further failure starts counting from one again, not from the old streak.
  t.fail()
  await t.service.read('deepseek', { force: true })
  assert.equal(t.service.cache.get('deepseek')?.failures, 1)
  // …so one more failure is still below the backoff threshold.
  const before = t.calls()
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), before + 1)
})

test('unconfigured and unsupported readings do not enter the backoff', async () => {
  const service = new BalanceService({
    ctx: { get: () => undefined },
    resolveCredential: async () => undefined,
    options: { ttlMs: 50 },
  })
  for (let i = 0; i < 3; i += 1) {
    const view = await service.read('deepseek', { force: true })
    assert.equal(view.status, 'unconfigured')
  }
  const entry = service.cache.get('deepseek')
  assert.equal(entry?.failures, 0)
})

test('manual refresh bypasses the backoff', async () => {
  const t = serviceWithMockedFetch()
  t.fail()
  await t.service.read('deepseek', { force: true })
  await t.service.read('deepseek', { force: true })
  const before = t.calls()
  // Without the flag the backed-off read answers from the cache…
  await t.service.read('deepseek', { force: true })
  assert.equal(t.calls(), before)
  // …and with it the manual refresh reaches the provider anyway.
  await t.service.read('deepseek', { force: true, bypassBackoff: true })
  assert.equal(t.calls(), before + 1)
})
