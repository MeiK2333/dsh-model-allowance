/**
 * The Remote controller exposing balance readings to the browser.
 *
 * The controller is the only thing a browser can reach. It never returns a
 * credential: a reading carries the amount or allowance, the outcome, and a
 * console link.
 */

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/**
 * Apply the protocol's `@Remote` marker to a method without decorator syntax.
 *
 * The decorator's first argument is the decorated method and its second is the
 * decorator context. The protocol registers an initializer through the
 * context, and that initializer writes the marker onto the service prototype.
 * The protocol accepts an identical marker again, so applying it once per
 * method is enough.
 *
 * @param {object} prototype Class prototype carrying the method.
 * @param {string} method Name of the public instance method.
 * @param {{mode?: 'stream'}} [options] Remote options.
 * @returns {() => void} Runs the captured initializer against an instance.
 */
function markRemote(prototype, method, options) {
  /** @type {Array<() => void>} */
  const initializers = []
  const context = {
    name: method,
    private: false,
    static: false,
    addInitializer(initializer) {
      initializers.push(initializer)
    },
  }
  const decorated = prototype[method]
  // With options the protocol returns a decorator; without them it registers
  // the marker directly. Both register through `context.addInitializer`.
  if (options) {
    Remote(options)(decorated, context)
  } else {
    Remote(decorated, context)
  }
  return (instance) => {
    for (const initializer of initializers) initializer.call(instance)
  }
}

/**
 * Balance readings for the current conversation's provider.
 */
export class BalanceController extends TypertRemoteService {
  /**
   * @param {import('cordis').Context} ctx Owning Cordis context.
   */
  constructor(ctx) {
    super(ctx, 'balanceController', { namespace: 'balance' })
    for (const apply of BalanceController.__applyRemoteMarkers) apply(this)
  }

  /**
   * Read one provider's balance.
   * @param {string} provider Provider route, e.g. `minimax-cn`.
   * @returns {Promise<import('./providers.js').BalanceView>} The reading.
   */
  async balance(provider) {
    return await this.ctx.modelBalance.read(provider)
  }

  /**
   * Force a fresh reading, bypassing the cache.
   * @param {string} provider Provider route.
   * @returns {Promise<import('./providers.js').BalanceView>} The reading.
   */
  async refresh(provider) {
    return await this.ctx.modelBalance.read(provider, { force: true })
  }

  /**
   * Stream balance readings for one provider until the stream ends.
   *
   * The stream opens with the current reading, then publishes every later
   * reading the service produces for that route.
   *
   * @param {string} provider Provider route.
   * @param {AbortSignal} signal Stream lifetime.
   * @returns {AsyncGenerator<import('./providers.js').BalanceView>} Readings.
   */
  async *watch(provider, signal) {
    const service = this.ctx.modelBalance
    const queue = []
    let wake
    const notify = () => {
      wake?.()
      wake = undefined
    }
    const unsubscribe = service.subscribe(provider, (view) => {
      queue.push(view)
      notify()
    })
    const abort = () => notify()
    signal.addEventListener('abort', abort, { once: true })
    try {
      yield await service.read(provider)
      while (!signal.aborted) {
        if (queue.length > 0) {
          yield queue.shift()
          continue
        }
        await new Promise((resolve) => {
          wake = resolve
        })
      }
    } finally {
      unsubscribe()
      signal.removeEventListener('abort', abort)
    }
  }
}

/** Marker initializers applied to every instance of the controller. */
BalanceController.__applyRemoteMarkers = [
  markRemote(BalanceController.prototype, 'balance'),
  markRemote(BalanceController.prototype, 'refresh'),
  markRemote(BalanceController.prototype, 'watch', { mode: 'stream' }),
]
