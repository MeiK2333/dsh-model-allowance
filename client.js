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
      const windowSchema = z.object({
        id: z.string(),
        unit: z.enum(['hour', 'day', 'month', 'unknown']),
        count: z.number().optional(),
        used: z.number().optional(),
        total: z.number().optional(),
        remainingPercent: z.number().optional(),
        resetAt: z.number().optional(),
      })
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
        windows: z.array(windowSchema).optional(),
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
      const providerListSchema = z.array(
        z.object({ route: z.string(), configured: z.boolean() }),
      )
      return {
        package: '@local/dsh-model-balance',
        methods: {
          'balance/list': {
            service: 'balanceController',
            description: 'List the provider routes this installation can read.',
            invocation: { kind: 'direct' },
            parameters: [],
            result: strict(providerListSchema, 'The routes.', '@local/dsh-model-balance#routes'),
          },
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
      'detail.error': '无法读取厂商余额。',
      'window.title.hour': '{count} 小时额度',
      'window.title.day': '{count} 天额度',
      'window.title.week': '每周额度',
      'window.title.month': '每月额度',
      'window.title.unknown': '当前额度',
      'window.usedOfTotal': '{used} / {total}',
      'window.usedPercent': '{percent}% 已使用',
      'window.resetIn': '{duration} 后重置',
      'window.resetAtLabel': '重置时间 {time}',
      'countdown.days': '{days} 天 {clock}',
      'duration.daysHours': '{days} 天 {hours} 小时',
      'duration.hoursMinutes': '{hours} 小时 {minutes} 分',
      'duration.minutes': '{minutes} 分钟',
      'duration.lessThanMinute': '不到 1 分钟',
      'provider.deepseekAccount': 'DeepSeek 账号',
      'provider.deepseekApiKey': 'DeepSeek API',
      'provider.minimaxTokenPlan': 'MiniMax',
      'provider.zhipuQuota': '智谱 GLM',
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
      'detail.error': 'Could not read the provider balance.',
      'window.title.hour': '{count}-hour quota',
      'window.title.day': '{count}-day quota',
      'window.title.week': 'Weekly quota',
      'window.title.month': 'Monthly quota',
      'window.title.unknown': 'Current quota',
      'window.usedOfTotal': '{used} / {total}',
      'window.usedPercent': '{percent}% used',
      'window.resetIn': 'resets in {duration}',
      'window.resetAtLabel': 'resets {time}',
      'countdown.days': '{days}d {clock}',
      'duration.daysHours': '{days}d {hours}h',
      'duration.hoursMinutes': '{hours}h {minutes}m',
      'duration.minutes': '{minutes}m',
      'duration.lessThanMinute': 'under a minute',
      'provider.deepseekAccount': 'DeepSeek account',
      'provider.deepseekApiKey': 'DeepSeek API',
      'provider.minimaxTokenPlan': 'MiniMax',
      'provider.zhipuQuota': 'Zhipu GLM',
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
      // Anchored to its own right edge: the badge sits next to the model seat
      // near the trailing edge, so the panel opens leftwards instead of
      // running off the side of the composer.
      '.dsh-model-balance-panel{position:absolute;bottom:calc(100% + 6px);right:0;z-index:20;',
      'min-width:250px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 8px 24px rgb(0 0 0 / 18%);font-size:12px}',
      '.dsh-model-balance-row{display:flex;justify-content:space-between;gap:16px;padding:2px 0}',
      '.dsh-model-balance-row>span:first-child{color:var(--dsw-alias-label-secondary)}',
      '.dsh-model-balance-usage{font-variant-numeric:tabular-nums}',
      '.dsh-model-balance-switcher{display:flex;flex-wrap:wrap;gap:4px;',
      'padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-tab{padding:3px 8px;border:1px solid transparent;border-radius:999px;',
      'background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;',
      'line-height:1.2;cursor:pointer;white-space:nowrap}',
      '.dsh-model-balance-tab:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-balance-tab[data-active="true"]{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-model-balance-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:1px}',
      '.dsh-model-balance-window{margin-top:10px;padding-top:10px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-window-head{display:flex;justify-content:space-between;',
      'align-items:baseline;gap:12px}',
      '.dsh-model-balance-window-title{font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-model-balance-percent{margin-top:2px;color:var(--dsw-alias-label-secondary);',
      'font-size:11px;font-variant-numeric:tabular-nums}',
      '.dsh-model-balance-bar{margin-top:6px;height:6px;border-radius:999px;overflow:hidden;',
      'background:var(--dsw-alias-bg-layer-2);',
      'box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-bar-fill{height:100%;border-radius:999px;',
      'background:var(--dsw-alias-state-success-primary);transition:width 300ms ease}',
      '.dsh-model-balance-bar-fill[data-tone="warn"]{',
      'background:var(--dsw-alias-state-warn-primary)}',
      '.dsh-model-balance-bar-fill[data-tone="error"]{',
      'background:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-balance-foot{display:flex;justify-content:space-between;gap:10px;',
      'flex-wrap:wrap;margin-top:5px;color:var(--dsw-alias-label-secondary);',
      'font-size:11px;font-variant-numeric:tabular-nums}',
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
     * Format a span in milliseconds as a readable duration.
     *
     * A plan window is hours or days away, so a raw millisecond count says
     * nothing; the units come from the locale.
     *
     * @param {number} ms Duration in milliseconds.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {string} The readable duration.
     */
    function formatDuration(ms, t) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      // Round rather than floor: a window 4d 2h 59m 59s away is four days and
      // three hours for every practical purpose, and flooring would report it
      // a whole unit short for the final minute of every window.
      const totalMinutes = Math.round(ms / 60_000)
      const days = Math.floor(totalMinutes / 1440)
      const hours = Math.floor((totalMinutes % 1440) / 60)
      const minutes = totalMinutes % 60
      if (days > 0) return t('duration.daysHours', { days, hours })
      if (hours > 0) return t('duration.hoursMinutes', { hours, minutes })
      if (minutes > 0) return t('duration.minutes', { minutes })
      return t('duration.lessThanMinute')
    }

    /**
     * Format a reset instant as a full local date and time.
     *
     * The countdown says how soon; this says exactly when, so a reset that is
     * days away is unambiguous without counting on your fingers.
     *
     * @param {number} epochMs Reset instant.
     * @returns {string} `YYYY-MM-DD HH:MM:SS` in local time.
     */
    function formatResetAt(epochMs) {
      const at = new Date(epochMs)
      const pad = (value) => String(value).padStart(2, '0')
      return (
        `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
        ` ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
      )
    }

    /**
     * Group digits so a five-figure quota stays readable.
     * @param {number} value The number.
     * @returns {string} The formatted number.
     */
    function formatNumber(value) {
      return Number.isInteger(value) ? value.toLocaleString() : String(value)
    }

    /**
     * Route to locale key for the provider's display name.
     *
     * A route without an entry falls back to its own id, so a newly added
     * adapter is readable before anyone writes copy for it.
     */
    const PROVIDER_NAME_KEYS = {
      'deepseek-account': 'provider.deepseekAccount',
      deepseek: 'provider.deepseekApiKey',
      'minimax-cn': 'provider.minimaxTokenPlan',
      zai: 'provider.zhipuQuota',
      'zai-coding-cn': 'provider.zhipuQuota',
    }

    /**
     * Name a provider route for the switcher.
     * @param {string} route Provider route.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {string} The display name.
     */
    function providerName(route, t) {
      const key = PROVIDER_NAME_KEYS[route]
      if (key === undefined) return route
      const name = t(key)
      return name === key ? route : name
    }

    /**
     * Name a metering window.
     * @param {object} window The window.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {string} The window title.
     */
    function windowTitle(window, t) {
      if (window.unit === 'hour' && window.count) {
        return t('window.title.hour', { count: window.count })
      }
      if (window.unit === 'day' && window.count === 7) return t('window.title.week')
      if (window.unit === 'day' && window.count) {
        return t('window.title.day', { count: window.count })
      }
      if (window.unit === 'month') return t('window.title.month')
      return t('window.title.unknown')
    }

    /**
     * How much of a window's allowance has been spent, as a percentage.
     *
     * The percentage is what the bar and the headline both read, so it is
     * derived once: from the remaining share when the provider reports one, and
     * from used over total otherwise. It may exceed 100 — a plan can be
     * overrun — and the bar clamps while the number stays honest.
     *
     * @param {object} window The window.
     * @returns {number | undefined} The consumed percentage.
     */
    function windowUsedPercent(window) {
      if (typeof window.remainingPercent === 'number') return 100 - window.remainingPercent
      if (
        typeof window.used === 'number' &&
        typeof window.total === 'number' &&
        window.total > 0
      ) {
        return (window.used / window.total) * 100
      }
      return undefined
    }

    /**
     * The "used / total" label, when the provider meters in countable units.
     * @param {object} window The window.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {string | undefined} The label, or undefined when the provider
     *   reports only a percentage.
     */
    function windowUsage(window, t) {
      if (typeof window.total !== 'number' || typeof window.used !== 'number') return undefined
      return t('window.usedOfTotal', {
        used: formatNumber(window.used),
        total: formatNumber(window.total),
      })
    }

    /**
     * Severity of a consumption level, for colouring the bar.
     * @param {number} percent Consumed percentage.
     * @returns {'ok'|'warn'|'error'} The tone.
     */
    function barTone(percent) {
      if (percent >= 85) return 'error'
      if (percent >= 60) return 'warn'
      return 'ok'
    }

    /**
     * Format a countdown as a clock, so it visibly ticks.
     *
     * A window hours away reads best as `HH:MM:SS`; a multi-day window keeps
     * its days in front rather than turning into a 96-hour clock.
     *
     * @param {number} ms Remaining milliseconds.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {string} The countdown.
     */
    function formatCountdown(ms, t) {
      if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
      const totalSeconds = Math.floor(ms / 1000)
      const days = Math.floor(totalSeconds / 86_400)
      const hours = Math.floor((totalSeconds % 86_400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const clock = [hours, minutes, seconds]
        .map((part) => String(part).padStart(2, '0'))
        .join(':')
      return days > 0 ? t('countdown.days', { days, clock }) : clock
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
      const rootRef = React.useRef(null)

      // The countdowns below are relative to "now", so the open panel re-reads
      // the clock on a slow tick. Only the open panel pays for it.
      const [now, setNow] = React.useState(() => Date.now())

      // The card follows the model by default but can be pointed at any other
      // provider this installation can read. `picked` holds that override and
      // is cleared whenever the model moves, so the card snaps back to it.
      const [picked, setPicked] = React.useState(null)
      const [available, setAvailable] = React.useState([])
      const lastModelProvider = React.useRef(null)

      // Dropping the override belongs to the model *changing*, not to every
      // render, so the previous value is compared rather than reset blindly.
      React.useEffect(() => {
        if (lastModelProvider.current === provider) return
        lastModelProvider.current = provider
        setPicked(null)
      })

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
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      // Refresh the countdown baseline while the panel is open. The countdown
      // shows seconds, so this ticks every second — but only while the panel is
      // open, and the interval stops the moment it closes.
      React.useEffect(() => {
        if (!open) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [open])

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
            setAvailable(result.value.filter((entry) => entry.configured))
          } catch (error) {
            console.error('[model-balance] listing providers failed', { error })
          }
        })()
        return () => {
          cancelled = true
        }
      }, [open])

      const activeProvider = picked ?? provider

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
        const readOnce = async (api) => {
          try {
            const result = await api.balance(activeProvider)
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
            setView({ provider: activeProvider, status: 'failed', kind: 'quota' })
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
                open: (signal) => api.watch(activeProvider, signal),
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
                  console.error('[model-balance] reading stream failed', { provider: activeProvider, error })
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
      }, [activeProvider, ctx])

      const refresh = React.useCallback(async () => {
        setRefreshing(true)
        try {
          const api = await getBalanceApi()
          if (!api) return
          const result = await api.refresh(activeProvider)
          if (result.ok) setView(result.value)
        } catch (error) {
          console.error('[model-balance] refresh failed', { provider: activeProvider, error })
        } finally {
          setRefreshing(false)
        }
      }, [activeProvider, ctx])

      const label = React.useMemo(() => {
        if (!provider) return ''
        if (!view) return t('badge.loading')
        if (view.status === 'ready') {
          if (view.kind === 'amount' && typeof view.amount === 'number') {
            return t('badge.amount', { amount: formatAmount(view.amount, view.currency) })
          }
          // With several windows the badge speaks for the one closest to its
          // limit; the panel breaks the rest down.
          const windows = Array.isArray(view.windows) ? view.windows : []
          const binding = windows.reduce((current, candidate) => {
            const a = current?.remainingPercent ?? Number.POSITIVE_INFINITY
            const b = candidate.remainingPercent ?? Number.POSITIVE_INFINITY
            return b < a ? candidate : current
          }, null)
          const percent = binding?.remainingPercent ?? view.percent
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
        {
          ref: rootRef,
          className: 'dsh-model-balance-root',
          'data-tone': tone,
          'data-loading': loading ? 'true' : 'false',
        },
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
              // With more than one readable provider the card opens a switcher;
              // with one there is nothing to switch, so it just names it.
              available.length > 1
                ? h(
                    'div',
                    {
                      className: 'dsh-model-balance-switcher',
                      role: 'tablist',
                      'aria-label': t('detail.provider'),
                    },
                    ...available.map((entry) =>
                      h(
                        'button',
                        {
                          type: 'button',
                          key: entry.route,
                          role: 'tab',
                          className: 'dsh-model-balance-tab',
                          'aria-selected': entry.route === activeProvider ? 'true' : 'false',
                          'data-active': entry.route === activeProvider ? 'true' : 'false',
                          onClick: () => setPicked(entry.route),
                        },
                        providerName(entry.route, t),
                      ),
                    ),
                  )
                : h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.provider')),
                    h('span', null, providerName(activeProvider, t)),
                  ),
              view?.kind === 'amount' && typeof view.amount === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
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
                    const filled =
                      consumed === undefined ? 0 : Math.min(100, Math.max(0, consumed))
                    const usage = windowUsage(window, t)
                    return h(
                      'div',
                      { className: 'dsh-model-balance-window', key: `w-${String(index)}` },
                      h(
                        'div',
                        { className: 'dsh-model-balance-window-head' },
                        h('span', { className: 'dsh-model-balance-window-title' }, windowTitle(window, t)),
                        // Countable units sit beside the title; a plan that
                        // reports only a percentage has none to show.
                        usage === undefined
                          ? null
                          : h('span', { className: 'dsh-model-balance-usage' }, usage),
                      ),
                      percent === undefined
                        ? null
                        : h(
                            'div',
                            { className: 'dsh-model-balance-percent' },
                            t('window.usedPercent', { percent }),
                          ),
                      percent === undefined
                        ? null
                        : h(
                            'div',
                            {
                              className: 'dsh-model-balance-bar',
                              role: 'progressbar',
                              'aria-valuenow': percent,
                              'aria-valuemin': 0,
                              'aria-valuemax': 100,
                              'aria-valuetext': t('window.usedPercent', { percent }),
                            },
                            h('div', {
                              className: 'dsh-model-balance-bar-fill',
                              'data-tone': barTone(percent),
                              style: { width: `${String(filled)}%` },
                            }),
                          ),
                      // A window the account has not started spending yet has no
                      // reset to report, and saying so would be a line of noise.
                      typeof window.resetAt === 'number'
                        ? h(
                            'div',
                            { className: 'dsh-model-balance-foot' },
                            h(
                              'span',
                              null,
                              t('window.resetIn', {
                                duration: formatCountdown(window.resetAt - now, t),
                              }),
                            ),
                            h(
                              'span',
                              null,
                              t('window.resetAtLabel', { time: formatResetAt(window.resetAt) }),
                            ),
                          )
                        : null,
                    )
                  })
                : []),
              // A single scalar reading has no windows to break down.
              !Array.isArray(view?.windows) && typeof view?.remainingMs === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.remaining')),
                    h('span', null, formatDuration(view.remainingMs, t)),
                  )
                : null,
              !Array.isArray(view?.windows) && typeof view?.remaining === 'number'
                ? h(
                    'div',
                    { className: 'dsh-model-balance-row' },
                    h('span', null, t('detail.remaining')),
                    h('span', null, String(view.remaining)),
                  )
                : null,
              !Array.isArray(view?.windows) && typeof view?.total === 'number'
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

        // `conversation.input.right` renders immediately before the composer's
        // model seat, so the badge sits directly left of the model name. The
        // left group sits behind the permission and plan controls, far enough
        // away that the two stopped reading as related.
        const SLOT = 'conversation.input.right'
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register(
            {
              name: SLOT,
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
