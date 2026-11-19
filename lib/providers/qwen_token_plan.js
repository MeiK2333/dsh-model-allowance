/**
 * Qwen Token Plan allowance adapter (Bailian personal plan, CN site).
 *
 * The plan key (`sk-sp-…`) only authorizes inference; the usage lives behind
 * the Bailian console gateway. The chain is the one Alibaba's own `bl` CLI
 * walks, verified against a real account:
 *
 *  1. ACS3-HMAC-SHA256 signs `POST modelstudio.cn-beijing.aliyuncs.com
 *     /modelstudio/cli/generateAccessToken`, which answers a temporary
 *     `cliAccessToken`;
 *  2. `POST bailian-cs.console.aliyun.com/cli/api.json?action=BroadScopeAspnGateway`
 *     carries that token to `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage`,
 *     whose payload reports each window as `per<N><unit>Percentage` (share
 *     used, 0–1) plus `per<N><unit>ResetTime` (epoch milliseconds).
 *
 * Absolute totals are enrichment, not the reading: the subscription names the
 * `specCode`, and `quota-config` carries that spec's per-window totals. A
 * reading without them still reports the share left and the reset.
 *
 * The AccessKey pair is read from the credential store (the settings page's
 * "Model Allowance" section stores it, after `testQwenPlanCredentials` has
 * walked this same chain against the live endpoints). A RAM user's AccessKey
 * is refused with `BailianGateway.Team.NotAuthorised` until the main account
 * grants it the AliyunTokenPlanReadOnlyAccess and AliyunBSSReadOnlyAccess
 * policies and the Subscribe Plan permission on the Model Studio console's
 * Account Management page — the failure names that.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto'
import {
  asObject,
  bindingWindow,
  defineAdapter,
  KIND_QUOTA,
  parseAmount,
  parseInstant,
} from './shared.js'

/** Credential references the settings page stores the AccessKey pair under. */
export const ACCESS_KEY_ID_REF = 'ALIBABA_CLOUD_ACCESS_KEY_ID'
export const ACCESS_KEY_SECRET_REF = 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'

/** The guide that walks obtaining the AccessKey pair, linked from the UI. */
export const SETUP_DOC_URL =
  'https://github.com/MeiK2333/dsh-model-allowance/blob/master/docs/qwen-token-plen-cn/README.md'

/** The console token endpoint (ROA-style: the Action travels in headers). */
const ACS_HOST = 'modelstudio.cn-beijing.aliyuncs.com'
const ACS_PATH = '/modelstudio/cli/generateAccessToken'
const ACS_ACTION = 'GenerateCLIAccessToken'
const ACS_VERSION = '2026-02-10'

/** The console gateway the usage APIs sit behind. */
const GATEWAY_HOST = 'bailian-cs.console.aliyun.com'
const GATEWAY_ACTION = 'BroadScopeAspnGateway'
const GATEWAY_REGION = 'cn-beijing'
const USAGE_API = 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage'
const SUBSCRIPTION_API = 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription'
const QUOTA_CONFIG_API = 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/quota-config'

/** What a RAM user's AccessKey needs; said in the failure that names it. */
const RAM_HINT =
  "grant the AccessKey's RAM user the AliyunTokenPlanReadOnlyAccess and " +
  'AliyunBSSReadOnlyAccess policies and the Subscribe Plan or Administrator permission ' +
  "on the Model Studio console's Account Management page, or use the main account's AccessKey"

const CONTENT_TYPE = 'application/json'
const SIGNED_HEADERS =
  'content-type;host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version'

/** A usage window: `per5HourPercentage` → five-hour, `per1MonthPercentage` → month. */
const WINDOW_PATTERN = /^per(\d+)(Hour|Day|Week|Month)Percentage$/

/**
 * @typedef {import('./shared.js').BalanceWindow & {usedShare: number}} UsageWindow
 */

/** @type {Record<string, 'hour' | 'day' | 'week' | 'month'>} */
const WINDOW_UNITS = { Hour: 'hour', Day: 'day', Week: 'week', Month: 'month' }

/** `quota-config` totals, by the window they meter. */
const TOTAL_WINDOWS = { five_hour: 'per5Hour', monthly: 'per1Month' }

/**
 * Build the ACS3-HMAC-SHA256 headers for one console API call.
 *
 * Time and nonce are parameters so the algorithm is pinned by a golden
 * vector; a signing typo is invisible until a live call is refused.
 *
 * @param {object} input The call to sign.
 * @param {string} input.accessKeyId AccessKey ID.
 * @param {string} input.secretAccessKey AccessKey secret.
 * @param {string} input.host Request host.
 * @param {string} input.path Request path.
 * @param {string} input.action `x-acs-action` value.
 * @param {string} input.version `x-acs-version` value.
 * @param {string} input.body Request body.
 * @param {string} input.date `x-acs-date`, ISO 8601 UTC to the second.
 * @param {string} input.nonce `x-acs-signature-nonce`.
 * @returns {Record<string, string>} The request headers, `authorization` included.
 */
export function acs3Authorization({
  accessKeyId,
  secretAccessKey,
  host,
  path,
  action,
  version,
  body,
  date,
  nonce,
}) {
  const hashedBody = createHash('sha256').update(body).digest('hex')
  const canonicalHeaders =
    `content-type:${CONTENT_TYPE}\n` +
    `host:${host}\n` +
    `x-acs-action:${action}\n` +
    `x-acs-content-sha256:${hashedBody}\n` +
    `x-acs-date:${date}\n` +
    `x-acs-signature-nonce:${nonce}\n` +
    `x-acs-version:${version}\n`
  const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${hashedBody}`
  const canonicalHash = createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = `ACS3-HMAC-SHA256\n${canonicalHash}`
  const signature = createHmac('sha256', secretAccessKey).update(stringToSign).digest('hex')
  return {
    'content-type': CONTENT_TYPE,
    'x-acs-action': action,
    'x-acs-version': version,
    'x-acs-date': date,
    'x-acs-signature-nonce': nonce,
    'x-acs-content-sha256': hashedBody,
    authorization:
      `ACS3-HMAC-SHA256 Credential=${accessKeyId},` +
      `SignedHeaders=${SIGNED_HEADERS},Signature=${signature}`,
  }
}

/**
 * The current instant in the `x-acs-date` format.
 * @returns {string} ISO 8601 UTC to the second.
 */
function acsDate() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

/**
 * Resolve one credential reference through the Host's credential store.
 * @param {{resolve: (ref: string) => Promise<{value?: unknown} | undefined>} | undefined} credentials
 *   The credential service, when the host offers one.
 * @param {string} ref Reference name.
 * @returns {Promise<string | undefined>} The value, when it is present.
 */
async function resolveCredential(credentials, ref) {
  if (credentials === undefined) return undefined
  try {
    const hit = await credentials.resolve(ref)
    const value = hit?.value
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    // An unresolvable reference is simply absent here.
    return undefined
  }
}

/**
 * Exchange the AccessKey pair for a console token.
 * @param {object} input The call.
 * @param {string} input.accessKeyId AccessKey ID.
 * @param {string} input.secretAccessKey AccessKey secret.
 * @param {AbortSignal} input.signal Cancellation.
 * @returns {Promise<{token?: string, error?: string}>} The token, or the refusal.
 */
async function consoleToken({ accessKeyId, secretAccessKey, signal }) {
  const headers = acs3Authorization({
    accessKeyId,
    secretAccessKey,
    host: ACS_HOST,
    path: ACS_PATH,
    action: ACS_ACTION,
    version: ACS_VERSION,
    body: '',
    date: acsDate(),
    nonce: randomUUID(),
  })
  const response = await fetch(`https://${ACS_HOST}${ACS_PATH}`, {
    method: 'POST',
    headers,
    body: '',
    signal,
  })
  if (!response.ok) return { error: `GenerateCLIAccessToken: HTTP ${String(response.status)}` }
  const body = asObject(await response.json())
  const direct = body.cliAccessToken
  const nested = asObject(body.data).cliAccessToken
  const token = typeof direct === 'string' ? direct : typeof nested === 'string' ? nested : ''
  if (token === '') return { error: 'GenerateCLIAccessToken returned no cliAccessToken' }
  return { token }
}

/**
 * Call one console gateway JSON API.
 *
 * The gateway wraps the business payload in `params`/`region` form fields and
 * answers a two-level envelope; the caller digs the payload out.
 *
 * @param {string} token Console token.
 * @param {string} api Console API name.
 * @param {Record<string, unknown>} data Business parameters.
 * @param {AbortSignal} signal Cancellation.
 * @returns {Promise<{envelope?: Record<string, unknown>, error?: string}>} The envelope, or the refusal.
 */
async function gatewayCall(token, api, data, signal) {
  const payload = {
    ...asObject(data),
    cornerstoneParam: {
      protocol: 'V2',
      console: 'ONE_CONSOLE',
      productCode: 'p_efm',
      switchUserType: 3,
      consoleSite: 'BAILIAN_ALIYUN',
    },
  }
  const params = JSON.stringify({ Api: api, V: '1.0', Data: payload })
  const body = `params=${encodeURIComponent(params)}&region=${encodeURIComponent(GATEWAY_REGION)}`
  const url =
    `https://${GATEWAY_HOST}/cli/api.json?action=${GATEWAY_ACTION}&product=sfm_bailian` +
    `&api=${encodeURIComponent(api)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Bearer ${token}`,
    },
    body,
    signal,
  })
  if (!response.ok) return { error: `${api}: HTTP ${String(response.status)}` }
  return { envelope: asObject(await response.json()) }
}

/**
 * The business payload inside the gateway's envelope.
 *
 * Depth varies by API and console build, so every nesting the gateway has
 * been seen to use is tried and the first node `wanted` accepts wins.
 *
 * @param {Record<string, unknown>} envelope The envelope.
 * @param {(node: Record<string, unknown>) => boolean} wanted Recognizes the payload.
 * @returns {Record<string, unknown> | undefined} The payload, when present.
 */
function gatewayPayload(envelope, wanted) {
  const data = asObject(envelope.data)
  const candidates = [
    asObject(asObject(asObject(data.DataV2).data).data),
    asObject(asObject(data.DataV2).data),
    asObject(data.data),
    data,
  ]
  return candidates.find((node) => wanted(node))
}

/**
 * A gateway refusal as one message, naming the grants when it is the RAM one.
 * @param {Record<string, unknown>} envelope The envelope.
 * @returns {string | undefined} The refusal, when the gateway refused.
 */
function gatewayError(envelope) {
  const data = asObject(envelope.data)
  if (data.success !== false) return undefined
  const code = typeof data.errorCode === 'string' ? data.errorCode : ''
  const message = typeof data.errorMsg === 'string' ? data.errorMsg : ''
  const detail = code !== '' && message !== '' && message !== code ? `${code}: ${message}` : code
  const refusal = detail !== '' ? detail : message !== '' ? message : 'unknown gateway error'
  return code.includes('NotAuthorised') ? `${refusal} — ${RAM_HINT}` : refusal
}

/**
 * Percentages are compared and displayed at two decimals.
 * @param {number} value The raw percentage.
 * @returns {number} The rounded percentage, clamped to 0–100.
 */
function roundPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100))
}

/**
 * A refused read as a reading: a provider refusal is data, not a crash.
 * @param {string} route Provider route.
 * @param {string} error The refusal.
 * @returns {import('../providers.js').BalanceView} The failed reading.
 */
function failed(route, error) {
  return { provider: route, status: 'failed', kind: KIND_QUOTA, error }
}

/**
 * Read the usage payload's quota windows.
 *
 * The vendor words every window the same way — `per<N><unit>Percentage` is
 * the share used and `per<N><unit>ResetTime` its reset — so one pattern
 * reports whatever windows a plan enforces instead of a hardcoded month.
 *
 * @param {Record<string, unknown>} payload The usage payload.
 * @returns {UsageWindow[]} The windows.
 */
function usageWindows(payload) {
  /** @type {UsageWindow[]} */
  const windows = []
  for (const [key, value] of Object.entries(payload)) {
    const match = WINDOW_PATTERN.exec(key)
    if (match === null) continue
    const usedShare = parseAmount(value)
    if (usedShare === undefined) continue
    const id = `per${match[1]}${match[2]}`
    const resetAt = parseInstant(payload[`${id}ResetTime`])
    windows.push({
      id,
      unit: WINDOW_UNITS[match[2]],
      count: Number(match[1]),
      usedShare,
      remainingPercent: roundPercent((1 - usedShare) * 100),
      ...(resetAt === undefined ? {} : { resetAt }),
    })
  }
  return windows
}

/**
 * The `quota-config` totals of one spec, keyed by the window they meter.
 * @param {Record<string, unknown> | undefined} payload The quota-config payload.
 * @param {string | undefined} specCode The subscription's spec, when known.
 * @returns {Map<string, number>} Window id to total allowance.
 */
function planTotals(payload, specCode) {
  /** @type {Map<string, number>} */
  const totals = new Map()
  const spec = specCode === undefined ? undefined : asObject(payload?.[specCode])
  for (const [key, windowId] of Object.entries(TOTAL_WINDOWS)) {
    const total = parseAmount(spec?.[key])
    if (total !== undefined) totals.set(windowId, total)
  }
  return totals
}

/**
 * Project the windows onto the shared reading shape.
 *
 * The top level speaks for the monthly window — the one a personal plan
 * meters — falling back to the binding window when a plan has no month.
 *
 * @param {string} route Provider route.
 * @param {UsageWindow[]} windows The windows.
 * @param {Map<string, number>} totals Known per-window totals.
 * @returns {import('../providers.js').BalanceView} The reading.
 */
function projectPlan(route, windows, totals) {
  for (const window of windows) {
    const total = totals.get(window.id)
    if (total === undefined) continue
    window.total = total
    window.used = Math.round(total * window.usedShare)
  }
  const month = windows.find((window) => window.id === 'per1Month')
  const chosen = month ?? bindingWindow(windows)
  const total = chosen?.total
  const used = chosen?.used
  return {
    provider: route,
    status: 'ready',
    kind: KIND_QUOTA,
    ...(chosen === undefined ? {} : { percent: chosen.remainingPercent }),
    ...(chosen?.resetAt === undefined ? {} : { resetsAt: chosen.resetAt }),
    ...(total === undefined || used === undefined ? {} : { total, remaining: total - used }),
    windows: windows.map(({ usedShare, ...window }) => window),
  }
}

/**
 * Walk the credential test chain: exchange a console token, then read the
 * usage windows with it.
 *
 * The settings page runs this against the entered AccessKey pair before it
 * saves, so a stored credential is one the live endpoints accepted. The RAM
 * refusal arrives here with the grants it asks for.
 *
 * @param {object} input The test.
 * @param {string} input.accessKeyId AccessKey ID.
 * @param {string} input.secretAccessKey AccessKey secret.
 * @param {AbortSignal} [input.signal] Cancellation.
 * @returns {Promise<{ok: true} | {ok: false, error: string}>} The outcome.
 */
export async function testQwenPlanCredentials({ accessKeyId, secretAccessKey, signal }) {
  const abort = signal ?? AbortSignal.timeout(15_000)
  const token = await consoleToken({ accessKeyId, secretAccessKey, signal: abort })
  if (token.error !== undefined) return { ok: false, error: token.error }
  const usage = await gatewayCall(token.token ?? '', USAGE_API, {}, abort)
  if (usage.error !== undefined) return { ok: false, error: usage.error }
  const envelope = usage.envelope ?? {}
  const payload = gatewayPayload(envelope, (node) =>
    Object.keys(node).some((key) => WINDOW_PATTERN.test(key)),
  )
  const windows = payload === undefined ? [] : usageWindows(payload)
  if (windows.length === 0) {
    return {
      ok: false,
      error: gatewayError(envelope) ?? 'Token Plan usage response carried no quota window',
    }
  }
  return { ok: true }
}

/**
 * Read one route's Token Plan allowance.
 *
 * @param {import('../providers.js').AdapterEnv} env Query context.
 * @returns {Promise<import('../providers.js').BalanceView>} The reading.
 */
async function readPlanAllowance({ route, ctx, signal }) {
  const credentials = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined
  const accessKeyId = await resolveCredential(credentials, ACCESS_KEY_ID_REF)
  const secretAccessKey = await resolveCredential(credentials, ACCESS_KEY_SECRET_REF)
  if (accessKeyId === undefined || secretAccessKey === undefined) {
    return { provider: route, status: 'unconfigured', kind: KIND_QUOTA }
  }

  const token = await consoleToken({ accessKeyId, secretAccessKey, signal })
  if (token.error !== undefined) return failed(route, token.error)

  const usage = await gatewayCall(token.token, USAGE_API, {}, signal)
  if (usage.error !== undefined) return failed(route, usage.error)
  const envelope = usage.envelope ?? {}
  const payload = gatewayPayload(envelope, (node) =>
    Object.keys(node).some((key) => WINDOW_PATTERN.test(key)),
  )
  const windows = payload === undefined ? [] : usageWindows(payload)
  if (windows.length === 0) {
    return failed(
      route,
      gatewayError(envelope) ?? 'Token Plan usage response carried no quota window',
    )
  }

  // Totals are enrichment: a plan whose subscription or quota-config cannot
  // be read still reports the share left and the reset.
  let specCode
  let totals = new Map()
  try {
    const subscription = await gatewayCall(token.token, SUBSCRIPTION_API, {}, signal)
    const subscriptionPayload =
      subscription.envelope === undefined
        ? undefined
        : gatewayPayload(subscription.envelope, (node) => typeof node.specCode === 'string')
    specCode =
      typeof subscriptionPayload?.specCode === 'string' ? subscriptionPayload.specCode : undefined
    if (specCode !== undefined) {
      const quotaConfig = await gatewayCall(token.token, QUOTA_CONFIG_API, {}, signal)
      if (quotaConfig.envelope !== undefined) {
        totals = planTotals(
          gatewayPayload(quotaConfig.envelope, (node) => typeof node[specCode] === 'object'),
          specCode,
        )
      }
    }
  } catch {
    // A reading is the usage; the totals are best-effort.
  }
  return projectPlan(route, windows, totals)
}

// --- recorded responses ----------------------------------------------------

/** The console token reply (identifier altered). */
const RECORDED_TOKEN = { cliAccessToken: 'recorded-console-token' }

/** The usage reply of a personal lite plan: one monthly window. */
const RECORDED_USAGE = {
  code: '200',
  data: {
    DataV2: {
      ret: ['SUCCESS::接口调用成功'],
      data: {
        msg: 'Success.',
        code: 'SUCCESS',
        data: { per1MonthPercentage: 0.9545502269, per1MonthResetTime: 1796572800000 },
        requestId: 'recorded',
        success: true,
      },
    },
    success: true,
    httpStatus: 200,
    errorCode: '',
    api: USAGE_API,
    errorMsg: '',
  },
  httpStatusCode: '200',
  requestId: 'recorded',
  successResponse: true,
}

/** The usage reply of a plan metering a five-hour and a weekly window. */
const RECORDED_SHORT_WINDOWS = {
  code: '200',
  data: {
    DataV2: {
      ret: ['SUCCESS::接口调用成功'],
      data: {
        msg: 'Success.',
        code: 'SUCCESS',
        data: {
          per5HourPercentage: 0.1,
          per5HourResetTime: 1796572800000,
          per1WeekPercentage: 0.5,
          per1WeekResetTime: 1797004800000,
        },
        requestId: 'recorded',
        success: true,
      },
    },
    success: true,
    errorCode: '',
    api: USAGE_API,
    errorMsg: '',
  },
}

/** The subscription reply naming the plan's spec. */
const RECORDED_SUBSCRIPTION = {
  code: '200',
  data: {
    DataV2: {
      ret: ['SUCCESS::接口调用成功'],
      data: {
        msg: 'Success.',
        code: 'SUCCESS',
        data: {
          instanceCode: 'recorded-instance',
          specCode: 'lite',
          remainingDays: 17,
          startTime: 1793967403000,
          endTime: 1796572800000,
          autoRenewFlag: false,
          status: 'VALID',
        },
        requestId: 'recorded',
        success: true,
      },
    },
    success: true,
    errorCode: '',
    api: SUBSCRIPTION_API,
    errorMsg: '',
  },
}

/** The quota-config reply: the totals of every personal spec. */
const RECORDED_QUOTA_CONFIG = {
  code: '200',
  data: {
    DataV2: {
      ret: ['SUCCESS::接口调用成功'],
      data: {
        msg: 'Success.',
        code: 'SUCCESS',
        data: {
          standard: { five_hour: 3000, monthly: 80000 },
          addon_quota: { extrabundle: 20000 },
          lite: { five_hour: 700, monthly: 20000 },
          pro: { five_hour: 12000, monthly: 200000 },
          essential: { five_hour: 1800, monthly: 45000 },
        },
        requestId: 'recorded',
        success: true,
      },
    },
    success: true,
    errorCode: '',
    api: QUOTA_CONFIG_API,
    errorMsg: '',
  },
}

/** The reply a RAM user without the Token Plan grants gets. */
const RECORDED_NOT_AUTHORISED = {
  code: '200',
  data: {
    success: false,
    httpStatus: 200,
    errorCode: 'BailianGateway.Team.NotAuthorised',
    api: USAGE_API,
    errorMsg: 'BailianGateway.Team.NotAuthorised',
  },
  httpStatusCode: '200',
  requestId: 'recorded',
  successResponse: true,
}

/** A configured AccessKey pair, as the settings page stores it. */
const RECORDED_CREDENTIALS = {
  resolve: async (ref) =>
    ref === ACCESS_KEY_ID_REF
      ? { value: 'LTAIrecorded' }
      : ref === ACCESS_KEY_SECRET_REF
        ? { value: 'recorded-secret' }
        : undefined,
}

/** The declared adapters this module serves. */
export const qwenTokenPlanAdapters = [
  defineAdapter({
    id: 'qwen-token-plan',
    routes: ['qwen-token-plan', 'qwen-token-plan-cn', 'qwen-token-plan-individual'],
    kind: KIND_QUOTA,
    consoleUrl: 'https://platform.qianwenai.com/home/analytics/token-plan/individual',
    setupUrl: SETUP_DOC_URL,
    credentialRefs: [ACCESS_KEY_ID_REF, ACCESS_KEY_SECRET_REF],
    display: {
      name: { zh: '通义千问 Token Plan', en: 'Qwen Token Plan' },
      mark: { icon: 'qwen', color: '#082DFF' },
    },
    readWithEnv: readPlanAllowance,
    fixtures: [
      {
        name: 'recorded monthly window with plan totals',
        services: { credentials: RECORDED_CREDENTIALS },
        responses: [RECORDED_TOKEN, RECORDED_USAGE, RECORDED_SUBSCRIPTION, RECORDED_QUOTA_CONFIG],
        expect: {
          status: 'ready',
          kind: KIND_QUOTA,
          percent: 4.54,
          resetsAt: 1796572800000,
          total: 20000,
          remaining: 909,
          windows: [
            {
              id: 'per1Month',
              unit: 'month',
              count: 1,
              used: 19091,
              total: 20000,
              remainingPercent: 4.54,
              resetAt: 1796572800000,
            },
          ],
        },
      },
      {
        name: 'usage only still reports the share left',
        services: { credentials: RECORDED_CREDENTIALS },
        responses: [RECORDED_TOKEN, RECORDED_USAGE],
        expect: {
          status: 'ready',
          percent: 4.54,
          resetsAt: 1796572800000,
          windows: [{ id: 'per1Month', remainingPercent: 4.54 }],
        },
        absent: ['total', 'remaining', 'windows[0].total', 'windows[0].used'],
      },
      {
        // The badge speaks for the window closest to its limit, so the top
        // level carries the weekly one; the five-hour window keeps its own
        // totals inside the list.
        name: 'a five-hour and a weekly window meter one plan',
        services: { credentials: RECORDED_CREDENTIALS },
        responses: [
          RECORDED_TOKEN,
          RECORDED_SHORT_WINDOWS,
          RECORDED_SUBSCRIPTION,
          RECORDED_QUOTA_CONFIG,
        ],
        expect: {
          status: 'ready',
          percent: 50,
          resetsAt: 1797004800000,
          windows: [
            {
              id: 'per5Hour',
              unit: 'hour',
              count: 5,
              used: 70,
              total: 700,
              remainingPercent: 90,
              resetAt: 1796572800000,
            },
            {
              id: 'per1Week',
              unit: 'week',
              count: 1,
              remainingPercent: 50,
              resetAt: 1797004800000,
            },
          ],
        },
        absent: ['total', 'remaining'],
      },
      {
        name: 'a gateway refusal names the RAM grants',
        services: { credentials: RECORDED_CREDENTIALS },
        responses: [RECORDED_TOKEN, RECORDED_NOT_AUTHORISED],
        expect: {
          status: 'failed',
          kind: KIND_QUOTA,
          error: `BailianGateway.Team.NotAuthorised — ${RAM_HINT}`,
        },
      },
      {
        name: 'no AccessKey configured',
        services: {},
        expect: { status: 'unconfigured', kind: KIND_QUOTA },
      },
    ],
  }),
]
