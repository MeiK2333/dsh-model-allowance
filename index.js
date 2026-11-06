/**
 * Host half of the model-balance bundle.
 *
 * The Host owns every provider credential, queries provider balance endpoints,
 * caches the readings, and publishes them through a Remote controller. The
 * Client half only ever sees readings.
 */

import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BalanceService } from './lib/balance.js'
import { BalanceController } from './lib/remote.js'
import { PROVIDER_ADAPTERS, KIND_AMOUNT, KIND_QUOTA, findAdapter } from './lib/providers.js'
import { describeError, logDebug } from './lib/debug.js'

/**
 * The Host-side balance service, registered as `ctx.modelBalance`.
 */
class ModelBalanceService extends Service {
  /**
   * Services this plugin depends on.
   */
  static inject = ['timer', 'credentials']

  /**
   * @param {import('@deepseek-ai/cordis').Context} ownerContext Owning context.
   * @param {object} config Resolved configuration.
   */
  constructor(ownerContext, config) {
    super(ownerContext, 'modelBalance')
    this.config = config

    /** @type {BalanceService} */
    this.balance = new BalanceService({
      ctx: ownerContext,
      resolveCredential: async (ref) => {
        const resolved = await ownerContext.credentials?.resolve(ref)
        return resolved?.value
      },
      options: {
        ttlMs: typeof config.ttlMs === 'number' ? config.ttlMs : undefined,
        requestTimeoutMs:
          typeof config.requestTimeoutMs === 'number' ? config.requestTimeoutMs : undefined,
      },
    })

    /** Routes a subscriber asked about, so polling touches only live providers. */
    this.activeRoutes = new Set()

    /**
     * The reading each route showed when the current turn began.
     * @type {Map<string, import('./lib/providers.js').BalanceView>}
     */
    this.baselines = new Map()

    // The Remote controller is a service of its own; it registers under the
    // `balanceController` key and exposes the `balance` wire namespace.
    this.controller = new BalanceController(ownerContext)
  }

  /**
   * Read one provider's balance.
   * @param {string} provider Provider route.
   * @param {{force?: boolean}} [options] Read options.
   * @returns {Promise<import('./lib/providers.js').BalanceView>} The reading.
   */
  async read(provider, options) {
    // A read means the browser is looking at this route, so it becomes part of
    // the set the periodic and turn-end sweeps refresh.
    this.activeRoutes.add(provider)
    const view = await this.balance.read(provider, options)
    if (this.config.debug === true && view.status !== 'ready') {
      await logDebug(
        `read route=${provider} status=${view.status} error=${view.error ?? '-'}`,
      )
    }
    return view
  }

  /**
   * Mark a provider as in use, so polling refreshes it.
   * @param {string} provider Provider route.
   * @returns {() => void} Releases the route.
   */
  track(provider) {
    this.activeRoutes.add(provider)
    return () => {
      this.activeRoutes.delete(provider)
    }
  }

  /**
   * Subscribe to new readings for one provider.
   * @param {string} provider Provider route.
   * @param {(view: import('./lib/providers.js').BalanceView) => void} listener Receives every reading.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(provider, listener) {
    return this.balance.subscribe(provider, listener)
  }

  /**
   * List the providers this installation can read.
   * @returns {Promise<Array<{route: string, configured: boolean}>>} The routes.
   */
  async list() {
    return await this.balance.available()
  }

  /**
   * Refresh every tracked provider.
   * @param {{withConsumption?: boolean}} [options] When `withConsumption`,
   *   each reading is compared with the one captured when the turn began.
   * @returns {Promise<void>} Resolves when the refreshes settle.
   */
  async refreshAll(options = {}) {
    const report = options.withConsumption === true
    await Promise.all(
      [...this.activeRoutes].map((route) => {
        // The armed baseline is the reading from before this turn consumed
        // anything. Falling back to the cached reading covers a turn whose
        // start was never seen — the plugin loaded mid-turn, or the host never
        // announced it. It is less precise, since a sweep may have refreshed
        // the cache mid-turn, but it keeps the feature working.
        const baseline = report
          ? (this.baselines.get(route) ?? this.balance.peek(route))
          : undefined
        return this.balance.read(route, { force: true, baseline }).then((view) => {
          if (report && this.config.debug === true) {
            const consumption = view.consumption
            const measure =
              typeof view.amount === 'number'
                ? `after=${String(view.amount)}`
                : `after%=${String(view.percent)}`
            const from =
              typeof baseline?.amount === 'number'
                ? `before=${String(baseline.amount)}`
                : baseline == null
                  ? 'before=none'
                  : `before%=${String(baseline.percent)}`
            void logDebug(
              `turn cost route=${route} status=${view.status} ${from} ${measure}` +
                (consumption === undefined
                  ? ' consumption=-'
                  : ` consumption=${consumption.kind}:${String(consumption.delta)}`),
            )
          }
          return view
        })
      }),
    )
    if (report) this.baselines.clear()
  }

  /**
   * Remember what each tracked provider last read, as the baseline for a turn
   * that is about to start.
   *
   * An existing baseline is not replaced. Turns nest — a subagent runs its own
   * turn inside the one that started it — and re-arming on the inner turn would
   * measure only the tail of the outer one.
   *
   * @returns {void}
   */
  armBaselines() {
    for (const route of this.activeRoutes) {
      if (this.baselines.has(route)) continue
      const view = this.balance.peek(route)
      if (view !== undefined) this.baselines.set(route, view)
    }
    if (this.config.debug === true) {
      void logDebug(`turn start: armed ${String(this.baselines.size)} baseline(s)`)
    }
  }

  /**
   * Run after construction: install the refresh triggers and, when debugging,
   * probe every adapter once and record what happened.
   * @returns {void} Nothing to clean up; the triggers live on the fiber.
   */
  [Service.init]() {
    const ctx = this.ctx

    // Both listeners are `global`. `session/event` is emitted from the
    // session's own scope, so a plugin context that is not an ancestor of that
    // scope never sees it — the turn-end refresh was silently dead for that
    // reason, and the badge only ever moved on the periodic sweep. The harness
    // registers its own cross-session listeners the same way.
    const GLOBAL = { global: true }

    // A turn beginning is the only reliable "before" instant: the provider is
    // not asked, so this costs nothing, and the value is the last reading taken.
    ctx.on(
      'agent/status',
      (payload) => {
        if (payload.status !== 'running') return
        this.armBaselines()
      },
      GLOBAL,
    )

    // A finished turn consumed provider quota, so the reading it belongs to is
    // stale. This is also the moment to report what the turn cost.
    ctx.on(
      'session/event',
      (_session, event) => {
        if (event.type !== 'turn/end') return
        if (this.config.debug === true) {
          void logDebug(`turn end: refreshing ${String(this.activeRoutes.size)} route(s)`)
        }
        this.refreshAll({ withConsumption: true }).catch((error) => {
          console.error('[model-balance] turn refresh failed', { error })
        })
      },
      GLOBAL,
    )

    // A periodic sweep keeps a long-lived session's reading current. It never
    // reports a difference: a sweep is not a turn.
    ctx.timer.interval(() => {
      this.refreshAll().catch((error) => {
        console.error('[model-balance] periodic refresh failed', { error })
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
        } catch (error) {
          await logDebug(`adapter=${adapter.id} route=${route} THREW ${describeError(error)}`)
        }
      }
      // An unknown route is not an adapter, but the client may still ask.
      await logDebug(`no-adapter route probe: ${String(findAdapter('__none__') === undefined)}`)
      await logDebug('=== probe done ===')
    })().catch((error) => {
      console.error('[model-balance] probe failed', { error })
    })
  }
}

/**
 * The plugin's configuration schema.
 */
ModelBalanceService.Config = z.object({
  /** Lifetime of one cached reading, in milliseconds. */
  ttlMs: z.number().default(5 * 60 * 1000),
  /** Timeout for one provider request, in milliseconds. */
  requestTimeoutMs: z.number().default(15 * 1000),
  /** Write each reading and its failure reason to `$DSH_HOME/model-balance-debug.log`. */
  debug: z.boolean().default(false),
})

export { ModelBalanceService as default, ModelBalanceService, PROVIDER_ADAPTERS, KIND_AMOUNT, KIND_QUOTA }
