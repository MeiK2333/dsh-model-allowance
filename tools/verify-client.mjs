/**
 * Load the client bundle in a sandbox that mimics the browser module system,
 * run its `apply`, and render the badge with a stubbed slot/framework.
 *
 * This catches syntax errors, bad requires, contribution-shape mistakes, and
 * component crashes without needing the live page.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as z from 'zod'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, '..', 'client.js')
const source = fs.readFileSync(bundlePath, 'utf8')

// --- Minimal React stand-in -------------------------------------------------
let hookState = []
let hookCursor = 0

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState(initial) {
    const index = hookCursor++
    if (!(index in hookState))
      hookState[index] = typeof initial === 'function' ? initial() : initial
    return [
      hookState[index],
      (next) => {
        hookState[index] = typeof next === 'function' ? next(hookState[index]) : next
      },
    ]
  },
  useEffect(effect) {
    hookCursor++
    effect()
  },
  useCallback(fn) {
    hookCursor++
    return fn
  },
  useMemo(fn) {
    hookCursor++
    return fn()
  },
  useRef(initial) {
    const index = hookCursor++
    if (!(index in hookState)) hookState[index] = { current: initial }
    return hookState[index]
  },
}

// The panel closes on an outside click or Escape, so the component touches the
// document. Record the listeners so a test can also fire them. The locale
// service keeps `<html lang>` on the active locale, so the stub carries one:
// the provider names below are the Chinese ones.
const documentListeners = new Map()
globalThis.document = {
  documentElement: { lang: 'zh-CN' },
  addEventListener(type, listener) {
    const set = documentListeners.get(type) ?? new Set()
    set.add(listener)
    documentListeners.set(type, set)
  },
  removeEventListener(type, listener) {
    documentListeners.get(type)?.delete(listener)
  },
}
globalThis.Node = class Node {}

// The open panel ticks a countdown. A real interval would hold the process
// open for its period, so record and drop the timer instead.
const intervalHandles = []
globalThis.setInterval = (callback) => {
  const handle = { callback }
  intervalHandles.push(handle)
  return handle
}
globalThis.clearInterval = (handle) => {
  const index = intervalHandles.indexOf(handle)
  if (index >= 0) intervalHandles.splice(index, 1)
}

// --- Capture the module registration ---------------------------------------
let registration
const fakeWindow = {
  __ModuleLoader__: {
    load: (value) => {
      registration = value
    },
  },
}
new Function('window', source)(fakeWindow)
if (!registration) throw new Error('bundle did not register a module')
console.log('registered id:', registration.id)
if (registration.id !== 'dsh-model-allowance') {
  throw new Error(`unexpected id ${registration.id}`)
}

// --- Execute the factory ----------------------------------------------------
const moduleCache = { react: React, zod: z }
const plugin = registration.factory((specifier) => {
  if (specifier in moduleCache) return moduleCache[specifier]
  throw new Error(`unexpected require: ${specifier}`)
})
console.log('plugin inject:', JSON.stringify(plugin.inject))

// --- Stub the client context ------------------------------------------------
const effects = []
const registeredSlots = []
const localeDictionaries = []
let remoteMount

/** When the fixture's turn difference was measured; the expiry test moves past it. */
const consumptionAt = Date.now()

const ctx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') effects.push(dispose)
    return dispose
  },
  locale: {
    register: (ns, dicts) => {
      localeDictionaries.push({ ns, dicts })
      return () => {}
    },
    bind: (ns) => {
      const dict = localeDictionaries.find((entry) => entry.ns === ns)?.dicts.zh ?? {}
      return (key, params) => {
        let text = dict[key] ?? key
        for (const [name, value] of Object.entries(params ?? {})) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
        return text
      }
    },
  },
  remote: {
    $mount: async (contribution) => {
      remoteMount = { package: contribution.package, descriptors: contribution.descriptors }
      return () => {}
    },
    // Deliberately no `balance` here: a Remote namespace must be reached
    // through `ctx.get`, because reading it as an injected service throws.
  },
  // The inject-free lookup the component uses to reach the namespace.
  get: (key) =>
    key === 'remote.balance'
      ? {
          balance: async () => ({
            ok: true,
            value: {
              provider: 'deepseek-account',
              status: 'ready',
              kind: 'amount',
              amount: 46.71,
              currency: 'CNY',
              updatedAt: Date.now(),
              consoleUrl: 'https://platform.deepseek.com/top_up',
              // A turn just ended and consumed 0.9.
              consumption: { kind: 'amount', delta: -0.9, at: consumptionAt },
            },
          }),
          refresh: async () => ({ ok: true, value: {} }),
          list: async () => ({
            ok: true,
            value: [
              {
                route: 'deepseek-account',
                configured: true,
                name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
                color: '#4d6bfe',
                iconHint: 'deepseek',
              },
            ],
          }),
          status: async (route) => ({
            ok: true,
            value: { provider: route, state: 'operational', url: 'https://status.deepseek.com' },
          }),
          defaultProvider: async () => ({ ok: true, value: { provider: 'deepseek-account' } }),
        }
      : undefined,
  slots: {
    inject: (_key, callback) => {
      const effect = callback()
      if (typeof effect === 'function') effects.push(effect)
      return effect
    },
    register: (options, Component) => {
      registeredSlots.push({ options, Component })
      return () => {}
    },
  },
}

plugin.apply(ctx)
await new Promise((resolve) => setTimeout(resolve, 20))

console.log('locale namespaces:', localeDictionaries.map((entry) => entry.ns).join(', '))
console.log('slot registrations:', JSON.stringify(registeredSlots.map((entry) => entry.options)))
// The badge must sit immediately left of the model seat, which is what the
// `right` list group renders before; the `left` group is past the permission
// and plan controls.
const slotName = registeredSlots[0]?.options?.name
if (slotName !== 'conversation.input.right') {
  throw new Error(`badge registered in ${slotName}, expected conversation.input.right`)
}

if (!remoteMount) throw new Error('remote contribution was not mounted')
console.log('remote package:', remoteMount.package)
console.log(
  'remote descriptors:',
  JSON.stringify(
    remoteMount.descriptors.map((descriptor) => ({
      endpoint: `${descriptor.namespace}/${descriptor.method}`,
      service: descriptor.service,
      params: descriptor.parameters.map((parameter) => `${parameter.wire}:${parameter.codec.mode}`),
      result: descriptor.result.mode,
    })),
  ),
)

// --- Render the badge -------------------------------------------------------
const registrationEntry = registeredSlots[0]
if (!registrationEntry) throw new Error('badge was not registered')

hookState = []
hookCursor = 0
const projectionValue = {
  lastUsed: { provider: 'deepseek-account', model: 'deepseek-flash' },
  next: null,
}
const element = registrationEntry.Component({
  useProjection: (key) => (key === 'modelSelection' ? projectionValue : undefined),
})

function render(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const { type, props, children } = node
  const rendered = (children ?? []).map(render).join('')
  if (typeof type === 'function') return render(type({ ...props, children }))
  // Surface the attributes the assertions read: the bar's fill width and tone,
  // the timeline's segment and cursor positions, the switcher's selection, and
  // the accessible name a mark carries.
  const extra = []
  if (props.style && (props.style.left || props.style.width)) {
    const style = []
    if (props.style.left) style.push(`left:${String(props.style.left)}`)
    if (props.style.width) style.push(`width:${String(props.style.width)}`)
    extra.push(`style="${style.join(';')}"`)
  }
  for (const name of [
    'data-tone',
    'data-service',
    'data-phase',
    'data-first',
    'data-active',
    'aria-selected',
    'aria-expanded',
  ]) {
    if (props[name] !== undefined) extra.push(`${name}="${String(props[name])}"`)
  }
  if (props.title !== undefined) extra.push(`title="${String(props.title)}"`)
  // An icon's box size decides whether it lands on a whole pixel inside its
  // chip, so the assertions need to see it.
  if (type === 'svg') {
    if (props.width !== undefined) extra.push(`w="${String(props.width)}"`)
    if (props.height !== undefined) extra.push(`h="${String(props.height)}"`)
  }
  const suffix = extra.length > 0 ? ` ${extra.join(' ')}` : ''
  return `<${type} class="${props.className ?? ''}"${suffix}>${rendered}</${type}>`
}

const html = render(element)
console.log('rendered (first pass):', html)

// The stub React does not re-render on its own, so sample the settled state
// with a second pass that reuses the hook slots the effect already filled.
await new Promise((resolve) => setTimeout(resolve, 20))
hookCursor = 0
const settled = render(
  registrationEntry.Component({
    useProjection: (key) => (key === 'modelSelection' ? projectionValue : undefined),
  }),
)
console.log('rendered (settled):', settled)
if (!settled.includes('¥46.71')) throw new Error('badge did not render the DeepSeek amount')
// The dot speaks for the platform: this provider's status page says it is
// operational, so the light is green.
if (!settled.includes('data-service="operational"')) {
  throw new Error('an operational platform should light the badge dot green')
}

// --- The difference on the badge, and its ten-second life -----------------
{
  if (!settled.includes('class="dsh-model-allowance-delta"')) {
    throw new Error('a reading that moved should put its difference on the badge')
  }
  if (!settled.includes('↓0.90')) {
    throw new Error(`the badge should show how far it moved, rendered ${JSON.stringify(settled)}`)
  }

  // The component re-reads the clock on every render, so expiry cannot be
  // simulated by poking its state alone: both the state it renders from and the
  // clock its effect reads have to move.
  const laterAt = consumptionAt + 11_000
  const realNow = Date.now
  Date.now = () => laterAt
  hookState[5] = laterAt
  hookCursor = 0
  const expired = render(
    registrationEntry.Component({
      useProjection: (key) => (key === 'modelSelection' ? projectionValue : undefined),
    }),
  )
  Date.now = realNow
  hookCursor = 0

  if (expired.includes('class="dsh-model-allowance-delta"')) {
    throw new Error('the difference outlived its ten seconds')
  }
  if (!expired.includes('¥46.71')) throw new Error('the plain value did not come back')
  console.log('badge: showed ↓0.90 when the reading moved, and dropped it ten seconds later')
}

// --- The detail panel opens with no close button ---------------------------
{
  const renderBadge = () =>
    render(
      registrationEntry.Component({
        useProjection: (key) => (key === 'modelSelection' ? projectionValue : undefined),
      }),
    )

  const rootNode = new Node()
  const insideNode = new Node()
  const outsideNode = new Node()
  // `open` is the third state slot; `rootRef` is the fourth hook.
  hookState[2] = true
  hookState[4] = { current: { contains: (target) => target === insideNode || target === rootNode } }
  hookCursor = 0
  const opened = renderBadge()

  // With one readable provider the card names it instead of offering a switcher.
  if (!opened.includes('DeepSeek 账号')) throw new Error('panel did not render the provider name')
  if (opened.includes('class="dsh-model-allowance-tab"')) {
    throw new Error('a single readable provider should not render a switcher')
  }
  if (opened.includes('关闭')) throw new Error('panel still renders a close button')

  // --- the footer is two icon buttons plus the reading time ------------------
  {
    const footerStart = opened.indexOf('dsh-model-allowance-actions"')
    if (footerStart < 0) throw new Error('the footer row was not rendered')
    const footer = opened.slice(footerStart)
    if (opened.includes('class="dsh-model-allowance-action"')) {
      throw new Error('the old text-button class survived the footer rewrite')
    }
    // The reading time comes before both buttons and carries the new wording.
    const updated = /更新于 \d{2}:\d{2}:\d{2}/.exec(footer)
    if (!updated)
      throw new Error(`the footer is missing the reading time: ${JSON.stringify(footer)}`)
    const refreshAt = footer.indexOf('title="刷新"')
    const clockAt = footer.indexOf(updated[0])
    if (refreshAt < 0) throw new Error('the footer is missing the refresh button')
    if (clockAt > refreshAt)
      throw new Error('the reading time should sit left of the refresh button')
    // Both controls are compact icon buttons.
    const iconButtons = footer.split('class="dsh-model-allowance-icon-button"').length - 1
    if (iconButtons !== 2)
      throw new Error(`expected 2 icon buttons, rendered ${String(iconButtons)}`)
    if (!footer.includes('title="控制台"')) {
      throw new Error('the footer is missing the console button')
    }
    // The refresh button keeps a disabled state while it works.
    if (!/class="dsh-model-allowance-icon-button"[^>]*>\s*<svg/.test(footer)) {
      throw new Error('the icon buttons should draw a glyph, not a label')
    }
  }
  console.log(
    'panel opened:',
    opened.slice(opened.indexOf('<div class="dsh-model-allowance-panel"')),
  )

  // A click inside keeps it open.
  for (const listener of documentListeners.get('pointerdown') ?? []) {
    listener({ target: insideNode })
  }
  if (hookState[2] !== true) throw new Error('a click inside the panel closed it')

  // A click outside dismisses it.
  for (const listener of documentListeners.get('pointerdown') ?? []) {
    listener({ target: outsideNode })
  }
  if (hookState[2] !== false) throw new Error('a click outside did not close the panel')

  // Escape dismisses it too.
  hookState[2] = true
  hookCursor = 0
  renderBadge()
  for (const listener of documentListeners.get('keydown') ?? []) {
    listener({ key: 'Escape' })
  }
  if (hookState[2] !== false) throw new Error('Escape did not close the panel')
  console.log('outside click and Escape both close the panel; no close button rendered')
}

// --- Second scenario: the stream path --------------------------------------
// A host that exposes `$stream` is the preferred path, so prove it renders the
// pushed reading rather than only the unary fallback.
const streamEffects = []
const streamCtx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') streamEffects.push(dispose)
    return dispose
  },
  locale: ctx.locale,
  remote: {
    // A plain `$stream` arrow hid a real bug: the shipping method reads its own
    // connection, so calling it detached threw `undefined.connection`. The stub
    // is a method reading `this.connection` for the same reason the real one is.
    connection: { interactions: 'answer' },
    $mount: async (contribution) => {
      streamMount = { package: contribution.package, descriptors: contribution.descriptors }
      return () => {}
    },
    $stream(options) {
      if (this?.connection === undefined) {
        throw new TypeError("Cannot read properties of undefined (reading 'connection')")
      }
      const controller = new AbortController()
      const frames = [
        {
          provider: 'minimax-cn',
          status: 'ready',
          kind: 'quota',
          percent: 82,
          remainingMs: 16380448,
          updatedAt: Date.now(),
        },
      ]
      return {
        // Items are wrappers carrying the reading under `value`, exactly as
        // RemoteStream yields them.
        async *[Symbol.asyncIterator]() {
          void options.open(controller.signal)
          for (const frame of frames) {
            yield { generation: 1, value: frame, signal: controller.signal, accept: () => {} }
          }
        },
        dispose: () => controller.abort(),
      }
    },
  },
  get: (key) =>
    key === 'remote.balance'
      ? {
          balance: async () => ({ ok: false, error: { message: 'unary should not run' } }),
          refresh: async () => ({ ok: true, value: {} }),
          defaultProvider: async () => ({ ok: true, value: { provider: 'deepseek-account' } }),
          watch: (_provider, _model, _signal) => ({ async *[Symbol.asyncIterator]() {} }),
        }
      : undefined,
  slots: {
    inject: (_key, callback) => {
      const effect = callback()
      if (typeof effect === 'function') streamEffects.push(effect)
      return effect
    },
    register: (options, Component) => {
      streamSlot = { options, Component }
      return () => {}
    },
  },
}
let streamMount
let streamSlot

plugin.apply(streamCtx)
await new Promise((resolve) => setTimeout(resolve, 20))
if (!streamMount) throw new Error('stream scenario did not mount the namespace')

hookState = []
hookCursor = 0
const streamProviders = {
  lastUsed: { provider: 'minimax-cn', model: 'MiniMax-M3' },
  next: null,
}
render(
  streamSlot.Component({
    useProjection: (key) => (key === 'modelSelection' ? streamProviders : undefined),
  }),
)
await new Promise((resolve) => setTimeout(resolve, 20))
hookCursor = 0
const streamed = render(
  streamSlot.Component({
    useProjection: (key) => (key === 'modelSelection' ? streamProviders : undefined),
  }),
)
console.log(
  'rendered (stream):',
  streamed.slice(streamed.indexOf('<button'), streamed.indexOf('</button>') + 9),
)
if (!streamed.includes('剩余 82%')) throw new Error('stream reading did not render')

// --- Third scenario: a coding plan with metering windows --------------------
// Each window must show its own usage and its own reset countdown, which a
// single remaining percentage cannot express. The windows deliberately cover
// all three reset shapes: none, more than a day away, and inside a day.
{
  const now = Date.now()
  const planView = {
    provider: 'zai',
    status: 'ready',
    kind: 'quota',
    percent: 0,
    updatedAt: now,
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    windows: [
      // Not started: the Host reports no reset for it.
      {
        id: 'session',
        unit: 'hour',
        count: 5,
        used: 0,
        total: 2000,
        remainingPercent: 100,
      },
      // Days away, so the countdown carries a `dd.` prefix.
      {
        id: 'weekly',
        unit: 'week',
        count: 1,
        used: 10071,
        total: 10000,
        remainingPercent: 0,
        resetAt: now + (4 * 24 * 3600 + 3 * 3600) * 1000,
      },
      // Inside a day, so the countdown must drop that prefix.
      {
        id: 'limit-2',
        unit: 'unknown',
        count: undefined,
        used: 500,
        total: 1000,
        remainingPercent: 50,
        resetAt: now + (3 * 3600 + 30 * 60) * 1000,
      },
    ],
  }

  let planSlot
  let planMount
  /** Routes the card asked the Host about, in order. */
  const readRoutes = []
  const providerDirectory = [
    {
      route: 'deepseek-account',
      configured: true,
      name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
      color: '#4d6bfe',
      iconHint: 'deepseek',
    },
    {
      route: 'deepseek',
      configured: false,
      name: { zh: 'DeepSeek API', en: 'DeepSeek API' },
      color: '#4d6bfe',
      iconHint: 'deepseek',
    },
    {
      route: 'minimax-cn',
      configured: true,
      name: { zh: 'MiniMax', en: 'MiniMax' },
      color: '#e21680',
      iconHint: 'minimax',
    },
    {
      route: 'zai',
      configured: true,
      name: { zh: '智谱 GLM', en: 'Zhipu GLM' },
      color: '#5668f5',
      iconHint: 'zhipu',
    },
  ]

  const readFor = (route) => ({
    ok: true,
    value:
      route === 'minimax-cn'
        ? {
            provider: 'minimax-cn',
            status: 'ready',
            kind: 'quota',
            percent: 58,
            updatedAt: now,
            windows: [{ id: 'weekly', unit: 'day', count: 7, remainingPercent: 58 }],
          }
        : planView,
  })

  const planCtx = {
    effect: (fn) => fn(),
    locale: ctx.locale,
    remote: {
      $mount: async (contribution) => {
        planMount = contribution.package
        return () => {}
      },
      $stream: undefined,
    },
    get: (key) =>
      key === 'remote.balance'
        ? {
            balance: async (route) => {
              readRoutes.push(route)
              return readFor(route)
            },
            refresh: async (route) => readFor(route),
            list: async () => ({ ok: true, value: providerDirectory }),
            status: async (route) => ({
              ok: true,
              value: {
                provider: route,
                state: 'degraded',
                summary: 'go · upstream, free · latency',
                url: 'https://status.opencode.ai',
                updatedAt: Date.now(),
              },
            }),
            defaultProvider: async () => ({ ok: true, value: { provider: 'deepseek-account' } }),
          }
        : undefined,
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, Component) => {
        planSlot = { options, Component }
        return () => {}
      },
    },
  }

  plugin.apply(planCtx)
  await new Promise((resolve) => setTimeout(resolve, 20))
  if (!planMount) throw new Error('plan scenario did not mount the namespace')

  hookState = []
  hookCursor = 0
  const planProviders = { lastUsed: { provider: 'zai', model: 'glm-4.6' }, next: null }
  /** Expand function components once, so hooks run a single time. */
  const expand = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') {
      return expand(node.type({ ...node.props, children: node.children }))
    }
    return { ...node, children: (node.children ?? []).map(expand) }
  }
  /** The rendered tree for the current state, with handlers intact. */
  const planTree = () => {
    hookCursor = 0
    return expand(
      planSlot.Component({
        useProjection: (key) => (key === 'modelSelection' ? planProviders : undefined),
      }),
    )
  }
  /** The same tree as markup, for text assertions. */
  const planBadge = () => render(planTree())

  planBadge()
  await new Promise((resolve) => setTimeout(resolve, 20))

  // Every window has allowance except the weekly one, which is exhausted; a
  // zero window decides the badge whatever the shorter window says.
  hookCursor = 0
  const planClosed = planBadge()
  if (!planClosed.includes('剩余 0%')) {
    throw new Error('badge should report the exhausted window')
  }
  // The platform is degraded in this scenario, so the badge dot is red.
  if (!planClosed.includes('data-service="degraded"')) {
    throw new Error('a degraded platform should light the badge dot red')
  }

  // Open the card and read both window blocks. The switcher list arrives from
  // the Host asynchronously, so sample the render after it settles.
  hookState[2] = true
  hookCursor = 0
  planBadge()
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookCursor = 0
  const planOpen = planBadge()
  const body = planOpen.slice(planOpen.indexOf('dsh-model-allowance-panel"'))
  console.log('plan card:', body)

  // The platform's own status rides in the footer, left of the reading time,
  // so a bad number can be told apart from a bad day without another row.
  {
    const footerAt = body.indexOf('dsh-model-allowance-actions')
    if (footerAt < 0) throw new Error('the footer row was not rendered')
    const footer = body.slice(footerAt)
    for (const expected of ['服务降级', 'go · upstream, free · latency']) {
      if (!footer.includes(expected)) {
        throw new Error(`the footer status is missing ${JSON.stringify(expected)}`)
      }
    }
    const statusAt = footer.indexOf('服务降级')
    const updatedAt = footer.indexOf('更新于')
    if (updatedAt < 0) throw new Error('the footer lost the reading time')
    if (statusAt > updatedAt) {
      throw new Error('the status should sit left of the reading time in the footer')
    }
    // The reason hides behind a warning mark rather than sitting in the row.
    if (!footer.includes('class="dsh-model-allowance-status-help"')) {
      throw new Error('the degraded reason should hide behind a warning mark')
    }
    if (!footer.includes('class="dsh-model-allowance-status-tip"')) {
      throw new Error('the warning mark should carry the reason in a tooltip')
    }
    console.log(
      'status: the card showed the platform state in the footer, left of the reading time',
    )
  }

  for (const expected of [
    '5 小时额度', // short window title
    '0 / 2,000', // countable units beside the title
    '0% 已使用', // consumed share
    '每周额度', // long window title
    '10,071 / 10,000', // long window units, digits grouped
    '100% 已使用', // long window consumed share
  ]) {
    if (!body.includes(expected))
      throw new Error(`plan card is missing ${JSON.stringify(expected)}`)
  }

  // Only the boundaries between windows are drawn: the first block has the
  // switcher's divider above it already, and a second line there read as a
  // stray bar.
  if (!body.includes('class="dsh-model-allowance-window" data-first="true"')) {
    throw new Error('the first window should not draw a divider above it')
  }
  {
    const windows = body.split('class="dsh-model-allowance-window"').length - 1
    const marked = body.split('data-first="true"').length - 1
    if (windows !== 3) throw new Error(`expected three window blocks, got ${String(windows)}`)
    if (marked !== 1)
      throw new Error(`exactly one window should be the first, got ${String(marked)}`)
  }

  // --- the bars carry the numbers and turn colour -------------------------
  // 0% used is an empty bar and a full bar at 100%, and the tone escalates.
  if (!body.includes('class="dsh-model-allowance-bar-fill" style="width:0%" data-tone="ok"')) {
    throw new Error('the unused window should render an empty ok bar')
  }
  if (!body.includes('class="dsh-model-allowance-bar-fill" style="width:100%" data-tone="error"')) {
    throw new Error('the exhausted window should render a full error bar')
  }
  // --- the reset line: countdown left, target instant right ---------------
  // Split per window so each countdown shape is checked on its own block.
  {
    const blocks = body.split('dsh-model-allowance-window"').slice(1)
    const blockOf = (title) => blocks.find((block) => block.includes(title))
    /** The footer's text with its markup removed, or undefined when absent. */
    const footerText = (block) => {
      const marker = 'dsh-model-allowance-foot">'
      const start = block.indexOf(marker)
      if (start < 0) return undefined
      const from = start + marker.length
      return block
        .slice(from, block.indexOf('</div>', from))
        .replace(/<[^>]*>/g, '')
        .trim()
    }

    const weeklyBlock = blockOf('每周额度')
    if (!weeklyBlock) throw new Error('the weekly window block was not rendered')
    const weeklyFoot = footerText(weeklyBlock)
    // More than a day out keeps the `dd.` prefix, and the countdown precedes
    // the target instant, which carries no label of its own.
    if (
      !/^\d{2}\.\d{2}:\d{2}:\d{2} 后重置\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(weeklyFoot ?? '')
    ) {
      throw new Error(`unexpected multi-day reset line: ${JSON.stringify(weeklyFoot)}`)
    }

    // Inside a day drops the prefix entirely.
    const nearBlock = blockOf('当前额度')
    if (!nearBlock) throw new Error('the near-reset window block was not rendered')
    const nearFoot = footerText(nearBlock)
    if (!/^\d{2}:\d{2}:\d{2} 后重置\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(nearFoot ?? '')) {
      throw new Error(
        `a window inside a day should drop the dd. prefix: ${JSON.stringify(nearFoot)}`,
      )
    }
  }

  // --- a window with no reset shows no reset line at all -------------------
  // The 5-hour window has not started here, so the Host reports no resetAt.
  // The card must drop the whole footer rather than print a placeholder.
  {
    const windows = body.split('dsh-model-allowance-window"').slice(1)
    const sessionBlock = windows.find((block) => block.includes('5 小时额度'))
    if (!sessionBlock) throw new Error('the session window block was not rendered')
    const sessionOnly = sessionBlock.slice(0, sessionBlock.indexOf('</div></div>'))
    if (sessionOnly.includes('dsh-model-allowance-foot')) {
      throw new Error('a window without a reset should not render the reset footer')
    }
    if (sessionOnly.includes('无重置时间')) {
      throw new Error('the card still prints a no-reset placeholder')
    }
    // The window that does have a reset keeps its footer.
    const weeklyBlock = windows.find((block) => block.includes('每周额度'))
    if (!weeklyBlock?.includes('dsh-model-allowance-foot')) {
      throw new Error('the window with a reset lost its footer')
    }
  }

  // --- the switcher lists what this installation can actually read ---------
  if (readRoutes[0] !== 'zai') {
    throw new Error(
      `the card should open on the model's provider, read ${JSON.stringify(readRoutes)}`,
    )
  }
  // The marks are letters; the full name rides in the accessible name.
  for (const name of ['DeepSeek 账号', 'MiniMax', '智谱 GLM']) {
    if (!body.includes(`title="${name}"`)) throw new Error(`switcher is missing ${name}`)
  }
  // --- every icon box is a whole, even pixel count --------------------------
  // A fractional box is floored into the chip's centre, which put Zhipu's mark
  // a pixel left of centre while the others leaned left too, by different
  // amounts. Whole even boxes make (chip - box) / 2 exact.
  {
    const boxes = [...body.matchAll(/w="([^"]+)" h="([^"]+)"/g)]
    if (boxes.length < 2) throw new Error('no icon boxes found to check')
    for (const [, w, h] of boxes) {
      for (const value of [w, h]) {
        if (!/^\d+$/.test(value)) {
          throw new Error(`icon box ${value} is not a whole number of pixels`)
        }
        if (Number(value) % 2 !== 0) {
          throw new Error(`icon box ${value} is odd, so its offset lands mid-pixel`)
        }
      }
    }
    console.log(
      `icon boxes: ${boxes.map(([, w, h]) => `${w}x${h}`).join(' ')} — all whole and even`,
    )
  }
  // `deepseek` has no key configured here, so it must not be offered.
  if (body.includes('title="DeepSeek API"')) {
    throw new Error('switcher offered a provider without a credential')
  }
  // Every mark sits on one row: the strip must not wrap.
  if (!body.includes('class="dsh-model-allowance-switcher"')) {
    throw new Error('the switcher strip was not rendered')
  }

  // --- picking another provider re-reads it --------------------------------
  /** Collect every button node in a rendered tree. */
  const buttonsIn = (node, out = []) => {
    if (node === null || node === undefined || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const child of node) buttonsIn(child, out)
      return out
    }
    if (node.type === 'button') out.push(node)
    for (const child of node.children ?? []) buttonsIn(child, out)
    return out
  }
  /** Flatten an element's text content. */
  const textIn = (node) => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textIn).join('')
    return textIn(node.children)
  }
  /** Find one switcher mark by the provider name it announces. */
  const tabNamed = (tree, label) =>
    buttonsIn(tree).find(
      (button) =>
        button.props.className === 'dsh-model-allowance-tab' && button.props.title === label,
    )

  const miniMaxTab = tabNamed(planTree(), 'MiniMax')
  if (!miniMaxTab) throw new Error('the MiniMax tab was not rendered')
  readRoutes.length = 0
  miniMaxTab.props.onClick()
  planBadge()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const afterSwitch = planBadge()

  if (!readRoutes.includes('minimax-cn')) {
    throw new Error(`switching did not read minimax-cn, read ${JSON.stringify(readRoutes)}`)
  }
  if (!afterSwitch.includes('每周额度')) {
    throw new Error('switched card did not show the MiniMax weekly window')
  }
  console.log('switcher: picked MiniMax and the card re-read it')

  // Switching back restores the other provider.
  const zaiTab = tabNamed(planTree(), '智谱 GLM')
  if (!zaiTab) throw new Error('the Zhipu tab disappeared after switching')
  readRoutes.length = 0
  zaiTab.props.onClick()
  planBadge()
  await new Promise((resolve) => setTimeout(resolve, 20))
  planBadge()
  if (!readRoutes.includes('zai')) throw new Error('switching back did not read zai')
  console.log('switcher: picked Zhipu GLM again and the card re-read it')

  // --- a narrow strip overflows into a menu instead of wrapping ------------
  // Feeding a width the marks cannot all fit in proves the split: one mark
  // stays, the rest move behind the button, and the active provider is never
  // the one that disappears.
  {
    // Hook indices shifted after entryOf/nameOf were wrapped in useCallback:
    // 12 = stripWidth state, 13 = stripRef.
    hookState[12] = 60
    hookState[13] = { current: { clientWidth: 60 } }
    const narrowTree = planTree()
    const narrow = render(narrowTree)
    const tabs = buttonsIn(narrowTree).filter(
      (button) => button.props.className === 'dsh-model-allowance-tab',
    )
    if (tabs.length !== 1) {
      throw new Error(`a narrow strip should keep one mark, rendered ${String(tabs.length)}`)
    }
    if (!narrow.includes('dsh-model-allowance-more')) {
      throw new Error('a narrow strip should offer the overflow button')
    }
    // The provider being read survives the cut.
    if (tabs[0].props.title !== '智谱 GLM') {
      throw new Error(`the cut dropped the active provider, kept ${String(tabs[0].props.title)}`)
    }

    const moreButton = buttonsIn(narrowTree).find(
      (button) => button.props.className === 'dsh-model-allowance-more',
    )
    moreButton.props.onClick()
    const openedTree = planTree()
    const opened = render(openedTree)
    if (!opened.includes('dsh-model-allowance-menu')) {
      throw new Error('the overflow menu did not open')
    }
    for (const hidden of ['DeepSeek 账号', 'MiniMax']) {
      if (!opened.includes(hidden)) {
        throw new Error(`the overflow menu is missing ${hidden}`)
      }
    }
    console.log('switcher: a narrow strip kept the active mark and listed the rest in a menu')

    // Choosing from the menu switches the reading like a mark does.
    const item = buttonsIn(openedTree).find(
      (button) =>
        button.props.className === 'dsh-model-allowance-menu-item' &&
        textIn(button).includes('MiniMax'),
    )
    if (!item) throw new Error('the MiniMax menu item was not rendered')
    readRoutes.length = 0
    item.props.onClick()
    planBadge()
    await new Promise((resolve) => setTimeout(resolve, 20))
    planBadge()
    if (!readRoutes.includes('minimax-cn')) {
      throw new Error('picking from the menu did not read minimax-cn')
    }
    console.log('switcher: picking from the menu read the provider')
  }
}

// --- A session with no turns yet shows the installation's default ----------
{
  // The plan scenario above mounted its own namespace; mount the plain one
  // again so this block reads the same fixture the first section did.
  plugin.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookState = []
  hookCursor = 0
  const renderBlank = () => {
    hookCursor = 0
    return render(registrationEntry.Component({ useProjection: () => undefined }))
  }
  // Nothing to name a provider with yet, so the badge stays out of the way.
  const before = renderBlank()
  if (before !== '') {
    throw new Error(`a blank session painted before the default arrived: ${before}`)
  }
  // The default arrives asynchronously, and the reading it triggers does too.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    renderBlank()
  }
  const html = renderBlank()
  if (!html.includes('¥46.71')) {
    throw new Error(
      `a blank session did not pick up the default provider, rendered ${JSON.stringify(html)}`,
    )
  }
  console.log('blank session: the installation default filled the badge')
}

// --- A provider this build has no artwork for reads as its initial ---------
// The point of the metadata contract: a vendor added long after this client
// bundle was built still appears, named and coloured by the Host, with its
// initial standing in for artwork this build does not carry.
{
  const letterDirectory = [
    {
      route: 'deepseek-account',
      configured: true,
      name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
      color: '#4d6bfe',
      iconHint: 'deepseek',
    },
    {
      route: 'kimi-coding',
      configured: true,
      name: { zh: 'Kimi Coding', en: 'Kimi Coding' },
      color: '#636ff6',
    },
  ]
  const readLetter = (route) => ({
    ok: true,
    value: {
      provider: route,
      status: 'ready',
      kind: 'quota',
      percent: 60,
      updatedAt: Date.now(),
      windows: [{ id: 'weekly', unit: 'week', remainingPercent: 60 }],
    },
  })
  let letterSlot
  const letterCtx = {
    effect: (fn) => fn(),
    locale: ctx.locale,
    remote: { $mount: async () => () => {}, $stream: undefined },
    get: (key) =>
      key === 'remote.balance'
        ? {
            balance: async (route) => readLetter(route),
            refresh: async (route) => readLetter(route),
            list: async () => ({ ok: true, value: letterDirectory }),
            defaultProvider: async () => ({ ok: true, value: { provider: 'deepseek-account' } }),
          }
        : undefined,
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, Component) => {
        letterSlot = { options, Component }
        return () => {}
      },
    },
  }
  plugin.apply(letterCtx)
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookState = []
  hookCursor = 0
  const letterProjection = {
    lastUsed: { provider: 'kimi-coding', model: 'kimi-k2' },
    next: null,
  }
  const renderLetter = () => {
    hookCursor = 0
    return render(
      letterSlot.Component({
        useProjection: (key) => (key === 'modelSelection' ? letterProjection : undefined),
      }),
    )
  }
  renderLetter()
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookState[2] = true
  hookCursor = 0
  const letterCard = renderLetter()
  if (!letterCard.includes('class="dsh-model-allowance-tab-letter">K<')) {
    throw new Error(
      `a provider without artwork should draw its initial, rendered ${JSON.stringify(letterCard)}`,
    )
  }
  if (!letterCard.includes('title="Kimi Coding"')) {
    throw new Error('the added provider was not named from its metadata')
  }
  // This stub answers no status, so the light stays grey rather than claiming
  // the platform is fine.
  if (!letterCard.includes('data-service="unknown"')) {
    throw new Error('a route without a status source should leave the badge dot grey')
  }
  console.log('client: a vendor without artwork reads as its initial')
}

// --- A vendor without a balance API is still offered, and still switchable --
// The card is how models are picked. A vendor this build cannot price must
// therefore appear in the switcher, say so in the panel, and still offer its
// models — otherwise the user cannot move to it at all.
{
  const pricelessDirectory = [
    {
      route: 'deepseek-account',
      configured: true,
      name: { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
      color: '#4d6bfe',
      iconHint: 'deepseek',
    },
    {
      route: 'qwen-token-plan-cn',
      configured: true,
      name: { zh: '通义千问 Token Plan (国内)', en: 'Qwen Token Plan (CN)' },
      color: '#ff6a00',
    },
  ]
  const readPriceless = (route) => ({
    ok: true,
    value:
      route === 'qwen-token-plan-cn'
        ? { provider: route, status: 'unsupported', kind: 'quota' }
        : {
            provider: route,
            status: 'ready',
            kind: 'amount',
            amount: 46.71,
            currency: 'CNY',
            updatedAt: Date.now(),
          },
  })
  const switched = []
  let pricelessSlot
  const pricelessCtx = {
    effect: (fn) => fn(),
    locale: ctx.locale,
    remote: { $mount: async () => () => {}, $stream: undefined },
    get: (key) =>
      key === 'remote.balance'
        ? {
            balance: async (route) => readPriceless(route),
            refresh: async (route) => readPriceless(route),
            list: async () => ({ ok: true, value: pricelessDirectory }),
            status: async (route) => ({ ok: true, value: { provider: route, state: 'unknown' } }),
            defaultProvider: async () => ({ ok: true, value: { provider: 'deepseek-account' } }),
          }
        : key === 'remote.session'
          ? {
              selectModel: async (request) => {
                switched.push(request)
                return { ok: true }
              },
              modelCatalog: async () => ({
                ok: true,
                value: {
                  groups: [
                    {
                      id: 'qwen-token-plan-cn',
                      name: 'Qwen Token Plan CN',
                      models: [{ id: 'qwen4-max-preview', name: 'Qwen4 Max Preview' }],
                    },
                  ],
                },
              }),
            }
          : undefined,
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, Component) => {
        pricelessSlot = { options, Component }
        return () => {}
      },
    },
  }
  plugin.apply(pricelessCtx)
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookState = []
  hookCursor = 0
  const pricelessProjection = {
    lastUsed: { provider: 'qwen-token-plan-cn', model: 'qwen4-max-preview' },
    next: null,
  }
  const renderPriceless = () => {
    hookCursor = 0
    return render(
      pricelessSlot.Component({
        useProjection: (key) => (key === 'modelSelection' ? pricelessProjection : undefined),
        sessionId: 'session-1',
      }),
    )
  }
  renderPriceless()
  await new Promise((resolve) => setTimeout(resolve, 20))

  // The badge follows the session's vendor and says there is no balance API.
  const pricelessBadge = renderPriceless()
  if (!pricelessBadge.includes('通义千问 Token Plan (国内) 目前无余额接口')) {
    throw new Error(
      `the badge should say the vendor has no balance API, rendered ${JSON.stringify(pricelessBadge)}`,
    )
  }

  // Open the card: the vendor has its own mark, and the panel repeats the
  // reason next to the vendor it names.
  hookState[2] = true
  hookCursor = 0
  renderPriceless()
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookCursor = 0
  const pricelessCard = renderPriceless()
  if (!pricelessCard.includes('class="dsh-model-allowance-tab-letter">Q<')) {
    throw new Error(
      `a vendor without a balance API should still draw its mark, rendered ${JSON.stringify(pricelessCard)}`,
    )
  }
  if (!pricelessCard.includes('通义千问 Token Plan (国内) 目前无余额接口')) {
    throw new Error('the panel should say the vendor has no balance API')
  }

  // The model list is what makes the vendor reachable: it opens for this
  // vendor, and picking a model moves the session to it.
  /** Expand function components once, so hooks run a single time. */
  const expand = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') {
      return expand(node.type({ ...node.props, children: node.children }))
    }
    return { ...node, children: (node.children ?? []).map(expand) }
  }
  /** Collect every button node in a rendered tree. */
  const buttonsIn = (node, out = []) => {
    if (node === null || node === undefined || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const child of node) buttonsIn(child, out)
      return out
    }
    if (node.type === 'button') out.push(node)
    for (const child of node.children ?? []) buttonsIn(child, out)
    return out
  }
  /** The rendered tree for the current state. */
  const pricelessTree = () => {
    hookCursor = 0
    return expand(
      pricelessSlot.Component({
        useProjection: (key) => (key === 'modelSelection' ? pricelessProjection : undefined),
        sessionId: 'session-1',
      }),
    )
  }
  const switchButton = buttonsIn(pricelessTree()).find(
    (button) =>
      button.props.className === 'dsh-model-allowance-icon-button' &&
      button.props['aria-haspopup'] === 'menu',
  )
  if (!switchButton) throw new Error('the model switch button was not rendered')
  switchButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  // The list is read when the menu opens, so the render that opens it starts
  // the read and the next one carries the models.
  pricelessTree()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const openTree = pricelessTree()
  const modelItem = buttonsIn(openTree).find(
    (button) => button.props.className === 'dsh-model-allowance-model-item',
  )
  if (!modelItem) {
    throw new Error(
      `a vendor without a balance API should still offer its models, rendered ${JSON.stringify(render(openTree))}`,
    )
  }
  modelItem.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  if (switched.length !== 1) {
    throw new Error(`the model switch did not run, recorded ${JSON.stringify(switched)}`)
  }
  if (switched[0].provider !== 'qwen-token-plan-cn') {
    throw new Error(`the switch named the wrong provider: ${JSON.stringify(switched[0])}`)
  }
  console.log('switcher: a vendor without a balance API is offered, and its models are pickable')
}

// --- With nothing exhausted the badge speaks for the shortest window ------
// A coding plan's 5-hour window is the allowance a turn spends first, so the
// badge shows it rather than the most-constrained weekly window; a window that
// has run out still decides the badge, which the plan fixture above proves.
{
  const readPlan = (route) => ({
    ok: true,
    value: {
      provider: route,
      status: 'ready',
      kind: 'quota',
      percent: 66,
      updatedAt: Date.now(),
      windows: [
        { id: 'session', unit: 'hour', count: 5, remainingPercent: 82 },
        { id: 'weekly', unit: 'week', remainingPercent: 66 },
      ],
    },
  })
  let shortestSlot
  const shortestCtx = {
    effect: (fn) => fn(),
    locale: ctx.locale,
    remote: { $mount: async () => () => {}, $stream: undefined },
    get: (key) =>
      key === 'remote.balance'
        ? {
            balance: async (route) => readPlan(route),
            refresh: async (route) => readPlan(route),
            list: async () => ({ ok: true, value: [] }),
            status: async (route) => ({
              ok: true,
              value: { provider: route, state: 'operational' },
            }),
            defaultProvider: async () => ({ ok: true, value: { provider: 'minimax-cn' } }),
          }
        : undefined,
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, Component) => {
        shortestSlot = { options, Component }
        return () => {}
      },
    },
  }
  plugin.apply(shortestCtx)
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookState = []
  hookCursor = 0
  const planProjection = {
    lastUsed: { provider: 'minimax-cn', model: 'MiniMax-M3' },
    next: null,
  }
  const renderPlan = () => {
    hookCursor = 0
    return render(
      shortestSlot.Component({
        useProjection: (key) => (key === 'modelSelection' ? planProjection : undefined),
      }),
    )
  }
  renderPlan()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const shortestBadge = renderPlan()
  if (!shortestBadge.includes('剩余 82%')) {
    throw new Error(
      `the badge should speak for the five-hour window, rendered ${JSON.stringify(shortestBadge)}`,
    )
  }
  console.log('badge: the shortest window speaks when nothing is exhausted')
}

// --- A vendor that prices by the wall clock gets its own block ------------
// DeepSeek's peak windows are weekdays 09:00–12:00 and 14:00–18:00 Beijing
// time, with statutory holidays off-peak all day. The card states the
// schedule, the phase the clock is in, and the countdown to the flip.
{
  const schedule = {
    provider: 'deepseek-account',
    timezone: 'Asia/Shanghai',
    timezoneLabel: { zh: '北京时间', en: 'Beijing time' },
    days: [1, 2, 3, 4, 5],
    windows: [
      { from: '09:00', to: '12:00' },
      { from: '14:00', to: '18:00' },
    ],
    holidays: [
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ],
    note: { zh: '低谷时段 API 价格减半', en: 'API prices are halved off-peak' },
  }
  let clockSlot
  const clockCtx = {
    effect: (fn) => fn(),
    locale: ctx.locale,
    remote: { $mount: async () => () => {}, $stream: undefined },
    get: (key) =>
      key === 'remote.balance'
        ? {
            balance: async (route) => ({
              ok: true,
              value: {
                provider: route,
                status: 'ready',
                kind: 'amount',
                amount: 46.71,
                currency: 'CNY',
                updatedAt: Date.now(),
                consoleUrl: 'https://platform.deepseek.com/top_up',
              },
            }),
            refresh: async () => ({ ok: true, value: {} }),
            list: async () => ({ ok: true, value: [] }),
            status: async (route) => ({
              ok: true,
              value: { provider: route, state: 'operational' },
            }),
            schedule: async (route) => ({ ok: true, value: { ...schedule, provider: route } }),
            defaultProvider: async () => ({ ok: true, value: { provider: 'deepseek-account' } }),
          }
        : undefined,
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, Component) => {
        clockSlot = { options, Component }
        return () => {}
      },
    },
  }
  plugin.apply(clockCtx)
  await new Promise((resolve) => setTimeout(resolve, 20))
  hookState = []
  hookCursor = 0
  const clockProjection = {
    lastUsed: { provider: 'deepseek-account', model: 'deepseek-flash' },
    next: null,
  }
  const renderClock = () => {
    hookCursor = 0
    return render(
      clockSlot.Component({
        useProjection: (key) => (key === 'modelSelection' ? clockProjection : undefined),
      }),
    )
  }
  const realNow = Date.now
  try {
    // Friday 10:30 in Beijing: inside the morning peak window, 90 minutes
    // before the off-peak switch.
    Date.now = () => Date.parse('2026-11-06T02:30:00Z')
    renderClock()
    await new Promise((resolve) => setTimeout(resolve, 20))
    hookState[2] = true
    renderClock()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const peakCard = renderClock()
    for (const expected of [
      'data-phase="peak"',
      '高峰时段',
      '工作日 09:00–12:00、14:00–18:00（北京时间）',
      '法定节假日全天低谷',
      '距低谷开始 01:30:00',
      '低谷时段 API 价格减半',
      // The day strip carries the two peak windows, and the cursor sits at
      // 10:30 — 43.75% of the way through the vendor's day.
      'style="left:37.5%;width:12.5%"',
      'style="left:58.33%;width:16.67%"',
      'style="left:43.75%"',
    ]) {
      if (!peakCard.includes(expected)) {
        throw new Error(`the pricing block is missing ${JSON.stringify(expected)}`)
      }
    }

    // The day scale runs 00:00–24:00 in quarter ticks.
    if (!peakCard.includes('class="dsh-model-allowance-schedule-ticks"')) {
      throw new Error('the day strip is missing its scale')
    }
    if (peakCard.split('class="dsh-model-allowance-schedule-tick"').length - 1 !== 5) {
      throw new Error('the day strip should carry five quarter ticks')
    }
    if (!peakCard.includes('24:00')) throw new Error('the day scale should reach 24:00')

    // A statutory holiday stays off-peak on a weekday morning, so the strip
    // carries no peak blocks, while the cursor and the countdown remain.
    Date.now = () => Date.parse('2026-10-01T02:30:00Z')
    renderClock()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const holidayCard = renderClock()
    for (const expected of [
      'data-phase="off-peak"',
      '低谷时段',
      '距高峰开始 06.22:30:00',
      'style="left:43.75%"',
    ]) {
      if (!holidayCard.includes(expected)) {
        throw new Error(`the holiday pricing block is missing ${JSON.stringify(expected)}`)
      }
    }
    if (holidayCard.includes('class="dsh-model-allowance-schedule-timeline-peak"')) {
      throw new Error('a holiday should draw no peak blocks on the day strip')
    }
    console.log('schedule: the card states the windows, the phase, and the countdown')
  } finally {
    Date.now = realNow
  }
}

console.log('OK: client bundle loads, applies, mounts the namespace, and renders')
