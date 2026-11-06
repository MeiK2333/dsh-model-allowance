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
import { StatusService } from './lib/status.js'
import { BalanceController } from './lib/remote.js'
import { PROVIDER_ADAPTERS, KIND_AMOUNT, KIND_QUOTA, findAdapter } from './lib/providers.js'
import { describeError, logDebug } from './lib/debug.js'

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
   * @param {object} config Resolved configuration.
   */
  constructor(ownerContext, config) {
    super(ownerContext, 'modelAllowance')
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
     * Platform status readings. Every source is a public page, so this half
     * needs no credential — only the vendor's status URL.
     */
    this.statusService = new StatusService({ ctx: ownerContext })

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
   * Refresh every tracked provider.
   * @returns {Promise<void>} Resolves when the refreshes settle.
   */
  async refreshAll() {
    await Promise.all(
      [...this.activeRoutes].map((route) =>
        this.balance.read(route, { force: true }).then((view) => {
          if (this.config.debug === true && view.consumption !== undefined) {
            void logDebug(
              `movement route=${route} status=${view.status}` +
                ` consumption=${view.consumption.kind}:${String(view.consumption.delta)}`,
            )
          }
          return view
        }),
      ),
    )
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

    // A finished turn consumed provider quota, so the reading it belongs to is
    // stale. Refreshing here is what turns "the number is old" into "here is
    // what moved".
    ctx.on(
      'session/event',
      (_session, event) => {
        if (event.type !== 'turn/end') return
        if (this.config.debug === true) {
          void logDebug(`turn end: refreshing ${String(this.activeRoutes.size)} route(s)`)
        }
        this.refreshAll().catch((error) => {
          console.error('[model-allowance] turn refresh failed', { error })
        })
      },
      GLOBAL,
    )

    // A periodic sweep keeps a long-lived session's reading current.
    ctx.timer.interval(() => {
      this.refreshAll().catch((error) => {
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
  /** Lifetime of one cached reading, in milliseconds. */
  ttlMs: z.number().default(5 * 60 * 1000),
  /** Timeout for one provider request, in milliseconds. */
  requestTimeoutMs: z.number().default(15 * 1000),
  /** Write each reading and its failure reason to `$DSH_HOME/model-allowance-debug.log`. */
  debug: z.boolean().default(false),
})

export { ModelAllowanceService as default, ModelAllowanceService, PROVIDER_ADAPTERS, KIND_AMOUNT, KIND_QUOTA }
