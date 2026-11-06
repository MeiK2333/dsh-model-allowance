/**
 * A small debug log for diagnosing provider readings.
 *
 * Host diagnostics normally reach the process console, which a user cannot
 * easily hand back. When `config.debug` is on, this writes the same facts to
 * `<DSH_HOME>/model-allowance-debug.log` so a failing reading can be inspected
 * after the fact. It stays off by default and writes nothing otherwise.
 */

import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** File name inside the DSH home. */
const LOG_NAME = 'model-allowance-debug.log'

/** A debug log this large is handed back as `.1` before the next line. */
const MAX_LOG_BYTES = 2 * 1024 * 1024

/** Directory DSH keeps its profile data in. */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/**
 * Keep the debug log bounded.
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
 * Append one line to the debug log.
 * @param {string} message Line to write.
 * @returns {Promise<void>} Resolves once the line is written.
 */
export async function logDebug(message) {
  try {
    const home = dshHome()
    await mkdir(home, { recursive: true })
    const file = join(home, LOG_NAME)
    await rotate(file)
    const line = `${new Date().toISOString()} ${message}\n`
    await appendFile(file, line, 'utf8')
  } catch {
    // A debug log that cannot be written must never break a reading.
  }
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
