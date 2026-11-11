/**
 * The mounted `balance` namespace.
 *
 * A Remote namespace is a Cordis service, so reading `ctx.remote.balance`
 * without declaring it in `inject` throws. This plugin cannot declare it:
 * `apply` is what mounts the namespace, so waiting for it would deadlock.
 * `ctx.get` is the inject-free lookup, and this promise lets a component that
 * renders before the mount finishes wait for it instead of guessing.
 *
 * @type {object | null}
 */
let balanceNamespace = null

/** @type {(value: object | null) => void} */
let settleBalanceNamespace

/** Resolves with the mounted namespace, or null when the mount failed. */
const balanceNamespaceReady = new Promise((resolve) => {
  settleBalanceNamespace = resolve
})

/**
 * Resolve the balance namespace, or null when the mount failed.
 * @returns {Promise<object | null>} The namespace.
 */
export async function getBalanceApi() {
  if (balanceNamespace) return balanceNamespace
  return await balanceNamespaceReady
}

/**
 * Look the namespace up without requiring it to be injected.
 * @param {object} ctx Client plugin context.
 * @returns {object | undefined} The namespace, when mounted.
 */
export function lookupBalanceNamespace(ctx) {
  try {
    return ctx.get('remote.balance')
  } catch {
    return undefined
  }
}

/**
 * Publish the mounted namespace and release every waiting component.
 * @param {object | null} value The namespace, or null after a failed mount.
 * @returns {object | null} The value.
 */
export function setBalanceNamespace(value) {
  balanceNamespace = value
  settleBalanceNamespace(value)
  return value
}

/** @type {boolean | undefined} */
let modelSupport

/** Forget the namespace when the plugin instance is disposed. */
export function resetBalanceNamespace() {
  balanceNamespace = null
  modelSupport = undefined
}

/**
 * The Host's Session face, looked up without requiring it to be injected.
 *
 * The `session` namespace is a core namespace the harness publishes, and the
 * model seat uses it to switch a session's model. It is looked up rather
 * than injected so a host that does not publish it leaves the badge working:
 * the switch button then simply stays hidden.
 *
 * @param {object} ctx Client plugin context.
 * @returns {object | undefined} The Session face, when the host publishes one.
 */
export function lookupSessionFace(ctx) {
  try {
    const face = ctx.get('remote.session')
    if (face !== undefined) return face
  } catch {
    // The property read below is the fallback.
  }
  return ctx.remote?.session
}

/**
 * Whether this Host accepts the optional model argument.
 *
 * A page can load a newer bundle than the Host process runs during an in-place
 * update. Asking once keeps the new contract while letting the old one answer
 * every read instead of rejecting an unexpected field.
 *
 * @param {object} api Mounted balance namespace.
 * @returns {Promise<boolean>} True when `balance`/`watch`/`refresh` take a model.
 */
export async function supportsModel(api) {
  if (modelSupport !== undefined) return modelSupport
  if (typeof api?.capabilities !== 'function') {
    modelSupport = false
    return modelSupport
  }
  try {
    const result = await api.capabilities()
    modelSupport = result?.ok === true && result.value?.modelScoped === true
  } catch {
    modelSupport = false
  }
  return modelSupport
}
