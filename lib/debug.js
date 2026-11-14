/**
 * A small debug log for diagnosing provider readings.
 *
 * Host diagnostics normally reach the process console, which a user cannot
 * easily hand back. When `config.debug` is on, this writes the same facts to
 * `<DSH_HOME>/model-allowance-debug.log` so a failing reading can be inspected
 * after the fact. It stays off by default and writes nothing otherwise.
 *
 * Writes go through an in-memory queue and are appended in batches, one
 * `setImmediate` turn at a time: the home directory is created once per
 * process, rotation is checked once per batch instead of once per line, and a
 * failed batch is dropped silently — a debug log must never break a reading.
 */

import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** File name inside the DSH home. */
const LOG_NAME = 'model-allowance-debug.log'

/** A debug log this large is handed back as `.1` before the next batch. */
const MAX_LOG_BYTES = 2 * 1024 * 1024

/** Directory DSH keeps its profile data in. */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Lines waiting for the next batch, each with the promise to settle. */
let queue = []

/** Directory and file path, cached after the first successful mkdir. */
let logFile = null

/** A batch flush currently running (append calls must stay ordered). */
let flushing = false

/** A flush turn already scheduled for whatever is in the queue. */
let flushScheduled = false

/**
 * Keep the debug log bounded; checked once per batch.
 * @param {string} file Log path.
 * @returns {Promise<void>} Resolves once rotation was considered.
 */
async function rotate(file) {
  try {
    const info = await stat(file)
    if (info.size < MAX_LOG_BYTES) return
    const previous = `${file}.1`
    await rm(previous, { force: true })
    await rename(file, previous)
  } catch {
    // A missing or unreadable log is not a rotation failure worth reporting.
  }
}

/**
 * Queue one line and make sure a flush turn is pending.
 * @param {{ line: string, resolve: () => void }} entry Line to write.
 * @returns {void}
 */
function enqueue(entry) {
  queue.push(entry)
  if (flushScheduled) return
  flushScheduled = true
  setImmediate(() => {
    flushScheduled = false
    runFlush()
  })
}

/**
 * Append every queued line in one `appendFile` call.
 * @returns {Promise<void>} Completes when this batch is settled.
 */
async function runFlush() {
  if (flushing || queue.length === 0) return
  flushing = true
  const batch = queue
  queue = []
  try {
    if (logFile === null) {
      const home = dshHome()
      await mkdir(home, { recursive: true })
      logFile = join(home, LOG_NAME)
    }
    await rotate(logFile)
    await appendFile(logFile, batch.map((entry) => entry.line).join(''), 'utf8')
  } catch {
    // A debug log that cannot be written must never break a reading: the
    // batch is dropped, its callers still resolve.
  } finally {
    flushing = false
    for (const entry of batch) entry.resolve()
    if (queue.length > 0) {
      flushScheduled = true
      setImmediate(() => {
        flushScheduled = false
        runFlush()
      })
    }
  }
}

/**
 * Append one line to the debug log.
 * @param {string} message Line to write.
 * @returns {Promise<void>} Resolves once the line reached disk (or the write
 *   failed and the line was dropped).
 */
export function logDebug(message) {
  return new Promise((resolve) => {
    enqueue({ line: `${new Date().toISOString()} ${message}\n`, resolve })
  })
}

/**
 * Describe an error with its stack, for one log line.
 * @param {unknown} error The thrown value.
 * @returns {string} A single-line description.
 */
export function describeError(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? ` | ${error.stack.split('\n')[1]?.trim() ?? ''}` : ''}`
  }
  return String(error)
}
