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
    if (!(index in hookState)) hookState[index] = typeof initial === 'function' ? initial() : initial
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
// document. Record the listeners so a test can also fire them.
const documentListeners = new Map()
globalThis.document = {
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

// --- Fake zod: only the codec shape is exercised ----------------------------
const zodChain = () => {
  const chain = {}
  for (const name of ['min', 'max', 'optional', 'describe', 'readonly', 'nullable']) {
    chain[name] = () => chain
  }
  return chain
}
const z = new Proxy(
  {},
  {
    get: () => () => zodChain(),
  },
)

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
if (registration.id !== '@local/dsh-model-balance') {
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
            },
          }),
          refresh: async () => ({ ok: true, value: {} }),
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
  return `<${type} class="${props.className ?? ''}">${rendered}</${type}>`
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

  if (!opened.includes('deepseek-account')) throw new Error('panel did not render the provider')
  if (opened.includes('关闭')) throw new Error('panel still renders a close button')
  if (!opened.includes('刷新')) throw new Error('panel lost its refresh action')
  console.log('panel opened:', opened.slice(opened.indexOf('<div class="dsh-model-balance-panel"')))

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
    $mount: async (contribution) => {
      streamMount = { package: contribution.package, descriptors: contribution.descriptors }
      return () => {}
    },
    $stream: ({ open }) => {
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
        async *[Symbol.asyncIterator]() {
          void open(controller.signal)
          yield* frames
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
          watch: (_provider, _signal) => ({ async *[Symbol.asyncIterator]() {} }),
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

// --- Third scenario: a coding plan with two metering windows ----------------
// Both windows must show their own usage and their own reset countdown, which
// a single remaining percentage cannot express.
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
      {
        id: 'session',
        unit: 'hour',
        count: 5,
        used: 0,
        total: 2000,
        remainingPercent: 100,
      },
      {
        id: 'monthly',
        unit: 'month',
        count: 1,
        used: 10071,
        total: 10000,
        remainingPercent: 0,
        resetAt: now + (4 * 24 * 3600 + 3 * 3600) * 1000,
      },
    ],
  }

  let planSlot
  let planMount
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
            balance: async () => ({ ok: true, value: planView }),
            refresh: async () => ({ ok: true, value: planView }),
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
  const planBadge = () =>
    render(planSlot.Component({ useProjection: (key) => (key === 'modelSelection' ? planProviders : undefined) }))

  planBadge()
  await new Promise((resolve) => setTimeout(resolve, 20))

  // The badge speaks for the window closest to its limit.
  hookCursor = 0
  const planClosed = planBadge()
  if (!planClosed.includes('剩余 0%')) {
    throw new Error('badge should report the binding window')
  }

  // Open the card and read both window blocks.
  hookState[2] = true
  hookCursor = 0
  const planOpen = planBadge()
  const body = planOpen.slice(planOpen.indexOf('dsh-model-balance-panel"'))
  console.log('plan card:', body)

  for (const expected of [
    '5 小时',            // short window title
    '已用 0 / 2,000',    // short window usage
    '剩余 100%',         // short window remaining
    '无重置时间',        // short window has no reset in this payload
    '每月',              // long window title
    '已用 10,071 / 10,000', // long window usage, digits grouped
    '剩余 0%',           // long window remaining
    '重置',              // long window reset time
    '4 天 3 小时后',     // long window countdown, from resetAt minus now
  ]) {
    if (!body.includes(expected)) throw new Error(`plan card is missing ${JSON.stringify(expected)}`)
  }
}

console.log('OK: client bundle loads, applies, mounts the namespace, and renders')
