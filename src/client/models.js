/**
 * The Host's model catalog, read from the browser.
 *
 * The catalog is the same one the composer's model seat shows: every
 * provider this installation routes to, with the models it advertises. The
 * card reads it to offer a model list for the provider the card points at,
 * and the Host's own `session.selectModel` performs the switch.
 */

/**
 * The catalog group one provider route offers.
 *
 * The group id is the LLM route the Host routes requests through, which is
 * the provider route this plugin names: both are the same identifiers.
 *
 * @param {{groups?: Array<object>} | undefined} catalog The Host's model catalog.
 * @param {string} provider Provider route.
 * @returns {object | undefined} The group, when the catalog has one.
 */
export function providerGroup(catalog, provider) {
  const groups = Array.isArray(catalog?.groups) ? catalog.groups : []
  return groups.find((group) => group?.id === provider)
}

/**
 * The models one provider route offers.
 *
 * A group without models, and a model without an id, are dropped: the switch
 * needs an exact model id, and an entry without one cannot be selected.
 *
 * @param {{groups?: Array<object>} | undefined} catalog The Host's model catalog.
 * @param {string} provider Provider route.
 * @returns {Array<{id: string, name?: string, reasoning?: {defaultEffort?: string, efforts?: Array<object>}}>} The models.
 */
export function modelsForProvider(catalog, provider) {
  const group = providerGroup(catalog, provider)
  const models = Array.isArray(group?.models) ? group.models : []
  return models.filter((model) => typeof model?.id === 'string' && model.id !== '')
}

/**
 * The model the session uses, when it uses one of this provider's models.
 *
 * The card can point at a provider the session does not use, and then no
 * model of it is the current one.
 *
 * @param {{next?: object, lastUsed?: object} | undefined} selection The session's model selection.
 * @param {string} provider Provider route.
 * @returns {string | undefined} The current model id.
 */
export function currentModelFor(selection, provider) {
  const next = selection?.next ?? selection?.lastUsed
  if (next?.provider !== provider) return undefined
  return typeof next.model === 'string' ? next.model : undefined
}
