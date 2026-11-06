/**
 * Credential discovery for provider routes.
 *
 * The harness already knows which credential authorizes which route: the
 * `llm-pi-ai` plugin keeps a profile per route, and its configurable-provider
 * directory names the catalog's native authentication env names. Asking it is
 * both more accurate than a hand-maintained table and the only way a custom
 * route (or a route whose profile names a non-default `apiKeyEnv`) can work.
 *
 * The chain, most authoritative first:
 *
 *  1. the route profile's `apiKeyEnv`, read through the settings service —
 *     exactly the reference the LLM request itself resolves;
 *  2. the catalog's native authentication env names, from the llm directory.
 *
 * When the harness names the route, those two answers are authoritative and
 * the adapter's own table is not consulted: the two Zhipu routes share a
 * vendor but not a credential, so a fallback table that lists both keys would
 * let one route answer for the other. Only a route the harness does not know —
 * a composition without `llm-pi-ai`, or a bare test context — falls through to
 * the adapter's `credentialRefs`.
 *
 * Every layer is optional: a composition without `llm` or `settings` falls
 * through to the adapter's own table, which is what a bare Host or a test
 * environment looks like. Only the reference list is cached — the value is
 * resolved per read, so a changed key reaches the next reading without a
 * restart.
 */

/**
 * How long one directory-and-settings snapshot is trusted.
 *
 * `settings.describe()` walks every active plugin's schema, so it is far too
 * expensive to call per read. A short trust window keeps an edited profile
 * reaching the plugin without wiring a second event subscription, and the
 * credential value itself is never cached.
 */
const SNAPSHOT_TTL_MS = 30_000

/**
 * Walk a settings path into a plain value.
 * @param {unknown} value Root value.
 * @param {readonly (string | number)[]} path Path segments.
 * @returns {unknown} The value at the path, or undefined.
 */
function walkPath(value, path) {
  let current = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = /** @type {Record<string | number, unknown>} */ (current)[segment]
  }
  return current
}

/**
 * Read the harness's provider directory and live settings once.
 *
 * Both reads are best-effort: a harness without the `llm` or `settings`
 * service, or one whose configuration surface is unavailable, simply answers
 * nothing here and the chain falls through.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx Host context.
 * @returns {{directory: Map<string, {settingsNs?: string, settingsPath?: readonly (string|number)[], nativeAuthEnv: readonly string[]}>, profiles: Map<string, unknown>}}
 *   The snapshot.
 */
function readHarnessSnapshot(ctx) {
  /** @type {Map<string, {settingsNs?: string, settingsPath?: readonly (string|number)[], nativeAuthEnv: readonly string[]}>} */
  const directory = new Map()
  /** @type {Map<string, unknown>} */
  const profiles = new Map()
  const get = (name) => (typeof ctx.get === 'function' ? ctx.get(name) : undefined)
  try {
    const llm = get('llm')
    const entries =
      typeof llm?.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : []
    for (const entry of entries ?? []) {
      if (!entry || typeof entry.provider !== 'string') continue
      directory.set(entry.provider, {
        settingsNs: typeof entry.settingsNs === 'string' ? entry.settingsNs : undefined,
        settingsPath: Array.isArray(entry.settingsPath) ? entry.settingsPath : undefined,
        nativeAuthEnv: Array.isArray(entry.nativeAuth?.env)
          ? entry.nativeAuth.env.filter((ref) => typeof ref === 'string' && ref !== '')
          : [],
      })
    }
    const settings = get('settings')
    const rows = typeof settings?.describe === 'function' ? settings.describe() : []
    for (const row of rows ?? []) {
      if (row && typeof row.ns === 'string') profiles.set(row.ns, row.value)
    }
  } catch {
    // A harness seam that is not mounted, or throws, is simply absent here.
  }
  return { directory, profiles }
}

/**
 * @typedef {object} RouteCredentialResolver
 * @property {(route: string, adapter: object) => Promise<{ref: string, value: string} | undefined>} resolve
 *   Resolve the credential that authorizes one route.
 */

/**
 * Create the per-route credential resolver for one balance service.
 * @param {object} deps Injected dependencies.
 * @param {import('@deepseek-ai/cordis').Context} deps.ctx Host context.
 * @param {(ref: string) => Promise<string | undefined>} deps.resolveCredential
 *   Resolves one credential reference to its value.
 * @returns {RouteCredentialResolver} The resolver.
 */
export function createRouteCredentialResolver({ ctx, resolveCredential }) {
  /** @type {{directory: ReturnType<typeof readHarnessSnapshot>['directory'], profiles: ReturnType<typeof readHarnessSnapshot>['profiles']} | undefined} */
  let snapshot
  let readAt = 0

  /**
   * The current harness snapshot, refreshed on a slow clock.
   * @returns {{directory: ReturnType<typeof readHarnessSnapshot>['directory'], profiles: ReturnType<typeof readHarnessSnapshot>['profiles']}} The snapshot.
   */
  const harness = () => {
    if (snapshot !== undefined && Date.now() - readAt < SNAPSHOT_TTL_MS) return snapshot
    snapshot = readHarnessSnapshot(ctx)
    readAt = Date.now()
    return snapshot
  }

  /**
   * The credential references worth trying for one route, most authoritative
   * first and without duplicates.
   * @param {string} route Provider route.
   * @param {object} adapter Adapter serving the route.
   * @returns {string[]} The references.
   */
  function candidateRefs(route, adapter) {
    /** @type {string[]} */
    const refs = []
    const seen = new Set()
    /** @param {unknown} ref Candidate reference. */
    const push = (ref) => {
      if (typeof ref !== 'string' || ref === '' || seen.has(ref)) return
      seen.add(ref)
      refs.push(ref)
    }
    const { directory, profiles } = harness()
    const entry = directory.get(route)
    if (entry !== undefined) {
      // The harness names this route, so its answer is authoritative.
      if (entry.settingsNs !== undefined && entry.settingsPath !== undefined) {
        // The profile's own apiKeyEnv is what the LLM request resolves, so it
        // outranks the catalog default even when the two disagree.
        const profile = walkPath(profiles.get(entry.settingsNs), entry.settingsPath)
        if (profile !== null && typeof profile === 'object') {
          push(/** @type {Record<string, unknown>} */ (profile).apiKeyEnv)
        }
      }
      for (const ref of entry.nativeAuthEnv) push(ref)
      return refs
    }
    // The harness does not know this route — a composition without
    // `llm-pi-ai`, or a bare test context — so the adapter's own table answers.
    for (const ref of adapter.credentialRefs ?? []) push(ref)
    return refs
  }

  return {
    async resolve(route, adapter) {
      for (const ref of candidateRefs(route, adapter)) {
        const value = await resolveCredential(ref)
        if (typeof value === 'string' && value !== '') return { ref, value }
      }
      return undefined
    },
  }
}
