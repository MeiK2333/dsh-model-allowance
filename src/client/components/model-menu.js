import { createElement as h } from 'react'
import { effortChoices } from '../models.js'

/**
 * The model list menu behind the switch button: the loading, empty, and
 * error states, then one row per model. A model that takes a reasoning
 * effort carries an arrow and offers its choices in a flyout on hover; a
 * click takes the model at its default effort. Every other model switches
 * on the click it already had.
 * @param {object} props The list state and its handlers.
 * @param {(key: string, params?: object) => string} props.t Translator.
 * @param {object[]} props.models The models to show.
 * @param {string} props.state 'loading', 'ready', 'empty' or 'error'.
 * @param {string | null} props.modelError The last switch or load error.
 * @param {string | undefined} props.currentModel The id the session uses.
 * @param {string | null} props.switchingModel The id being switched to.
 * @param {(model: object, effort?: string) => Promise<void>} props.switchToModel Performs the switch.
 * @param {object} props.modelWrapRef Ref on the button-plus-list wrapper.
 * @param {(model: object, top: number) => void} props.showEffortFlyout Opens the flyout for a model.
 * @param {(id: string) => void} props.scheduleEffortFlyoutClose Closes the flyout after a beat.
 * @returns {React.ReactElement} The menu.
 */
export function ModelMenu({
  t,
  models,
  state,
  modelError,
  currentModel,
  switchingModel,
  switchToModel,
  modelWrapRef,
  showEffortFlyout,
  scheduleEffortFlyoutClose,
}) {
  return h(
    'div',
    {
      className: 'dsh-model-allowance-model-menu',
      role: 'menu',
      'aria-label': t('model.title'),
    },
    state === 'loading'
      ? h('div', { className: 'dsh-model-allowance-model-message' }, t('model.loading'))
      : null,
    state === 'empty'
      ? h('div', { className: 'dsh-model-allowance-model-message' }, t('model.empty'))
      : null,
    state === 'error'
      ? h(
          'div',
          {
            className: 'dsh-model-allowance-model-message',
            'data-tone': 'error',
          },
          modelError ?? t('model.unavailable'),
        )
      : null,
    ...models.map((model) => {
      const isCurrent = model.id === currentModel
      const efforts = effortChoices(model)
      const defaultEffortId = efforts?.find((effort) => effort.isDefault)?.id
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
          ...(efforts === null ? {} : { 'aria-haspopup': 'menu' }),
          onClick: () => {
            void switchToModel(model, defaultEffortId)
          },
          ...(efforts === null
            ? {}
            : {
                onMouseEnter: (event) => {
                  const wrap = modelWrapRef.current
                  if (!wrap) return
                  const top =
                    event.currentTarget.getBoundingClientRect().top -
                    wrap.getBoundingClientRect().top
                  showEffortFlyout(model, top)
                },
                onMouseLeave: () => {
                  scheduleEffortFlyoutClose(model.id)
                },
              }),
        },
        h('span', { className: 'dsh-model-allowance-model-name' }, model.name ?? model.id),
        h(
          'span',
          { className: 'dsh-model-allowance-model-side' },
          switchingModel === model.id
            ? h('span', { className: 'dsh-model-allowance-model-note' }, t('model.switching'))
            : isCurrent
              ? h('span', { className: 'dsh-model-allowance-model-note' }, t('model.current'))
              : null,
          efforts === null
            ? null
            : h(
                'span',
                {
                  className: 'dsh-model-allowance-model-arrow',
                  'aria-hidden': true,
                },
                '›',
              ),
        ),
      )
    }),
    // A failed switch keeps the list open and says why.
    modelError && state !== 'error'
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
}
