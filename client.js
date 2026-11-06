/**
 * Client half of the model-allowance bundle.
 *
 * The badge reads the session's `modelSelection` projection to learn which
 * provider the conversation uses, then asks the Host's `balance` Remote
 * namespace for that provider's reading. No credential ever reaches this half;
 * only readings do.
 *
 * Provider names, brand colours, and artwork hints arrive with the Host's
 * route list, so this half knows no vendor by name: adding one needs no
 * change here, and a vendor this build has no artwork for reads as its
 * initial over the colour the Host declared.
 */

window.__ModuleLoader__.load({
  id: 'dsh-model-allowance',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const z = require('zod')

    /** The locale namespace this plugin owns. */
    const NS = 'model-allowance'

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
      const balanceStatusSchema = z.object({
        provider: z.string(),
        state: z.enum([
          'operational',
          'degraded',
          'partial-outage',
          'major-outage',
          'maintenance',
          'unknown',
        ]),
        summary: z.string().optional(),
        url: z.string().optional(),
        updatedAt: z.number().optional(),
        error: z.string().optional(),
      })
      const scheduleSchema = z
        .object({
          provider: z.string(),
          timezone: z.string(),
          timezoneLabel: z.object({ zh: z.string().optional(), en: z.string().optional() }),
          days: z.array(z.number()),
          windows: z.array(z.object({ from: z.string(), to: z.string() })),
          holidays: z.array(z.string()).optional(),
          note: z.object({ zh: z.string().optional(), en: z.string().optional() }).optional(),
        })
        .nullable()
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
        codec: strict(providerSchema, 'Provider route to read.', 'dsh-model-allowance#provider'),
      }
      // A provider entry carries what the browser needs to name and draw the
      // route. Every added field is optional, so an older Host still answers.
      const providerListSchema = z.array(
        z.object({
          route: z.string(),
          configured: z.boolean(),
          name: z.object({ zh: z.string().optional(), en: z.string().optional() }).optional(),
          color: z.string().optional(),
          iconHint: z.string().optional(),
        }),
      )
      return {
        package: 'dsh-model-allowance',
        methods: {
          'balance/list': {
            service: 'balanceController',
            description: 'List the provider routes this installation can read.',
            invocation: { kind: 'direct' },
            parameters: [],
            result: strict(providerListSchema, 'The routes.', 'dsh-model-allowance#routes'),
          },
          'balance/balance': {
            service: 'balanceController',
            description: "Read one provider's balance or remaining allowance.",
            invocation: { kind: 'direct' },
            parameters: [providerParameter],
            result: strict(
              balanceViewSchema,
              'The reading.',
              'dsh-model-allowance#balanceView',
            ),
          },
          'balance/defaultProvider': {
            service: 'balanceController',
            description: 'The provider a session with no model selection would use.',
            invocation: { kind: 'direct' },
            parameters: [],
            result: strict(
              z.object({ provider: z.string().optional() }),
              'The default provider.',
              'dsh-model-allowance#defaultProvider',
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
              'dsh-model-allowance#balanceView',
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
              'dsh-model-allowance#balanceView',
            ),
          },
          'balance/status': {
            service: 'balanceController',
            description: "Read one provider's platform status.",
            invocation: { kind: 'direct' },
            parameters: [providerParameter],
            result: strict(
              balanceStatusSchema,
              'The status reading.',
              'dsh-model-allowance#balanceStatus',
            ),
          },
          'balance/schedule': {
            service: 'balanceController',
            description: 'The time-of-day pricing schedule for one provider, when it has one.',
            invocation: { kind: 'direct' },
            parameters: [providerParameter],
            result: strict(scheduleSchema, 'The schedule, or null.', 'dsh-model-allowance#schedule'),
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
      'status.operational': '运行正常',
      'status.degraded': '服务降级',
      'status.partialOutage': '部分服务中断',
      'status.majorOutage': '大面积中断',
      'status.maintenance': '维护中',
      'status.unknown': '状态未知',
      'schedule.title': '时段价格',
      'schedule.peak': '高峰',
      'schedule.offPeak': '低谷',
      'schedule.daysWeekdays': '工作日',
      'schedule.daysDaily': '每天',
      'schedule.daysOther': '指定日期',
      'schedule.ranges': '{days} {windows}（{timezone}）',
      'schedule.toPeak': '距高峰开始 {duration}',
      'schedule.toOffPeak': '距低谷开始 {duration}',
      'badge.consumption': '相对上次读数的变化',
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
      'status.operational': 'Operational',
      'status.degraded': 'Degraded',
      'status.partialOutage': 'Partial outage',
      'status.majorOutage': 'Major outage',
      'status.maintenance': 'Maintenance',
      'status.unknown': 'Status unknown',
      'schedule.title': 'Time-based pricing',
      'schedule.peak': 'Peak',
      'schedule.offPeak': 'Off-peak',
      'schedule.daysWeekdays': 'Weekdays',
      'schedule.daysDaily': 'Every day',
      'schedule.daysOther': 'Selected days',
      'schedule.ranges': '{days} {windows} ({timezone})',
      'schedule.toPeak': '{duration} until peak',
      'schedule.toOffPeak': '{duration} until off-peak',
      'badge.consumption': 'Change since the last reading',
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
    }

    /**
     * Component styles. Every colour is a theme token, so light and dark
     * palettes both follow the host without a second declaration.
     */
    const STYLES = [
      '.dsh-model-allowance-root{position:relative;display:inline-flex;align-items:center}',
      '.dsh-model-allowance-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;',
      'font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dsh-model-allowance-badge:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-allowance-badge:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:1px}',
      '.dsh-model-allowance-dot{width:6px;height:6px;border-radius:50%;flex:none;',
      'background:var(--dsw-alias-state-idle-primary)}',
      // The dot reports the platform, not the reading: green while the service
      // is available, red once its own status page says otherwise, and grey
      // when this installation has no status source for the route.
      '.dsh-model-allowance-root[data-service="operational"] .dsh-model-allowance-dot{',
      'background:var(--dsw-alias-state-success-primary)}',
      '.dsh-model-allowance-root[data-service="degraded"] .dsh-model-allowance-dot,',
      '.dsh-model-allowance-root[data-service="partial-outage"] .dsh-model-allowance-dot,',
      '.dsh-model-allowance-root[data-service="major-outage"] .dsh-model-allowance-dot,',
      '.dsh-model-allowance-root[data-service="maintenance"] .dsh-model-allowance-dot{',
      'background:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-allowance-root[data-loading="true"] .dsh-model-allowance-dot{opacity:.5}',
      // The turn's difference rides beside the value for a few seconds. It is
      // quieter than the value so the balance stays the thing being read, and
      // it fades in rather than popping.
      '.dsh-model-allowance-delta{margin-left:-2px;font-size:11px;',
      'color:var(--dsw-alias-label-secondary);animation:dsh-model-allowance-fade 200ms ease-out}',
      '.dsh-model-allowance-delta[data-direction="up"]{',
      'color:var(--dsw-alias-state-success-primary)}',
      '@keyframes dsh-model-allowance-fade{from{opacity:0}to{opacity:1}}',
      // Anchored to its own right edge: the badge sits next to the model seat
      // near the trailing edge, so the panel opens leftwards instead of
      // running off the side of the composer.
      '.dsh-model-allowance-panel{position:absolute;bottom:calc(100% + 6px);right:0;z-index:20;',
      'min-width:250px;padding:8px 10px 10px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 8px 24px rgb(0 0 0 / 18%);font-size:12px}',
      '.dsh-model-allowance-row{display:flex;justify-content:space-between;gap:16px;padding:2px 0}',
      // Label first, value second, matching every other pair in the card
      // (schedule title/state, status/reading time): the label carries the
      // emphasis and the value reads as its detail. Reversed, the balance row
      // stood out as the one pair laid out the other way round.
      '.dsh-model-allowance-row>span:first-child{color:var(--dsw-alias-label-primary)}',
      '.dsh-model-allowance-row>span:last-child{color:var(--dsw-alias-label-secondary)}',
      '.dsh-model-allowance-usage{font-variant-numeric:tabular-nums;',
      'color:var(--dsw-alias-label-secondary)}',
      // The row cancels the panel's own horizontal padding so the divider under
      // it runs edge to edge, then puts the same padding back so the first mark
      // lines up with the labels below. Without this the marks sit further from
      // the edge than every other row and the whole strip reads as shifted left.
      '.dsh-model-allowance-switcher-wrap{position:relative;margin:-2px -10px 6px;',
      'padding:0 10px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-allowance-switcher{display:flex;flex-wrap:nowrap;align-items:center;',
      'gap:4px;overflow:hidden}',
      // The mark sits straight on the panel; the chip draws no surface of its
      // own. It used to be filled, which in this theme meant a pure white tile
      // (bg-layer-2 is #ffffff) on a #e9ecf2 panel and read as a white
      // background behind the logo.
      //
      // A frame means one thing here: this is the provider being read. It is
      // not used to say anything else about a route, because a second meaning
      // makes an unselected mark look selected.
      '.dsh-model-allowance-tab{display:inline-flex;align-items:center;justify-content:center;',
      'box-sizing:border-box;width:26px;height:26px;flex:none;padding:0;',
      'border:1px solid transparent;border-radius:7px;',
      'background:transparent;line-height:1;cursor:pointer;',
      'color:var(--provider-mark,var(--dsw-alias-label-primary));opacity:.66}',
      '.dsh-model-allowance-tab:hover{opacity:.9}',
      // The selected mark gains the one frame the chip already has, and stops
      // being dimmed. It must not use the brand colour: in this theme that is
      // #0f1115, so a selected chip wore a near-black frame. It also gains no
      // background, since any fill here reintroduces the white tile.
      '.dsh-model-allowance-tab[data-active="true"]{opacity:1;',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-allowance-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:-1px}',
      '.dsh-model-allowance-tab svg{display:block}',
      '.dsh-model-allowance-tab-letter{font-size:11px;font-weight:600;line-height:1}',
      '.dsh-model-allowance-more{display:inline-flex;align-items:center;justify-content:center;',
      'box-sizing:border-box;width:26px;height:26px;flex:none;margin-left:auto;padding:0;',
      'border-radius:7px;',
      'border:1px solid var(--dsw-alias-border-l1);background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1}',
      '.dsh-model-allowance-more:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-model-allowance-menu{position:absolute;top:calc(100% + 2px);right:0;z-index:30;',
      'min-width:150px;padding:4px;border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:8px;background:var(--dsw-alias-bg-overlay);',
      'box-shadow:0 8px 24px rgb(0 0 0 / 18%)}',
      '.dsh-model-allowance-menu-item{display:flex;align-items:center;gap:8px;width:100%;',
      'padding:4px 6px;border:0;border-radius:6px;background:transparent;',
      'color:var(--dsw-alias-label-primary);font-size:12px;text-align:left;cursor:pointer}',
      '.dsh-model-allowance-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      // Same rule as the strip chips: no surface of its own, so the mark sits
      // on the menu instead of on a white tile.
      '.dsh-model-allowance-menu-mark{display:inline-flex;align-items:center;',
      'justify-content:center;width:20px;height:20px;flex:none;border-radius:5px;',
      'line-height:1;background:transparent;',
      'color:var(--provider-mark,var(--dsw-alias-label-primary))}',
      '.dsh-model-allowance-menu-mark svg{display:block}',
      '.dsh-model-allowance-window{margin-top:10px;padding-top:10px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      // The first window has no boundary above it: the switcher already ends
      // in a divider, and a bare provider row should not be underlined.
      '.dsh-model-allowance-window[data-first="true"]{margin-top:0;padding-top:8px;',
      'border-top:0}',
      '.dsh-model-allowance-window-head{display:flex;justify-content:space-between;',
      'align-items:baseline;gap:12px}',
      '.dsh-model-allowance-window-title{font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-model-allowance-percent{margin-top:2px;color:var(--dsw-alias-label-secondary);',
      'font-size:11px;font-variant-numeric:tabular-nums}',
      '.dsh-model-allowance-bar{margin-top:6px;height:6px;border-radius:999px;overflow:hidden;',
      'background:var(--dsw-alias-bg-layer-2);',
      'box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1)}',
      '.dsh-model-allowance-bar-fill{height:100%;border-radius:999px;',
      'background:var(--dsw-alias-state-success-primary);transition:width 300ms ease}',
      '.dsh-model-allowance-bar-fill[data-tone="warn"]{',
      'background:var(--dsw-alias-state-warn-primary)}',
      '.dsh-model-allowance-bar-fill[data-tone="error"]{',
      'background:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-allowance-foot{display:flex;justify-content:space-between;',
      'align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:5px;',
      'color:var(--dsw-alias-label-secondary);',
      'font-size:11px;font-variant-numeric:tabular-nums;word-break:break-word}',
      '.dsh-model-allowance-error{padding:4px 0;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-allowance-reason{padding:2px 0;color:var(--dsw-alias-label-secondary);',
      'font-size:11px;word-break:break-word}',
      // The footer is one right-aligned cluster: the reading time sits directly
      // left of the two icon buttons.
      '.dsh-model-allowance-actions{display:flex;align-items:center;',
      'justify-content:flex-end;gap:8px;margin-top:8px;padding-top:8px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-allowance-updated{color:var(--dsw-alias-label-secondary);font-size:11px;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;margin-right:2px}',
      '.dsh-model-allowance-icon-button{display:inline-flex;align-items:center;',
      'justify-content:center;box-sizing:border-box;width:26px;height:26px;flex:none;padding:0;',
      'border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;',
      'color:var(--dsw-alias-label-secondary);cursor:pointer;text-decoration:none}',
      '.dsh-model-allowance-icon-button:hover{color:var(--dsw-alias-label-primary);',
      'border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-model-allowance-icon-button:focus-visible{',
      'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-model-allowance-icon-button[disabled]{opacity:.5;cursor:default}',
      '.dsh-model-allowance-icon-button svg{display:block}',
      // The platform status row: one dot whose colour is the state, the
      // localized label, and a link to the source page when the vendor
      // publishes one. It sits at the left edge of the footer, so the margin
      // below pushes the reading time and the buttons to the right edge.
      '.dsh-model-allowance-status{display:inline-flex;align-items:center;gap:5px;',
      'margin-right:auto;min-width:0;font-size:11px;',
      'color:var(--dsw-alias-label-primary);text-decoration:none}',
      'a.dsh-model-allowance-status:hover{text-decoration:underline}',
      '.dsh-model-allowance-status-label{flex:none}',
      // The source's own words are the first thing to give up room when the
      // footer is narrow; the state label and the dot never shrink.
      '.dsh-model-allowance-status-summary{color:var(--dsw-alias-label-secondary);',
      'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-model-allowance-status-dot{width:6px;height:6px;border-radius:50%;flex:none;',
      'background:var(--dsw-alias-state-success-primary)}',
      '.dsh-model-allowance-status[data-state="degraded"] .dsh-model-allowance-status-dot,',
      '.dsh-model-allowance-status[data-state="maintenance"] .dsh-model-allowance-status-dot{',
      'background:var(--dsw-alias-state-warn-primary)}',
      '.dsh-model-allowance-status[data-state="partial-outage"] .dsh-model-allowance-status-dot,',
      '.dsh-model-allowance-status[data-state="major-outage"] .dsh-model-allowance-status-dot{',
      'background:var(--dsw-alias-state-error-primary)}',
      '.dsh-model-allowance-status-arrow{font-size:10px;flex:none;',
      'color:var(--dsw-alias-label-secondary)}',
      // The time-of-day pricing block: the schedule, the phase the clock is
      // in, and how long until it flips.
      '.dsh-model-allowance-schedule{margin-top:10px;padding-top:10px;',
      'border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-model-allowance-schedule-head{display:flex;justify-content:space-between;',
      'align-items:baseline;gap:12px}',
      '.dsh-model-allowance-schedule-title{font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-model-allowance-schedule-state{display:inline-flex;align-items:center;gap:5px;',
      'font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-model-allowance-schedule-dot{width:6px;height:6px;border-radius:50%;flex:none;',
      'background:var(--dsw-alias-state-success-primary)}',
      '.dsh-model-allowance-schedule[data-phase="peak"] .dsh-model-allowance-schedule-dot{',
      'background:var(--dsw-alias-state-warn-primary)}',
      '.dsh-model-allowance-schedule-ranges{margin-top:4px;font-size:11px;',
      'color:var(--dsw-alias-label-secondary);word-break:break-word}',
      '.dsh-model-allowance-schedule-countdown{margin-top:2px;font-size:11px;',
      'color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-model-allowance-schedule-note{margin-top:2px;font-size:11px;',
      'color:var(--dsw-alias-label-secondary);word-break:break-word}',
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

    /** How long a finished turn's difference stays on the badge. */
    const CONSUMPTION_MS = 10 * 1000

    /**
     * How often the badge re-reads the platform status.
     *
     * The dot speaks for the platform at a glance, so it cannot wait for the
     * panel to open. The Host caches each status source for the same minute,
     * so this cadence costs at most one upstream fetch per source per minute
     * however many browser tabs are open.
     */
    const STATUS_REFRESH_MS = 60 * 1000

    /**
     * Whether a reading's difference is still worth showing.
     *
     * A difference with nothing to say — none at all, or a magnitude that
     * rounds away at display precision — is treated as absent, so the badge
     * does not flicker through a `↓0.00` that carries no information.
     *
     * @param {{kind: string, delta: number, at: number} | undefined} consumption The difference.
     * @param {number} now The current instant.
     * @returns {boolean} True while it should be shown.
     */
    function consumptionFreshAt(consumption, now) {
      if (!consumption) return false
      if (!Number.isFinite(consumption.delta)) return false
      if (formatDelta(consumption) === '') return false
      return now - consumption.at < CONSUMPTION_MS
    }

    /**
     * The magnitude of a difference, without its sign.
     * @param {{kind: string, delta: number}} consumption The difference.
     * @returns {string} The formatted magnitude, or an empty string when it
     *   rounds away.
     */
    function formatDelta(consumption) {
      const magnitude = Math.abs(consumption.delta)
      if (consumption.kind === 'percent') {
        // A plan window moves in whole points at most turns, so a whole number
        // is right — but a turn that moves a fifth of a point is still a real
        // cost, and rounding it to 0% would hide it.
        if (magnitude >= 0.95) return `${String(Math.round(magnitude))}%`
        if (magnitude >= 0.05) return `${magnitude.toFixed(1)}%`
        return ''
      }
      // Matches how the balance itself is rendered: two decimals once they mean
      // something, four while the amounts are fractional cents.
      const value = magnitude >= 0.01 ? magnitude.toFixed(2) : magnitude.toFixed(4)
      return Number(value) === 0 ? '' : value
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
     * The language the interface is in.
     *
     * The locale service keeps `<html lang>` pointed at the active locale, so
     * reading it is reading the same choice every `t()` call resolves
     * through. A non-browser host has no document, and English is the
     * baseline there.
     *
     * @returns {'zh' | 'en'} The language, collapsed to the two baselines.
     */
    function activeLanguage() {
      const tag = typeof document !== 'undefined' ? document.documentElement?.lang : undefined
      return typeof tag === 'string' && tag.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    /**
     * Pick one route's display name from the Host metadata.
     *
     * A route without metadata falls back to its own id, so a newly added
     * adapter is readable before anyone writes copy for it.
     *
     * @param {{name?: {zh?: string, en?: string}} | undefined} entry Directory entry.
     * @param {string} route Provider route.
     * @returns {string} The display name.
     */
    function pickName(entry, route) {
      const name = entry?.name
      if (!name) return route
      return name[activeLanguage()] ?? name.en ?? name.zh ?? route
    }

    /** Shared status state to its locale key. */
    const STATUS_LABEL_KEYS = {
      operational: 'status.operational',
      degraded: 'status.degraded',
      'partial-outage': 'status.partialOutage',
      'major-outage': 'status.majorOutage',
      maintenance: 'status.maintenance',
      unknown: 'status.unknown',
    }

    /**
     * Name one status state in the interface language.
     * @param {string} state Shared status state.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {string} The label.
     */
    function statusLabel(state, t) {
      const key = STATUS_LABEL_KEYS[state]
      return key === undefined ? t('status.unknown') : t(key)
    }

    /**
     * The artwork this build can draw, keyed by the hint a route's Host
     * metadata carries.
     *
     * All three are the vendors' own artwork, taken from what each site
     * publishes: DeepSeek serves a standalone square icon SVG, MiniMax and
     * Zhipu serve wordmarks with the mark as the leading path. Neither of the
     * latter ships the mark on its own — their square PNGs are a jellyfish and
     * a letter tile respectively — so the glyph is lifted from the wordmark.
     * All three are trademarks of their owners and identify the provider here.
     *
     * Routes that share a vendor share a hint; the two DeepSeek entries look
     * alike on purpose, and the difference between the signed-in account and a
     * stored key is carried by the name. A hint this build has no artwork for
     * falls back to the route's initial over its brand colour, so adding a
     * vendor never requires touching this file.
     */

    /** DeepSeek's own square icon, 50x50, filled #4D6BFE. */
    const DEEPSEEK_PATH =
      'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'

    /**
     * MiniMax's waveform, the leading path of its official wordmark, which
     * spans 0..36.91 of the 129-wide lockup. The lettering that follows is
     * dropped.
     */
    const MINIMAX_PATH =
      'M17.5802 3.08155C17.5802 2.35036 16.987 1.75702 16.2589 1.75702C15.5309 1.75702 14.9377 2.35171 14.9377 3.08155V25.0348C14.9377 26.7337 13.5586 28.1164 11.8639 28.1164C10.1693 28.1164 8.79008 26.7337 8.79008 25.0348V10.9503C8.79008 10.2191 8.19688 9.62575 7.46886 9.62575C6.74085 9.62575 6.14765 10.2204 6.14765 10.9503V16.9201C6.14765 18.619 4.76846 20.0016 3.07381 20.0016C1.37915 20.0016 0 18.619 0 16.9201V14.7563C0 14.2711 0.392318 13.8778 0.876312 13.8778C1.36031 13.8778 1.75262 14.2711 1.75262 14.7563V16.9201C1.75262 17.6513 2.34579 18.2446 3.07381 18.2446C3.80182 18.2446 4.39502 17.6499 4.39502 16.9201V10.9503C4.39502 9.25138 5.77421 7.86874 7.46886 7.86874C9.16352 7.86874 10.5427 9.25138 10.5427 10.9503V25.0348C10.5427 25.766 11.1359 26.3593 11.8639 26.3593C12.5919 26.3593 13.1851 25.7646 13.1851 25.0348V16.4227V3.08155C13.1851 1.38265 14.5643 0 16.2589 0C17.9536 0 19.3328 1.38265 19.3328 3.08155V21.2599C19.3328 21.7451 18.9405 22.1384 18.4565 22.1384C17.9725 22.1384 17.5802 21.7451 17.5802 21.2599V3.08155ZM33.8405 7.86874C32.1458 7.86874 30.7666 9.25138 30.7666 10.9503V22.7155C30.7666 23.4467 30.1734 24.0401 29.4454 24.0401C28.7174 24.0401 28.1242 23.4454 28.1242 22.7155V3.08155C28.1242 1.38265 26.745 0 25.0504 0C23.3557 0 21.9766 1.38265 21.9766 3.08155V28.0042C21.9766 28.7354 21.3834 29.3287 20.6553 29.3287C19.9273 29.3287 19.3341 28.734 19.3341 28.0042V24.9186C19.3341 24.4334 18.9418 24.0401 18.4578 24.0401C17.9738 24.0401 17.5815 24.4334 17.5815 24.9186V28.0042C17.5815 29.7031 18.9607 31.0857 20.6553 31.0857C22.35 31.0857 23.7292 29.7031 23.7292 28.0042V3.08155C23.7292 2.35036 24.3224 1.75702 25.0504 1.75702C25.7784 1.75702 26.3716 2.35171 26.3716 3.08155V22.7155C26.3716 24.4144 27.7508 25.7971 29.4454 25.7971C31.1401 25.7971 32.5193 24.4144 32.5193 22.7155V10.9503C32.5193 10.2191 33.1125 9.62575 33.8405 9.62575C34.5685 9.62575 35.1617 10.2204 35.1617 10.9503V21.2599C35.1617 21.7451 35.554 22.1384 36.038 22.1384C36.522 22.1384 36.9143 21.7451 36.9143 21.2599V10.9503C36.9143 9.25138 35.5351 7.86874 33.8405 7.86874Z'

    /**
     * The waveform's official paint: brand magenta sweeping to orange across
     * the mark. Coordinates stay in the wordmark's own space, which still lines
     * up after the viewBox is cropped because the waveform starts at x=0.
     *
     * The id is fixed. The mark can be on screen twice, in the strip and in the
     * overflow menu, so two definitions may coexist; both are identical, and a
     * `url(#…)` resolves to the first, which paints the same either way.
     */
    const MINIMAX_GRADIENT = {
      id: 'dsh-balance-minimax-wave',
      x1: 0,
      y1: 15.5,
      x2: 36.9143,
      y2: 15.5,
      stops: [
        ['#E21680', '0'],
        ['#FF633A', '1'],
      ],
    }

    /**
     * Zhipu's glyph: the four blocks of the official wordmark, with their
     * gradients flattened to mid tones so the mark can be drawn twice in one
     * document without duplicating gradient ids.
     *
     * The wordmark also draws the star between the blocks as a shape filled
     * #f7f8fa. That is negative space, not part of the mark, and painting it
     * put a near-white star on the panel, which read as the icon having a white
     * background. Leaving it out lets the panel show through instead.
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
    ]

    /**
     * Each mark's viewBox and the ink it draws, in viewBox units.
     *
     * Every viewBox is cropped to its own glyph, so the ink fills it and the
     * two pairs agree. The split is kept because the sizing rule is about ink,
     * not about the file: a mark whose viewBox carried padding would otherwise
     * be drawn smaller than its neighbours for no visible reason. Matching ink
     * height is what gives all three the same top and bottom breathing room.
     */
    const ICON_GEOMETRY = {
      // DeepSeek's square icon draws 1..49.35 across and 7..43.35 down.
      deepseek: { x: 1, y: 7, vbW: 48.35, vbH: 36.35, inkW: 48.35, inkH: 36.35 },
      // MiniMax's waveform occupies 0..37.02 by 0..31.10 of the wordmark.
      minimax: { x: 0, y: 0, vbW: 37.023, vbH: 31.097, inkW: 37.023, inkH: 31.097 },
      zhipu: { x: 0, y: 0, vbW: 21.052, vbH: 24, inkW: 21.052, inkH: 24 },
    }

    /**
     * The mark for one route: its Host-declared artwork hint and brand colour,
     * or the route's initial in grey when this installation named neither.
     * @param {{iconHint?: string, color?: string} | undefined} entry Directory entry.
     * @param {string} route Provider route.
     * @returns {{icon?: string, letter?: string, color: string}} The mark.
     */
    function markOf(entry, route) {
      const color = typeof entry?.color === 'string' && entry.color !== '' ? entry.color : '#6b7280'
      if (typeof entry?.iconHint === 'string' && entry.iconHint !== '') {
        return { icon: entry.iconHint, color }
      }
      return { letter: route.slice(0, 1).toUpperCase(), color }
    }

    /**
     * The svg for one mark, sized so every mark draws the same ink height.
     *
     * A hint this build has no artwork for draws the route's initial instead:
     * a blank chip would be worse than a letter.
     *
     * @param {string} route Provider route.
     * @param {number} inkHeight Drawn height of the ink, in pixels.
     * @param {{icon?: string, letter?: string, color: string}} mark The mark.
     * @returns {object} The icon element.
     */
    function providerIcon(route, inkHeight, mark) {
      const geo = mark.icon === undefined ? undefined : ICON_GEOMETRY[mark.icon]
      if (mark.letter !== undefined || geo === undefined) {
        return h(
          'span',
          { className: 'dsh-model-allowance-tab-letter' },
          mark.letter ?? route.slice(0, 1).toUpperCase(),
        )
      }
      // Both dimensions must land on whole, even pixels.
      //
      // A fractional box is placed by flooring it against the chip's centre:
      // Zhipu's 12.28px box was laid out at 6 instead of the ideal 6.86, so
      // the mark sat a pixel left of centre while the vertical axis, whose box
      // happened to be exactly 14px, stayed perfect. Rounding to even makes
      // (chip - box) / 2 a whole number for the 26px and 20px chips.
      const even = (value) => Math.max(2, Math.round(value / 2) * 2)
      const boxH = even((inkHeight * geo.vbH) / geo.inkH)
      const boxW = even((inkHeight * geo.vbW) / geo.inkH)
      let content
      if (mark.icon === 'zhipu') {
        content = ZHIPU_PATHS.map((path, index) =>
          h('path', { key: `z-${String(index)}`, d: path.d, fill: path.fill }),
        )
      } else if (mark.icon === 'minimax') {
        // The waveform carries its own brand gradient rather than a flat tint.
        content = [
          h(
            'defs',
            { key: 'defs' },
            h(
              'linearGradient',
              {
                id: MINIMAX_GRADIENT.id,
                x1: MINIMAX_GRADIENT.x1,
                y1: MINIMAX_GRADIENT.y1,
                x2: MINIMAX_GRADIENT.x2,
                y2: MINIMAX_GRADIENT.y2,
                gradientUnits: 'userSpaceOnUse',
              },
              ...MINIMAX_GRADIENT.stops.map(([color, offset]) =>
                h('stop', { key: offset, offset, stopColor: color }),
              ),
            ),
          ),
          h('path', {
            key: 'wave',
            d: MINIMAX_PATH,
            fill: `url(#${MINIMAX_GRADIENT.id})`,
          }),
        ]
      } else {
        content = [h('path', { key: 'mark', d: DEEPSEEK_PATH, fill: 'currentColor' })]
      }
      return h(
        'svg',
        {
          viewBox: `${String(geo.x)} ${String(geo.y)} ${String(geo.vbW)} ${String(geo.vbH)}`,
          width: boxW,
          height: boxH,
          preserveAspectRatio: 'xMidYMid meet',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        ...content,
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

    /** Milliseconds per window unit, for ordering windows by their length. */
    const UNIT_MS = {
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
    }

    /**
     * The window a plan meters most finely: the shortest one it reports.
     *
     * A coding plan meters a short rolling window and a long one, and the
     * short window is the allowance a turn spends first — so it is the number
     * that moves, and the one the badge speaks for. A window whose length the
     * plan does not state cannot be ordered against the others and is skipped;
     * the caller falls back to the reading's own percentage for those.
     *
     * @param {Array<object>} windows Reported windows.
     * @returns {object | undefined} The shortest window reporting a percentage.
     */
    function shortestWindow(windows) {
      let shortest
      let shortestMs = Number.POSITIVE_INFINITY
      for (const window of windows) {
        if (typeof window.remainingPercent !== 'number') continue
        const unit = UNIT_MS[window.unit]
        if (unit === undefined) continue
        const count = typeof window.count === 'number' && window.count > 0 ? window.count : 1
        const lengthMs = unit * count
        if (lengthMs < shortestMs) {
          shortest = window
          shortestMs = lengthMs
        }
      }
      return shortest
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

    /** Two-digit clock segment. */
    const pad2 = (value) => String(value).padStart(2, '0')

    /** Zone formatters, built once: constructing one is not free. */
    const ZONE_FORMATTERS = new Map()

    /**
     * The formatter for one zone, built once.
     * @param {string} timeZone IANA zone.
     * @returns {Intl.DateTimeFormat} The formatter.
     */
    function zoneFormatter(timeZone) {
      let formatter = ZONE_FORMATTERS.get(timeZone)
      if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          weekday: 'short',
        })
        ZONE_FORMATTERS.set(timeZone, formatter)
      }
      return formatter
    }

    /**
     * The wall-clock parts of one instant in a named zone.
     * @param {number} ms The instant.
     * @param {string} timeZone IANA zone.
     * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: number}}
     *   The zone's calendar and clock at that instant.
     */
    function zoneParts(ms, timeZone) {
      const parts = zoneFormatter(timeZone).formatToParts(new Date(ms))
      const value = (type) => parts.find((part) => part.type === type)?.value ?? ''
      return {
        year: Number(value('year')),
        month: Number(value('month')),
        day: Number(value('day')),
        // Some runtimes render midnight as 24 with hour12 turned off.
        hour: Number(value('hour')) % 24,
        minute: Number(value('minute')),
        second: Number(value('second')),
        weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday')),
      }
    }

    /**
     * A zone's offset from UTC at one instant, in milliseconds.
     * @param {number} ms The instant.
     * @param {string} timeZone IANA zone.
     * @returns {number} The offset.
     */
    function zoneOffsetMs(ms, timeZone) {
      const parts = zoneParts(ms, timeZone)
      const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
      return wall - Math.floor(ms / 1000) * 1000
    }

    /**
     * The instant at which a wall-clock time occurs in a zone.
     *
     * Two passes: the first lands within a day of the answer, the second
     * corrects for a DST transition between the guess and the answer.
     *
     * @param {string} timeZone IANA zone.
     * @param {number} year Calendar year.
     * @param {number} month Calendar month, 1-based.
     * @param {number} day Calendar day.
     * @param {number} hour Wall-clock hour.
     * @param {number} minute Wall-clock minute.
     * @returns {number} Epoch milliseconds.
     */
    function zoneInstant(timeZone, year, month, day, hour, minute) {
      const wall = Date.UTC(year, month - 1, day, hour, minute, 0)
      const first = wall - zoneOffsetMs(wall, timeZone)
      return wall - zoneOffsetMs(first, timeZone)
    }

    /**
     * The schedule's phase at one instant.
     * @param {object} schedule The schedule.
     * @param {number} now The instant.
     * @returns {'peak'|'off-peak'} The phase.
     */
    function schedulePhase(schedule, now) {
      const parts = zoneParts(now, schedule.timezone)
      const date = `${String(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`
      if ((schedule.holidays ?? []).includes(date)) return 'off-peak'
      if (!schedule.days.includes(parts.weekday)) return 'off-peak'
      const minutes = parts.hour * 60 + parts.minute
      for (const window of schedule.windows) {
        const [fromHour, fromMinute] = window.from.split(':').map(Number)
        const [toHour, toMinute] = window.to.split(':').map(Number)
        if (minutes >= fromHour * 60 + fromMinute && minutes < toHour * 60 + toMinute) return 'peak'
      }
      return 'off-peak'
    }

    /**
     * The next instant at which the phase flips.
     *
     * Only window edges are transitions: outside the windows the phase is
     * always off-peak, so a weekend or a holiday needs no boundary of its own.
     * Ten days reach past the longest statutory break to the next window.
     *
     * @param {object} schedule The schedule.
     * @param {number} now The instant.
     * @returns {number | undefined} The next change, when one is within reach.
     */
    function nextScheduleChange(schedule, now) {
      const parts = zoneParts(now, schedule.timezone)
      let next
      for (let offset = 0; offset <= 10; offset += 1) {
        const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + offset * 86_400_000)
        const year = day.getUTCFullYear()
        const month = day.getUTCMonth() + 1
        const date = day.getUTCDate()
        const key = `${String(year)}-${pad2(month)}-${pad2(date)}`
        if ((schedule.holidays ?? []).includes(key)) continue
        if (!schedule.days.includes(day.getUTCDay())) continue
        for (const window of schedule.windows) {
          for (const time of [window.from, window.to]) {
            const [hour, minute] = time.split(':').map(Number)
            const at = zoneInstant(schedule.timezone, year, month, date, hour, minute)
            if (at > now && (next === undefined || at < next)) next = at
          }
        }
      }
      return next
    }

    /**
     * The time-of-day pricing block.
     * @param {object} schedule The schedule.
     * @param {number} now The instant the card is showing.
     * @param {(key: string, params?: object) => string} t Translator.
     * @returns {object} The block.
     */
    function scheduleView(schedule, now, t) {
      const language = activeLanguage()
      const phase = schedulePhase(schedule, now)
      const change = nextScheduleChange(schedule, now)
      const separator = language === 'zh' ? '、' : ', '
      const windows = schedule.windows.map((window) => `${window.from}–${window.to}`).join(separator)
      const days =
        schedule.days.length === 7
          ? t('schedule.daysDaily')
          : [1, 2, 3, 4, 5].every((day) => schedule.days.includes(day))
            ? t('schedule.daysWeekdays')
            : t('schedule.daysOther')
      const timezone =
        schedule.timezoneLabel?.[language] ?? schedule.timezoneLabel?.en ?? schedule.timezone
      const note = schedule.note?.[language] ?? schedule.note?.en ?? schedule.note?.zh
      return h(
        'div',
        { className: 'dsh-model-allowance-schedule', 'data-phase': phase },
        h(
          'div',
          { className: 'dsh-model-allowance-schedule-head' },
          h('span', { className: 'dsh-model-allowance-schedule-title' }, t('schedule.title')),
          h(
            'span',
            { className: 'dsh-model-allowance-schedule-state' },
            h('span', { className: 'dsh-model-allowance-schedule-dot', 'aria-hidden': true }),
            phase === 'peak' ? t('schedule.peak') : t('schedule.offPeak'),
          ),
        ),
        h(
          'div',
          { className: 'dsh-model-allowance-schedule-ranges' },
          t('schedule.ranges', { days, windows, timezone }),
        ),
        change === undefined
          ? null
          : h(
              'div',
              { className: 'dsh-model-allowance-schedule-countdown' },
              t(phase === 'peak' ? 'schedule.toOffPeak' : 'schedule.toPeak', {
                duration: formatCountdown(change - now),
              }),
            ),
        note === undefined ? null : h('div', { className: 'dsh-model-allowance-schedule-note' }, note),
      )
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
      const selected = selection?.next?.provider ?? selection?.lastUsed?.provider ?? null

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
      // Every route the Host can read, with the metadata that names and draws
      // it. The switcher offers the configured ones; the metadata of the rest
      // still names the route when it is the one being read.
      const [directory, setDirectory] = React.useState([])
      const lastModelProvider = React.useRef(null)

      /** The routes this installation can read, for the switcher. */
      const available = directory.filter((entry) => entry.configured)

      /**
       * The directory entry for one route, when the Host named it.
       * @param {string} route Provider route.
       * @returns {object | undefined} The entry.
       */
      const entryOf = (route) => directory.find((entry) => entry.route === route)

      /**
       * Name a route from its metadata, falling back to the route id.
       * @param {string} route Provider route.
       * @returns {string} The display name.
       */
      const nameOf = (route) => pickName(entryOf(route), route)

      /**
       * The mark for a route, from its metadata.
       * @param {string} route Provider route.
       * @returns {{icon?: string, letter?: string, color: string}} The mark.
       */
      const markFor = (route) => markOf(entryOf(route), route)

      // The switcher is a single row of marks. When they cannot all fit, the
      // tail moves into a menu behind a button on the right, so the strip never
      // wraps or clips. Width is measured rather than assumed.
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [stripWidth, setStripWidth] = React.useState(0)
      const stripRef = React.useRef(null)

      // A session that has not taken a turn yet has no `modelSelection` to
      // read, and rendering nothing there would leave the composer without a
      // badge until the first message. Ask what a new session would use — the
      // installation's default, which the model selector also falls back to.
      const [defaultProvider, setDefaultProvider] = React.useState(null)
      // The provider's own platform status, fetched with the panel. The view
      // carries its provider, so a reading for the route that was selected a
      // moment ago is never shown against the current one.
      const [providerStatus, setProviderStatus] = React.useState(null)
      // The pricing schedule the vendor meters by, when it publishes one.
      const [schedule, setSchedule] = React.useState(null)

      // The panel names routes from the Host's directory: small, local, and
      // stable for a session. Fetching it at mount means the first open names
      // a route instead of flashing its id; the open-time refresh below keeps
      // it current when a credential changed in the same session.
      React.useEffect(() => {
        let cancelled = false
        ;(async () => {
          try {
            const api = await getBalanceApi()
            if (!api || typeof api.list !== 'function') return
            const result = await api.list()
            if (cancelled || !result.ok) return
            setDirectory(result.value)
          } catch (error) {
            console.error('[model-allowance] listing providers failed', { error })
          }
        })()
        return () => {
          cancelled = true
        }
      }, [ctx])

      React.useEffect(() => {
        if (selected !== null) return undefined
        let cancelled = false
        ;(async () => {
          try {
            const api = await getBalanceApi()
            if (!api || typeof api.defaultProvider !== 'function') return
            const result = await api.defaultProvider()
            if (cancelled || result?.ok !== true) return
            const provider = result.value?.provider
            if (typeof provider === 'string' && provider !== '') setDefaultProvider(provider)
          } catch (error) {
            console.error('[model-allowance] reading the default provider failed', { error })
          }
        })()
        return () => {
          cancelled = true
        }
      }, [selected, ctx])

      const provider = selected ?? defaultProvider

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

      // Refresh the clock while the panel is open, and while a difference is
      // being shown — the card must fall back to the plain value on its own,
      // with no other render to trigger it. Once the difference expires this
      // effect re-runs and the interval stops.
      const showingDifference = consumptionFreshAt(view?.consumption, now)
      React.useEffect(() => {
        if (!open && !showingDifference) return
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [open, showingDifference, view?.consumption?.at])

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
            setDirectory(result.value)
          } catch (error) {
            console.error('[model-allowance] listing providers failed', { error })
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
            console.error('[model-allowance] reading failed', { provider, error })
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
                open: (signal) => api.watch(activeProvider, signal),
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
                  console.error('[model-allowance] reading stream failed', { provider: activeProvider, error })
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

      // The badge dot speaks for the platform: green while the service is
      // available, red once its own status page says otherwise. It is read for
      // the provider the badge speaks for, not only while the panel is open,
      // and refreshed on the same slow clock the Host caches it with.
      React.useEffect(() => {
        if (!activeProvider) return undefined
        let cancelled = false
        const readStatus = async () => {
          try {
            const api = await getBalanceApi()
            if (!api || typeof api.status !== 'function') return
            const result = await api.status(activeProvider)
            if (cancelled || !result.ok) return
            setProviderStatus(result.value)
          } catch (error) {
            console.error('[model-allowance] reading provider status failed', { error })
          }
        }
        void readStatus()
        const timer = setInterval(readStatus, STATUS_REFRESH_MS)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [activeProvider, ctx])

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
      }, [activeProvider, ctx])

      const refresh = React.useCallback(async () => {
        setRefreshing(true)
        try {
          const api = await getBalanceApi()
          if (!api) return
          const result = await api.refresh(activeProvider)
          if (result.ok) setView(result.value)
          // Status has its own cache, so a refresh asks again and takes
          // whatever the Host considers fresh.
          if (typeof api.status === 'function') {
            const status = await api.status(activeProvider)
            if (status.ok) setProviderStatus(status.value)
          }
        } catch (error) {
          console.error('[model-allowance] refresh failed', { provider: activeProvider, error })
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
          const percent = exhausted
            ? 0
            : (shortestWindow(windows)?.remainingPercent ?? view.percent)
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

      // Which platform light the badge shows. A status reading for another
      // route — or none yet — is not evidence about this one, so it stays
      // grey rather than claiming the platform is fine.
      const serviceState =
        providerStatus && providerStatus.provider === activeProvider
          ? providerStatus.state
          : 'unknown'

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
        const mark = markFor(entry.route)
        const name = nameOf(entry.route)
        return h(
          'button',
          {
            type: 'button',
            key: entry.route,
            role: 'tab',
            className: 'dsh-model-allowance-tab',
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
          providerIcon(entry.route, 14, mark),
        )
      }

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
            'data-provider': provider,
            'aria-expanded': open ? 'true' : 'false',
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
          ? h(
              'div',
              {
                className: 'dsh-model-allowance-panel',
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
                    { className: 'dsh-model-allowance-switcher-wrap' },
                    h(
                      'div',
                      {
                        ref: stripRef,
                        className: 'dsh-model-allowance-switcher',
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
                                  setPicked(entry.route)
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
                    const percent =
                      consumed === undefined ? undefined : Math.max(0, Math.round(consumed))
                    const filled =
                      consumed === undefined ? 0 : Math.min(100, Math.max(0, consumed))
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
                      // A window the account has not started spending yet has no
                      // reset to report, and saying so would be a line of noise.
                      // Otherwise the countdown holds the left edge and the
                      // target instant the right, so the eye can compare them.
                      typeof window.resetAt === 'number'
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
                    view.error
                      ? h('div', { className: 'dsh-model-allowance-reason' }, view.error)
                      : null,
                  )
                : null,
              view?.status === 'unsupported'
                ? h('div', { className: 'dsh-model-allowance-reason' }, t('badge.unsupported'))
                : null,
              view?.status === 'unconfigured'
                ? h('div', { className: 'dsh-model-allowance-reason' }, t('badge.unconfigured'))
                : null,
              // A vendor that prices by the wall clock gets its phase and
              // countdown here, above the footer.
              schedule && schedule.provider === activeProvider
                ? scheduleView(schedule, now, t)
                : null,
              h(
                'div',
                { className: 'dsh-model-allowance-actions' },
                // The platform status sits at the left edge of the footer, on
                // the same line as the reading time: the card gains no extra
                // row, and the state and the source page stay together.
                serviceState !== 'unknown'
                  ? h(
                      providerStatus.url ? 'a' : 'span',
                      {
                        className: 'dsh-model-allowance-status',
                        'data-state': providerStatus.state,
                        title:
                          providerStatus.summary === undefined
                            ? statusLabel(providerStatus.state, t)
                            : `${statusLabel(providerStatus.state, t)} · ${providerStatus.summary}`,
                        ...(providerStatus.url
                          ? {
                              href: providerStatus.url,
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
                        statusLabel(providerStatus.state, t),
                      ),
                      providerStatus.summary
                        ? h(
                            'span',
                            { className: 'dsh-model-allowance-status-summary' },
                            providerStatus.summary,
                          )
                        : null,
                      ...(providerStatus.url
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
                    )
                  : null,
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
              console.error('[model-allowance] the balance namespace did not register')
              settleBalanceNamespace(null)
            }
          })().catch((error) => {
            console.error('[model-allowance] mounting the balance namespace failed', { error })
            settleBalanceNamespace(null)
          })
          return () => {
            disposed = true
            balanceNamespace = null
            unmount?.()
          }
        }, 'model-allowance: balance namespace')

        // `conversation.input.right` renders immediately before the composer's
        // model seat, so the badge sits directly left of the model name. The
        // left group sits behind the permission and plan controls, far enough
        // away that the two stopped reading as related.
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
      },
    }
  },
})
