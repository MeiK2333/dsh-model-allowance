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
        unit: z.enum(['hour', 'day', 'week', 'month', 'unknown']),
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
      'detail.updatedAt': '更新于 {time}',
      'detail.refresh': '刷新',
      'detail.refreshing': '刷新中…',
      'detail.console': '控制台',
      'detail.error': '无法读取厂商余额。',
      'detail.moreProviders': '更多厂商',
      'window.title.hour': '{count} 小时额度',
      'window.title.day': '{count} 天额度',
      'window.title.week': '每周额度',
      'window.title.month': '每月额度',
      'window.title.unknown': '当前额度',
      'window.usedOfTotal': '{used} / {total}',
      'window.usedPercent': '{percent}% 已使用',
      'window.resetIn': '{duration} 后重置',
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
      'detail.updatedAt': 'updated {time}',
      'detail.refresh': 'Refresh',
      'detail.refreshing': 'Refreshing…',
      'detail.console': 'Console',
      'detail.error': 'Could not read the provider balance.',
      'detail.moreProviders': 'More providers',
      'window.title.hour': '{count}-hour quota',
      'window.title.day': '{count}-day quota',
      'window.title.week': 'Weekly quota',
      'window.title.month': 'Monthly quota',
      'window.title.unknown': 'Current quota',
      'window.usedOfTotal': '{used} / {total}',
      'window.usedPercent': '{percent}% used',
      'window.resetIn': 'resets in {duration}',
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
      'min-width:250px;padding:8px 10px 10px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 8px 24px rgb(0 0 0 / 18%);font-size:12px}',
      '.dsh-model-balance-row{display:flex;justify-content:space-between;gap:16px;padding:2px 0}',
      '.dsh-model-balance-row>span:first-child{color:var(--dsw-alias-label-secondary)}',
      '.dsh-model-balance-usage{font-variant-numeric:tabular-nums}',
      // The row cancels the panel's own horizontal padding so the divider under
      // it runs edge to edge, then puts the same padding back so the first mark
      // lines up with the labels below. Without this the marks sit further from
      // the edge than every other row and the whole strip reads as shifted left.
      '.dsh-model-balance-switcher-wrap{position:relative;margin:-2px -10px 6px;',
      'padding:0 10px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-switcher{display:flex;flex-wrap:nowrap;align-items:center;',
      'gap:4px;overflow:hidden}',
      // Each mark is the vendor's own artwork in its own colour on a neutral
      // chip, so a multi-colour mark needs no white-on-brand treatment. The
      // two DeepSeek routes tell each other apart by chip: filled for the
      // signed-in account, outlined for a stored key.
      '.dsh-model-balance-tab{display:inline-flex;align-items:center;justify-content:center;',
      'box-sizing:border-box;width:26px;height:26px;flex:none;padding:0;',
      'border:1px solid transparent;border-radius:7px;',
      'background:transparent;line-height:1;cursor:pointer;',
      'color:var(--provider-mark,var(--dsw-alias-label-primary));opacity:.66}',
      '.dsh-model-balance-tab[data-variant="solid"]{background:var(--dsw-alias-bg-layer-2);',
      'border-color:var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-tab[data-variant="outline"]{',
      'border-color:var(--dsw-alias-border-l2);background:transparent}',
      '.dsh-model-balance-tab:hover{opacity:.9}',
      // The selected mark recolours the one border it already has. An extra
      // inset ring would stack a second line on top of that border and read as
      // a thick frame.
      '.dsh-model-balance-tab[data-active="true"]{opacity:1;',
      'background:var(--dsw-alias-bg-layer-2);',
      'border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-model-balance-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:-1px}',
      '.dsh-model-balance-tab svg{display:block}',
      '.dsh-model-balance-tab-letter{font-size:11px;font-weight:600;line-height:1}',
      '.dsh-model-balance-more{display:inline-flex;align-items:center;justify-content:center;',
      'box-sizing:border-box;width:26px;height:26px;flex:none;margin-left:auto;padding:0;',
      'border-radius:7px;',
      'border:1px solid var(--dsw-alias-border-l1);background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1}',
      '.dsh-model-balance-more:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-balance-menu{position:absolute;top:calc(100% + 2px);right:0;z-index:30;',
      'min-width:150px;padding:4px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:8px;background:var(--dsw-alias-bg-overlay);',
      'box-shadow:0 8px 24px rgb(0 0 0 / 18%)}',
      '.dsh-model-balance-menu-item{display:flex;align-items:center;gap:8px;width:100%;',
      'padding:4px 6px;border:0;border-radius:6px;background:transparent;',
      'color:var(--dsw-alias-label-primary);font-size:12px;text-align:left;cursor:pointer}',
      '.dsh-model-balance-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-model-balance-menu-mark{display:inline-flex;align-items:center;',
      'justify-content:center;width:20px;height:20px;flex:none;border-radius:5px;',
      'line-height:1;background:var(--dsw-alias-bg-layer-2);',
      'color:var(--provider-mark,var(--dsw-alias-label-primary))}',
      '.dsh-model-balance-menu-mark svg{display:block}',
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
      '.dsh-model-balance-foot{display:flex;justify-content:space-between;',
      'align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:5px;',
      'color:var(--dsw-alias-label-secondary);',
      'font-size:11px;font-variant-numeric:tabular-nums;word-break:break-word}',
      '.dsh-model-balance-error{padding:4px 0;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-balance-reason{padding:2px 0;color:var(--dsw-alias-label-secondary);',
      'font-size:11px;word-break:break-word}',
      // The footer is one right-aligned cluster: the reading time sits directly
      // left of the two icon buttons.
      '.dsh-model-balance-actions{display:flex;align-items:center;',
      'justify-content:flex-end;gap:8px;margin-top:8px;padding-top:8px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-balance-updated{color:var(--dsw-alias-label-secondary);font-size:11px;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;margin-right:2px}',
      '.dsh-model-balance-icon-button{display:inline-flex;align-items:center;',
      'justify-content:center;box-sizing:border-box;width:26px;height:26px;flex:none;padding:0;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);cursor:pointer;text-decoration:none}',
      '.dsh-model-balance-icon-button:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-model-balance-icon-button:focus-visible{',
      'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-model-balance-icon-button[disabled]{opacity:.5;cursor:default}',
      '.dsh-model-balance-icon-button svg{display:block}',
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
     * Format an instant as a wall clock, for the footer's reading time.
     * @param {number} epochMs The instant.
     * @returns {string} `HH:MM:SS` in local time.
     */
    function formatClock(epochMs) {
      const at = new Date(epochMs)
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
    }

    /**
     * The refresh glyph: an arc with a filled arrowhead, so it reads as
     * "rotate" rather than a hook.
     * @param {number} size Rendered size in pixels.
     * @returns {object} The icon element.
     */
    function refreshGlyph(size) {
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M12.05 4.36A6 6 0 1 1 7.95 4.36',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M15.05 5.45L10.48 6.35L12.12 1.83Z',
          fill: 'currentColor',
          stroke: 'currentColor',
          strokeWidth: 0.6,
          strokeLinejoin: 'round',
        }),
      )
    }

    /**
     * The console glyph: a window with its title bar.
     *
     * A terminal prompt and a monitor on a stand were drawn alongside this one
     * and compared at true size; the prompt's chevron and cursor merged into a
     * smudge, and the monitor read as a display rather than as the console the
     * button opens.
     *
     * @param {number} size Rendered size in pixels.
     * @returns {object} The icon element.
     */
    function consoleGlyph(size) {
      return h(
        'svg',
        { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
        h('rect', {
          x: 3.4,
          y: 4.2,
          width: 13.2,
          height: 11.6,
          rx: 2,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
        }),
        h('path', {
          d: 'M3.4 8.1h13.2',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
        }),
      )
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
     * The real mark of each vendor, plus how a route badges it.
     *
     * DeepSeek and MiniMax artwork comes from Simple Icons (CC0-1.0). Zhipu's
     * glyph is the icon half of the official wordmark at cdn.bigmodel.cn,
     * separating the four shapes from the lettering. All three are trademarks
     * of their owners and are used here only to identify the provider.
     *
     * A route maps to one vendor's glyph; `variant` then says how the chip is
     * drawn, which is how the two DeepSeek routes stay distinguishable: a
     * filled chip marks the signed-in account, an outlined one marks a key the
     * user holds.
     */
    const PROVIDER_MARKS = {
      'deepseek-account': { icon: 'deepseek', color: '#4d6bfe', variant: 'solid' },
      deepseek: { icon: 'deepseek', color: '#4d6bfe', variant: 'outline' },
      'minimax-cn': { icon: 'minimax', color: '#e21680', variant: 'solid' },
      zai: { icon: 'zhipu', color: '#5668f5', variant: 'solid' },
      'zai-coding-cn': { icon: 'zhipu', color: '#5668f5', variant: 'solid' },
    }

    /** Simple Icons' DeepSeek glyph, 24x24. */
    const DEEPSEEK_PATH =
      'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45'

    /** Simple Icons' MiniMax glyph, 24x24. */
    const MINIMAX_PATH =
      'M11.43 3.92a.86.86 0 1 0-1.718 0v14.236a1.999 1.999 0 0 1-3.997 0V9.022a.86.86 0 1 0-1.718 0v3.87a1.999 1.999 0 0 1-3.997 0V11.49a.57.57 0 0 1 1.139 0v1.404a.86.86 0 0 0 1.719 0V9.022a1.999 1.999 0 0 1 3.997 0v9.134a.86.86 0 0 0 1.719 0V3.92a1.998 1.998 0 1 1 3.996 0v11.788a.57.57 0 1 1-1.139 0zm10.572 3.105a2 2 0 0 0-1.999 1.997v7.63a.86.86 0 0 1-1.718 0V3.923a1.999 1.999 0 0 0-3.997 0v16.16a.86.86 0 0 1-1.719 0V18.08a.57.57 0 1 0-1.138 0v2a1.998 1.998 0 0 0 3.996 0V3.92a.86.86 0 0 1 1.719 0v12.73a1.999 1.999 0 0 0 3.996 0V9.023a.86.86 0 1 1 1.72 0v6.686a.57.57 0 0 0 1.138 0V9.022a2 2 0 0 0-1.998-1.997'

    /**
     * Zhipu's glyph: four gradient blocks around a light cross, lifted from the
     * official wordmark. Gradients are flattened to their mid tones so the mark
     * can be drawn twice in one document without duplicating gradient ids.
     */
    const ZHIPU_PATHS = [
      {
        d: 'M21.0517 11.7895V5.91559C21.0517 5.89816 21.0422 5.88207 21.0268 5.87346L10.5497 0.00632824C10.5422 0.00210946 10.5338 2.92206e-08 10.5254 0V2.45801C10.5254 7.22726 14.5109 11.784 19.4278 11.784C19.3287 11.784 19.2299 11.7858 19.1316 11.7895H21.0517Z',
        fill: '#5b6fe8',
      },
      {
        d: 'M-0.000925064 11.7895V17.8731C-0.000925064 17.8912 0.00857449 17.9079 0.0239525 17.9168L10.5011 23.9934C10.5086 23.9978 10.517 24 10.5254 24V21.4542C10.5254 16.5146 6.53987 11.7952 1.62302 11.7952C1.72212 11.7952 1.82085 11.7933 1.91917 11.7895H-0.000925064Z',
        fill: '#57a4ee',
      },
      {
        d: 'M-0.000925064 11.7895V5.91559C-0.000925064 5.89816 0.00857449 5.88207 0.0239525 5.87346L10.5011 0.00632824C10.5086 0.00210946 10.517 2.92206e-08 10.5254 0V2.45801C10.5254 7.22726 6.53987 11.784 1.62302 11.784C1.72212 11.784 1.82085 11.7858 1.91917 11.7895H-0.000925064Z',
        fill: '#5b6fe8',
      },
      {
        d: 'M21.0517 11.7895V17.8731C21.0517 17.8912 21.0422 17.9079 21.0268 17.9168L10.5497 23.9934C10.5422 23.9978 10.5338 24 10.5254 24V21.4542C10.5254 16.5146 14.5109 11.7952 19.4278 11.7952C19.3287 11.7952 19.2299 11.7933 19.1316 11.7895H21.0517Z',
        fill: '#5a84ee',
      },
      {
        d: 'M10.5273 2.45801C10.5273 7.22725 14.5129 11.7842 19.4297 11.7842L19.1338 11.7891C19.232 11.7929 19.3307 11.7949 19.4297 11.7949C14.5129 11.7949 10.5274 16.5146 10.5273 21.4541C10.5273 16.5581 6.61178 11.8801 1.75488 11.7979L1.75391 11.792L1.9209 11.7891C1.86537 11.787 1.80969 11.7869 1.75391 11.7861V11.7803C6.61128 11.7015 10.5273 7.18549 10.5273 2.45801Z',
        fill: '#f7f8fa',
      },
    ]

    /**
     * Each mark's drawn extent, in its own viewBox units.
     *
     * Sizing every mark by its viewBox height is wrong for a mixed set: the
     * DeepSeek and MiniMax glyphs sit inside a 24-tall box with padding above
     * and below, while Zhipu's fills all 24. Matching viewBox height therefore
     * drew Zhipu about a third taller than the other two, which read as that
     * one icon being too big for its chip. Matching the *ink* height instead
     * gives all three the same top and bottom breathing room.
     */
    const ICON_GEOMETRY = {
      deepseek: { vbW: 24, vbH: 24, inkW: 24, inkH: 17.8 },
      minimax: { vbW: 24, vbH: 24, inkW: 24, inkH: 20.2 },
      zhipu: { vbW: 21.052, vbH: 24, inkW: 21.052, inkH: 24 },
    }

    /**
     * The mark for one route, falling back to the route's first letter.
     * @param {string} route Provider route.
     * @returns {{icon?: string, letter?: string, color: string, variant: string}} The mark.
     */
    function providerMark(route) {
      return (
        PROVIDER_MARKS[route] ?? {
          letter: route.slice(0, 1).toUpperCase(),
          color: '#6b7280',
          variant: 'solid',
        }
      )
    }

    /**
     * The svg for one mark, sized so every mark draws the same ink height.
     * @param {string} route Provider route.
     * @param {number} inkHeight Drawn height of the ink, in pixels.
     * @returns {object} The icon element.
     */
    function providerIcon(route, inkHeight) {
      const mark = providerMark(route)
      if (mark.letter !== undefined) {
        return h('span', { className: 'dsh-model-balance-tab-letter' }, mark.letter)
      }
      const geo = ICON_GEOMETRY[mark.icon]
      const boxH = (inkHeight * geo.vbH) / geo.inkH
      const boxW = (boxH * geo.vbW) / geo.vbH
      const paths =
        mark.icon === 'zhipu'
          ? ZHIPU_PATHS.map((path, index) =>
              h('path', { key: `z-${String(index)}`, d: path.d, fill: path.fill }),
            )
          : [
              h('path', {
                d: mark.icon === 'deepseek' ? DEEPSEEK_PATH : MINIMAX_PATH,
                fill: 'currentColor',
              }),
            ]
      return h(
        'svg',
        {
          viewBox: `0 0 ${String(geo.vbW)} ${String(geo.vbH)}`,
          width: boxW,
          height: boxH,
          preserveAspectRatio: 'xMidYMid meet',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        ...paths,
      )
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
      // A weekly window may be reported as one week or as seven days; both are
      // the same cadence and read best as "weekly".
      if (window.unit === 'week') return t('window.title.week')
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
     * Format a countdown as `dd.HH:MM:SS`, or `HH:MM:SS` within a day.
     *
     * The day prefix only appears when there is a whole day to count, so a
     * window inside 24 hours is not padded with a `00.` that reads as noise.
     * Beyond a day the field is zero-padded and always present, so the string
     * does not change width as the clock ticks.
     *
     * @param {number} ms Remaining milliseconds.
     * @returns {string} The countdown.
     */
    function formatCountdown(ms) {
      const remaining = Number.isFinite(ms) && ms > 0 ? ms : 0
      const totalSeconds = Math.floor(remaining / 1000)
      const days = Math.floor(totalSeconds / 86_400)
      const hours = Math.floor((totalSeconds % 86_400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const pad = (value) => String(value).padStart(2, '0')
      const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      return days > 0 ? `${pad(days)}.${clock}` : clock
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

      // The switcher is a single row of marks. When they cannot all fit, the
      // tail moves into a menu behind a button on the right, so the strip never
      // wraps or clips. Width is measured rather than assumed.
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [stripWidth, setStripWidth] = React.useState(0)
      const stripRef = React.useRef(null)

      // Dropping the override belongs to the model *changing*, not to every
      // render, so the previous value is compared rather than reset blindly.
      React.useEffect(() => {
        if (lastModelProvider.current === provider) return
        lastModelProvider.current = provider
        setPicked(null)
      })

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
        overflow = [
          ...overflow.slice(0, activeIndex),
          displaced,
          ...overflow.slice(activeIndex + 1),
        ]
      }

      /** One provider mark. */
      const markButton = (entry) => {
        const mark = providerMark(entry.route)
        const name = providerName(entry.route, t)
        return h(
          'button',
          {
            type: 'button',
            key: entry.route,
            role: 'tab',
            className: 'dsh-model-balance-tab',
            'data-variant': mark.variant,
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
          providerIcon(entry.route, 14),
        )
      }

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
                    // The clipping strip and the menu are siblings: the strip
                    // hides what does not fit, and the menu would be clipped
                    // with it if it lived inside.
                    'div',
                    { className: 'dsh-model-balance-switcher-wrap' },
                    h(
                      'div',
                      {
                        ref: stripRef,
                        className: 'dsh-model-balance-switcher',
                        role: 'tablist',
                        'aria-label': t('detail.provider'),
                        'data-overflow': overflow.length > 0 ? 'true' : 'false',
                      },
                      ...shown.map(markButton),
                      overflow.length > 0
                        ? h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-model-balance-more',
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
                          { className: 'dsh-model-balance-menu', role: 'menu' },
                          ...overflow.map((entry) =>
                            h(
                              'button',
                              {
                                type: 'button',
                                key: entry.route,
                                role: 'menuitem',
                                className: 'dsh-model-balance-menu-item',
                                onClick: () => {
                                  setPicked(entry.route)
                                  setMenuOpen(false)
                                },
                              },
                              h(
                                'span',
                                {
                                  className: 'dsh-model-balance-menu-mark',
                                  'data-variant': providerMark(entry.route).variant,
                                  style: { '--provider-mark': providerMark(entry.route).color },
                                },
                                providerIcon(entry.route, 11),
                              ),
                              h('span', null, providerName(entry.route, t)),
                            ),
                          ),
                        )
                      : null,
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
                      // Otherwise the countdown holds the left edge and the
                      // target instant the right, so the eye can compare them.
                      typeof window.resetAt === 'number'
                        ? h(
                            'div',
                            { className: 'dsh-model-balance-foot' },
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
              h(
                'div',
                { className: 'dsh-model-balance-actions' },
                view?.updatedAt
                  ? h(
                      'span',
                      { className: 'dsh-model-balance-updated' },
                      t('detail.updatedAt', { time: formatClock(view.updatedAt) }),
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-model-balance-icon-button',
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
                        className: 'dsh-model-balance-icon-button',
                        href: view.consoleUrl,
                        target: '_blank',
                        rel: 'noreferrer noopener',
                        title: t('detail.console'),
                        'aria-label': t('detail.console'),
                      },
                      consoleGlyph(16),
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
