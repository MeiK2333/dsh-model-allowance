import { createElement as h } from 'react'
import { effortChoices } from '../models.js'

/**
 * The effort flyout is a sibling of the list, not a child: the list
 * scrolls, and a nested panel would be clipped by it. Sharing the hover
 * with the row keeps it open while the pointer crosses over.
 * @param {object} props The hovered model and the switch it offers.
 * @param {(key: string, params?: object) => string} props.t Translator.
 * @param {{model: object, top: number}} props.hoverModel The hovered model with the flyout offset.
 * @param {string | undefined} props.currentModel The id the session uses.
 * @param {string | undefined} props.selectedEffort The effort the session picked.
 * @param {string | null} props.switchingModel The id being switched to.
 * @param {(model: object, effort?: string) => Promise<void>} props.switchToModel Performs the switch.
 * @param {() => void} props.keepEffortFlyout Cancels the pending close.
 * @param {(id: string) => void} props.scheduleEffortFlyoutClose Closes the flyout after a beat.
 * @returns {React.ReactElement} The flyout.
 */
export function EffortFlyout({
  t,
  hoverModel,
  currentModel,
  selectedEffort,
  switchingModel,
  switchToModel,
  keepEffortFlyout,
  scheduleEffortFlyoutClose,
}) {
  return h(
    'div',
    {
      className: 'dsh-model-allowance-effort-menu',
      role: 'menu',
      'aria-label': t('model.title'),
      style: { top: `${hoverModel.top}px` },
      onMouseEnter: keepEffortFlyout,
      onMouseLeave: () => {
        scheduleEffortFlyoutClose(hoverModel.model.id)
      },
    },
    ...effortChoices(hoverModel.model).map((effort) => {
      const isCurrentEffort = hoverModel.model.id === currentModel && effort.id === selectedEffort
      return h(
        'button',
        {
          type: 'button',
          key: effort.id ?? 'provider-default',
          role: 'menuitemradio',
          'aria-checked': isCurrentEffort ? 'true' : 'false',
          'data-current': isCurrentEffort ? 'true' : 'false',
          'data-default': effort.isDefault ? 'true' : 'false',
          className: 'dsh-model-allowance-effort-item',
          disabled: switchingModel !== null,
          onClick: () => {
            void switchToModel(hoverModel.model, effort.id)
          },
        },
        h(
          'span',
          { className: 'dsh-model-allowance-model-name' },
          effort.providerDefault ? t('model.effortDefault') : effort.name,
        ),
        effort.isDefault && !isCurrentEffort
          ? h('span', { className: 'dsh-model-allowance-model-note' }, t('model.effortDefault'))
          : null,
      )
    }),
  )
}
