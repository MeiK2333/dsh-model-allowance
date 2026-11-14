import * as React from 'react'
import { currentModelFor, providerModelGroup } from '../models.js'
import { lookupSessionFace } from '../namespace.js'
import { describe } from './use-balance-stream.js'

/**
 * How long the Host's model catalog is reused before it is read again.
 *
 * The catalog changes only when a provider changes what it advertises, and
 * every open of the list reads the same document.
 */
const CATALOG_TTL_MS = 60 * 1000

/**
 * The Host's model catalog, the list the switch button offers, and the
 * switch itself, with the effort flyout's hover state.
 * @param {object} args Everything the list and the switch need.
 * @param {object} args.ctx Client plugin context.
 * @param {(key: string, params?: object) => string} args.t Translator.
 * @param {string | undefined} args.sessionId The session the switch performs on.
 * @param {string | null} args.activeProvider The route the card points at.
 * @param {(route: string) => object | undefined} args.entryOf Directory entry lookup.
 * @param {object | undefined} args.selection The session's model selection projection.
 * @returns {object} The model list state and its handlers.
 */
export function useModelCatalog({ ctx, t, sessionId, activeProvider, entryOf, selection }) {
  // The models the switch button offers. The Host's catalog is the same one
  // the composer's model seat reads, so the two always agree on which
  // models exist.
  const [modelList, setModelList] = React.useState([])
  // The card route the shown list belongs to, so a list read for another
  // route never shows against the route now in use.
  const [modelListRoute, setModelListRoute] = React.useState(null)
  // The Host provider id the listed models switch under, when it differs
  // from the card's own route.
  const [catalogProvider, setCatalogProvider] = React.useState(null)
  // 'idle' before the list was ever opened, then 'loading', 'ready', 'empty'
  // or 'error'.
  const [modelListState, setModelListState] = React.useState('idle')
  const [modelError, setModelError] = React.useState(null)
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  // The model whose effort choices show in the flyout while the pointer
  // rests on its row, with the flyout's top offset inside the wrap.
  const [hoverModel, setHoverModel] = React.useState(null)
  // Closing the flyout waits a beat, so a pointer travelling from a row
  // into the flyout does not dismiss it mid-air.
  const hoverModelTimer = React.useRef(null)
  // The model being switched to, while the Host performs the switch.
  const [switchingModel, setSwitchingModel] = React.useState(null)
  // The wrapper that holds the switch button and its list, so a click on
  // either of them does not dismiss the list.
  const modelWrapRef = React.useRef(null)
  // The Host's model catalog, kept for a minute: it changes only when a
  // provider changes what it advertises, and every open of the list reads
  // the same document.
  const catalogRef = React.useRef({ value: null, at: 0 })

  /**
   * Show the models of the provider the card points at.
   * @param {object | null} catalog The Host's model catalog.
   */
  const showModels = React.useCallback(
    (catalog) => {
      // A balance route and the Host provider id that lists the same
      // vendor's models are not always the same id, so the adapter's own
      // candidates follow the route itself.
      const routes = [activeProvider, ...(entryOf(activeProvider)?.modelRoutes ?? [])]
      const group = providerModelGroup(catalog, routes)
      const models = group?.models ?? []
      setCatalogProvider(group?.provider ?? null)
      setModelListRoute(activeProvider)
      setModelList(models)
      setModelListState(models.length > 0 ? 'ready' : 'empty')
    },
    [activeProvider, entryOf],
  )

  // The catalog is read when the list opens and kept for a minute: a
  // provider changes what it advertises rarely, and every open of the list
  // reads the same document.
  React.useEffect(() => {
    if (!modelMenuOpen) return undefined
    let cancelled = false
    ;(async () => {
      const face = lookupSessionFace(ctx)
      if (face === undefined || typeof face.modelCatalog !== 'function') {
        setModelListState('error')
        setModelError(t('model.unavailable'))
        return
      }
      const cached = catalogRef.current
      if (cached.value !== null && Date.now() - cached.at < CATALOG_TTL_MS) {
        if (!cancelled) showModels(cached.value)
        return
      }
      setModelListState('loading')
      try {
        const result = await face.modelCatalog()
        if (cancelled) return
        if (!result?.ok) {
          setModelListState('error')
          setModelError(
            t('model.loadFailed', { error: result?.error?.message ?? result?.error?.code ?? '' }),
          )
          return
        }
        catalogRef.current = { value: result.value, at: Date.now() }
        showModels(result.value)
      } catch (error) {
        if (cancelled) return
        setModelListState('error')
        setModelError(t('model.loadFailed', { error: describe(error) }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modelMenuOpen, ctx, t, showModels])

  // A click outside the list closes it. The button that opened the list
  // sits inside the same wrapper, so the list is not dismissed by its own
  // trigger.
  React.useEffect(() => {
    if (!modelMenuOpen) return undefined
    const onPointerDown = (event) => {
      const wrap = modelWrapRef.current
      if (wrap && event.target instanceof Node && wrap.contains(event.target)) return
      setModelMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [modelMenuOpen])

  /**
   * Switch the session to one model of the card's provider.
   *
   * The Host's own switch performs it, so the session records the same
   * selection a click in the composer's model seat records, and the
   * installation keeps that selection as its default.
   *
   * @param {{id: string}} model The model to switch to.
   * @param {string | undefined} effort The reasoning effort the user picked,
   *   or undefined to leave the choice to the provider.
   */
  const switchToModel = React.useCallback(
    async (model, effort) => {
      const face = lookupSessionFace(ctx)
      if (face === undefined || typeof face.selectModel !== 'function') {
        setModelError(t('model.unavailable'))
        return
      }
      if (typeof sessionId !== 'string' || sessionId === '') {
        setModelError(t('model.unavailable'))
        return
      }
      setSwitchingModel(model.id)
      try {
        const result = await face.selectModel({
          sessionId,
          provider: catalogProvider ?? activeProvider,
          model: model.id,
          ...(typeof effort === 'string' && effort !== '' ? { reasoningEffort: effort } : {}),
        })
        if (!result?.ok) {
          setModelError(
            t('model.failed', { error: result?.error?.message ?? result?.error?.code ?? '' }),
          )
          return
        }
        setModelError(null)
        setModelMenuOpen(false)
      } catch (error) {
        console.error('[model-allowance] switching the model failed', { error })
        setModelError(t('model.failed', { error: describe(error) }))
      } finally {
        setSwitchingModel(null)
      }
    },
    [ctx, sessionId, activeProvider, catalogProvider, t],
  )

  // The flyout is a sibling of the list, so the row and the flyout share
  // the hover through a delayed close rather than CSS nesting.
  const showEffortFlyout = React.useCallback((model, top) => {
    clearTimeout(hoverModelTimer.current)
    setHoverModel({ model, top })
  }, [])
  const scheduleEffortFlyoutClose = React.useCallback((id) => {
    clearTimeout(hoverModelTimer.current)
    hoverModelTimer.current = setTimeout(() => {
      setHoverModel((current) => (current?.model?.id === id ? null : current))
    }, 150)
  }, [])
  /** Keep the flyout open while the pointer is over it. */
  const keepEffortFlyout = React.useCallback(() => {
    clearTimeout(hoverModelTimer.current)
  }, [])

  /** Open or close the model list, resetting its error and flyout first. */
  const toggleModelMenu = React.useCallback(() => {
    setModelError(null)
    // Every open of the list starts with the flyout closed.
    clearTimeout(hoverModelTimer.current)
    setHoverModel(null)
    setModelMenuOpen((value) => !value)
  }, [])

  // The model the session uses, when it uses one of the card's provider's
  // models. The card can point at another provider, and then none of that
  // provider's models is the current one. The catalog provider names the
  // group the switch offers, which is the id the session selection carries.
  const modelProvider = catalogProvider ?? activeProvider
  const currentModel = currentModelFor(selection, modelProvider)
  // A list read for another route is not evidence about this one: it reads
  // as loading until the open of the list answers for the route in use.
  const shownModelList = modelListRoute === activeProvider ? modelList : []
  const shownModelListState = modelListRoute === activeProvider ? modelListState : 'loading'

  return {
    modelMenuOpen,
    setModelMenuOpen,
    modelWrapRef,
    shownModelList,
    shownModelListState,
    modelError,
    setModelError,
    currentModel,
    switchingModel,
    hoverModel,
    showEffortFlyout,
    scheduleEffortFlyoutClose,
    keepEffortFlyout,
    toggleModelMenu,
    switchToModel,
  }
}
