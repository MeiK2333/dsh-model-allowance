import { createElement as h } from 'react'
import { formatAmount, formatClock, formatDuration, formatResetAt } from '../format.js'
import { consoleGlyph, modelGlyph, refreshGlyph } from '../icons.js'
import { statusLabel } from '../locales.js'
import { formatCountdown, scheduleView } from '../schedule.js'
import { barTone, windowTitle, windowUsage, windowUsedPercent } from '../windows.js'
import { EffortFlyout } from './effort-flyout.js'
import { ModelMenu } from './model-menu.js'
import { ProviderStrip } from './provider-strip.js'

/**
 * The detail panel the badge opens: the provider switcher, the reading
 * broken down per window, the platform status, and the actions.
 * @param {object} props Everything the panel shows and does.
 * @param {(key: string, params?: object) => string} props.t Translator.
 * @param {number} props.now The panel's clock, for the countdowns.
 * @param {object | null} props.view The reading the card is showing.
 * @param {string | null} props.activeProvider The route the card points at.
 * @param {object[]} props.available The configured directory entries.
 * @param {object | null} props.schedule The pricing schedule, when published.
 * @param {object | null} props.currentStatus The platform status reading for this route.
 * @param {string} props.serviceState The projected platform state.
 * @param {() => Promise<void>} props.refresh Refreshes the reading.
 * @param {boolean} props.refreshing Whether a refresh is in flight.
 * @param {boolean} props.canSwitch Whether the session can switch models.
 * @param {boolean} props.inUse Whether the card points at the session's vendor.
 * @param {string} props.switchLabel The switch button's label.
 * @param {string | undefined} props.selectedEffort The effort the session picked.
 * @param {(route: string) => void} props.setPicked Points the card at a route.
 * @param {(route: string) => string} props.nameOf Name lookup.
 * @param {(route: string) => {icon?: string, letter?: string, color: string}} props.markFor Mark lookup.
 * @param {object} props.catalog The model list hook bundle.
 * @param {boolean} props.menuOpen Whether the switcher's overflow menu is open.
 * @param {(next: boolean | ((value: boolean) => boolean)) => void} props.setMenuOpen Sets the overflow menu open state.
 * @param {number} props.stripWidth The switcher's measured width.
 * @param {(width: number) => void} props.setStripWidth Reports the measured width.
 * @param {object} props.stripRef Ref on the clipping strip node.
 * @returns {React.ReactElement} The panel.
 */
export function BalancePanel({
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
}) {
  return h(
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
      ? h(ProviderStrip, {
          t,
          available,
          activeProvider,
          markFor,
          nameOf,
          onPick: setPicked,
          menuOpen,
          setMenuOpen,
          stripWidth,
          setStripWidth,
          stripRef,
        })
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
          const percent = consumed === undefined ? undefined : Math.max(0, Math.round(consumed))
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
              h('span', { className: 'dsh-model-allowance-window-title' }, windowTitle(window, t)),
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
          view.error ? h('div', { className: 'dsh-model-allowance-reason' }, view.error) : null,
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
      h(
        'span',
        { className: 'dsh-model-allowance-status-wrap' },
        h(
          currentStatus?.url ? 'a' : 'span',
          {
            className: 'dsh-model-allowance-status',
            'data-state': serviceState,
            ...(currentStatus?.url
              ? {
                  href: currentStatus.url,
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
            statusLabel(serviceState, t),
          ),
          ...(currentStatus?.url
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
        currentStatus?.summary
          ? h(
              'span',
              {
                className: 'dsh-model-allowance-status-help',
                tabIndex: 0,
                role: 'note',
                'aria-label': currentStatus.summary,
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
                currentStatus.summary,
              ),
            )
          : null,
      ),
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
            { ref: catalog.modelWrapRef, className: 'dsh-model-allowance-model-wrap' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-model-allowance-icon-button',
                'aria-haspopup': 'menu',
                'aria-expanded': catalog.modelMenuOpen ? 'true' : 'false',
                // The vendor in use paints the glyph in its own
                // colour, so the button says which vendor the card is
                // on instead of the strip having to say it twice.
                'data-in-use': inUse ? 'true' : 'false',
                style: { '--provider-mark': markFor(activeProvider).color },
                title: switchLabel,
                'aria-label': switchLabel,
                onClick: catalog.toggleModelMenu,
              },
              modelGlyph(16),
            ),
            catalog.modelMenuOpen
              ? h(ModelMenu, {
                  t,
                  models: catalog.shownModelList,
                  state: catalog.shownModelListState,
                  modelError: catalog.modelError,
                  currentModel: catalog.currentModel,
                  switchingModel: catalog.switchingModel,
                  switchToModel: catalog.switchToModel,
                  modelWrapRef: catalog.modelWrapRef,
                  showEffortFlyout: catalog.showEffortFlyout,
                  scheduleEffortFlyoutClose: catalog.scheduleEffortFlyoutClose,
                })
              : null,
            // The effort flyout is a sibling of the list, not a
            // child: the list scrolls, and a nested panel would be
            // clipped by it.
            catalog.modelMenuOpen &&
              catalog.hoverModel !== null &&
              catalog.shownModelList.includes(catalog.hoverModel.model)
              ? h(EffortFlyout, {
                  t,
                  hoverModel: catalog.hoverModel,
                  currentModel: catalog.currentModel,
                  selectedEffort,
                  switchingModel: catalog.switchingModel,
                  switchToModel: catalog.switchToModel,
                  keepEffortFlyout: catalog.keepEffortFlyout,
                  scheduleEffortFlyoutClose: catalog.scheduleEffortFlyoutClose,
                })
              : null,
          )
        : null,
    ),
  )
}
