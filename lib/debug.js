/**
 * A small debug log for diagnosing provider readings.
 *
 * Host diagnostics normally reach the process console, which a user cannot
 * easily hand back. When `config.debug` is on, this writes the same facts to
 * `<DSH_HOME>/model-balance-debug.log` so a failing reading can be inspected
 * after the fact. It stays off by default and writes nothing otherwise.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Directory DSH keeps its profile data in. */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
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
    const line = `${new Date().toISOString()} ${message}\n`
    await appendFile(join(home, 'model-balance-debug.log'), line, 'utf8')
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

export { dshHome }
