/**
 * The browser half of the model-allowance plugin.
 *
 * The badge reads the session's `modelSelection` projection to learn which
 * provider and model the conversation uses, then asks the Host's `balance`
 * Remote namespace for that reading. No credential ever reaches this half;
 * only readings do.
 *
 * Provider names, brand colours, and artwork hints arrive with the Host's
 * route list, so this half knows no vendor by name: adding one needs no change
 * here, and a vendor this build has no artwork for reads as its initial over
 * the colour the Host declared.
 */
import { createElement as h } from 'react'
import { BalanceBadge } from './badge.js'
import { createBalanceContribution } from './contract.js'
import { en, NS, zh } from './locales.js'
import { lookupBalanceNamespace, resetBalanceNamespace, setBalanceNamespace } from './namespace.js'

export const inject = ['slots', 'locale', 'remote']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }))
  const t = ctx.locale.bind(NS)

  // Mount the `balance` Remote namespace the Host publishes.
  ctx.effect(() => {
    let disposed = false
    let unmount
    ;(async () => {
      const contribution = createBalanceContribution()
      const info = {
        package: contribution.package,
        get descriptors() {
          const descriptors = []
          for (const [endpoint, definition] of Object.entries(contribution.methods)) {
            const separator = endpoint.indexOf('/')
            const namespace = endpoint.slice(0, separator)
            const method = endpoint.slice(separator + 1)
            descriptors.push({
              ...definition,
              id: `${contribution.package}#${endpoint}`,
              namespace,
              method,
              parameters: definition.parameters.map((parameter) => ({
                ...parameter,
                wire: parameter.wire ?? parameter.name,
              })),
            })
          }
          return descriptors
        },
      }
      const disposer = await ctx.remote.$mount(info)
      if (disposed) {
        await disposer()
        return
      }
      unmount = disposer
      // The namespace service exists once the mount settles, so this is the
      // point where the inject-free lookup can succeed.
      const namespace = lookupBalanceNamespace(ctx)
      if (namespace) {
        setBalanceNamespace(namespace)
      } else {
        console.error('[model-allowance] the balance namespace did not register')
        setBalanceNamespace(null)
      }
    })().catch((error) => {
      console.error('[model-allowance] mounting the balance namespace failed', { error })
      // A hot reload can mount the new instance before the previous namespace
      // is gone; the existing namespace is still the working one, so use it
      // instead of reporting every reading as unavailable.
      setBalanceNamespace(lookupBalanceNamespace(ctx) ?? null)
    })
    return () => {
      disposed = true
      resetBalanceNamespace()
      unmount?.()
    }
  }, 'model-allowance: balance namespace')

  // `conversation.input.right` renders immediately before the composer's model
  // seat, so the badge sits directly left of the model name. The left group
  // sits behind the permission and plan controls, far enough away that the two
  // stopped reading as related.
  const SLOT = 'conversation.input.right'
  ctx.slots.inject(SLOT, () =>
    ctx.slots.register(
      {
        name: SLOT,
        id: 'model-allowance',
        order: 10,
      },
      (props) => h(BalanceBadge, { ...props, ctx, t }),
    ),
  )
}
