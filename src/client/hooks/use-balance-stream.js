import * as React from 'react'
import { getBalanceApi, supportsModel } from '../namespace.js'

/**
 * The message of a thrown value.
 * @param {unknown} error The thrown value.
 * @returns {string} The message.
 */
export function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read one provider's status and always settle on a displayable result.
 * @param {string} provider Provider route.
 * @returns {Promise<{provider: string, state: string, url?: string, summary?: string, error?: string}>}
 *   The status reading, or an unknown reading explaining why it failed.
 */
export async function readProviderStatus(provider) {
  try {
    const api = await getBalanceApi()
    if (!api || typeof api.status !== 'function') {
      return { provider, state: 'unknown', error: 'status API unavailable' }
    }
    const result = await api.status(provider)
    if (!result.ok) {
      const error =
        typeof result.error?.message === 'string'
          ? result.error.message
          : typeof result.error === 'string'
            ? result.error
            : 'status reading failed'
      return { provider, state: 'unknown', error }
    }
    return result.value
  } catch (error) {
    console.error('[model-allowance] reading provider status failed', { provider, error })
    return { provider, state: 'unknown', error: describe(error) }
  }
}

/**
 * Subscribe to the provider's balance reading: the Host's stream when it
 * offers one, one unary read when it does not. The reading state itself is
 * owned by the badge (its verification harness addresses hook slots by
 * index), so the setters travel in.
 * @param {object} args The provider the card points at, its model context, the plugin context, and the reading state's setters.
 * @param {string | null} args.activeProvider Provider route.
 * @param {string | undefined} args.activeModel The model the reading is for, when it is one.
 * @param {object} args.ctx Client plugin context.
 * @param {(view: object | null) => void} args.setView Sets the latest reading.
 * @param {(loading: boolean) => void} args.setLoading Sets the reading-in-flight flag.
 */
export function useBalanceStream({ activeProvider, activeModel, ctx, setView, setLoading }) {
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
  }, [activeProvider, activeModel, ctx, setView, setLoading])
}
