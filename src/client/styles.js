const STYLES = [
  '.dsh-model-allowance-root{position:relative;display:inline-flex;align-items:center}',
  // The badge is a trigger, the way the harness's own composer triggers
  // are: no frame of its own, a transparent surface, and the hover tint
  // only while the pointer is on it or the card is open. A bordered pill
  // read as a field rather than a control.
  '.dsh-model-allowance-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;',
  'border:0;border-radius:var(--dsw-radius-sm);background:0 0;',
  'color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;cursor:pointer;',
  'font-variant-numeric:tabular-nums;white-space:nowrap}',
  '.dsh-model-allowance-badge:hover{color:var(--dsw-alias-label-secondary);',
  'background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-model-allowance-badge[aria-expanded="true"]{color:var(--dsw-alias-label-secondary);',
  'background:var(--dsw-alias-interactive-bg-hover)}',
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
  //
  // The surface is the harness's own menu surface — a translucent white
  // behind a heavy blur — and the shadow is its own elevation scale. The
  // overlay token reads as a mask over the page behind, not as a panel
  // surface: on it this card came out a flat grey slab.
  // The floor is set for the layout, not for the content: with it removed
  // the card collapses to 248px, so 300px is the slack that lets a label
  // and its value read as two columns instead of one run-on line. The cap
  // is the harness's own idiom for a floating surface, so a narrow window
  // shrinks the card rather than pushing it off the composer.
  '.dsh-model-allowance-panel{position:absolute;bottom:calc(100% + 6px);right:0;z-index:20;',
  'box-sizing:border-box;min-width:300px;max-width:calc(100vw - 24px);',
  'padding:8px 10px 10px;border:0;',
  'border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);',
  'box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);',
  'font-size:12px}',
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
  // own, so the panel's own surface shows through behind the logo.
  //
  // A frame means one thing here: this is the provider being read. It is
  // not used to say anything else about a route, because a second meaning
  // makes an unselected mark look selected.
  '.dsh-model-allowance-tab{display:inline-flex;align-items:center;justify-content:center;',
  'box-sizing:border-box;width:26px;height:26px;flex:none;padding:0;',
  'border:1px solid transparent;border-radius:var(--dsw-radius-sm);',
  'background:0 0;line-height:1;cursor:pointer;',
  'color:var(--provider-mark,var(--dsw-alias-label-primary));opacity:.66}',
  '.dsh-model-allowance-tab:hover{opacity:.9}',
  // The selected mark gains the one frame the chip already has, and stops
  // being dimmed. It must not use the brand colour: in this theme that is
  // #0f1115, so a selected chip wore a near-black frame. It also gains no
  // background, since any fill here reintroduces a tile on the panel.
  '.dsh-model-allowance-tab[data-active="true"]{opacity:1;',
  'border-color:var(--dsw-alias-border-l2)}',
  '.dsh-model-allowance-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
  'outline-offset:-1px}',
  '.dsh-model-allowance-tab svg{display:block}',
  '.dsh-model-allowance-tab-letter{font-size:11px;font-weight:600;line-height:1}',
  '.dsh-model-allowance-more{display:inline-flex;align-items:center;justify-content:center;',
  'box-sizing:border-box;width:26px;height:26px;flex:none;margin-left:auto;padding:0;',
  'border-radius:var(--dsw-radius-sm);',
  'border:1px solid var(--dsw-alias-border-l1);background:0 0;cursor:pointer;',
  'color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1}',
  '.dsh-model-allowance-more:hover{color:var(--dsw-alias-label-secondary);',
  'border-color:var(--dsw-alias-border-l2)}',
  // The overflow menu is a second floating surface, so it carries the same
  // solid layer and elevation as the card it belongs to.
  '.dsh-model-allowance-menu{position:absolute;top:calc(100% + 2px);right:0;z-index:30;',
  'min-width:150px;padding:4px;border:0;',
  'border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);',
  'box-shadow:var(--dsw-elevation-prominent)}',
  '.dsh-model-allowance-menu-item{display:flex;align-items:center;gap:8px;width:100%;',
  'padding:4px 6px;border:0;border-radius:var(--dsw-radius-xs);background:0 0;',
  'color:var(--dsw-alias-label-primary);font-size:12px;text-align:left;cursor:pointer}',
  '.dsh-model-allowance-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // Same rule as the strip chips: no surface of its own, so the mark sits
  // on the menu instead of on a tile.
  '.dsh-model-allowance-menu-mark{display:inline-flex;align-items:center;',
  'justify-content:center;width:20px;height:20px;flex:none;border-radius:var(--dsw-radius-xs);',
  'line-height:1;background:0 0;',
  'color:var(--provider-mark,var(--dsw-alias-label-primary))}',
  '.dsh-model-allowance-menu-mark svg{display:block}',
  // The model list is a third floating surface. It opens upwards from the
  // footer button, so it carries the same menu surface and elevation as the
  // card and the provider overflow menu.
  //
  // It is the one surface that is not translucent: the list floats over the
  // conversation, and a frosted panel there let the text underneath show
  // through the model names. A solid layer keeps the list readable wherever
  // it opens.
  '.dsh-model-allowance-model-wrap{position:relative;display:inline-flex}',
  '.dsh-model-allowance-model-menu{position:absolute;bottom:calc(100% + 4px);right:0;z-index:30;',
  'min-width:180px;max-width:260px;max-height:240px;overflow-y:auto;padding:4px;border:0;',
  'border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);',
  'box-shadow:var(--dsw-elevation-prominent)}',
  '.dsh-model-allowance-model-item{display:flex;align-items:center;justify-content:space-between;',
  'gap:10px;width:100%;padding:4px 6px;border:0;border-radius:var(--dsw-radius-xs);',
  'background:0 0;color:var(--dsw-alias-label-primary);font-size:12px;text-align:left;cursor:pointer}',
  '.dsh-model-allowance-model-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // The model the session uses is dimmed rather than framed: a frame here
  // would give the chip a second meaning it does not have.
  '.dsh-model-allowance-model-item[data-current="true"]{color:var(--dsw-alias-label-secondary)}',
  '.dsh-model-allowance-model-item[disabled]{opacity:.6;cursor:default}',
  '.dsh-model-allowance-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  // The trailing side of a model row carries its state label and, for a
  // model with reasoning efforts, the arrow that says a flyout waits to
  // the right.
  '.dsh-model-allowance-model-side{display:inline-flex;align-items:center;gap:4px;flex:none}',
  '.dsh-model-allowance-model-arrow{color:var(--dsw-alias-label-tertiary);font-size:12px;',
  'line-height:1}',
  // The effort flyout opens to the right of the list, on the row the
  // pointer rests on, as a fourth floating surface of the card. It overlaps
  // the list, so it is solid for the same reason the list is.
  '.dsh-model-allowance-effort-menu{position:absolute;left:calc(100% + 4px);z-index:31;',
  'display:flex;flex-direction:column;min-width:130px;max-width:220px;padding:4px;border:0;',
  'border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);',
  'box-shadow:var(--dsw-elevation-prominent)}',
  '.dsh-model-allowance-effort-item{display:flex;align-items:center;justify-content:space-between;',
  'gap:10px;width:100%;padding:3px 6px;border:0;border-radius:var(--dsw-radius-xs);',
  'background:0 0;color:var(--dsw-alias-label-primary);font-size:12px;text-align:left;cursor:pointer}',
  '.dsh-model-allowance-effort-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // The provider's own default effort is dimmed like the model in use, so
  // the open submenu points at it before anything is picked.
  '.dsh-model-allowance-effort-item[data-default="true"],',
  '.dsh-model-allowance-effort-item[data-current="true"]{color:var(--dsw-alias-label-secondary)}',
  '.dsh-model-allowance-effort-item[disabled]{opacity:.6;cursor:default}',
  // The trailing label names the state of one model: the one in use, or the
  // one being switched to.
  '.dsh-model-allowance-model-note{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}',
  // A message covers the whole list: it loads, it is empty, or the switch
  // failed and says why.
  '.dsh-model-allowance-model-message{padding:4px 6px;color:var(--dsw-alias-label-secondary);',
  'font-size:11px;word-break:break-word}',
  '.dsh-model-allowance-model-message[data-tone="error"]{',
  'color:var(--dsw-alias-state-error-primary)}',
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
  // The bar's track is the harness's own hover tint, not a white well: on
  // a white card a white track was invisible, and the inset frame around
  // it drew the eye to the groove instead of to the fill.
  '.dsh-model-allowance-bar{margin-top:6px;height:6px;border-radius:999px;overflow:hidden;',
  'background:var(--dsw-alias-interactive-bg-hover)}',
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
  'border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:0 0;',
  'color:var(--dsw-alias-label-tertiary);cursor:pointer;text-decoration:none}',
  '.dsh-model-allowance-icon-button:hover{color:var(--dsw-alias-label-secondary);',
  'border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}',
  // The vendor in use paints the switch glyph in that vendor's own colour,
  // so the button says which vendor the card is on. The frame stays
  // neutral: a coloured frame would fight the vendor marks in the strip
  // above it.
  '.dsh-model-allowance-icon-button[data-in-use="true"]{',
  'color:var(--provider-mark,var(--dsw-alias-label-primary));',
  'border-color:var(--dsw-alias-border-l3)}',
  '.dsh-model-allowance-icon-button[data-in-use="true"]:hover{',
  'color:var(--provider-mark,var(--dsw-alias-label-primary));',
  'background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-model-allowance-icon-button:focus-visible{',
  'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.dsh-model-allowance-icon-button[disabled]{opacity:.5;cursor:default}',
  '.dsh-model-allowance-icon-button svg{display:block}',
  // The platform status row: one dot whose colour is the state, the
  // localized label, and a link to the source page when the vendor
  // publishes one. It sits at the left edge of the footer, so the margin
  // below pushes the reading time and the buttons to the right edge.
  '.dsh-model-allowance-status-wrap{display:inline-flex;align-items:center;gap:5px;',
  'margin-right:auto;min-width:0;font-size:11px}',
  '.dsh-model-allowance-status{display:inline-flex;align-items:center;gap:5px;',
  'color:var(--dsw-alias-label-primary);text-decoration:none}',
  'a.dsh-model-allowance-status:hover{text-decoration:underline}',
  '.dsh-model-allowance-status-label{flex:none}',
  // The degraded reason hides behind a warning mark: the footer keeps one
  // row, and the detail is one hover away. The mark wears the same hue an
  // exhausted allowance does, so the two warnings read alike.
  '.dsh-model-allowance-status-help{position:relative;display:inline-flex;',
  'align-items:center;justify-content:center;box-sizing:border-box;width:14px;height:14px;',
  'flex:none;border:1px solid var(--dsw-alias-state-error-primary);border-radius:50%;',
  'color:var(--dsw-alias-state-error-primary);font-size:9px;font-weight:700;line-height:1;',
  'cursor:help}',
  '.dsh-model-allowance-status-help:hover,',
  '.dsh-model-allowance-status-help:focus-visible{background:var(--dsw-alias-state-error-primary);',
  'color:var(--dsw-alias-label-primary-foreground);outline:none}',
  '.dsh-model-allowance-status-tip{display:none;position:absolute;left:0;',
  'bottom:calc(100% + 8px);z-index:40;width:max-content;max-width:240px;padding:6px 8px;',
  'border:0;border-radius:var(--dsw-radius-sm);',
  'background:var(--dsw-alias-tooltip-bg);box-shadow:var(--dsw-elevation-prominent);',
  'font-size:11px;font-weight:400;line-height:1.5;',
  // The hint sits on the harness's own tooltip surface, so it takes the
  // text colour that surface is read with: white on the dark tooltip.
  'color:var(--dsw-static-neutral-bluish-00);',
  'white-space:normal;text-align:left}',
  '.dsh-model-allowance-status-help:hover .dsh-model-allowance-status-tip,',
  '.dsh-model-allowance-status-help:focus-visible .dsh-model-allowance-status-tip{display:block}',
  '.dsh-model-allowance-status-dot{width:6px;height:6px;border-radius:50%;flex:none;',
  'background:var(--dsw-alias-state-success-primary)}',
  '.dsh-model-allowance-status[data-state="loading"] .dsh-model-allowance-status-dot,',
  '.dsh-model-allowance-status[data-state="unsupported"] .dsh-model-allowance-status-dot,',
  '.dsh-model-allowance-status[data-state="unknown"] .dsh-model-allowance-status-dot{',
  'background:var(--dsw-alias-state-idle-primary)}',
  '.dsh-model-allowance-status[data-state="loading"] .dsh-model-allowance-status-dot{opacity:.5}',
  '.dsh-model-allowance-status[data-state="degraded"] .dsh-model-allowance-status-dot,',
  '.dsh-model-allowance-status[data-state="maintenance"] .dsh-model-allowance-status-dot{',
  'background:var(--dsw-alias-state-warn-primary)}',
  '.dsh-model-allowance-status[data-state="partial-outage"] .dsh-model-allowance-status-dot,',
  '.dsh-model-allowance-status[data-state="major-outage"] .dsh-model-allowance-status-dot{',
  'background:var(--dsw-alias-state-error-primary)}',
  '.dsh-model-allowance-status-arrow{font-size:10px;flex:none;',
  'color:var(--dsw-alias-label-tertiary)}',
  // The time-of-day pricing block: the phase the clock is in, how far
  // through that stretch of time it is, and the countdown. The rule itself
  // hides behind the help mark, so the card stays readable.
  '.dsh-model-allowance-schedule{margin-top:10px;padding-top:10px;',
  'border-top:1px solid var(--dsw-alias-border-l1)}',
  '.dsh-model-allowance-schedule-head{display:flex;justify-content:space-between;',
  'align-items:center;gap:12px}',
  '.dsh-model-allowance-schedule-title{font-weight:500;color:var(--dsw-alias-label-primary)}',
  '.dsh-model-allowance-schedule-help{position:relative;display:inline-flex;',
  'align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:16px;',
  'flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;',
  'color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:600;line-height:1;',
  'cursor:help}',
  '.dsh-model-allowance-schedule-help:hover,',
  '.dsh-model-allowance-schedule-help:focus-visible{color:var(--dsw-alias-label-primary);',
  'border-color:var(--dsw-alias-label-secondary);outline:none}',
  // Opens upwards: the block sits just above the footer, so a tooltip
  // hanging below it would leave the panel.
  '.dsh-model-allowance-schedule-tip{display:none;position:absolute;right:0;',
  'bottom:calc(100% + 8px);z-index:40;width:max-content;max-width:240px;padding:6px 8px;',
  'border:0;border-radius:var(--dsw-radius-sm);',
  'background:var(--dsw-alias-tooltip-bg);box-shadow:var(--dsw-elevation-prominent);',
  'font-size:11px;font-weight:400;line-height:1.5;',
  'color:var(--dsw-static-neutral-bluish-00);',
  'white-space:normal;text-align:left}',
  '.dsh-model-allowance-schedule-help:hover .dsh-model-allowance-schedule-tip,',
  '.dsh-model-allowance-schedule-help:focus-visible .dsh-model-allowance-schedule-tip{',
  'display:block}',
  '.dsh-model-allowance-schedule-tip-line{display:block}',
  // One 24-hour strip for the vendor's day: its peak windows tinted red
  // and the off-peak day tinted green, both at low saturation so the
  // strip reads at a glance without glaring, and a cursor where the
  // clock stands.
  '.dsh-model-allowance-schedule-timeline{position:relative;margin-top:8px;height:8px;',
  'border-radius:4px;overflow:hidden;',
  'background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%,',
  'var(--dsw-alias-interactive-bg-hover));}',
  '.dsh-model-allowance-schedule-timeline-peak{position:absolute;top:0;bottom:0;',
  // The same hue the exhausted allowance uses, so "peak" and "spent" read
  // as one family of warnings rather than two unrelated colours.
  'background:var(--dsw-alias-state-error-primary);opacity:.4}',
  '.dsh-model-allowance-schedule-timeline-now{position:absolute;top:0;bottom:0;width:2px;',
  'margin-left:-1px;border-radius:1px;background:var(--dsw-alias-label-primary);',
  'box-shadow:0 0 0 1px var(--dsw-alias-bg-layer-1)}',
  '.dsh-model-allowance-schedule-ticks{display:flex;justify-content:space-between;',
  'margin-top:2px;font-size:9px;line-height:1;color:var(--dsw-alias-label-secondary);',
  'font-variant-numeric:tabular-nums}',
  '.dsh-model-allowance-schedule-countdown{margin-top:4px;text-align:right;font-size:11px;',
  'color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
  // A badge that fades or grows while a user asks for less motion is noise.
  '@media (prefers-reduced-motion:reduce){.dsh-model-allowance-delta{animation:none}',
  '.dsh-model-allowance-bar-fill{transition:none}}',
]

const STYLES_JOINED = STYLES.join('')

export { STYLES_JOINED as STYLES }
