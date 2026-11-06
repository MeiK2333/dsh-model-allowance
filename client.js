/**
 * Client half of the model-balance bundle.
 *
 * The badge reads the session's `modelSelection` projection to learn which
 * provider the conversation uses, then asks the Host's `balance` Remote
 * namespace for that provider's reading. No credential ever reaches this half;
 * only readings do.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-model-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const z = require('zod')

    /** The locale namespace this plugin owns. */
    const NS = 'model-balance'

    /**
     * Build the client contribution for the `balance` namespace.
     *
     * The Host publishes the namespace through `@Remote` markers on its live
     * service. The browser needs a matching descriptor to mount it, so this
     * hand-authors the contract the Typert build pipeline would generate: one
     * strict codec per parameter and per result. The Host answers in the
     * source mode, so the parameter names must match the Host method's own
     * parameter names.
     *
     * @returns {{package: string, methods: Record<string, object>}} The contribution.
     */
    function createBalanceContribution() {
      const providerSchema = z.string().min(1)
      const balanceViewSchema = z.object({
        provider: z.string(),
        status: z.enum(['ready', 'unsupported', 'unconfigured', 'failed']),
        kind: z.enum(['amount', 'quota']).optional(),
        amount: z.number().optional(),
        currency: z.string().optional(),
        remaining: z.number().optional(),
        total: z.number().optional(),
        percent: z.number().optional(),
        remainingMs: z.number().optional(),
        resetsAt: z.number().optional(),
        consoleUrl: z.string().optional(),
        updatedAt: z.number().optional(),
        error: z.string().optional(),
      })
      /** A strict codec carries the Zod factory the gateway validates with. */
      const strict = (schema, description, typeSymbol) => ({
        mode: 'strict',
        typeSymbol,
        create: () => schema,
        jsonSchema: { type: 'object' },
        description,
      })
      const providerParameter = {
        name: 'provider',
        wire: 'provider',
        source: 'json',
        codec: strict(providerSchema, 'Provider route to read.', '@local/dsh-model-balance#provider'),
      }
      return {
        package: '@local/dsh-model-balance',
        methods: {
          'balance/balance': {
            service: 'balanceController',
            description: "Read one provider's balance or remaining allowance.",
            invocation: { kind: 'direct' },
            parameters: [providerParameter],
            result: strict(
              balanceViewSchema,
              'The reading.',
              '@local/dsh-model-balance#balanceView',
            ),
          },
          'balance/refresh': {
            service: 'balanceController',
            description: 'Force a fresh reading for one provider, bypassing the cache.',
            invocation: { kind: 'direct' },
            parameters: [providerParameter],
            result: strict(
              balanceViewSchema,
              'The reading.',
              '@local/dsh-model-balance#balanceView',
            ),
          },
          'balance/watch': {
            service: 'balanceController',
            description: 'Stream readings for one provider until the stream ends.',
            mode: 'stream',
            invocation: { kind: 'direct' },
            parameters: [providerParameter],
            cancellation: { parameter: 'signal' },
            result: strict(
              balanceViewSchema,
              'One reading.',
              '@local/dsh-model-balance#balanceView',
            ),
          },
        },
      }
    }

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'badge.loading': '加载中…',
      'badge.amount': '{amount}',
      'badge.quotaPercent': '剩余 {percent}%',
      'badge.quotaRatio': '{remaining} / {total}',
      'badge.quotaDuration': '剩余 {duration}',
      'badge.unsupported': '无余额接口',
      'badge.unconfigured': '未配置凭证',
      'badge.failed': '无法获取',
      'badge.noSelection': '请选择模型',
      'detail.title': '厂商余额',
      'detail.provider': '厂商',
      'detail.amount': '余额',
      'detail.remaining': '剩余',
      'detail.total': '总额',
      'detail.updated': '更新时间',
      'detail.refresh': '刷新',
      'detail.refreshing': '刷新中…',
      'detail.console': '打开厂商控制台',
      'detail.close': '关闭',
      'detail.error': '无法读取厂商余额。',
    }

    /** English dictionary. */
    const en = {
      'badge.loading': 'Loading…',
      'badge.amount': '{amount}',
      'badge.quotaPercent': '{percent}% left',
      'badge.quotaRatio': '{remaining} / {total}',
      'badge.quotaDuration': '{duration} left',
      'badge.unsupported': 'No balance API',
      'badge.unconfigured': 'No credential',
      'badge.failed': 'Unavailable',
      'badge.noSelection': 'Select a model',
      'detail.title': 'Provider balance',
      'detail.provider': 'Provider',
      'detail.amount': 'Balance',
      'detail.remaining': 'Remaining',
      'detail.total': 'Total',
      'detail.updated': 'Updated',
      'detail.refresh': 'Refresh',
      'detail.refreshing': 'Refreshing…',
      'detail.console': 'Open provider console',
      'detail.close': 'Close',
      'detail.error': 'Could not read the provider balance.',
    }

    /**
     * Component styles. Every colour is a theme token, so light and dark
     * palettes both follow the host without a second declaration.
     */
    const STYLES = [
      '.dsh-model-balance-root{position:relative;display:inline-flex;align-items:center}',
      '.dsh-model-balance-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;',
      'font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dsh-model-balance-badge:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-balance-badge:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:1px}',
      '.dsh-model-balance-dot{width:6px;height:6px;border-radius:50%;flex:none;',
      'background:var(--dsw-alias-state-idle-primary)}',
      '.dsh-model-balance-root[data-tone="ready"] .dsh-model-balance-dot{',
      'background:var(--dsw-alias-state-success-primary)}',
      '.dsh-model-balance-root[data-tone="failed"] .dsh-model-balance-dot{',
      'background:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-balance-root[data-loading="true"] .dsh-model-balance-dot{opacity:.5}',
      '.dsh-model-balance-panel{position:absolute;bottom:calc(100% + 6px);left:0;z-index:20;',
      'min-width:210px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 8px 24px rgb(0 0 0 / 18%);font-size:12px}',
      '.dsh-model-balance-row{display:flex;justify-content:space-between;gap:16px;padding:2px 0}',
      '.dsh-model-balance-row>span:first-child{color:var(--dsw-alias-label-secondary)}',
      '.dsh-model-balance-error{padding:4px 0;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-balance-reason{padding:2px 0;color:var(--dsw-alias-label-secondary);',
      'font-size:11px;word-break:break-word}',
      '.dsh-model-balance-actions{display:flex;gap:8px;margin-top:8px;padding-top:8px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-action{padding:2px 6px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);',
      'font-size:12px;cursor:pointer;text-decoration:none}',
      '.dsh-model-balance-action:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-balance-action:disabled{opacity:.6;cursor:default}',
    ].join('')

    /**
     * The mounted `balance` namespace.
     *
     * A Remote namespace is a Cordis service, so reading `ctx.remote.balance`
     * without declaring it in `inject` throws. This plugin cannot declare it:
     * `apply` is what mounts the namespace, so waiting for it would deadlock.
     * `ctx.get` is the inject-free lookup, and this promise lets a component
     * that renders before the mount finishes wait for it instead of guessing.
     *
     * @type {object | null}
     */
    let balanceNamespace = null
    /** @type {(value: object | null) => void} */
    let settleBalanceNamespace
    const balanceNamespaceReady = new Promise((resolve) => {
      settleBalanceNamespace = resolve
    })

    /**
     * Resolve the balance namespace, or null when the mount failed.
     * @returns {Promise<object | null>} The namespace.
     */
    async function getBalanceApi() {
      if (balanceNamespace) return balanceNamespace
      return await balanceNamespaceReady
    }

    /**
     * Look the namespace up without requiring it to be injected.
     * @param {object} ctx Client plugin context.
     * @returns {object | undefined} The namespace, when mounted.
     */
    function lookupBalanceNamespace(ctx) {
      try {
        return ctx.get('remote.balance')
      } catch {
        return undefined
      }
    }

    /**
     * Format a monetary amount with its currency.
     * @param {number} amount The amount.
     * @param {string | undefined} currency Currency code.
     * @returns {string} The formatted amount.
     */
    function formatAmount(amount, currency) {
      const symbol = currency === 'USD' ? '$' : '¥'
      const value = Math.abs(amount) >= 0.01 ? amount.toFixed(2) : amount.toFixed(4)
      return `${symbol}${value}`
    }

    /**
     * Format a remaining duration in milliseconds as a compact, readable span.
     *
     * A plan key reports its allowance in milliseconds, so an hour-scale number
     * reads better as hours and minutes than as a raw millisecond count.
     *
     * @param {number} ms Remaining milliseconds.
     * @returns {string} The readable duration.
     */
    function formatDuration(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      const totalMinutes = Math.floor(ms / 60_000)
      const days = Math.floor(totalMinutes / 1440)
      const hours = Math.floor((totalMinutes % 1440) / 60)
      const minutes = totalMinutes % 60
      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${minutes}m`
      if (minutes > 0) return `${minutes}m`
      return `${Math.floor(ms / 1000)}s`
    }

    /**
     * The badge and its detail popover.
     * @param {object} props Slot props plus the plugin context and translator.
     * @returns {React.ReactElement | null} The rendered badge.
     */
    function BalanceBadge(props) {
      const { useProjection, ctx, t } = props

      // The session's durable model selection names the provider in use.
      const selection = useProjection('modelSelection')
      const provider = selection?.next?.provider ?? selection?.lastUsed?.provider ?? null

      const [view, setView] = React.useState(null)
      const [loading, setLoading] = React.useState(false)
      const [open, setOpen] = React.useState(false)
      const [refreshing, setRefreshing] = React.useState(false)

      React.useEffect(() => {
        if (!provider) {
          setView(null)
          setLoading(false)
          return
        }
        let cancelled = false
        let handle
        setLoading(true)

        /** One unary read, used when the stream is unavailable or fails. */
        const readOnce = async (api) => {
          try {
            const result = await api.balance(provider)
            if (cancelled) return
            if (!result.ok) throw new Error('balance reading failed')
            setView(result.value)
          } catch (error) {
            console.error('[model-balance] reading failed', { provider, error })
            if (!cancelled) setView({ provider, status: 'failed', kind: 'quota' })
          } finally {
            if (!cancelled) setLoading(false)
          }
        }

        ;(async () => {
          const api = await getBalanceApi()
          if (cancelled) return
          if (!api) {
            setView({ provider, status: 'failed', kind: 'quota' })
            setLoading(false)
            return
          }

          // The Host pushes a new reading when a turn ends or the periodic
          // sweep runs, so the badge stays current without polling from the
          // browser. A host without the stream API, or a stream that fails
          // before its first frame, falls back to one unary read.
          const streamFactory = ctx.remote.$stream
          if (typeof streamFactory === 'function' && typeof api.watch === 'function') {
            try {
              handle = streamFactory({
                name: 'balance',
                open: (signal) => api.watch(provider, signal),
                ended: () => new Error('balance stream ended'),
              })
            } catch (error) {
              console.error('[model-balance] opening the reading stream failed', { error })
              handle = undefined
            }
            if (handle) {
              let received = false
              try {
                for await (const frame of handle) {
                  if (cancelled) return
                  received = true
                  setView(frame)
                  setLoading(false)
                }
              } catch (error) {
                if (!cancelled) {
                  console.error('[model-balance] reading stream failed', { provider, error })
                }
              } finally {
                // A stream that produced nothing leaves the badge loading
                // forever, so answer the same question the unary call would.
                if (!cancelled && !received) await readOnce(api)
              }
              return
            }
          }

          await readOnce(api)
        })()

        return () => {
          cancelled = true
          handle?.dispose?.()
        }
      }, [provider, ctx])

      const refresh = React.useCallback(async () => {
        setRefreshing(true)
        try {
          const api = await getBalanceApi()
          if (!api) return
          const result = await api.refresh(provider)
          if (result.ok) setView(result.value)
        } catch (error) {
          console.error('[model-balance] refresh failed', { provider, error })
        } finally {
          setRefreshing(false)
        }
      }, [provider, ctx])

      const label = React.useMemo(() => {
        if (!provider) return ''
        if (!view) return t('badge.loading')
        if (view.status === 'ready') {
          if (view.kind === 'amount' && typeof view.amount === 'number') {
            return t('badge.amount', { amount: formatAmount(view.amount, view.currency) })
          }
          if (typeof view.percent === 'number') {
            return t('badge.quotaPercent', { percent: Math.round(view.percent) })
          }
          if (typeof view.remainingMs === 'number') {
            return t('badge.quotaDuration', { duration: formatDuration(view.remainingMs) })
          }
          if (typeof view.remaining === 'number' && typeof view.total === 'number') {
            return t('badge.quotaRatio', { remaining: view.remaining, total: view.total })
          }
          if (typeof view.remaining === 'number') {
            return t('badge.quotaRatio', { remaining: view.remaining, total: '—' })
          }
          return t('badge.loading')
        }
        if (view.status === 'unsupported') return t('badge.unsupported')
        if (view.status === 'unconfigured') return t('badge.unconfigured')
        return t('badge.failed')
      }, [view, provider, t])

      if (!provider) return null

      const tone =
        view?.status === 'ready' ? 'ready' : view?.status === 'failed' ? 'failed' : 'idle'

      return h(
        'div',
        { className: 'dsh-model-balance-root', 'data-tone': tone, 'data-loading': loading ? 'true' : 'false' },
        // Component-local styles: React removes them with the component, and
        // every colour comes from a theme token so light and dark both follow.
        h('style', { key: 'styles' }, STYLES),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-model-balance-badge',
            'data-provider': provider,
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen((value) => !value),
          },
          h('span', { className: 'dsh-model-balance-dot', 'aria-hidden': true }),
          h('span', { className: 'dsh-model-balance-label' }, label),
        ),
        open
          ? h(
              'div',
              {
                className: 'dsh-model-balance-panel',
                role: 'dialog',
                'aria-label': t('detail.title'),
              },
              h(
                'div',
                { className: 'dsh-model-balance-row' },
                h('span', null, t('detail.provider')),
                h('span', null, provider),
              ),
              view?.kind === 'amount' && typeof view.amount === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.amount')),
                    h('span', null, formatAmount(view.amount, view.currency)),
                  )
                : null,
              typeof view?.remainingMs === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.remaining')),
                    h('span', null, formatDuration(view.remainingMs)),
                  )
                : null,
              typeof view?.remaining === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.remaining')),
                    h('span', null, String(view.remaining)),
                  )
                : null,
              typeof view?.total === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.total')),
                    h('span', null, String(view.total)),
                  )
                : null,
              view?.status === 'failed'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-error' },
                    t('detail.error'),
                    // The Host reports why a reading failed; showing it is what
                    // turns "it does not work" into something actionable.
                    view.error
                      ? h('div', { className: 'dsh-model-balance-reason' }, view.error)
                      : null,
                  )
                : null,
              view?.status === 'unsupported'
                ? h('div', { className: 'dsh-model-balance-reason' }, t('badge.unsupported'))
                : null,
              view?.status === 'unconfigured'
                ? h('div', { className: 'dsh-model-balance-reason' }, t('badge.unconfigured'))
                : null,
              view?.updatedAt
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.updated')),
                    h('span', null, new Date(view.updatedAt).toLocaleTimeString()),
                  )
                : null,
              h(
                'div',
                { className: 'dsh-model-balance-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-model-balance-action',
                    onClick: refresh,
                    disabled: refreshing,
                  },
                  refreshing ? t('detail.refreshing') : t('detail.refresh'),
                ),
                view?.consoleUrl
                  ? h(
                      'a',
                      {
                        className: 'dsh-model-balance-action',
                        href: view.consoleUrl,
                        target: '_blank',
                        rel: 'noreferrer noopener',
                      },
                      t('detail.console'),
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-model-balance-action',
                    onClick: () => setOpen(false),
                  },
                  t('detail.close'),
                ),
              ),
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        ctx.effect(() =>
          ctx.locale.register(NS, {
            en,
            zh,
          }),
        )
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
            // The namespace service exists once the mount settles, so this is
            // the point where the inject-free lookup can succeed.
            const namespace = lookupBalanceNamespace(ctx)
            if (namespace) {
              balanceNamespace = namespace
              settleBalanceNamespace(namespace)
            } else {
              console.error('[model-balance] the balance namespace did not register')
              settleBalanceNamespace(null)
            }
          })().catch((error) => {
            console.error('[model-balance] mounting the balance namespace failed', { error })
            settleBalanceNamespace(null)
          })
          return () => {
            disposed = true
            balanceNamespace = null
            unmount?.()
          }
        }, 'model-balance: balance namespace')

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'model-balance',
              order: 10,
            },
            (props) => h(BalanceBadge, { ...props, ctx, t }),
          ),
        )
      },
    }
  },
})
