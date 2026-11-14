import * as React from 'react'
import { createElement as h } from 'react'
import { BalancePanel } from './components/balance-panel.js'
import {
  consumptionFreshAt,
  formatAmount,
  formatDelta,
  formatDuration,
  STATUS_REFRESH_MS,
} from './format.js'
import { readProviderStatus, useBalanceStream } from './hooks/use-balance-stream.js'
import { useDismiss } from './hooks/use-dismiss.js'
import { useModelCatalog } from './hooks/use-model-catalog.js'
import { entryCovers, useProviderDirectory } from './hooks/use-provider-directory.js'
import { markOf } from './icons.js'
import { getBalanceApi, lookupSessionFace, supportsModel } from './namespace.js'
import { STYLES } from './styles.js'
import { shortestWindow } from './windows.js'

export { entryCovers }

/**
 * Project a status reading onto the states the card can present.
 *
 * The Host uses `unknown` without a URL or error only when the vendor has no
 * status source. A failed source keeps its URL or error, so it remains
 * distinguishable from an unsupported one without another wire field.
 *
 * @param {{state: string, url?: string, error?: string} | null} status Current reading.
 * @returns {string} A shared status state, `loading`, or `unsupported`.
 */
export function statusDisplayState(status) {
  if (status === null) return 'loading'
  if (status.state === 'unknown' && !status.url && !status.error) return 'unsupported'
  return status.state
}

/**
 * The badge and its detail popover.
 *
 * The read states the verification harness addresses by hook-slot index —
 * the reading, the open state, the panel root, the clock, and the switcher
 * strip's measured width — stay declared here, in this order; the hooks
 * below take them in and install their own state after them.
 *
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
  const selectedEffort =
    selection?.next?.reasoningEffort ?? selection?.lastUsed?.reasoningEffort ?? undefined
  // The session this badge belongs to. A session-scoped slot carries its
  // id, and the Host's switch needs it.
  const sessionId = props.sessionId

  // The reading the stream or a refresh last produced, and whether it is
  // being read. The state lives here so the hook-slot layout of the
  // component stays stable; the stream hook below installs the effect.
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
  // The switcher's overflow menu is controlled from here so closing the
  // card also closes the menu.
  const [menuOpen, setMenuOpen] = React.useState(false)
  // The provider's own platform status, fetched with the panel. The view
  // carries its provider, so a reading for the route that was selected a
  // moment ago is never shown against the current one.
  const [providerStatus, setProviderStatus] = React.useState(null)
  // The pricing schedule the vendor meters by, when it publishes one.
  const [schedule, setSchedule] = React.useState(null)
  // Dropping the override belongs to the model *changing*, not to every
  // render, so the previous selection is compared rather than reset
  // blindly. A model switch inside one provider also resets it.
  const lastModelProvider = React.useRef(null)

  // The switcher only steers the card while it is open. Closing the card
  // returns the badge to the session's own model, which is the number the
  // composer should always describe when nothing is open.
  React.useEffect(() => {
    if (open) return
    setPicked(null)
    setMenuOpen(false)
  }, [open])

  // The switcher strip's measured width and its node: the strip measures
  // itself when it mounts and reports the width back through here.
  const [stripWidth, setStripWidth] = React.useState(0)
  const stripRef = React.useRef(null)

  // The Host's provider directory, the installation's default provider,
  // and the helpers that name and match a route from directory metadata.
  const { available, defaultProvider, entryOf, nameOf } = useProviderDirectory(selected)
  const provider = selected ?? defaultProvider

  // The provider the card is pointed at, and the model whose plan it reads.
  // Pointing the card at a *different* route has no model context, so the
  // Host falls back to the provider's own choice.
  const activeProvider = picked ?? provider
  // Whether the card points at the vendor the session is on. The card can
  // be pointed at another vendor to read that vendor's balance, and then
  // the switch button means something else: it would move the session
  // over, rather than pick another model of the vendor already in use.
  // Another id of the same vendor is the same vendor, so the card still
  // counts as pointing at it.
  const inUse = activeProvider === provider || entryOf(provider)?.route === activeProvider
  const activeModel = inUse ? selectedModel : undefined
  // What the button says it will do: another model of the vendor in use,
  // or a move over to the vendor the card points at.
  const switchLabel = t(inUse ? 'detail.switchModelHere' : 'detail.switchModelThere', {
    name: nameOf(activeProvider),
  })
  // A reading belongs to the provider that produced it. Deriving the visible
  // view instead of clearing state keeps a stale reading from flashing on the
  // badge when the card points at another provider.
  const view = rawView?.provider === activeProvider ? rawView : null
  // How far the number moved since the last reading, for a few seconds
  // after it lands.
  const showingDifference = consumptionFreshAt(view?.consumption, now)

  // Refresh the clock while the panel is open, and while a difference is
  // being shown — the card must fall back to the plain value on its own,
  // with no other render to trigger it. Once the difference expires this
  // effect re-runs and the interval stops.
  React.useEffect(() => {
    if (!open && !showingDifference) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open, showingDifference])

  // The badge dot speaks for the platform: green while the service is
  // available, red once its own status page says otherwise. It is read for
  // the provider the badge speaks for, not only while the panel is open,
  // and refreshed on the same slow clock the Host caches it with.
  React.useEffect(() => {
    if (!activeProvider) return undefined
    let cancelled = false
    const readStatus = async () => {
      const status = await readProviderStatus(activeProvider)
      if (!cancelled) setProviderStatus(status)
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

  // The reading stream: the Host's stream with a unary fallback.
  useBalanceStream({ activeProvider, activeModel, ctx, setView, setLoading })

  // The Host's model catalog, the list the switch button offers, and the
  // switch itself, with the effort flyout's hover state.
  const catalog = useModelCatalog({ ctx, t, sessionId, activeProvider, entryOf, selection })

  // The panel closes on a click outside it or on Escape.
  useDismiss({
    open,
    rootRef,
    modelMenuOpen: catalog.modelMenuOpen,
    setOpen,
    setModelMenuOpen: catalog.setModelMenuOpen,
  })

  const selectionKey = `${provider ?? ''}\u0000${selectedModel ?? ''}`
  React.useEffect(() => {
    if (lastModelProvider.current === selectionKey) return
    lastModelProvider.current = selectionKey
    setPicked(null)
  })

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
      // whatever the Host considers fresh. Keep the previous reading while
      // the request is pending, then settle failures as unknown as well.
      const status = await readProviderStatus(activeProvider)
      setProviderStatus(status)
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
   * The mark for a route, from its metadata.
   * @param {string} route Provider route.
   * @returns {{icon?: string, letter?: string, color: string}} The mark.
   */
  const markFor = (route) => markOf(entryOf(route), route)

  // The switch needs a session to switch and a host that can perform one.
  // A host without the Session namespace keeps the badge whole: the button
  // is simply not there.
  const sessionFace = lookupSessionFace(ctx)
  const canSwitch =
    typeof sessionId === 'string' &&
    sessionId !== '' &&
    sessionFace !== undefined &&
    typeof sessionFace.selectModel === 'function'

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
  // grey rather than claiming the platform is fine. The same current-only
  // reading drives the card, which says loading until this route answers.
  const currentStatus = providerStatus?.provider === activeProvider ? providerStatus : null
  const serviceState = statusDisplayState(currentStatus)

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
      ? h(BalancePanel, {
          t,
          now,
          view,
          activeProvider,
          available,
          schedule,
          currentStatus,
          serviceState,
          refresh,
          refreshing,
          canSwitch,
          inUse,
          switchLabel,
          selectedEffort,
          setPicked,
          nameOf,
          markFor,
          catalog,
          menuOpen,
          setMenuOpen,
          stripWidth,
          setStripWidth,
          stripRef,
        })
      : null,
  )
}
