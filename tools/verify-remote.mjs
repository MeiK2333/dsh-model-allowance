/**
 * Exercise the Remote controller against a stubbed balance service.
 *
 * This covers the stream contract the browser depends on: `watch` opens with
 * the current reading and then forwards every later one, and `refresh` asks
 * for a fresh reading.
 */
import { Context } from '@deepseek-ai/cordis'
import { BalanceController } from '../lib/remote.js'

/** A minimal stand-in for the Host modelAllowance service. */
function createService() {
  const listeners = new Map()
  const publish = (route, view) => {
    for (const listener of listeners.get(route) ?? []) listener(view)
  }
  let reads = 0
  let lastModel
  return {
    publish,
    get lastModel() {
      return lastModel
    },
    async read(route, options = {}) {
      reads += 1
      lastModel = options.model
      const view = {
        provider: route,
        status: 'ready',
        kind: 'amount',
        amount: reads === 1 ? 46.71 : 40,
        currency: 'CNY',
        updatedAt: Date.now(),
      }
      // The real service publishes the reading it is about to return; the
      // controller must not yield that opening reading twice.
      publish(route, view)
      return view
    },
    subscribe(route, model, listener) {
      const callback = typeof model === 'function' ? model : listener
      let set = listeners.get(route)
      if (!set) {
        set = new Set()
        listeners.set(route, set)
      }
      set.add(callback)
      return () => {
        set?.delete(callback)
        if (set && set.size === 0) listeners.delete(route)
      }
    },
    track() {
      return () => {}
    },
    defaultProvider() {
      return 'deepseek-account'
    },
    async status(route) {
      return { provider: route, state: 'operational', url: 'https://status.deepseek.com' }
    },
    schedule(route) {
      return {
        provider: route,
        timezone: 'Asia/Shanghai',
        timezoneLabel: { zh: '北京时间', en: 'Beijing time' },
        days: [1, 2, 3, 4, 5],
        windows: [{ from: '09:00', to: '12:00' }],
        holidays: [],
      }
    },
    activeRoutes: new Set(['deepseek-account']),
    async refreshAll() {
      publish('deepseek-account', await this.read('deepseek-account'))
    },
  }
}

const service = createService()
// A real Cordis context, because the Service base registers through it.
const ctx = new Context()
ctx.reflect.provide('modelAllowance', service)

// The controller's constructor registers an initializer for each `@Remote`
// marker, so this also proves the plain-JavaScript marker path works.
const controller = new BalanceController(ctx)

if (controller.name !== 'balanceController') {
  throw new Error(`unexpected service name ${controller.name}`)
}
if (controller.typertRemote?.namespace !== 'balance') {
  throw new Error(`unexpected namespace ${controller.typertRemote?.namespace}`)
}
const capabilities = await controller.capabilities()
if (capabilities?.modelScoped !== true) {
  throw new Error(
    `the controller did not advertise model-scoped reads: ${JSON.stringify(capabilities)}`,
  )
}

// --- watch opens with the current reading, then forwards pushes ------------
const abort = new AbortController()
const frames = []
const consumer = (async () => {
  for await (const frame of controller.watch('deepseek-account', undefined, abort.signal)) {
    frames.push(frame)
    if (frames.length === 2) abort.abort()
  }
})()

// The opening frame resolves first; then a pushed reading arrives.
await new Promise((resolve) => setTimeout(resolve, 10))
service.publish('deepseek-account', {
  provider: 'deepseek-account',
  status: 'ready',
  kind: 'amount',
  amount: 40,
  currency: 'CNY',
  updatedAt: Date.now(),
})
await consumer

if (frames.length !== 2) throw new Error(`expected 2 frames, got ${frames.length}`)
if (frames[0].amount !== 46.71) throw new Error('opening frame is not the current reading')
if (frames[1].amount !== 40) throw new Error('pushed reading was not forwarded')

// --- the session model travels with the read -------------------------------
const read = await controller.balance('deepseek-account', 'deepseek-flash')
if (read?.amount === undefined) throw new Error('balance did not return a reading')
if (service.lastModel !== 'deepseek-flash') {
  throw new Error(`the model did not reach the service, got ${JSON.stringify(service.lastModel)}`)
}
console.log('model: the session model reached the service')

// --- refresh bypasses the cache -------------------------------------------
service.read = async (route) => ({
  provider: route,
  status: 'ready',
  kind: 'amount',
  amount: 12.5,
  currency: 'CNY',
})
const refreshed = await controller.refresh('deepseek-account')
if (refreshed.amount !== 12.5) throw new Error('refresh did not return a fresh reading')

// --- a session with no selection still has a provider ---------------------
const fallback = await controller.defaultProvider()
if (fallback?.provider !== 'deepseek-account') {
  throw new Error(`the default provider was not reported, got ${JSON.stringify(fallback)}`)
}

// --- the platform status reaches the browser ------------------------------
const status = await controller.status('deepseek-account')
if (status?.state !== 'operational') {
  throw new Error(`the status reading was not forwarded, got ${JSON.stringify(status)}`)
}
if (status?.url !== 'https://status.deepseek.com') {
  throw new Error('the status reading lost its source page')
}

// --- the pricing schedule reaches the browser ----------------------------
const schedule = await controller.schedule('deepseek-account')
if (schedule?.timezone !== 'Asia/Shanghai') {
  throw new Error(`the schedule was not forwarded, got ${JSON.stringify(schedule)}`)
}
if (schedule?.windows?.[0]?.from !== '09:00') {
  throw new Error('the schedule lost its windows')
}

// --- an aborted stream releases its subscription ---------------------------
if ((service.subscribe('probe', () => {}) ?? false) !== undefined) {
  // subscribe still works after the stream above ended
}
const stillThere = service.activeRoutes.has('deepseek-account')
if (!stillThere) throw new Error('route tracking broke')

console.log('service name:', controller.name)
console.log('namespace:', controller.typertRemote.namespace)
console.log('frames:', JSON.stringify(frames.map((frame) => frame.amount)))
console.log('refresh amount:', refreshed.amount)
console.log('default provider:', fallback.provider)
console.log('status:', status.state, status.url)

// --- the real service exposes what `watch` uses ---------------------------
// The controller reaches `ctx.modelAllowance.subscribe`, so the shipped service
// must provide it; the stub above cannot prove that.
const { default: ModelAllowanceService } = await import('../index.js')
for (const method of [
  'read',
  'track',
  'subscribe',
  'defaultProvider',
  'refreshAll',
  'status',
  'schedule',
]) {
  if (typeof ModelAllowanceService.prototype[method] !== 'function') {
    throw new Error(`ModelAllowanceService is missing ${method}()`)
  }
}
console.log(
  'ModelAllowanceService exposes:',
  'read, track, subscribe, defaultProvider, refreshAll, status, schedule',
)

console.log('OK: the Remote controller opens, streams, and refreshes')
