/**
 * Status-page parsing shared by the providers that publish one.
 *
 * Every vendor words its status differently — Statuspage's boolean-ish
 * indicators, OpenCode's own state machine, FlashCat's impact vocabulary — so
 * the mapping onto the plugin's shared vocabulary lives here, and each adapter
 * names the source it reads.
 *
 * The plugin's own states are a small fixed set so the browser can label them
 * without knowing any vendor:
 *
 *   `operational`     everything works
 *   `degraded`        slower or partly impaired, still serving
 *   `partial-outage`  some services are down
 *   `major-outage`    critical services are down
 *   `maintenance`     a planned maintenance window is in progress
 *   `unknown`         no reading, no source, or an unparsable one
 */

import { asObject } from './shared.js'

/** A provider reports full availability. */
export const STATUS_OPERATIONAL = 'operational'

/** A provider reports slowed or partly impaired service. */
export const STATUS_DEGRADED = 'degraded'

/** A provider reports some services down. */
export const STATUS_PARTIAL_OUTAGE = 'partial-outage'

/** A provider reports critical services down. */
export const STATUS_MAJOR_OUTAGE = 'major-outage'

/** A provider reports a maintenance window in progress. */
export const STATUS_MAINTENANCE = 'maintenance'

/** No reading, no source, or an unparsable one. */
export const STATUS_UNKNOWN = 'unknown'

/** Severity order, worst first; used to pick the state a list implies. */
const SEVERITY = Object.freeze({
  [STATUS_MAJOR_OUTAGE]: 4,
  [STATUS_PARTIAL_OUTAGE]: 3,
  [STATUS_DEGRADED]: 2,
  [STATUS_MAINTENANCE]: 1,
  [STATUS_OPERATIONAL]: 0,
})

/**
 * The vocabulary the sources use, collapsed onto the shared states.
 *
 * Statuspage speaks `none`/`minor`/`major`/`critical`/`maintenance`; FlashCat
 * pages speak `full_outage`/`partial_outage`/`degraded`/`maintenance`;
 * OpenCode speaks `operational`/`degraded`/`down`. Incident phases such as
 * `investigating` or `monitoring` are deliberately absent: they describe the
 * response to an incident, not what it is doing to the service, and the impact
 * entries beside them carry the actual state.
 */
const STATE_WORDS = Object.freeze({
  operational: STATUS_OPERATIONAL,
  none: STATUS_OPERATIONAL,
  ok: STATUS_OPERATIONAL,
  up: STATUS_OPERATIONAL,
  degraded: STATUS_DEGRADED,
  'degraded-performance': STATUS_DEGRADED,
  minor: STATUS_DEGRADED,
  'partial-outage': STATUS_PARTIAL_OUTAGE,
  partial: STATUS_PARTIAL_OUTAGE,
  major: STATUS_PARTIAL_OUTAGE,
  'major-outage': STATUS_MAJOR_OUTAGE,
  'full-outage': STATUS_MAJOR_OUTAGE,
  critical: STATUS_MAJOR_OUTAGE,
  outage: STATUS_MAJOR_OUTAGE,
  down: STATUS_MAJOR_OUTAGE,
  maintenance: STATUS_MAINTENANCE,
  'under-maintenance': STATUS_MAINTENANCE,
})

/**
 * Normalize one state word onto the shared vocabulary.
 * @param {unknown} raw State word from a source.
 * @returns {string | undefined} The shared state, or undefined when the word
 *   is not a state this plugin knows.
 */
export function normalizeState(raw) {
  if (typeof raw !== 'string') return undefined
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (key === '') return undefined
  return STATE_WORDS[key]
}

/**
 * The worst state of a list, ignoring unparsable entries.
 * @param {Iterable<unknown>} states Candidate states.
 * @returns {string | undefined} The worst state, or undefined when none parse.
 */
export function worstState(states) {
  let worst
  for (const candidate of states) {
    const state = normalizeState(candidate)
    if (state === undefined) continue
    if (worst === undefined || SEVERITY[state] > SEVERITY[worst]) worst = state
  }
  return worst
}

/**
 * Project one Atlassian-Statuspage `/api/v2/status.json` body.
 *
 * The indicator is the whole answer; the description is its human sentence,
 * and it is English whatever the page's locale. The plugin's own label is
 * localized in the browser, so the sentence is only carried when something is
 * wrong — saying "All Systems Operational" beside "运行正常" would just repeat
 * itself.
 *
 * @param {{json?: unknown}} env Source payload.
 * @returns {{state: string, summary?: string}} The projected reading.
 */
export function statuspageView({ json }) {
  const body = asObject(json)
  const status = asObject(body.status)
  const state = normalizeState(status.indicator) ?? STATUS_UNKNOWN
  const summary = typeof status.description === 'string' ? status.description.trim() : ''
  return {
    state,
    ...(summary === '' || state === STATUS_OPERATIONAL || state === STATUS_UNKNOWN
      ? {}
      : { summary }),
  }
}
