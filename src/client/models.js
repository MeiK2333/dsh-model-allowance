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
 * The catalog group that lists a vendor's models, under the Host's own
 * provider id.
 *
 * A balance route and the Host provider routes that serve the same vendor's
 * models are not always the same id, so every candidate is tried in order
 * and the first group that carries models wins. The group's id is what a
 * model switch must name.
 *
 * @param {{groups?: Array<object>} | undefined} catalog The Host's model catalog.
 * @param {readonly string[]} routes Candidate provider routes, the card's own first.
 * @returns {{provider: string, models: Array<{id: string, name?: string}>} | undefined} The group, when one carries models.
 */
export function providerModelGroup(catalog, routes) {
  const seen = new Set()
  for (const route of routes) {
    if (typeof route !== 'string' || route === '' || seen.has(route)) continue
    seen.add(route)
    const models = modelsForProvider(catalog, route)
    if (models.length > 0) return { provider: route, models }
  }
  return undefined
}

/**
 * The second-level choices a model with reasoning efforts offers: one per
 * effort, and a provider-default entry first when the model names no
 * default of its own.
 *
 * @param {{reasoning?: {defaultEffort?: string, efforts?: Array<object>}}} model A catalog model.
 * @returns {Array<{id: string | undefined, name?: string, isDefault?: boolean, providerDefault?: boolean}> | null} The choices, or null when the model takes no effort choice.
 */
export function effortChoices(model) {
  const reasoning = model?.reasoning
  const efforts = Array.isArray(reasoning?.efforts) ? reasoning.efforts : []
  if (efforts.length === 0) return null
  const entries = efforts
    .filter((effort) => typeof effort?.id === 'string' && effort.id !== '')
    .map((effort) => ({
      id: effort.id,
      name: typeof effort.name === 'string' && effort.name !== '' ? effort.name : effort.id,
      isDefault: effort.id === reasoning.defaultEffort,
    }))
  if (reasoning.defaultEffort === undefined) {
    // No default of its own: the provider's choice is one of the options,
    // like the composer's model seat offers it.
    entries.unshift({ id: undefined, providerDefault: true })
  }
  return entries
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
