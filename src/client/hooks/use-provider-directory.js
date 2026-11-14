import * as React from 'react'
import { pickName } from '../locales.js'
import { getBalanceApi } from '../namespace.js'

/**
 * Whether one directory entry stands for a provider route.
 *
 * The Host names a vendor by two ids when the balance route and the route
 * that lists the vendor's models differ: the DeepSeek API vendor is
 * `deepseek` to a balance query and `deepseek-official` to the model catalog.
 * The entry that answers for one of them answers for the other.
 *
 * @param {{route: string, aliases?: readonly string[]}} entry Directory entry.
 * @param {string} route Provider route.
 * @returns {boolean} Whether the entry names the route.
 */
export function entryCovers(entry, route) {
  if (entry === undefined || entry === null) return false
  if (entry.route === route) return true
  return Array.isArray(entry.aliases) && entry.aliases.includes(route)
}

/**
 * The Host's provider directory, the installation's default provider, and
 * the helpers that name and match a route from directory metadata.
 * @param {string | null} selected The route the session's selection names.
 * @returns {{available: object[], defaultProvider: string | null, entryOf: (route: string) => object | undefined, nameOf: (route: string) => string}} The directory state.
 */
export function useProviderDirectory(selected) {
  // Every route the Host can read, with the metadata that names and draws
  // it. The switcher offers the configured ones; the metadata of the rest
  // still names the route when it is the one being read.
  const [directory, setDirectory] = React.useState([])
  // A session that has not taken a turn yet has no `modelSelection` to
  // read, and rendering nothing there would leave the composer without a
  // badge until the first message. Ask what a new session would use — the
  // installation's default, which the model selector also falls back to.
  const [defaultProvider, setDefaultProvider] = React.useState(null)

  // The panel names routes from the Host's directory: small, local, and
  // stable for a session. Fetching it at mount means the first open names
  // a route instead of flashing its id; the open-time refresh below keeps
  // it current when a credential changed in the same session.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const api = await getBalanceApi()
        if (!api || typeof api.list !== 'function') return
        const result = await api.list()
        if (cancelled || !result.ok) return
        setDirectory(result.value)
      } catch (error) {
        console.error('[model-allowance] listing providers failed', { error })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (selected !== null) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const api = await getBalanceApi()
        if (!api || typeof api.defaultProvider !== 'function') return
        const result = await api.defaultProvider()
        if (cancelled || result?.ok !== true) return
        const provider = result.value?.provider
        if (typeof provider === 'string' && provider !== '') setDefaultProvider(provider)
      } catch (error) {
        console.error('[model-allowance] reading the default provider failed', { error })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  /** The routes this installation can read, for the switcher. */
  const available = directory.filter((entry) => entry.configured)

  /**
   * The directory entry for one route, when the Host named it.
   * @param {string} route Provider route.
   * @returns {object | undefined} The entry.
   */
  const entryOf = React.useCallback(
    (route) => directory.find((entry) => entryCovers(entry, route)),
    [directory],
  )

  /**
   * Name a route from its metadata, falling back to the route id.
   * @param {string} route Provider route.
   * @returns {string} The display name.
   */
  const nameOf = React.useCallback((route) => pickName(entryOf(route), route), [entryOf])

  return { available, defaultProvider, entryOf, nameOf }
}
