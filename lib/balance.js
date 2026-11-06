/**
 * The balance service: credential resolution, provider queries, caching, and
 * the refresh triggers.
 *
 * The service is Host-only. It is the single place that holds a provider
 * credential, so a browser never sees one.
 */

import { findAdapter, KIND_AMOUNT, KIND_QUOTA, PROVIDER_ADAPTERS } from './providers.js'

/** Default lifetime of one cached reading, in milliseconds. */
const DEFAULT_TTL_MS = 5 * 60 * 1000

/** Timeout for one provider request, in milliseconds. */
const REQUEST_TIMEOUT_MS = 15 * 1000

/**
 * @typedef {import('./providers.js').BalanceView} BalanceView
 */

/**
 * Compare a fresh reading with the one it should be measured against.
 *
 * The anchor is the reading the browser was last told about, or — right after a
 * turn — the reading taken when that turn began. Either way the arrow the UI
 * draws points the way the displayed number moved, so the difference is signed:
 * a balance falling from 100 to 99.1 reports -0.9, and a top-up or a window
 * reset reports a positive number. Readings of a different kind, or ones that
 * failed on either side, carry no difference at all — a change from "failed" to
 * "¥10" is not a measurement.
 *
 * @param {BalanceView} view The fresh reading.
 * @param {BalanceView} before The reading to measure against.
 * @returns {BalanceView} The reading, annotated when a difference exists.
 */
function withConsumption(view, before) {
  if (view.status !== 'ready' || before.status !== 'ready') return view
  if (view.kind === KIND_AMOUNT) {
    if (typeof view.amount !== 'number' || typeof before.amount !== 'number') return view
    return {
      ...view,
      consumption: { kind: 'amount', delta: view.amount - before.amount, at: Date.now() },
    }
  }
  // A plan meters several windows at once, and the one the badge speaks for is
  // the most-consumed one — which on an exhausted plan is pinned at zero and
  // never moves. The turn's cost is better read from whichever window actually
  // changed, so the largest movement wins.
  const moved = largestWindowMove(view, before)
  if (moved !== undefined) {
    return { ...view, consumption: { kind: 'percent', delta: moved, at: Date.now() } }
  }
  if (typeof view.percent !== 'number' || typeof before.percent !== 'number') return view
  return {
    ...view,
    consumption: { kind: 'percent', delta: view.percent - before.percent, at: Date.now() },
  }
}

/**
 * The biggest remaining-percent change across the windows both readings share.
 * @param {BalanceView} view The fresh reading.
 * @param {BalanceView} before The reading from the start of the turn.
 * @returns {number | undefined} The change in percentage points, if any.
 */
function largestWindowMove(view, before) {
  const previous = new Map(
    (Array.isArray(before.windows) ? before.windows : [])
      .filter((window) => typeof window.remainingPercent === 'number')
      .map((window) => [window.id, window.remainingPercent]),
  )
  let largest
  for (const window of Array.isArray(view.windows) ? view.windows : []) {
    const was = previous.get(window.id)
    if (was === undefined || typeof window.remainingPercent !== 'number') continue
    const delta = window.remainingPercent - was
    if (largest === undefined || Math.abs(delta) > Math.abs(largest)) largest = delta
  }
  return largest
}

/**
 * @typedef {object} BalanceServiceOptions
 * @property {number} [ttlMs] Lifetime of one cached reading.
 * @property {number} [requestTimeoutMs] Timeout for one provider request.
 */

/**
 * Host-side balance readings, keyed by provider route.
 */
export class BalanceService {
  /**
   * @param {object} deps Injected dependencies.
   * @param {import('cordis').Context} deps.ctx Cordis context.
   * @param {() => Promise<string | undefined>} deps.resolveCredential Resolves a credential reference to its value.
   * @param {BalanceServiceOptions} [deps.options] Service options.
   */
  constructor({ ctx, resolveCredential, options = {} }) {
    this.ctx = ctx
    this.resolveCredential = resolveCredential
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS

    /** @type {Map<string, {view: BalanceView, at: number}>} */
    this.cache = new Map()
    /**
     * The reading each route published last, which the next one is measured
     * against. Kept beside the cache rather than in it: the cache holds the
     * plain reading, this holds the anchor a difference is computed from.
     * @type {Map<string, BalanceView>}
     */
    this.lastPublished = new Map()
    /** @type {Map<string, Promise<BalanceView>>} */
    this.inflight = new Map()
    /** @type {Map<string, Set<(view: BalanceView) => void>>} */
    this.listeners = new Map()
  }

  /**
   * Read one provider's balance, reusing a fresh cached reading.
   * @param {string} route Provider route.
   * @param {{force?: boolean, baseline?: BalanceView}} [options] Read options.
   *   `baseline` is the reading taken when a turn began; when given, the
   *   returned reading carries the difference from it. Without one the reading
   *   is measured against the reading published last time, so a manual refresh
   *   or a sweep reports the movement it saw as well.
   * @returns {Promise<BalanceView>} The reading.
   */
  async read(route, options = {}) {
    const cached = this.cache.get(route)
    if (!options.force && cached && Date.now() - cached.at < this.ttlMs) {
      return cached.view
    }
    const pending = this.inflight.get(route)
    if (pending) return await pending

    const request = this.#query(route)
      .then((view) => {
        // Only the published copy carries the difference. Caching it would let
        // a later sweep republish a stale one.
        const anchor = options.baseline ?? this.lastPublished.get(route)
        const published = anchor ? withConsumption(view, anchor) : view
        this.cache.set(route, { view, at: Date.now() })
        // A reading that did not come back cleanly says nothing about movement,
        // and anchoring the next one to it would attribute the whole gap to
        // whatever moved in between.
        if (view.status === 'ready') this.lastPublished.set(route, view)
        else this.lastPublished.delete(route)
        this.#publish(route, published)
        return published
      })
      .finally(() => {
        this.inflight.delete(route)
      })
    this.inflight.set(route, request)
    return await request
  }

  /**
   * The cached reading, without refreshing it.
   *
   * The turn-start baseline must be the last reading taken, not a new request:
   * asking the provider again here would cost a call per turn and would still
   * measure from the wrong instant.
   *
   * @param {string} route Provider route.
   * @returns {BalanceView | undefined} The cached reading, if any.
   */
  peek(route) {
    return this.cache.get(route)?.view
  }

  /**
   * Drop one provider's cached reading so the next read refetches.
   * @param {string} route Provider route.
   */
  invalidate(route) {
    this.cache.delete(route)
    // Forgetting the reading forgets the anchor too: a difference against a
    // reading this installation no longer remembers is not a movement it saw.
    this.lastPublished.delete(route)
  }

  /**
   * List every adapter this installation can read, and whether it can answer.
   *
   * The card offers these as a switcher, so a route only appears when its
   * credential (or the service behind it) actually exists here. One entry per
   * adapter: `zai` and `zai-coding-cn` share a key and answer the same, so two
   * rows would be noise.
   *
   * @returns {Promise<Array<{route: string, configured: boolean}>>} The routes.
   */
  async available() {
    /** @type {Array<{route: string, configured: boolean}>} */
    const routes = []
    for (const adapter of PROVIDER_ADAPTERS) {
      const route = adapter.routes[0]
      let configured = false
      if (adapter.readWithEnv) {
        // A service-backed adapter is available when the service is mounted.
        const service = typeof this.ctx.get === 'function' ? this.ctx.get(adapter.service) : undefined
        configured = service !== undefined
      } else if (adapter.credentialRef) {
        configured = Boolean(await this.resolveCredential(adapter.credentialRef))
      }
      routes.push({ route, configured })
    }
    return routes
  }

  /**
   * Drop every cached reading.
   */
  invalidateAll() {
    this.cache.clear()
    this.lastPublished.clear()
  }

  /**
   * Subscribe to readings for one provider route.
   * @param {string} route Provider route.
   * @param {(view: BalanceView) => void} listener Receives every new reading.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(route, listener) {
    let set = this.listeners.get(route)
    if (!set) {
      set = new Set()
      this.listeners.set(route, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
      if (set && set.size === 0) this.listeners.delete(route)
    }
  }

  /**
   * Publish a reading to the route's subscribers.
   * @param {string} route Provider route.
   * @param {BalanceView} view The reading.
   */
  #publish(route, view) {
    for (const listener of this.listeners.get(route) ?? []) {
      try {
        listener(view)
      } catch (error) {
        console.error('[model-allowance] listener failed', { route, error })
      }
    }
  }

  /**
   * Query one provider, translating every failure into a reading.
   * @param {string} route Provider route.
   * @returns {Promise<BalanceView>} The reading.
   */
  async #query(route) {
    const adapter = findAdapter(route)
    if (!adapter) {
      return { provider: route, status: 'unsupported', kind: KIND_QUOTA }
    }
    // A service-backed adapter brings its own authorization, so it needs no
    // credential reference.
    let credential
    if (adapter.credentialRef !== undefined) {
      credential = await this.resolveCredential(adapter.credentialRef)
      if (!credential) {
        return {
          provider: route,
          status: 'unconfigured',
          kind: KIND_QUOTA,
          consoleUrl: adapter.consoleUrl,
        }
      }
    }
    // A reading is bounded by the request timeout alone. Cordis has no
    // context lifetime signal: reading `ctx.signal` asks for a service named
    // `signal`, which does not exist and throws without an inject.
    const timeout = AbortSignal.timeout(this.requestTimeoutMs)
    const signal = timeout
    try {
      const view = adapter.readWithEnv
        ? await adapter.readWithEnv({ route, apiKey: credential, ctx: this.ctx, signal })
        : await adapter.read(route, credential, signal)
      return { ...view, updatedAt: Date.now() }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      // An aborted request is a cancellation, not a provider failure.
      if (timeout.aborted) {
        return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'timeout' }
      }
      return {
        provider: route,
        status: 'failed',
        kind: KIND_QUOTA,
        error: reason,
        consoleUrl: adapter.consoleUrl,
      }
    }
  }
}
