/**
 * Provider balance adapters: the registry.
 *
 * Every adapter declares the routes it serves, the credential reference that
 * authorizes the query, how the request is authenticated, and how the response
 * is projected onto the shared {@link BalanceView} shape. One vendor lives in
 * one file under `lib/providers/`, so adding a vendor is adding a file: this
 * module only collects them and answers "which adapter serves this route".
 *
 * The quantity a provider reports is not always money. DeepSeek reports a
 * currency balance; MiniMax, Zhipu, Kimi, and OpenCode report a subscription
 * allowance. The `kind` field keeps the two apart so the UI can say the right
 * thing.
 */

import { deepseekAdapters } from './providers/deepseek.js'
import { kimiAdapters } from './providers/kimi.js'
import { minimaxAdapters } from './providers/minimax.js'
import { opencodeAdapters } from './providers/opencode.js'
import { zhipuAdapters } from './providers/zhipu.js'
import { KIND_AMOUNT, KIND_QUOTA } from './providers/shared.js'

/**
 * One metering window a subscription plan enforces.
 *
 * A coding plan usually meters the same account over several periods — a short
 * rolling window and a long one — and each period has its own allowance and
 * reset. A single "remaining" number cannot express that, so a reading carries
 * one of these per window.
 *
 * @typedef {object} BalanceWindow
 * @property {string} id Stable identity: `session`, `weekly`, or a positional fallback.
 * @property {'hour'|'day'|'week'|'month'|'unknown'} unit Length unit of the window.
 * @property {number} [count] How many `unit`s long the window is, e.g. 5 hours.
 * @property {number} [used] Allowance already spent in this window.
 * @property {number} [total] Allowance included in this window.
 * @property {number} [remainingPercent] Share of the allowance still available.
 * @property {number} [resetAt] Epoch milliseconds of the next reset.
 */

/**
 * @typedef {object} BalanceView
 * @property {string} provider Route the reading belongs to.
 * @property {'ready'|'unsupported'|'unconfigured'|'failed'} status Reading outcome.
 * @property {'amount'|'quota'} kind Quantity dimension of the reading.
 * @property {number} [amount] Monetary balance, for `kind === 'amount'`.
 * @property {string} [currency] Currency of `amount`, e.g. `CNY`.
 * @property {number} [remaining] Remaining allowance, for `kind === 'quota'`.
 * @property {number} [total] Total allowance, for `kind === 'quota'`.
 * @property {number} [percent] Remaining percentage, for `kind === 'quota'`.
 * @property {number} [remainingMs] Remaining time in the reported window, in milliseconds.
 * @property {number} [resetsAt] Epoch milliseconds of the next allowance reset.
 * @property {readonly BalanceWindow[]} [windows] Per-window detail for a metered plan.
 * @property {string} [consoleUrl] Provider console for a manual top-up or quota check.
 * @property {number} [updatedAt] Epoch milliseconds of the reading.
 * @property {string} [error] Failure detail for `status === 'failed'`.
 */

/**
 * What a `readWithEnv` adapter may use to answer one reading.
 * @typedef {object} AdapterEnv
 * @property {string} route Provider route being read.
 * @property {string | undefined} apiKey Resolved credential value, when the adapter needs one.
 * @property {import('@deepseek-ai/cordis').Context} ctx Host context, for service-backed adapters.
 * @property {AbortSignal} signal Cancellation.
 */

/**
 * One declared provider adapter, as {@link defineAdapter} normalizes it.
 * @typedef {object} ProviderAdapter
 * @property {string} id Adapter identity.
 * @property {readonly string[]} routes Provider routes this adapter serves.
 * @property {'amount'|'quota'} kind Quantity dimension of the reading.
 * @property {string} consoleUrl Provider console for a manual check.
 * @property {string} [service] Host service this adapter reads through, when it needs no key.
 * @property {{endpoint: string, auth: 'bearer'|'raw'}} [http] Endpoint and signing
 *   style, when the service performs the request.
 * @property {readonly string[]} credentialRefs Credential references to try when
 *   the harness cannot name one for the route.
 * @property {{name: {zh: string, en: string}, mark: {icon?: string, color: string}}} display
 *   Display metadata the browser needs to name and draw the route.
 * @property {{endpoint: string, url: string, parse: (env: {text?: string, json?: unknown}) => {state: string, summary?: string}}} [status]
 *   Live platform status source, when the vendor publishes one.
 * @property {import('./providers/schedule.js').Schedule} [schedule]
 *   Time-of-day pricing schedule, when the vendor prices by wall clock.
 * @property {(env: {route: string, apiKey: string, body: object}) => object} [read]
 *   Projection for an endpoint adapter.
 * @property {(env: AdapterEnv) => Promise<object>} [readWithEnv] Full read for an
 *   adapter that needs more than an API key, such as a Host service.
 * @property {readonly object[]} fixtures Recorded responses proving the projection.
 */

/**
 * The registry of provider balance adapters, in switcher order.
 * @type {readonly ProviderAdapter[]}
 */
export const PROVIDER_ADAPTERS = Object.freeze([
  ...deepseekAdapters,
  ...minimaxAdapters,
  ...zhipuAdapters,
  ...kimiAdapters,
  ...opencodeAdapters,
])

/** Route to the adapter serving it, resolved once at load. */
const BY_ROUTE = new Map()
for (const adapter of PROVIDER_ADAPTERS) {
  for (const route of adapter.routes) {
    // Two adapters answering the same route would make a reading depend on
    // load order; refuse the declaration instead.
    if (BY_ROUTE.has(route)) {
      throw new Error(`two provider adapters declare the route "${route}"`)
    }
    BY_ROUTE.set(route, adapter)
  }
}

/**
 * Find the adapter serving one provider route.
 * @param {string} route Provider route, e.g. `minimax-cn`.
 * @returns {ProviderAdapter | undefined} The adapter, when one serves the route.
 */
export function findAdapter(route) {
  return BY_ROUTE.get(route)
}

export { KIND_AMOUNT, KIND_QUOTA }
