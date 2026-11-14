import * as React from 'react'
import { createElement as h } from 'react'
import { entryCovers } from '../hooks/use-provider-directory.js'
import { providerIcon } from '../icons.js'

/**
 * Split the switcher's marks into the row and its overflow menu.
 *
 * Each mark is `MARK_SIZE` plus the gap; the menu button, when it appears,
 * needs its own slot. An unmeasured strip (no host observer) keeps every
 * mark visible. The provider being read stays visible; it is the one the
 * card is about.
 * @param {object[]} entries The configured directory entries.
 * @param {number} stripWidth The measured strip width, or 0 before it is measured.
 * @param {string | null} activeProvider The route the card is reading.
 * @returns {{shown: object[], overflow: object[]}} The marks on the row and in the menu.
 */
export function splitStrip(entries, stripWidth, activeProvider) {
  const MARK_SIZE = 26
  const MARK_GAP = 4
  const MENU_SIZE = 26
  const perMark = MARK_SIZE + MARK_GAP
  let visibleCount = entries.length
  if (stripWidth > 0 && entries.length * perMark - MARK_GAP > stripWidth) {
    visibleCount = Math.max(1, Math.floor((stripWidth - MENU_SIZE - MARK_GAP) / perMark))
    visibleCount = Math.min(visibleCount, entries.length - 1)
  }
  let shown = entries.slice(0, visibleCount)
  let overflow = entries.slice(visibleCount)
  const activeIndex = overflow.findIndex((entry) => entryCovers(entry, activeProvider))
  if (activeIndex >= 0 && shown.length > 0) {
    const displaced = shown[shown.length - 1]
    shown = [...shown.slice(0, -1), overflow[activeIndex]]
    overflow = [...overflow.slice(0, activeIndex), displaced, ...overflow.slice(activeIndex + 1)]
  }
  return { shown, overflow }
}

/**
 * The switcher is a single row of provider marks. When they cannot all
 * fit, the tail moves into a menu behind a button on the right, so the
 * strip never wraps or clips. Width is measured rather than assumed; the
 * measured width and the strip's node live in the badge so the
 * verification harness can address them by hook slot.
 * @param {object} props The strip's data and handlers.
 * @param {(key: string, params?: object) => string} props.t Translator.
 * @param {object[]} props.available The configured directory entries.
 * @param {string | null} props.activeProvider The route the card is reading.
 * @param {(route: string) => {icon?: string, letter?: string, color: string}} props.markFor Mark lookup.
 * @param {(route: string) => string} props.nameOf Name lookup.
 * @param {(route: string) => void} props.onPick Picks the route the card reads.
 * @param {boolean} props.menuOpen Whether the overflow menu is open.
 * @param {(next: boolean | ((value: boolean) => boolean)) => void} props.setMenuOpen Sets the overflow menu open state.
 * @param {number} props.stripWidth The strip's measured width, 0 before it is measured.
 * @param {(width: number) => void} props.setStripWidth Reports the measured width.
 * @param {object} props.stripRef Ref on the clipping strip node.
 * @returns {React.ReactElement} The switcher.
 */
export function ProviderStrip({
  t,
  available,
  activeProvider,
  markFor,
  nameOf,
  onPick,
  menuOpen,
  setMenuOpen,
  stripWidth,
  setStripWidth,
  stripRef,
}) {
  // Track the strip's width so the row can decide how many marks fit. A
  // host without ResizeObserver simply shows them all.
  // The ref is read when the effect runs, not as a dependency: the node is
  // attached after the effect, and its identity never re-arms the observer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stripRef.current is a DOM node read at effect time
  React.useEffect(() => {
    const node = stripRef.current
    if (!node) return
    const measure = () => setStripWidth(node.clientWidth ?? 0)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [setStripWidth])

  const { shown, overflow } = splitStrip(available, stripWidth, activeProvider)

  /** One provider mark. */
  const markButton = (entry) => {
    const mark = markFor(entry.route)
    const name = nameOf(entry.route)
    const active = entryCovers(entry, activeProvider)
    return h(
      'button',
      {
        type: 'button',
        key: entry.route,
        role: 'tab',
        className: 'dsh-model-allowance-tab',
        'data-active': active ? 'true' : 'false',
        'aria-selected': active ? 'true' : 'false',
        'aria-label': name,
        title: name,
        style: { '--provider-mark': mark.color },
        onClick: () => {
          onPick(entry.route)
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

  // The clipping strip and the menu are siblings: the strip hides what
  // does not fit, and the menu would be clipped with it if it lived inside.
  return h(
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
                  onPick(entry.route)
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
}
