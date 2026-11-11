/**
 * Provider platform status.
 *
 * The four sources this plugin reads are public pages, not authenticated
 * APIs: a Statuspage JSON document, OpenCode's own status endpoint, and the
 * server-rendered DeepSeek page. None of them needs a credential, so this
 * service owns no secrets and can be reached from anywhere — but it is still
 * Host-only, because the browser should not have to know four different
 * response formats.
 *
 * A reading is cached per source, not per route: the two DeepSeek routes share
 * one status page, and asking twice must not mean fetching twice.
 */

import { findAdapter } from './providers.js'

/** Status pages refresh on the order of a minute; more often buys nothing. */
const DEFAULT_TTL_MS = 60 * 1000

/**
 * How long a failed status fetch is remembered.
 *
 * Without a negative cache, a down source is fetched again on every badge
 * mount, every 60-second dot refresh, and every manual refresh. A short
 * failure window keeps the source from being hammered while still letting a
 * recovered page show up promptly.
 */
const DEFAULT_FAILURE_TTL_MS = 30 * 1000

/** A status page that does not answer quickly is as good as unknown. */
const DEFAULT_TIMEOUT_MS = 8 * 1000

/** A page larger than this is not a status page this plugin understands. */
const MAX_PAGE_BYTES = 2 * 1024 * 1024

/**
 * @typedef {object} StatusView
 * @property {string} provider Route the reading belongs to.
 * @property {string} state One of the shared states in `providers/status.js`.
 * @property {string} [summary] What the source says is wrong, when it says.
 * @property {string} [url] The provider's status page.
 * @property {number} [updatedAt] Epoch milliseconds of the reading.
 * @property {string} [error] Why the reading failed, for `state === 'unknown'`.
 */

/**
 * @typedef {object} StatusServiceOptions
 * @property {number} [ttlMs] Lifetime of one successful reading.
 * @property {number} [failureTtlMs] Lifetime of one failed reading.
 * @property {number} [timeoutMs] Timeout for one status request.
 */

/**
 * @typedef {object} StatusSource
 * @property {string} endpoint Machine-readable status endpoint.
 * @property {string} url Human-readable status page.
 * @property {(env: {text?: string, json?: unknown, response?: unknown}) => {state: string, summary?: string}} parse Projection.
 */

/**
 * @typedef {object} StatusReading
 * @property {string} state One of the shared states in `providers/status.js`.
 * @property {string} [summary] What the source says is wrong, when it says.
 * @property {string} [url] The provider's status page.
 * @property {number} [updatedAt] Epoch milliseconds of the reading.
 * @property {string} [error] Why the reading failed, for `state === 'unknown'`.
 */

/**
 * Host-side status readings, keyed by source endpoint.
 */
export class StatusService {
  /**
   * @param {object} deps Injected dependencies.
   * @param {import('@deepseek-ai/cordis').Context} deps.ctx Cordis context.
   * @param {StatusServiceOptions} [deps.options] Service options.
   */
  constructor({ ctx, options = {} }) {
    this.ctx = ctx
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    /** @type {Map<string, {view: StatusReading, at: number, failed: boolean}>} */
    this.cache = new Map()
    /** @type {Map<string, Promise<StatusReading>>} */
    this.inflight = new Map()
  }

  /**
   * Read one provider's platform status.
   *
   * A route whose vendor publishes no status page answers `unknown` without
   * touching the network: the browser presents that source-free reading as
   * "no status service", and a route that later gains a source starts working
   * without any other change.
   *
   * @param {string} provider Provider route.
   * @returns {Promise<StatusView>} The reading.
   */
  async read(provider) {
    const source = findAdapter(provider)?.status
    if (source === undefined) return { provider, state: 'unknown' }
    try {
      const view = await this.#readSource(source)
      return { ...view, provider }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { provider, state: 'unknown', url: source.url, error: reason }
    }
  }

  /**
   * Read one source, reusing a fresh cached reading.
   *
   * Successful readings live for `ttlMs`; failures for `failureTtlMs`. A
   * failure is cached as an `unknown` reading rather than thrown, so every
   * route sharing the source gets the same answer without another request.
   *
   * @param {StatusSource} source The source.
   * @returns {Promise<StatusReading>} The reading without its provider.
   */
  async #readSource(source) {
    const cached = this.cache.get(source.endpoint)
    if (cached) {
      const ttl = cached.failed ? this.failureTtlMs : this.ttlMs
      if (Date.now() - cached.at < ttl) return cached.view
    }
    const pending = this.inflight.get(source.endpoint)
    if (pending) return await pending
    const request = this.#query(source)
      .then((view) => {
        this.cache.set(source.endpoint, { view, at: Date.now(), failed: false })
        return view
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error)
        const view = {
          state: 'unknown',
          url: source.url,
          error: reason,
          updatedAt: Date.now(),
        }
        this.cache.set(source.endpoint, { view, at: Date.now(), failed: true })
        return view
      })
      .finally(() => {
        this.inflight.delete(source.endpoint)
      })
    this.inflight.set(source.endpoint, request)
    return await request
  }

  /**
   * Fetch and project one source.
   * @param {StatusSource} source The source.
   * @returns {Promise<StatusReading>} The reading without its provider.
   */
  async #query(source) {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const response = await fetch(source.endpoint, {
      headers: { accept: 'application/json, text/html;q=0.9' },
      signal: timeout,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    // Check the declared size before reading the body: a status page that is
    // not a status page (a captive portal, an error page) should not be read
    // into memory in full.
    const declared = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(declared) && declared > MAX_PAGE_BYTES) {
      throw new Error('status page too large')
    }
    const text = await response.text()
    if (text.length > MAX_PAGE_BYTES) throw new Error('status page too large')
    let json
    const contentType = response.headers?.get?.('content-type') ?? ''
    if (contentType.includes('json')) {
      try {
        json = JSON.parse(text)
      } catch {
        // A body that claims JSON and is not: the parser decides what that
        // means, and most will answer unknown.
      }
    }
    const parsed = source.parse({ text, json, response })
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.state !== 'string') {
      throw new Error('status source returned no state')
    }
    return {
      state: parsed.state,
      ...(typeof parsed.summary === 'string' && parsed.summary !== ''
        ? { summary: parsed.summary }
        : {}),
      url: source.url,
      updatedAt: Date.now(),
    }
  }
}
