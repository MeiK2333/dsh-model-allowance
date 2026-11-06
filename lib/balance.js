/**
 * The balance service: credential resolution, provider queries, caching, and
 * the refresh triggers.
 *
 * The service is Host-only. It is the single place that holds a provider
 * credential, so a browser never sees one.
 */

import { createRouteCredentialResolver } from './credentials.js'
import { displayOf, readEndpointAdapter } from './providers/shared.js'
import { findAdapter, KIND_AMOUNT, KIND_QUOTA, PROVIDER_ADAPTERS } from './providers.js'

/** Default lifetime of one cached reading, in milliseconds. */
const DEFAULT_TTL_MS = 5 * 60 * 1000

/** Timeout for one provider request, in milliseconds. */
const REQUEST_TIMEOUT_MS = 15 * 1000

/**
 * The cache key of one reading.
 *
 * A provider route can meter different models separately (MiniMax reports one
 * plan entry per model), so the model is part of the identity. Routes that do
 * not care about the model keep their route-only key, exactly as before.
 *
 * @param {string} route Provider route.
 * @param {string | undefined} model Provider-owned model id, when known.
 * @returns {string} Cache key.
 */
function keyOf(route, model) {
  return typeof model === 'string' && model !== '' ? `${route}\u0000${model}` : route
}

/**
 * Reject a promise when its timeout signal fires.
 *
 * A provider read that ignores the signal (a Host service call) would
 * otherwise keep the in-flight entry alive forever; this bounds it at the
 * caller's timeout without cancelling work that cannot be cancelled.
 *
 * @template T
 * @param {Promise<T>} promise The read.
 * @param {AbortSignal} signal Timeout signal.
 * @returns {Promise<T>} The read, or a rejection once the signal fires.
 */
function withTimeout(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/**
 * @typedef {import('./providers.js').BalanceView} BalanceView
 */

/**
 * Compare a fresh reading with the one published before it.
 *
 * The browser was last told that reading, so the difference is exactly what
 * moved since the number it is showing. The arrow the UI draws points the way
 * that number went, so the difference is signed: a balance falling from 100 to
 * 99.1 reports -0.9, and a top-up or a window reset reports a positive number.
 * Readings of a different kind, or ones that failed on either side, carry no
 * difference at all — a change from "failed" to "¥10" is not a measurement.
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
   * @param {import('@deepseek-ai/cordis').Context} deps.ctx Cordis context.
   * @param {(ref: string) => Promise<string | undefined>} deps.resolveCredential Resolves a credential reference to its value.
   * @param {BalanceServiceOptions} [deps.options] Service options.
   */
  constructor({ ctx, resolveCredential, options = {} }) {
    this.ctx = ctx
    this.resolveCredential = resolveCredential
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS

    // Which credential authorizes a route is the harness's fact, not this
    // plugin's; the resolver asks it and only falls back to the adapter's own
    // references when the harness cannot answer.
    this.routeCredentials = createRouteCredentialResolver({ ctx, resolveCredential })

    // Readings are cached per route and model: one route can meter different
    // models separately, so a model switch must not answer with the previous
    // model's reading.
    /** @type {Map<string, {view: BalanceView, at: number}>} */
    this.cache = new Map()
    /**
     * The reading each key published last, which the next one is measured
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
   * The cache key of one reading.
   *
   * Only an adapter that meters models separately keeps the model in its key;
   * a DeepSeek balance is the same figure whichever model asks for it, so a
   * model switch must not leave a second cache entry and a second sweep
   * target behind.
   *
   * @param {string} route Provider route.
   * @param {string | undefined} model Provider-owned model id.
   * @returns {string} Cache key.
   */
  #key(route, model) {
    const adapter = findAdapter(route)
    return adapter?.modelScoped === true ? keyOf(route, model) : route
  }

  /**
   * Read one provider's balance, reusing a fresh cached reading.
   * @param {string} route Provider route.
   * @param {{force?: boolean, model?: string}} [options] Read options.
   * @returns {Promise<BalanceView>} The reading.
   */
  async read(route, options = {}) {
    const model =
      typeof options.model === 'string' && options.model !== '' ? options.model : undefined
    const key = this.#key(route, model)
    const cached = this.cache.get(key)
    if (!options.force && cached && Date.now() - cached.at < this.ttlMs) {
      return cached.view
    }
    const pending = this.inflight.get(key)
    if (pending) return await pending

    const request = this.#query(route, model)
      .then((view) => {
        // Only the published copy carries the difference. Caching it would let
        // a later sweep republish a stale one.
        const anchor = this.lastPublished.get(key)
        const published = anchor ? withConsumption(view, anchor) : view
        this.cache.set(key, { view, at: Date.now() })
        // A reading that did not come back cleanly says nothing about movement,
        // and anchoring the next one to it would attribute the whole gap to
        // whatever moved in between.
        if (view.status === 'ready') this.lastPublished.set(key, view)
        else this.lastPublished.delete(key)
        this.#publish(key, published)
        return published
      })
      .finally(() => {
        this.inflight.delete(key)
      })
    this.inflight.set(key, request)
    return await request
  }

  /**
   * The cached reading, without refreshing it.
   *
   * Callers that only need to know what the last request answered — a debug
   * probe, a test — read it here instead of paying for another request.
   *
   * @param {string} route Provider route.
   * @param {string} [model] Provider-owned model id, when known.
   * @returns {BalanceView | undefined} The cached reading, if any.
   */
  peek(route, model) {
    return this.cache.get(this.#key(route, model))?.view
  }

  /**
   * Drop one provider's cached reading so the next read refetches.
   * @param {string} route Provider route.
   * @param {string} [model] Provider-owned model id, when known.
   */
  invalidate(route, model) {
    const key = this.#key(route, model)
    this.cache.delete(key)
    // Forgetting the reading forgets the anchor too: a difference against a
    // reading this installation no longer remembers is not a movement it saw.
    this.lastPublished.delete(key)
  }

  /**
   * List every route this installation can read, with the display metadata the
   * browser needs to name and draw it.
   *
   * The card offers these as a switcher, so a route only answers `configured`
   * when its credential (or the service behind it) actually resolves here. One
   * entry per route rather than per adapter: the two Zhipu routes carry
   * different credentials, so an installation using the CN plan should see
   * that route, not the international one.
   *
   * @returns {Promise<Array<{route: string, configured: boolean, name: {zh: string, en: string}, color: string, iconHint?: string}>>}
   *   The routes.
   */
  async available() {
    /** @type {Array<{route: string, configured: boolean, name: {zh: string, en: string}, color: string, iconHint?: string}>} */
    const routes = []
    for (const adapter of PROVIDER_ADAPTERS) {
      for (const route of adapter.routes) {
        let configured
        if (adapter.readWithEnv) {
          // A service-backed adapter is available when the service is mounted.
          const service =
            typeof this.ctx.get === 'function' ? this.ctx.get(adapter.service) : undefined
          configured = service !== undefined
        } else {
          configured = (await this.routeCredentials.resolve(route, adapter)) !== undefined
        }
        routes.push({ route, configured, ...displayOf(adapter) })
      }
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
   * Subscribe to readings for one provider route and model.
   *
   * The model is optional so a caller that only knows the route (a test, a
   * debug tool) keeps working; the two-argument form stays supported.
   *
   * @param {string} route Provider route.
   * @param {string | ((view: BalanceView) => void)} [model] Model id, or the listener.
   * @param {(view: BalanceView) => void} [listener] Receives every new reading.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(route, model, listener) {
    let key
    let callback = listener
    if (typeof model === 'function') {
      callback = model
      key = this.#key(route, undefined)
    } else {
      key = this.#key(route, model)
    }
    if (typeof callback !== 'function')
      throw new TypeError('a balance subscriber must be a function')
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(callback)
    return () => {
      set?.delete(callback)
      if (set && set.size === 0) this.listeners.delete(key)
    }
  }

  /**
   * Publish a reading to the key's subscribers.
   * @param {string} key Reading key.
   * @param {BalanceView} view The reading.
   */
  #publish(key, view) {
    for (const listener of this.listeners.get(key) ?? []) {
      try {
        listener(view)
      } catch (error) {
        console.error('[model-allowance] listener failed', { key, error })
      }
    }
  }

  /**
   * Query one provider, translating every failure into a reading.
   * @param {string} route Provider route.
   * @param {string} [model] Provider-owned model id, when known.
   * @returns {Promise<BalanceView>} The reading.
   */
  async #query(route, model) {
    const adapter = findAdapter(route)
    if (!adapter) {
      return { provider: route, status: 'unsupported', kind: KIND_QUOTA }
    }
    // A service-backed adapter brings its own authorization, so it needs no
    // credential; every other adapter asks the harness which credential
    // authorizes this route.
    const hit = adapter.readWithEnv
      ? undefined
      : await this.routeCredentials.resolve(route, adapter)
    if (!adapter.readWithEnv && hit === undefined) {
      return {
        provider: route,
        status: 'unconfigured',
        kind: adapter.kind,
        consoleUrl: adapter.consoleUrl,
      }
    }
    // A reading is bounded by the request timeout alone. Cordis has no
    // context lifetime signal: reading `ctx.signal` asks for a service named
    // `signal`, which does not exist and throws without an inject.
    const timeout = AbortSignal.timeout(this.requestTimeoutMs)
    const signal = timeout
    try {
      const view = adapter.readWithEnv
        ? await withTimeout(
            adapter.readWithEnv({ route, apiKey: hit?.value, ctx: this.ctx, signal, model }),
            signal,
          )
        : await readEndpointAdapter(adapter, {
            route,
            apiKey: hit === undefined ? '' : hit.value,
            signal,
            model,
          })
      // The console link is a property of the route, not of the response, so
      // every reading carries it — including one that failed authorization and
      // is exactly when the user needs the way back to the console.
      return { ...view, consoleUrl: view.consoleUrl ?? adapter.consoleUrl, updatedAt: Date.now() }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      // An aborted request is a cancellation, not a provider failure.
      if (timeout.aborted) {
        return {
          provider: route,
          status: 'failed',
          kind: adapter.kind,
          error: 'timeout',
          consoleUrl: adapter.consoleUrl,
        }
      }
      return {
        provider: route,
        status: 'failed',
        kind: adapter.kind,
        error: reason,
        consoleUrl: adapter.consoleUrl,
      }
    }
  }
}
