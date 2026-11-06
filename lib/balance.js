/**
 * The balance service: credential resolution, provider queries, caching, and
 * the refresh triggers.
 *
 * The service is Host-only. It is the single place that holds a provider
 * credential, so a browser never sees one.
 */

import { findAdapter, KIND_QUOTA } from './providers.js'

/** Default lifetime of one cached reading, in milliseconds. */
const DEFAULT_TTL_MS = 5 * 60 * 1000

/** Timeout for one provider request, in milliseconds. */
const REQUEST_TIMEOUT_MS = 15 * 1000

/**
 * @typedef {import('./providers.js').BalanceView} BalanceView
 */

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
    /** @type {Map<string, Promise<BalanceView>>} */
    this.inflight = new Map()
    /** @type {Map<string, Set<(view: BalanceView) => void>>} */
    this.listeners = new Map()
  }

  /**
   * Read one provider's balance, reusing a fresh cached reading.
   * @param {string} route Provider route.
   * @param {{force?: boolean}} [options] Read options.
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
        this.cache.set(route, { view, at: Date.now() })
        this.#publish(route, view)
        return view
      })
      .finally(() => {
        this.inflight.delete(route)
      })
    this.inflight.set(route, request)
    return await request
  }

  /**
   * Drop one provider's cached reading so the next read refetches.
   * @param {string} route Provider route.
   */
  invalidate(route) {
    this.cache.delete(route)
  }

  /**
   * Drop every cached reading.
   */
  invalidateAll() {
    this.cache.clear()
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
        console.error('[model-balance] listener failed', { route, error })
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
    const timeout = AbortSignal.timeout(this.requestTimeoutMs)
    const signal = AbortSignal.any([timeout, this.ctx.signal ?? new AbortController().signal])
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
