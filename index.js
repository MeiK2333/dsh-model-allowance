/**
 * Host half of the model-allowance bundle.
 *
 * The Host owns every provider credential, queries provider balance endpoints,
 * caches the readings, and publishes them through a Remote controller. The
 * Client half only ever sees readings.
 */

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BalanceService } from './lib/balance.js'
import { describeError, logDebug } from './lib/debug.js'
import { holidayCoverage } from './lib/providers/schedule.js'
import { findAdapter, KIND_AMOUNT, KIND_QUOTA, PROVIDER_ADAPTERS } from './lib/providers.js'
import { BalanceController } from './lib/remote.js'
import { StatusService } from './lib/status.js'

/**
 * The identity of one watched reading: a route and, when the caller knows it,
 * the provider-owned model whose plan the route meters.
 * @param {string} provider Provider route.
 * @param {string | undefined} model Provider-owned model id.
 * @returns {string} The key.
 */
function activeKey(provider, model) {
  const scoped = findAdapter(provider)?.modelScoped === true
  return scoped && typeof model === 'string' && model !== ''
    ? `${provider}\u0000${model}`
    : provider
}

/**
 * Normalize the optional model option.
 * @param {unknown} model Candidate model id.
 * @returns {string | undefined} A non-empty model id, when one was given.
 */
function modelOf(model) {
  return typeof model === 'string' && model !== '' ? model : undefined
}

/**
 * The resolved plugin configuration.
 * @typedef {object} ModelAllowanceConfig
 * @property {number} [ttlMs] Lifetime of one cached reading, and the sweep period.
 * @property {number} [requestTimeoutMs] Timeout for one provider request.
 * @property {number} [statusTtlMs] Lifetime of one successful platform status.
 * @property {number} [statusFailureTtlMs] Lifetime of a failed platform status.
 * @property {number} [statusTimeoutMs] Timeout for one platform status request.
 * @property {boolean} [debug] Write diagnostics to the debug log.
 */

/**
 * The Host-side balance service, registered as `ctx.modelAllowance`.
 */
class ModelAllowanceService extends Service {
  /**
   * Services this plugin depends on.
   */
  static inject = ['timer', 'credentials']

  /**
   * @param {import('@deepseek-ai/cordis').Context} ownerContext Owning context.
   * @param {ModelAllowanceConfig} config Resolved configuration.
   */
  constructor(ownerContext, config) {
    super(ownerContext, 'modelAllowance')
    this.config = config

    /** @type {BalanceService} */
    this.balance = new BalanceService({
      ctx: ownerContext,
      resolveCredential: async (ref) => {
        const credentials = ownerContext.get('credentials')
        const resolved = await credentials?.resolve(ref)
        return resolved?.value
      },
      options: {
        ttlMs: typeof config.ttlMs === 'number' ? config.ttlMs : undefined,
        requestTimeoutMs:
          typeof config.requestTimeoutMs === 'number' ? config.requestTimeoutMs : undefined,
      },
    })

    /**
     * Readings a browser asked about recently, keyed by route and model.
     *
     * `count` is the number of live streams watching the key; `until` keeps a
     * unary reader's key in the sweep for one cache lifetime. A key is swept
     * only while one of the two says it is still in use, so switching away
     * from a provider stops its requests instead of refreshing it forever.
     * @type {Map<string, {provider: string, model: string | undefined, count: number, until: number}>}
     */
    this.active = new Map()

    /**
     * Platform status readings. Every source is a public page, so this half
     * needs no credential — only the vendor's status URL.
     */
    this.statusService = new StatusService({
      ctx: ownerContext,
      options: {
        ttlMs: config.statusTtlMs,
        failureTtlMs: config.statusFailureTtlMs,
        timeoutMs: config.statusTimeoutMs,
      },
    })

    // The Remote controller is a service of its own; it registers under the
    // `balanceController` key and exposes the `balance` wire namespace.
    this.controller = new BalanceController(ownerContext)
  }

  /**
   * Read one provider's balance.
   *
   * A unary read keeps the route in the sweep for one cache lifetime, which
   * covers a client that cannot open a stream; the effect is bounded by time,
   * unlike the old append-only set.
   *
   * @param {string} provider Provider route.
   * @param {{force?: boolean, model?: string}} [options] Read options.
   * @returns {Promise<import('./lib/providers.js').BalanceView>} The reading.
   */
  async read(provider, options) {
    const model = modelOf(options?.model)
    this.markActive(provider, model)
    const view = await this.balance.read(provider, { ...options, model })
    if (this.config.debug === true && view.status !== 'ready') {
      await logDebug(
        `read route=${provider} model=${model ?? '-'} status=${view.status} error=${view.error ?? '-'}`,
      )
    }
    return view
  }

  /**
   * Keep one route/model reading in the periodic and turn-end sweeps.
   *
   * A stream holds this for its whole lifetime; releasing it keeps the key
   * alive for one cache lifetime so a just-closed badge does not stop the
   * final write from landing. After that it expires unless read again.
   *
   * @param {string} provider Provider route.
   * @param {string} [model] Provider-owned model id, when known.
   * @returns {() => void} Releases the key.
   */
  track(provider, model) {
    const normalized = modelOf(model)
    const key = activeKey(provider, normalized)
    const entry = this.active.get(key) ?? {
      provider,
      model: normalized,
      count: 0,
      until: 0,
    }
    entry.count += 1
    entry.until = Math.max(entry.until, Date.now() + this.balance.ttlMs)
    this.active.set(key, entry)
    let released = false
    return () => {
      if (released) return
      released = true
      entry.count = Math.max(0, entry.count - 1)
      entry.until = Date.now() + this.balance.ttlMs
    }
  }

  /**
   * Mark one reading as recently asked about without holding a stream.
   *
   * Deliberately a normal method, not a `#private` one: Cordis calls service
   * methods through a context shadow, and a private member would fail its
   * brand check with "Receiver must be an instance of class".
   *
   * @param {string} provider Provider route.
   * @param {string | undefined} model Provider-owned model id.
   */
  markActive(provider, model) {
    const key = activeKey(provider, model)
    const entry = this.active.get(key)
    if (entry !== undefined && entry.count > 0) return
    this.active.set(key, {
      provider,
      model,
      count: entry?.count ?? 0,
      until: Date.now() + this.balance.ttlMs,
    })
  }

  /**
   * Subscribe to new readings for one provider and model.
   * @param {string} provider Provider route.
   * @param {string} [model] Provider-owned model id, when known.
   * @param {(view: import('./lib/providers.js').BalanceView) => void} [listener] Receives every reading.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(provider, model, listener) {
    return this.balance.subscribe(provider, model, listener)
  }

  /**
   * List the providers this installation can read.
   * @returns {Promise<Array<{route: string, configured: boolean}>>} The routes.
   */
  async list() {
    return await this.balance.available()
  }

  /**
   * Read one provider's platform status, for the card's status row.
   *
   * A route whose vendor publishes no status page answers `unknown` and the
   * browser hides the row, so this never needs a guard at the call site.
   *
   * @param {string} provider Provider route.
   * @returns {Promise<import('./lib/status.js').StatusView>} The status reading.
   */
  async status(provider) {
    return await this.statusService.read(provider)
  }

  /**
   * The pricing schedule a provider meters by, when it publishes one.
   *
   * The schedule is declared data, not a reading: the browser evaluates it
   * against its own clock, so the countdown never needs another round trip.
   *
   * @param {string} provider Provider route.
   * @returns {object | null} The schedule, or null when the vendor prices flat.
   */
  schedule(provider) {
    const schedule = findAdapter(provider)?.schedule
    return schedule === undefined ? null : { provider, ...schedule }
  }

  /**
   * The provider a session with no model selection would use.
   *
   * A session that has not taken a turn yet carries no `modelSelection`
   * projection, so the browser cannot name a provider from the log. The
   * installation's default model is the answer the model selector itself falls
   * back to, so the badge follows the same one.
   *
   * @returns {string | undefined} Provider route, when the installation names one.
   */
  defaultProvider() {
    try {
      const selection = this.ctx.get('agentDefaultModel')?.currentSelection?.()
      const provider = selection?.provider
      return typeof provider === 'string' && provider.length > 0 ? provider : undefined
    } catch {
      // A deployment without a default-model service simply has none.
      return undefined
    }
  }

  /**
   * Refresh every reading a browser is currently watching, or asked for within
   * one cache lifetime.
   * @param {{minAgeMs?: number}} [options] Skip readings newer than this.
   * @returns {Promise<void>} Resolves when the refreshes settle.
   */
  async refreshAll(options = {}) {
    const minAgeMs = typeof options.minAgeMs === 'number' ? options.minAgeMs : 0
    const now = Date.now()
    /** @type {Array<{provider: string, model: string | undefined, count: number, until: number}>} */
    const targets = []
    for (const [key, entry] of this.active) {
      if (entry.count > 0 || entry.until > now) {
        targets.push(entry)
      } else {
        // Nothing has looked at this key for a whole cache lifetime.
        this.active.delete(key)
      }
    }
    if (targets.length === 0) return
    await Promise.all(
      targets.map((entry) => {
        // The periodic sweep runs on its own clock; a turn-end refresh may
        // have just read the same key, and forcing it again would spend a
        // second request for nothing.
        if (minAgeMs > 0) {
          const cached = this.balance.peek(entry.provider, entry.model)
          if (cached?.updatedAt !== undefined && now - cached.updatedAt < minAgeMs) return cached
        }
        return this.balance
          .read(entry.provider, { force: true, model: entry.model })
          .then((view) => {
            if (this.config.debug === true && view.consumption !== undefined) {
              void logDebug(
                `movement route=${entry.provider} model=${entry.model ?? '-'} status=${view.status}` +
                  ` consumption=${view.consumption.kind}:${String(view.consumption.delta)}`,
              )
            }
            return view
          })
      }),
    )
  }

  /**
   * Run after construction: install the refresh triggers and, when debugging,
   * probe every adapter once and record what happened.
   * @returns {void} Nothing to clean up; the triggers live on the fiber.
   */
  [Service.init]() {
    const ctx = this.ctx

    // Vendor holiday lists change annually and are the one piece of schedule
    // data that goes silently wrong. Surface a stale list once at startup.
    const thisYear = new Date().getFullYear()
    for (const adapter of PROVIDER_ADAPTERS) {
      const coverage =
        adapter.schedule === undefined ? undefined : holidayCoverage(adapter.schedule)
      if (coverage !== undefined && coverage.to < thisYear) {
        console.warn(
          `[model-allowance] ${adapter.id} holiday data ends in ${String(coverage.to)}; ` +
            `extend it for ${String(thisYear)}`,
        )
      }
    }

    // Both listeners are `global`. `session/event` is emitted from the
    // session's own scope, so a plugin context that is not an ancestor of that
    // scope never sees it — the turn-end refresh was silently dead for that
    // reason, and the badge only ever moved on the periodic sweep. The harness
    // registers its own cross-session listeners the same way.
    const GLOBAL = { global: true }

    // A finished turn consumed provider quota, so the reading it belongs to is
    // stale. Refreshing here is what turns "the number is old" into "here is
    // what moved".
    ctx.on(
      'session/event',
      (_session, event) => {
        if (event.type !== 'turn/end') return
        if (this.config.debug === true) {
          void logDebug(`turn end: refreshing ${String(this.active.size)} reading(s)`)
        }
        this.refreshAll().catch((error) => {
          console.error('[model-allowance] turn refresh failed', { error })
        })
      },
      GLOBAL,
    )

    // A periodic sweep keeps a long-lived session's reading current. It skips
    // a reading the turn-end trigger just refreshed, so the two clocks cannot
    // spend two provider requests on the same number.
    ctx.timer.interval(() => {
      this.refreshAll({ minAgeMs: 10 * 1000 }).catch((error) => {
        console.error('[model-allowance] periodic refresh failed', { error })
      })
    }, this.balance.ttlMs)

    if (this.config.debug === true) this.probe()
  }

  /**
   * Read every adapter once and write the outcome to the debug log.
   *
   * A reading that fails inside the browser is hard to report back, so this
   * runs the same Host code at activation and leaves a trail.
   * @returns {void} Starts the probe; failures are logged, never thrown.
   */
  probe() {
    const ctx = this.ctx
    void (async () => {
      await logDebug(`=== probe: ${PROVIDER_ADAPTERS.length} adapters ===`)
      await logDebug(`deepseekAccount present: ${String(ctx.get('deepseekAccount') !== undefined)}`)
      try {
        const routes = await this.list()
        await logDebug(
          `available=${JSON.stringify(routes.filter((route) => route.configured).map((route) => route.route))}`,
        )
      } catch (error) {
        await logDebug(`available probe THREW ${describeError(error)}`)
      }
      for (const adapter of PROVIDER_ADAPTERS) {
        const route = adapter.routes[0]
        try {
          const view = await this.balance.read(route, { force: true })
          await logDebug(
            `adapter=${adapter.id} route=${route} status=${view.status}` +
              ` kind=${view.kind ?? '-'}` +
              ` amount=${view.amount ?? '-'} percent=${view.percent ?? '-'}` +
              ` error=${view.error ?? '-'}`,
          )
          if (Array.isArray(view.windows) && view.windows.length > 0) {
            await logDebug(`  windows=${JSON.stringify(view.windows)}`)
          }
          if (adapter.status !== undefined) {
            const platform = await this.statusService.read(route)
            await logDebug(
              `  platform=${platform.state}` +
                (platform.summary ? ` summary=${platform.summary}` : '') +
                (platform.error ? ` error=${platform.error}` : ''),
            )
          }
        } catch (error) {
          await logDebug(`adapter=${adapter.id} route=${route} THREW ${describeError(error)}`)
        }
      }
      // An unknown route is not an adapter, but the client may still ask.
      await logDebug(`no-adapter route probe: ${String(findAdapter('__none__') === undefined)}`)
      await logDebug('=== probe done ===')
    })().catch((error) => {
      console.error('[model-allowance] probe failed', { error })
    })
  }
}

/**
 * The plugin's configuration schema.
 */
ModelAllowanceService.Config = z.object({
  /** Lifetime of one cached reading, in milliseconds; also the sweep period. */
  ttlMs: z
    .number()
    .min(30_000)
    .max(24 * 60 * 60 * 1000)
    .default(5 * 60 * 1000),
  /** Timeout for one provider request, in milliseconds. */
  requestTimeoutMs: z
    .number()
    .min(1000)
    .max(120 * 1000)
    .default(15 * 1000),
  /** Lifetime of one successful platform-status reading. */
  statusTtlMs: z
    .number()
    .min(5_000)
    .max(60 * 60 * 1000)
    .default(60 * 1000),
  /** How long a failed platform-status fetch is remembered. */
  statusFailureTtlMs: z
    .number()
    .min(1000)
    .max(30 * 60 * 1000)
    .default(30 * 1000),
  /** Timeout for one platform-status request. */
  statusTimeoutMs: z
    .number()
    .min(1000)
    .max(60 * 1000)
    .default(8 * 1000),
  /** Write each reading and its failure reason to `$DSH_HOME/model-allowance-debug.log`. */
  debug: z.boolean().default(false),
})

export {
  KIND_AMOUNT,
  KIND_QUOTA,
  ModelAllowanceService as default,
  ModelAllowanceService,
  PROVIDER_ADAPTERS,
}
