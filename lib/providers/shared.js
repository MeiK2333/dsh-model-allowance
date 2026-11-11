/**
 * Shared machinery for provider balance adapters.
 *
 * An adapter declares the routes it serves, how its query is authorized, and
 * how the provider's response is projected onto the shared `BalanceView`
 * shape. The projection is always bespoke — every provider words its response
 * differently — so this module owns only what every adapter repeats: the
 * quantity dimensions, the tolerant readers for numbers and instants, the
 * window-length naming, the HTTP request that signs and bounds one query, and
 * the validation that keeps a newly added vendor honest about its metadata.
 */

/** A provider reports a monetary balance. */
export const KIND_AMOUNT = 'amount'

/** A provider reports a remaining allowance (quota, time, call count). */
export const KIND_QUOTA = 'quota'

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
 * @property {{zh?: string, en?: string}} [label] Vendor-specific display name, when the plan has several windows of one unit.
 * @property {number} [count] How many `unit`s long the window is, e.g. 5 hours.
 * @property {number} [used] Allowance already spent in this window.
 * @property {number} [total] Allowance included in this window.
 * @property {number} [remainingPercent] Share of the allowance still available.
 * @property {number} [resetAt] Epoch milliseconds of the next reset.
 */

/** Signing styles a provider endpoint accepts. */
const AUTH_STYLES = new Set(['bearer', 'raw'])

/** The credential-reference grammar the harness credentials service accepts. */
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Read a JSON body as a plain object.
 * @param {unknown} payload Decoded response body.
 * @returns {Record<string, unknown>} The body as a plain object.
 */
export function asObject(payload) {
  return payload && typeof payload === 'object'
    ? /** @type {Record<string, unknown>} */ (payload)
    : {}
}

/**
 * Parse a numeric string the providers use for money amounts.
 * @param {unknown} value Raw amount.
 * @returns {number | undefined} The amount, or undefined when unparsable.
 */
export function parseAmount(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Parse an instant the providers report, as epoch milliseconds or ISO text.
 *
 * Reset times arrive in three shapes across the vendors: epoch milliseconds
 * (MiniMax, Zhipu), RFC 3339 text (Kimi, OpenCode), and numeric strings. One
 * reader keeps every adapter from inventing its own numeric-string heuristic.
 *
 * @param {unknown} value Raw instant.
 * @returns {number | undefined} Epoch milliseconds, or undefined when unparsable.
 */
export function parseInstant(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text === '') return undefined
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text)
    return Number.isFinite(numeric) ? numeric : undefined
  }
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Name a window length from its duration.
 *
 * Reporting the window the provider actually enforces matters: MiniMax meters
 * a 7-day window, not a calendar month, and saying "month" would be wrong.
 *
 * @param {number | undefined} ms Window length in milliseconds.
 * @returns {{unit: 'hour'|'day'|'month'|'unknown', count?: number}} The unit and count.
 */
export function windowLength(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return { unit: 'unknown' }
  const hours = ms / 3_600_000
  if (hours < 24) return { unit: 'hour', count: Math.round(hours) }
  const days = ms / 86_400_000
  if (days < 28) return { unit: 'day', count: Math.round(days) }
  return { unit: 'month', count: Math.round(days / 30) }
}

/**
 * The most-constrained window of a reading.
 *
 * The badge speaks for the window closest to its limit; the panel breaks the
 * rest down. A window that reports no percentage cannot constrain anything,
 * so it sorts last.
 *
 * @param {Array<BalanceWindow>} windows Reported windows.
 * @returns {BalanceWindow | undefined} The binding window, if any.
 */
export function bindingWindow(windows) {
  return windows.reduce((current, candidate) => {
    const a = current?.remainingPercent ?? Number.POSITIVE_INFINITY
    const b = candidate.remainingPercent ?? Number.POSITIVE_INFINITY
    return b < a ? candidate : current
  }, undefined)
}

/**
 * @typedef {object} AdapterFixture
 * @property {string} name Fixture identity, used in failure messages.
 * @property {string} [route] Route to read; defaults to the adapter's first.
 * @property {object} [response] Recorded JSON body, for an endpoint adapter.
 * @property {number} [httpStatus] Recorded HTTP status; defaults to 200.
 * @property {Record<string, unknown>} [services] Host services the read uses,
 *   for a `readWithEnv` adapter.
 * @property {string} [apiKey] Credential value handed to the read.
 * @property {string} [model] Provider-owned model id handed to the read.
 * @property {Record<string, unknown>} expect Fields the reading must carry.
 * @property {string[]} [absent] Dotted paths the reading must not carry.
 */

/**
 * Declare one provider adapter and refuse a declaration that cannot work.
 *
 * Two forms exist. An endpoint adapter names its URL and signing style, so the
 * balance service is the only code that performs the request: timeout, status
 * mapping, and JSON decoding behave the same for every provider, and the
 * vendor file only projects the body. A `readWithEnv` adapter performs its own
 * read, which is what a Host-service-backed route needs.
 *
 * @param {object} spec The declaration.
 * @param {string} spec.id Adapter identity.
 * @param {readonly string[]} spec.routes Provider routes this adapter serves.
 * @param {readonly string[]} [spec.modelRoutes] Host provider routes whose
 *   catalog groups list this vendor's models, when they differ from the
 *   balance route.
 * @param {'amount'|'quota'} spec.kind Quantity dimension of the reading.
 * @param {boolean} [spec.modelScoped] Whether the reading is per model.
 * @param {string} spec.consoleUrl Provider console for a manual check.
 * @param {{name: {zh: string, en: string}, mark: {icon?: string, color: string}}} spec.display
 *   Display metadata the browser needs to name and draw the route.
 * @param {string} [spec.service] Host service this adapter reads through.
 * @param {string} [spec.endpoint] HTTPS endpoint, for an endpoint adapter.
 * @param {'bearer'|'raw'} [spec.auth] How the credential signs the request.
 * @param {readonly string[]} [spec.credentialRefs] Credential references to try
 *   when the harness cannot name one for the route.
 * @param {{endpoint: string, url: string, parse: (env: {text?: string, json?: unknown}) => {state: string, summary?: string}}} [spec.status]
 *   Live platform status source, when the vendor publishes one.
 * @param {import('./schedule.js').Schedule} [spec.schedule] Time-of-day pricing schedule.
 * @param {(env: {route: string, apiKey: string, body: Record<string, unknown>, model?: string}) => import('../providers.js').BalanceView} [spec.read]
 *   Projection for an endpoint adapter.
 * @param {(env: import('../providers.js').AdapterEnv) => Promise<import('../providers.js').BalanceView>} [spec.readWithEnv]
 *   Full read for an adapter that needs more than an API key, such as a Host service.
 * @param {readonly AdapterFixture[]} [spec.fixtures] Recorded responses proving
 *   the projection still parses.
 * @returns {import('../providers.js').ProviderAdapter} The normalized adapter.
 */
export function defineAdapter(spec) {
  const where = `adapter "${String(spec?.id)}"`
  if (typeof spec?.id !== 'string' || spec.id === '') {
    throw new Error('a provider adapter needs a non-empty id')
  }
  if (!Array.isArray(spec.routes) || spec.routes.length === 0) {
    throw new Error(`${where} declares no routes`)
  }
  for (const route of spec.routes) {
    if (typeof route !== 'string' || route === '') throw new Error(`${where} has an empty route`)
  }
  if (spec.kind !== KIND_AMOUNT && spec.kind !== KIND_QUOTA) {
    throw new Error(`${where} must declare kind "${KIND_AMOUNT}" or "${KIND_QUOTA}"`)
  }
  if (typeof spec.consoleUrl !== 'string' || !spec.consoleUrl.startsWith('https://')) {
    throw new Error(`${where} needs an https console link`)
  }
  if (spec.status !== undefined) {
    if (typeof spec.status !== 'object' || spec.status === null) {
      throw new Error(`${where} declares an unreadable status source`)
    }
    if (typeof spec.status.endpoint !== 'string' || !spec.status.endpoint.startsWith('https://')) {
      throw new Error(`${where} needs an https status endpoint`)
    }
    if (typeof spec.status.url !== 'string' || !spec.status.url.startsWith('https://')) {
      throw new Error(`${where} needs an https status page link`)
    }
    if (typeof spec.status.parse !== 'function') {
      throw new Error(`${where} needs a status parser`)
    }
  }
  const name = spec.display?.name
  if (
    typeof name?.zh !== 'string' ||
    name.zh === '' ||
    typeof name?.en !== 'string' ||
    name.en === ''
  ) {
    throw new Error(`${where} needs a display name for both zh and en`)
  }
  const color = spec.display?.mark?.color
  if (typeof color !== 'string' || color === '') throw new Error(`${where} needs a brand colour`)

  const hasEndpoint = spec.endpoint !== undefined
  const hasEnvRead = typeof spec.readWithEnv === 'function'
  if (hasEndpoint === hasEnvRead) {
    throw new Error(`${where} must declare exactly one of endpoint and readWithEnv`)
  }
  if (hasEndpoint) {
    if (typeof spec.endpoint !== 'string' || !spec.endpoint.startsWith('https://')) {
      throw new Error(`${where} needs an https endpoint`)
    }
    if (!AUTH_STYLES.has(spec.auth)) {
      throw new Error(`${where} needs an auth style (${[...AUTH_STYLES].join(' or ')})`)
    }
    if (typeof spec.read !== 'function')
      throw new Error(`${where} needs a read() to project the response`)
  }
  if (spec.service !== undefined && (typeof spec.service !== 'string' || spec.service === '')) {
    throw new Error(`${where} names an empty service`)
  }
  for (const ref of spec.credentialRefs ?? []) {
    if (typeof ref !== 'string' || !REF_PATTERN.test(ref)) {
      throw new Error(`${where} names an invalid credential reference "${String(ref)}"`)
    }
  }
  if (
    spec.schedule !== undefined &&
    (typeof spec.schedule !== 'object' || spec.schedule === null)
  ) {
    throw new Error(`${where} declares an unreadable schedule`)
  }
  const fixtures = spec.fixtures ?? []
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    throw new Error(`${where} ships no fixture, so nothing would prove it still parses`)
  }

  return Object.freeze({
    id: spec.id,
    routes: Object.freeze([...spec.routes]),
    ...(spec.modelRoutes === undefined
      ? {}
      : { modelRoutes: Object.freeze([...spec.modelRoutes]) }),
    kind: spec.kind,
    ...(spec.modelScoped === true ? { modelScoped: true } : {}),
    consoleUrl: spec.consoleUrl,
    service: spec.service,
    http: hasEndpoint ? Object.freeze({ endpoint: spec.endpoint, auth: spec.auth }) : undefined,
    credentialRefs: Object.freeze([...(spec.credentialRefs ?? [])]),
    display: Object.freeze({
      name: Object.freeze({ zh: name.zh, en: name.en }),
      mark: Object.freeze({
        ...(typeof spec.display.mark.icon === 'string' && spec.display.mark.icon !== ''
          ? { icon: spec.display.mark.icon }
          : {}),
        color,
      }),
    }),
    status:
      spec.status === undefined
        ? undefined
        : Object.freeze({
            endpoint: spec.status.endpoint,
            url: spec.status.url,
            parse: spec.status.parse,
          }),
    schedule: spec.schedule,
    read: spec.read,
    readWithEnv: spec.readWithEnv,
    fixtures: Object.freeze(fixtures.map((fixture) => Object.freeze({ ...fixture }))),
  })
}

/**
 * Perform one endpoint adapter query and project its body.
 *
 * The service owns the transport so every provider shares one timeout, one
 * status mapping, and one decode step; the adapter owns only the projection.
 * Transport failures throw and are translated by the caller, exactly like a
 * failed `response.json()`.
 *
 * @param {import('../providers.js').ProviderAdapter} adapter Declared adapter.
 * @param {{route: string, apiKey: string, signal: AbortSignal, model?: string}} env Query context.
 * @returns {Promise<import('../providers.js').BalanceView>} The reading.
 */
export async function readEndpointAdapter(adapter, { route, apiKey, signal, model }) {
  if (adapter.http === undefined) throw new Error('adapter has no endpoint')
  const headers =
    adapter.http.auth === 'bearer'
      ? { authorization: `Bearer ${apiKey}` }
      : { authorization: String(apiKey) }
  const response = await fetch(adapter.http.endpoint, { headers, signal })
  if (!response.ok) {
    return {
      provider: route,
      status: 'failed',
      kind: adapter.kind,
      error: `HTTP ${response.status}`,
    }
  }
  const body = asObject(await response.json())
  return await adapter.read({ route, apiKey, body, model })
}

/**
 * The wire metadata for one adapter: what the browser needs to name and draw
 * the route without knowing any vendor.
 * @param {import('../providers.js').ProviderAdapter} adapter Declared adapter.
 * @returns {{name: {zh: string, en: string}, color: string, iconHint?: string}} The metadata.
 */
export function displayOf(adapter) {
  return {
    name: { ...adapter.display.name },
    color: adapter.display.mark.color,
    ...(adapter.display.mark.icon === undefined ? {} : { iconHint: adapter.display.mark.icon }),
  }
}
