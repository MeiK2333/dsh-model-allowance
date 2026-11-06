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
   * Refresh every tracked provider.
   * @returns {Promise<void>} Resolves when the refreshes settle.
   */
  async refreshAll() {
    await Promise.all(
      [...this.activeRoutes].map((route) => this.balance.read(route, { force: true })),
    )
  }

  /**
   * Run after construction: install the refresh triggers and, when debugging,
   * probe every adapter once and record what happened.
   * @returns {void} Nothing to clean up; the triggers live on the fiber.
   */
  [Service.init]() {
    const ctx = this.ctx

    // A finished turn consumed provider quota, so the reading it belongs to is
    // stale.
    ctx.on('session/event', (_session, event) => {
      if (event.type !== 'turn/end') return
      this.refreshAll().catch((error) => {
        console.error('[model-balance] turn refresh failed', { error })
      })
    })

    // A periodic sweep keeps a long-lived session's reading current.
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
