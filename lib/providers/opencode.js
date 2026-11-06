/**
 * OpenCode Go adapter.
 *
 * The Go plan meters three windows and reports each as the share already
 * spent — the opposite direction of every other vendor this plugin reads —
 * plus the instant it resets. `GET /zen/go/v1/usage` is the only endpoint the
 * plan answers; its sibling paths return 404 even with a valid key.
 */

import {
  KIND_QUOTA,
  asObject,
  bindingWindow,
  defineAdapter,
  parseAmount,
  parseInstant,
} from './shared.js'
import { STATUS_OPERATIONAL, STATUS_UNKNOWN, normalizeState } from './status.js'

/** The Go plan page, where the plan itself is managed. Verified 2026-11-06. */
const CONSOLE = 'https://opencode.ai/go'

/**
 * OpenCode published its own status API, and it names Go as a component —
 * which is the plan this adapter reads. Verified 2026-11-06; the overall
 * `status` is the answer, and the per-service components explain it.
 *
 * @type {{endpoint: string, url: string, parse: (env: {json?: unknown}) => {state: string, summary?: string}}}
 */
const STATUS = Object.freeze({
  endpoint: 'https://status.opencode.ai/api/status',
  url: 'https://status.opencode.ai',
  parse: parseStatus,
})

/**
 * Project one OpenCode status body.
 *
 * The degraded components are the useful part of the answer — "go · upstream"
 * says what is wrong where, which the single overall word cannot.
 *
 * @param {{json?: unknown}} env Source payload.
 * @returns {{state: string, summary?: string}} The projected reading.
 */
function parseStatus({ json }) {
  const body = asObject(json)
  const state = normalizeState(body.status) ?? STATUS_UNKNOWN
  /** @type {string[]} */
  const affected = []
  for (const entry of Array.isArray(body.components) ? body.components : []) {
    const record = asObject(entry)
    const componentState = normalizeState(record.status)
    if (componentState === undefined || componentState === STATUS_OPERATIONAL) continue
    const service = typeof record.service === 'string' ? record.service : ''
    const reason =
      typeof record.reason === 'string' && record.reason !== '' && record.reason !== 'none'
        ? record.reason
        : ''
    const label = service === '' ? reason : reason === '' ? service : `${service} · ${reason}`
    if (label !== '') affected.push(label)
  }
  return {
    state,
    ...(affected.length === 0 || state === STATUS_OPERATIONAL ? {} : { summary: affected.join(', ') }),
  }
}

/**
 * The three windows the Go plan meters, in display order, with the length
 * each one names. `rolling` is the plan's short window; the docs call it 5
 * hours.
 */
const WINDOWS = [
  ['rolling', { id: 'session', unit: 'hour', count: 5 }],
  ['weekly', { id: 'weekly', unit: 'week' }],
  ['monthly', { id: 'monthly', unit: 'month' }],
]

/**
 * Project one OpenCode Go usage body.
 * @param {{route: string, body: object}} env Projection context.
 * @returns {object} The reading.
 */
function readUsage({ route, body }) {
  const usage = asObject(body.usage)
  /** @type {Array<object>} */
  const windows = []
  for (const [key, shape] of WINDOWS) {
    const entry = asObject(usage[key])
    const spent = parseAmount(entry.percent)
    if (spent === undefined) continue
    const resetAt = parseInstant(entry.resetsAt)
    windows.push({
      ...shape,
      // `percent` here is what was spent; the shared shape carries what is
      // left.
      remainingPercent: Math.max(0, 100 - spent),
      ...(resetAt === undefined ? {} : { resetAt }),
    })
  }
  if (windows.length === 0) {
    return { provider: route, status: 'failed', kind: KIND_QUOTA, error: 'no usage in response' }
  }
  const binding = bindingWindow(windows)
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    ...(binding.remainingPercent === undefined ? {} : { percent: binding.remainingPercent }),
    ...(binding.resetAt === undefined ? {} : { resetsAt: binding.resetAt }),
    windows,
    consoleUrl: CONSOLE,
  }
}

/** OpenCode Go's route. */
export const opencodeAdapters = [
  defineAdapter({
    id: 'opencode-go',
    routes: ['opencode-go'],
    kind: KIND_QUOTA,
    endpoint: 'https://opencode.ai/zen/go/v1/usage',
    auth: 'bearer',
    // The catalog names OPENCODE_API_KEY for this route; the plan's own
    // documentation names OPENCODE_GO_API_KEY. Both are tried, the catalog
    // first, because the name has already drifted once.
    credentialRefs: ['OPENCODE_API_KEY', 'OPENCODE_GO_API_KEY'],
    read: readUsage,
    consoleUrl: CONSOLE,
    status: STATUS,
    display: {
      name: { zh: 'OpenCode Go', en: 'OpenCode Go' },
      mark: { icon: 'opencode', color: '#64748b' },
    },
    fixtures: [
      {
        name: 'recorded three windows',
        response: {
          usage: {
            rolling: { status: 'ok', percent: 1, resetsAt: '2026-08-14T06:44:12.569Z' },
            weekly: { status: 'ok', percent: 12, resetsAt: '2026-08-17T00:00:00.569Z' },
            monthly: { status: 'ok', percent: 35, resetsAt: '2026-08-30T02:03:31.569Z' },
          },
        },
        apiKey: 'sk-test',
        expect: {
          status: 'ready',
          kind: KIND_QUOTA,
          // The monthly window is the binding one at 35% spent.
          percent: 65,
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              remainingPercent: 99,
              resetAt: Date.parse('2026-08-14T06:44:12.569Z'),
            },
            {
              id: 'weekly',
              unit: 'week',
              remainingPercent: 88,
              resetAt: Date.parse('2026-08-17T00:00:00.569Z'),
            },
            {
              id: 'monthly',
              unit: 'month',
              remainingPercent: 65,
              resetAt: Date.parse('2026-08-30T02:03:31.569Z'),
            },
          ],
        },
      },
      {
        name: 'exhausted window clamps at zero',
        response: {
          usage: {
            rolling: { status: 'ok', percent: 140, resetsAt: '2026-08-14T06:44:12.569Z' },
            monthly: { status: 'capped', percent: 70 },
          },
        },
        expect: {
          status: 'ready',
          percent: 0,
          windows: [
            {
              id: 'session',
              unit: 'hour',
              count: 5,
              remainingPercent: 0,
              resetAt: Date.parse('2026-08-14T06:44:12.569Z'),
            },
            { id: 'monthly', unit: 'month', remainingPercent: 30 },
          ],
        },
        // A window that reports no reset instant must not invent one.
        absent: ['windows[1].resetAt'],
      },
      {
        name: 'key rejected',
        httpStatus: 401,
        expect: { status: 'failed', error: 'HTTP 401' },
      },
    ],
  }),
]
