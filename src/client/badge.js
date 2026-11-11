import * as React from 'react'
import { createElement as h } from 'react'
import {
  consumptionFreshAt,
  formatAmount,
  formatClock,
  formatDelta,
  formatDuration,
  formatResetAt,
  STATUS_REFRESH_MS,
} from './format.js'
import { consoleGlyph, markOf, modelGlyph, providerIcon, refreshGlyph } from './icons.js'
import { pickName, statusLabel } from './locales.js'
import { currentModelFor, modelsForProvider } from './models.js'
import { getBalanceApi, lookupSessionFace, supportsModel } from './namespace.js'
import { formatCountdown, scheduleView } from './schedule.js'
import { STYLES } from './styles.js'
import { barTone, shortestWindow, windowTitle, windowUsage, windowUsedPercent } from './windows.js'

/**
 * How long the Host's model catalog is reused before it is read again.
 *
 * The catalog changes only when a provider changes what it advertises, and
 * every open of the list reads the same document.
 */
const CATALOG_TTL_MS = 60 * 1000

/**
 * The message of a thrown value.
 * @param {unknown} error The thrown value.
 * @returns {string} The message.
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The badge and its detail popover.
 * @param {object} props Slot props plus the plugin context and translator.
 * @returns {React.ReactElement | null} The rendered badge.
 */
export function BalanceBadge(props) {
  const { useProjection, ctx, t } = props

  // The session's durable model selection names the provider and model in
  // use. The model matters to providers that meter models separately
  // (MiniMax), so both halves of the selection travel with every read.
  const selection = useProjection('modelSelection')
  const selected = selection?.next?.provider ?? selection?.lastUsed?.provider ?? null
  const selectedModel = selection?.next?.model ?? selection?.lastUsed?.model ?? undefined
  // The session this badge belongs to. A session-scoped slot carries its
  // id, and the Host's switch needs it.
  const sessionId = props.sessionId

  const [rawView, setView] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const rootRef = React.useRef(null)

  // The countdowns below are relative to "now", so the open panel re-reads
  // the clock on a slow tick. Only the open panel pays for it.
  const [now, setNow] = React.useState(() => Date.now())

  // The card follows the model by default but can be pointed at any other
  // provider this installation can read. `picked` holds that override and
  // is cleared whenever the model moves, so the card snaps back to it.
  const [picked, setPicked] = React.useState(null)
  // Every route the Host can read, with the metadata that names and draws
  // it. The switcher offers the configured ones; the metadata of the rest
  // still names the route when it is the one being read.
  const [directory, setDirectory] = React.useState([])
  const lastModelProvider = React.useRef(null)

  /** The routes this installation can read, for the switcher. */
  const available = directory.filter((entry) => entry.configured)

  /**
   * The directory entry for one route, when the Host named it.
   * @param {string} route Provider route.
   * @returns {object | undefined} The entry.
   */
  const entryOf = React.useCallback(
    (route) => directory.find((entry) => entry.route === route),
    [directory],
  )

  /**
   * Name a route from its metadata, falling back to the route id.
   * @param {string} route Provider route.
   * @returns {string} The display name.
   */
  const nameOf = React.useCallback((route) => pickName(entryOf(route), route), [entryOf])

  /**
   * The mark for a route, from its metadata.
   * @param {string} route Provider route.
   * @returns {{icon?: string, letter?: string, color: string}} The mark.
   */
  const markFor = (route) => markOf(entryOf(route), route)

  // The switcher is a single row of marks. When they cannot all fit, the
  // tail moves into a menu behind a button on the right, so the strip never
  // wraps or clips. Width is measured rather than assumed.
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [stripWidth, setStripWidth] = React.useState(0)
  const stripRef = React.useRef(null)

  // A session that has not taken a turn yet has no `modelSelection` to
  // read, and rendering nothing there would leave the composer without a
  // badge until the first message. Ask what a new session would use — the
  // installation's default, which the model selector also falls back to.
  const [defaultProvider, setDefaultProvider] = React.useState(null)
  // The provider's own platform status, fetched with the panel. The view
  // carries its provider, so a reading for the route that was selected a
  // moment ago is never shown against the current one.
  const [providerStatus, setProviderStatus] = React.useState(null)
  // The pricing schedule the vendor meters by, when it publishes one.
  const [schedule, setSchedule] = React.useState(null)
  // The models the switch button offers. The Host's catalog is the same one
  // the composer's model seat reads, so the two always agree on which
  // models exist.
  const [modelList, setModelList] = React.useState([])
  // 'idle' before the list was ever opened, then 'loading', 'ready', 'empty'
  // or 'error'.
  const [modelListState, setModelListState] = React.useState('idle')
  const [modelError, setModelError] = React.useState(null)
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  // The model being switched to, while the Host performs the switch.
  const [switchingModel, setSwitchingModel] = React.useState(null)
  // The wrapper that holds the switch button and its list, so a click on
  // either of them does not dismiss the list.
  const modelWrapRef = React.useRef(null)
  // The Host's model catalog, kept for a minute: it changes only when a
  // provider changes what it advertises, and every open of the list reads
  // the same document.
  const catalogRef = React.useRef({ value: null, at: 0 })

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

  const provider = selected ?? defaultProvider

  // Dropping the override belongs to the model *changing*, not to every
  // render, so the previous selection is compared rather than reset
  // blindly. A model switch inside one provider also resets it.
  const selectionKey = `${provider ?? ''}\u0000${selectedModel ?? ''}`
  React.useEffect(() => {
    if (lastModelProvider.current === selectionKey) return
    lastModelProvider.current = selectionKey
    setPicked(null)
  })

  // The provider the card is pointed at, and the model whose plan it reads.
  // Pointing the card at a *different* route has no model context, so the
  // Host falls back to the provider's own choice.
  const activeProvider = picked ?? provider
  const activeModel = picked === null || picked === provider ? selectedModel : undefined
  // Whether the card points at the vendor the session is on. The card can
  // be pointed at another vendor to read that vendor's balance, and then
  // the switch button means something else: it would move the session
  // over, rather than pick another model of the vendor already in use.
  const inUse = activeProvider === provider
  // What the button says it will do: another model of the vendor in use,
  // or a move over to the vendor the card points at.
  const switchLabel = t(inUse ? 'detail.switchModelHere' : 'detail.switchModelThere', {
    name: nameOf(activeProvider),
  })
  // The model the session uses, when it uses one of the card's provider's
  // models. The card can point at another provider, and then none of that
  // provider's models is the current one.
  const currentModel = currentModelFor(selection, activeProvider)
  // The switch needs a session to switch and a host that can perform one.
  // A host without the Session namespace keeps the badge whole: the button
  // is simply not there.
  const sessionFace = lookupSessionFace(ctx)
  const canSwitch =
    typeof sessionId === 'string' &&
    sessionId !== '' &&
    sessionFace !== undefined &&
    typeof sessionFace.selectModel === 'function'
  // A reading belongs to the provider that produced it. Deriving the visible
  // view instead of clearing state keeps a stale reading from flashing on the
  // badge when the card points at another provider.
  const view = rawView?.provider === activeProvider ? rawView : null

  // The switcher only steers the card while it is open. Closing the card
  // returns the badge to the session's own model, which is the number the
  // composer should always describe when nothing is open.
  React.useEffect(() => {
    if (open) return
    setPicked(null)
    setMenuOpen(false)
    setModelMenuOpen(false)
  }, [open])

  // Track the strip's width so the row can decide how many marks fit. A
  // host without ResizeObserver simply shows them all.
  React.useEffect(() => {
    if (!open) return
    const node = stripRef.current
    if (!node) return
    const measure = () => setStripWidth(node.clientWidth ?? 0)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [open])

  // The panel has no close button: a click anywhere outside it dismisses it,
  // and Escape does the same for keyboard users. The listener is on the
  // document during capture so a click on a control that stops propagation
  // still closes the panel.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && root.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      // The model list is the inner surface: Escape closes it first and
      // leaves the card open.
      if (modelMenuOpen) {
        setModelMenuOpen(false)
        return
      }
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, modelMenuOpen])

  // Refresh the clock while the panel is open, and while a difference is
  // being shown — the card must fall back to the plain value on its own,
  // with no other render to trigger it. Once the difference expires this
  // effect re-runs and the interval stops.
  const showingDifference = consumptionFreshAt(view?.consumption, now)
  React.useEffect(() => {
    if (!open && !showingDifference) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open, showingDifference])

  // Ask which providers exist here when the card first opens. The answer is
  // stable for a session unless a credential changes, so this is not polled.
  React.useEffect(() => {
    if (!open) return
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
  }, [open])

  React.useEffect(() => {
    if (!activeProvider) {
      setView(null)
      setLoading(false)
      return
    }
    let cancelled = false
    let handle
    setLoading(true)

    /** One unary read, used when the stream is unavailable or fails. */
    const readOnce = async (api, model) => {
      try {
        let result = await api.balance(activeProvider, model)
        // A Host that predates the model argument rejects the extra field.
        // Retry with an explicit undefined second argument: the wire layer
        // omits it, and the client descriptor still sees the two arguments it
        // declares. Calling with one argument never reaches the Host.
        if (!result.ok && model !== undefined) {
          result = await api.balance(activeProvider, undefined)
        }
        if (cancelled) return
        if (!result.ok) {
          const detail =
            typeof result.error?.message === 'string'
              ? result.error.message
              : typeof result.error === 'string'
                ? result.error
                : 'balance reading failed'
          throw new Error(detail)
        }
        setView(result.value)
      } catch (error) {
        console.error('[model-allowance] reading failed', {
          provider: activeProvider,
          model,
          error,
        })
        if (!cancelled) {
          setView({
            provider: activeProvider,
            status: 'failed',
            kind: 'quota',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    ;(async () => {
      const api = await getBalanceApi()
      if (cancelled) return
      if (!api) {
        setView({
          provider: activeProvider,
          status: 'failed',
          kind: 'quota',
          error: 'balance namespace unavailable',
        })
        setLoading(false)
        return
      }
      const readModel = (await supportsModel(api)) ? activeModel : undefined
      if (cancelled) return

      // The Host pushes a new reading when a turn ends or the periodic
      // sweep runs, so the badge stays current without polling from the
      // browser. A host without the stream API, or a stream that fails
      // before its first frame, falls back to one unary read.
      //
      // `$stream` is a method: it reads its own connection to supervise
      // carrier generations, so detaching it into a local throws. The items
      // it yields are wrappers carrying the reading under `value`, and
      // `accept()` confirms a generation's opening value.
      const remote = ctx.remote
      if (typeof remote?.$stream === 'function' && typeof api.watch === 'function') {
        try {
          handle = remote.$stream({
            name: 'balance',
            open: (signal) => api.watch(activeProvider, readModel, signal),
            ended: () => new Error('balance stream ended'),
          })
        } catch (error) {
          console.error('[model-allowance] opening the reading stream failed', { error })
          handle = undefined
        }
        if (handle) {
          let received = false
          try {
            for await (const item of handle) {
              if (cancelled) return
              const frame = item?.value
              if (frame === undefined) continue
              received = true
              setView(frame)
              setLoading(false)
              item?.accept?.()
            }
          } catch (error) {
            if (!cancelled) {
              console.error('[model-allowance] reading stream failed', {
                provider: activeProvider,
                error,
              })
            }
          } finally {
            // A stream that produced nothing leaves the badge loading
            // forever, so answer the same question the unary call would.
            if (!cancelled && !received) await readOnce(api, readModel)
          }
          return
        }
      }

      await readOnce(api, readModel)
    })()

    return () => {
      cancelled = true
      handle?.dispose?.()
    }
  }, [activeProvider, activeModel, ctx])

  // The badge dot speaks for the platform: green while the service is
  // available, red once its own status page says otherwise. It is read for
  // the provider the badge speaks for, not only while the panel is open,
  // and refreshed on the same slow clock the Host caches it with.
  React.useEffect(() => {
    if (!activeProvider) return undefined
    let cancelled = false
    const readStatus = async () => {
      try {
        const api = await getBalanceApi()
        if (!api || typeof api.status !== 'function') return
        const result = await api.status(activeProvider)
        if (cancelled || !result.ok) return
        setProviderStatus(result.value)
      } catch (error) {
        console.error('[model-allowance] reading provider status failed', { error })
      }
    }
    void readStatus()
    const timer = setInterval(readStatus, STATUS_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [activeProvider])

  // The pricing schedule is static data: read it as soon as the provider
  // is known so the card opens with it, and let the card's own clock drive
  // the countdown from then on.
  React.useEffect(() => {
    if (!activeProvider) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const api = await getBalanceApi()
        if (!api || typeof api.schedule !== 'function') return
        const result = await api.schedule(activeProvider)
        if (cancelled || !result.ok) return
        setSchedule(result.value)
      } catch (error) {
        console.error('[model-allowance] reading the pricing schedule failed', { error })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeProvider])

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const api = await getBalanceApi()
      if (!api) return
      const readModel = (await supportsModel(api)) ? activeModel : undefined
      let result = await api.refresh(activeProvider, readModel)
      // Same old-Host fallback as the opening read: keep the argument count
      // the descriptor declares and let the wire layer omit the undefined.
      if (!result.ok && readModel !== undefined) {
        result = await api.refresh(activeProvider, undefined)
      }
      if (result.ok) setView(result.value)
      // Status has its own cache, so a refresh asks again and takes
      // whatever the Host considers fresh.
      if (typeof api.status === 'function') {
        const status = await api.status(activeProvider)
        if (status.ok) setProviderStatus(status.value)
      }
    } catch (error) {
      console.error('[model-allowance] refresh failed', {
        provider: activeProvider,
        model: activeModel,
        error,
      })
    } finally {
      setRefreshing(false)
    }
  }, [activeProvider, activeModel])

  /**
   * Show the models of the provider the card points at.
   * @param {object | null} catalog The Host's model catalog.
   */
  const showModels = React.useCallback(
    (catalog) => {
      const models = modelsForProvider(catalog, activeProvider)
      setModelList(models)
      setModelListState(models.length > 0 ? 'ready' : 'empty')
    },
    [activeProvider],
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
   * @param {{id: string, reasoning?: {defaultEffort?: string}}} model The model to switch to.
   */
  const switchToModel = React.useCallback(
    async (model) => {
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
        const effort = model.reasoning?.defaultEffort
        const result = await face.selectModel({
          sessionId,
          provider: activeProvider,
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
    [ctx, sessionId, activeProvider, t],
  )

  const label = React.useMemo(() => {
    if (!provider) return ''
    if (!view) return t('badge.loading')
    if (view.status === 'ready') {
      if (view.kind === 'amount' && typeof view.amount === 'number') {
        return t('badge.amount', { amount: formatAmount(view.amount, view.currency) })
      }
      // A window at zero means the account is out of allowance right now,
      // whichever window ran out; saying "0%" is the fact a user needs at
      // a glance.
      const windows = Array.isArray(view.windows) ? view.windows : []
      const exhausted = windows.some(
        (window) => typeof window.remainingPercent === 'number' && window.remainingPercent <= 0,
      )
      // Otherwise the badge speaks for the shortest window — the 5-hour
      // one on a coding plan — because that is the allowance a turn spends
      // first, so it is the number that moves. The panel breaks every
      // window down.
      const percent = exhausted ? 0 : (shortestWindow(windows)?.remainingPercent ?? view.percent)
      if (typeof percent === 'number') {
        return t('badge.quotaPercent', { percent: Math.round(percent) })
      }
      if (typeof view.remainingMs === 'number') {
        return t('badge.quotaDuration', {
          duration: formatDuration(view.remainingMs, t),
        })
      }
      if (typeof view.remaining === 'number' && typeof view.total === 'number') {
        return t('badge.quotaRatio', { remaining: view.remaining, total: view.total })
      }
      if (typeof view.remaining === 'number') {
        return t('badge.quotaRatio', { remaining: view.remaining, total: '—' })
      }
      // Ready, but this provider reported nothing the badge can show.
      // "Loading…" here would claim a request that already finished.
      return t('badge.noData')
    }
    if (view.status === 'unsupported') {
      const name = nameOf(activeProvider)
      return t('badge.unsupportedWithName', { name })
    }
    if (view.status === 'unconfigured') return t('badge.unconfigured')
    return t('badge.failed')
  }, [view, provider, activeProvider, nameOf, t])

  if (!provider) return null

  // Which platform light the badge shows. A status reading for another
  // route — or none yet — is not evidence about this one, so it stays
  // grey rather than claiming the platform is fine.
  const serviceState =
    providerStatus && providerStatus.provider === activeProvider ? providerStatus.state : 'unknown'

  // How many marks fit on one row. Each mark is `MARK_SIZE` plus the gap;
  // the menu button, when it appears, needs its own slot. An unmeasured
  // strip (no host observer) keeps every mark visible.
  const MARK_SIZE = 26
  const MARK_GAP = 4
  const MENU_SIZE = 26
  const perMark = MARK_SIZE + MARK_GAP
  let visibleCount = available.length
  if (stripWidth > 0 && available.length * perMark - MARK_GAP > stripWidth) {
    visibleCount = Math.max(1, Math.floor((stripWidth - MENU_SIZE - MARK_GAP) / perMark))
    visibleCount = Math.min(visibleCount, available.length - 1)
  }
  let shown = available.slice(0, visibleCount)
  let overflow = available.slice(visibleCount)
  // The provider being read stays visible; it is the one the card is about.
  const activeIndex = overflow.findIndex((entry) => entry.route === activeProvider)
  if (activeIndex >= 0 && shown.length > 0) {
    const displaced = shown[shown.length - 1]
    shown = [...shown.slice(0, -1), overflow[activeIndex]]
    overflow = [...overflow.slice(0, activeIndex), displaced, ...overflow.slice(activeIndex + 1)]
  }

  /** One provider mark. */
  const markButton = (entry) => {
    const mark = markFor(entry.route)
    const name = nameOf(entry.route)
    return h(
      'button',
      {
        type: 'button',
        key: entry.route,
        role: 'tab',
        className: 'dsh-model-allowance-tab',
        'data-active': entry.route === activeProvider ? 'true' : 'false',
        'aria-selected': entry.route === activeProvider ? 'true' : 'false',
        'aria-label': name,
        title: name,
        style: { '--provider-mark': mark.color },
        onClick: () => {
          setPicked(entry.route)
          setMenuOpen(false)
        },
      },
      providerIcon(entry.route, 14, mark),
    )
  }

  /**
   * Move focus through the provider strip with the arrow keys.
   *
   * A `role="tablist"` is expected to support roving focus; without this the
   * strip is only reachable with Tab, which skips the marks once a menu opens.
   */
  const onTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
    if (tabs.length === 0) return
    const index = tabs.indexOf(document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    event.preventDefault()
    tabs[next]?.focus()
  }

  return h(
    'div',
    {
      ref: rootRef,
      className: 'dsh-model-allowance-root',
      'data-service': serviceState,
      'data-loading': loading ? 'true' : 'false',
    },
    // Component-local styles: React removes them with the component, and
    // every colour comes from a theme token so light and dark both follow.
    h('style', { key: 'styles' }, STYLES),
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-model-allowance-badge',
        'data-provider': activeProvider,
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': open ? 'dsh-model-allowance-panel' : undefined,
        onClick: () => setOpen((value) => !value),
      },
      h('span', { className: 'dsh-model-allowance-dot', 'aria-hidden': true }),
      h('span', { className: 'dsh-model-allowance-label' }, label),
      // How far the number moved since the last reading, for a few seconds
      // after it lands. The arrow follows the number shown beside it: down
      // means the balance fell.
      showingDifference
        ? h(
            'span',
            {
              className: 'dsh-model-allowance-delta',
              'data-direction': view.consumption.delta < 0 ? 'down' : 'up',
              title: t('badge.consumption'),
            },
            `${view.consumption.delta < 0 ? '↓' : '↑'}${formatDelta(view.consumption)}`,
          )
        : null,
    ),
    open
      ? h(
          'div',
          {
            className: 'dsh-model-allowance-panel',
            id: 'dsh-model-allowance-panel',
            role: 'dialog',
            'aria-label': t('detail.title'),
          },
          // With more than one readable provider the card opens a switcher;
          // with one there is nothing to switch, so it just names it.
          available.length > 1
            ? h(
                // The clipping strip and the menu are siblings: the strip
                // hides what does not fit, and the menu would be clipped
                // with it if it lived inside.
                'div',
                { className: 'dsh-model-allowance-switcher-wrap' },
                h(
                  'div',
                  {
                    ref: stripRef,
                    className: 'dsh-model-allowance-switcher',
                    role: 'tablist',
                    'aria-label': t('detail.provider'),
                    onKeyDown: onTabKeyDown,
                  },
                  ...shown.map(markButton),
                  overflow.length > 0
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-model-allowance-more',
                          'aria-haspopup': 'menu',
                          'aria-expanded': menuOpen ? 'true' : 'false',
                          'aria-label': t('detail.moreProviders'),
                          title: t('detail.moreProviders'),
                          onClick: () => setMenuOpen((value) => !value),
                        },
                        '⋯',
                      )
                    : null,
                ),
                menuOpen && overflow.length > 0
                  ? h(
                      'div',
                      { className: 'dsh-model-allowance-menu', role: 'menu' },
                      ...overflow.map((entry) =>
                        h(
                          'button',
                          {
                            type: 'button',
                            key: entry.route,
                            role: 'menuitem',
                            className: 'dsh-model-allowance-menu-item',
                            onClick: () => {
                              setPicked(entry.route)
                              setMenuOpen(false)
                            },
                          },
                          h(
                            'span',
                            {
                              className: 'dsh-model-allowance-menu-mark',
                              style: { '--provider-mark': markFor(entry.route).color },
                            },
                            providerIcon(entry.route, 11, markFor(entry.route)),
                          ),
                          h('span', null, nameOf(entry.route)),
                        ),
                      ),
                    )
                  : null,
              )
            : h(
                'div',
                { className: 'dsh-model-allowance-row' },
                h('span', null, t('detail.provider')),
                h('span', null, nameOf(activeProvider)),
              ),
          view?.kind === 'amount' && typeof view.amount === 'number'
            ? h(
                'div',
                { className: 'dsh-model-allowance-row' },
                h('span', null, t('detail.amount')),
                h('span', null, formatAmount(view.amount, view.currency)),
              )
            : null,
          // A metered plan reports one block per window. Each shows how much
          // of its allowance is spent as one bar you can read at a glance,
          // then when it comes back.
          ...(Array.isArray(view?.windows) && view.windows.length > 0
            ? view.windows.map((window, index) => {
                const consumed = windowUsedPercent(window)
                const percent =
                  consumed === undefined ? undefined : Math.max(0, Math.round(consumed))
                const filled = consumed === undefined ? 0 : Math.min(100, Math.max(0, consumed))
                const usage = windowUsage(window, t)
                return h(
                  'div',
                  {
                    className: 'dsh-model-allowance-window',
                    key: `w-${String(index)}`,
                    // The first block needs no divider: the switcher above
                    // it already ends in one, and a bare provider row does
                    // not deserve a line either. Only the boundaries
                    // *between* windows are drawn.
                    'data-first': index === 0 ? 'true' : undefined,
                  },
                  h(
                    'div',
                    { className: 'dsh-model-allowance-window-head' },
                    h(
                      'span',
                      { className: 'dsh-model-allowance-window-title' },
                      windowTitle(window, t),
                    ),
                    // Countable units sit beside the title; a plan that
                    // reports only a percentage has none to show.
                    usage === undefined
                      ? null
                      : h('span', { className: 'dsh-model-allowance-usage' }, usage),
                  ),
                  percent === undefined
                    ? null
                    : h(
                        'div',
                        { className: 'dsh-model-allowance-percent' },
                        t('window.usedPercent', { percent }),
                      ),
                  percent === undefined
                    ? null
                    : h(
                        'div',
                        {
                          className: 'dsh-model-allowance-bar',
                          role: 'progressbar',
                          'aria-valuenow': percent,
                          'aria-valuemin': 0,
                          'aria-valuemax': 100,
                          'aria-valuetext': t('window.usedPercent', { percent }),
                        },
                        h('div', {
                          className: 'dsh-model-allowance-bar-fill',
                          'data-tone': barTone(percent),
                          style: { width: `${String(filled)}%` },
                        }),
                      ),
                  // A window with zero usage has not started its rolling timer
                  // yet, so the countdown would be misleading. Hide it until
                  // consumption begins.
                  typeof window.resetAt === 'number' &&
                    (typeof window.remainingPercent !== 'number' || window.remainingPercent < 100)
                    ? h(
                        'div',
                        { className: 'dsh-model-allowance-foot' },
                        h(
                          'span',
                          null,
                          t('window.resetIn', {
                            duration: formatCountdown(window.resetAt - now),
                          }),
                        ),
                        h('span', null, formatResetAt(window.resetAt)),
                      )
                    : null,
                )
              })
            : []),
          // A single scalar reading has no windows to break down.
          !Array.isArray(view?.windows) && typeof view?.remainingMs === 'number'
            ? h(
                'div',
                { className: 'dsh-model-allowance-row' },
                h('span', null, t('detail.remaining')),
                h('span', null, formatDuration(view.remainingMs, t)),
              )
            : null,
          !Array.isArray(view?.windows) && typeof view?.remaining === 'number'
            ? h(
                'div',
                { className: 'dsh-model-allowance-row' },
                h('span', null, t('detail.remaining')),
                h('span', null, String(view.remaining)),
              )
            : null,
          !Array.isArray(view?.windows) && typeof view?.total === 'number'
            ? h(
                'div',
                { className: 'dsh-model-allowance-row' },
                h('span', null, t('detail.total')),
                h('span', null, String(view.total)),
              )
            : null,
          view?.status === 'failed'
            ? h(
                'div',
                { className: 'dsh-model-allowance-error' },
                t('detail.error'),
                // The Host reports why a reading failed; showing it is what
                // turns "it does not work" into something actionable.
                view.error
                  ? h('div', { className: 'dsh-model-allowance-reason' }, view.error)
                  : null,
              )
            : null,
          view?.status === 'unsupported'
            ? h(
                'div',
                { className: 'dsh-model-allowance-reason' },
                t('badge.unsupportedWithName', { name: nameOf(activeProvider) }),
              )
            : null,
          view?.status === 'unconfigured'
            ? h('div', { className: 'dsh-model-allowance-reason' }, t('badge.unconfigured'))
            : null,
          // A vendor that prices by the wall clock gets its phase and
          // countdown here, above the footer.
          schedule && schedule.provider === activeProvider ? scheduleView(schedule, now, t) : null,
          h(
            'div',
            { className: 'dsh-model-allowance-actions' },
            // The platform status sits at the left edge of the footer, on
            // the same line as the reading time: the card gains no extra
            // row, and the state and the source page stay together.
            serviceState !== 'unknown'
              ? h(
                  'span',
                  { className: 'dsh-model-allowance-status-wrap' },
                  h(
                    providerStatus.url ? 'a' : 'span',
                    {
                      className: 'dsh-model-allowance-status',
                      'data-state': providerStatus.state,
                      ...(providerStatus.url
                        ? {
                            href: providerStatus.url,
                            target: '_blank',
                            rel: 'noreferrer noopener',
                          }
                        : {}),
                    },
                    h('span', {
                      className: 'dsh-model-allowance-status-dot',
                      'aria-hidden': true,
                    }),
                    h(
                      'span',
                      { className: 'dsh-model-allowance-status-label' },
                      statusLabel(providerStatus.state, t),
                    ),
                    ...(providerStatus.url
                      ? [
                          h(
                            'span',
                            {
                              className: 'dsh-model-allowance-status-arrow',
                              'aria-hidden': true,
                            },
                            '↗',
                          ),
                        ]
                      : []),
                  ),
                  // The reason is a warning mark rather than another line:
                  // the footer stays one row, and the detail is one hover
                  // — or one keyboard focus — away.
                  providerStatus.summary
                    ? h(
                        'span',
                        {
                          className: 'dsh-model-allowance-status-help',
                          tabIndex: 0,
                          role: 'note',
                          'aria-label': providerStatus.summary,
                        },
                        h(
                          'span',
                          {
                            'aria-hidden': true,
                          },
                          '!',
                        ),
                        h(
                          'span',
                          { className: 'dsh-model-allowance-status-tip', role: 'tooltip' },
                          providerStatus.summary,
                        ),
                      )
                    : null,
                )
              : null,
            view?.updatedAt
              ? h(
                  'span',
                  { className: 'dsh-model-allowance-updated' },
                  t('detail.updatedAt', { time: formatClock(view.updatedAt) }),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-model-allowance-icon-button',
                onClick: refresh,
                disabled: refreshing,
                title: refreshing ? t('detail.refreshing') : t('detail.refresh'),
                'aria-label': refreshing ? t('detail.refreshing') : t('detail.refresh'),
              },
              refreshGlyph(16),
            ),
            view?.consoleUrl
              ? h(
                  'a',
                  {
                    className: 'dsh-model-allowance-icon-button',
                    href: view.consoleUrl,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                    title: t('detail.console'),
                    'aria-label': t('detail.console'),
                  },
                  consoleGlyph(16),
                )
              : null,
            // The switch to another model of this provider. It sits to the
            // right of the console link, which is the last thing the footer
            // offered before, so the two never trade places.
            canSwitch
              ? h(
                  'span',
                  { ref: modelWrapRef, className: 'dsh-model-allowance-model-wrap' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-model-allowance-icon-button',
                      'aria-haspopup': 'menu',
                      'aria-expanded': modelMenuOpen ? 'true' : 'false',
                      // The vendor in use paints the glyph in its own
                      // colour, so the button says which vendor the card is
                      // on instead of the strip having to say it twice.
                      'data-in-use': inUse ? 'true' : 'false',
                      style: { '--provider-mark': markFor(activeProvider).color },
                      title: switchLabel,
                      'aria-label': switchLabel,
                      onClick: () => {
                        setModelError(null)
                        setModelMenuOpen((value) => !value)
                      },
                    },
                    modelGlyph(16),
                  ),
                  modelMenuOpen
                    ? h(
                        'div',
                        {
                          className: 'dsh-model-allowance-model-menu',
                          role: 'menu',
                          'aria-label': t('model.title'),
                        },
                        modelListState === 'loading'
                          ? h(
                              'div',
                              { className: 'dsh-model-allowance-model-message' },
                              t('model.loading'),
                            )
                          : null,
                        modelListState === 'empty'
                          ? h(
                              'div',
                              { className: 'dsh-model-allowance-model-message' },
                              t('model.empty'),
                            )
                          : null,
                        modelListState === 'error'
                          ? h(
                              'div',
                              {
                                className: 'dsh-model-allowance-model-message',
                                'data-tone': 'error',
                              },
                              modelError ?? t('model.unavailable'),
                            )
                          : null,
                        ...modelList.map((model) => {
                          const isCurrent = model.id === currentModel
                          return h(
                            'button',
                            {
                              type: 'button',
                              key: model.id,
                              role: 'menuitemradio',
                              'aria-checked': isCurrent ? 'true' : 'false',
                              'data-current': isCurrent ? 'true' : 'false',
                              className: 'dsh-model-allowance-model-item',
                              disabled: switchingModel !== null,
                              title: model.id,
                              onClick: () => {
                                void switchToModel(model)
                              },
                            },
                            h(
                              'span',
                              { className: 'dsh-model-allowance-model-name' },
                              model.name ?? model.id,
                            ),
                            switchingModel === model.id
                              ? h(
                                  'span',
                                  { className: 'dsh-model-allowance-model-note' },
                                  t('model.switching'),
                                )
                              : isCurrent
                                ? h(
                                    'span',
                                    { className: 'dsh-model-allowance-model-note' },
                                    t('model.current'),
                                  )
                                : null,
                          )
                        }),
                        // A failed switch keeps the list open and says why.
                        modelError && modelListState !== 'error'
                          ? h(
                              'div',
                              {
                                className: 'dsh-model-allowance-model-message',
                                'data-tone': 'error',
                              },
                              modelError,
                            )
                          : null,
                      )
                    : null,
                )
              : null,
          ),
        )
      : null,
  )
}
