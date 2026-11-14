/**
 * The queued debug log writer: batches must land in order, complete, and never
 * reject — even when the log file cannot be written.
 *
 * `DSH_HOME` is pointed at a throwaway directory before the module is
 * imported, so nothing here touches a real profile.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const home = await mkdtemp(join(tmpdir(), 'dsh-debug-log-'))
process.env.DSH_HOME = home

const { describeError, logDebug } = await import(
  pathToFileURL(join(here, '..', 'lib', 'debug.js')).href
)
const logFile = join(home, 'model-allowance-debug.log')

async function readLines() {
  return (await readFile(logFile, 'utf8')).trimEnd().split('\n')
}

test('concurrent lines land complete and in order', async () => {
  const waits = []
  for (let i = 0; i < 50; i += 1) waits.push(logDebug(`line ${i}`))
  await Promise.all(waits)

  const lines = await readLines()
  assert.equal(lines.length, 50)
  for (let i = 0; i < 50; i += 1) {
    assert.match(lines[i], /^\d{4}-\d{2}-\d{2}T[\d:.]+Z line \d+$/)
  }
  const numbers = lines.map((line) => Number(line.match(/line (\d+)$/)[1]))
  assert.deepEqual(
    numbers,
    Array.from({ length: 50 }, (_, i) => i),
  )
})

test('serial awaited lines also land in order', async () => {
  for (let i = 50; i < 60; i += 1) await logDebug(`line ${i}`)
  const numbers = (await readLines()).map((line) => Number(line.match(/line (\d+)$/)[1]))
  assert.deepEqual(
    numbers,
    Array.from({ length: 60 }, (_, i) => i),
  )
})

test('a write failure still resolves every caller', async () => {
  // Make appending fail by replacing the log file with a directory.
  await rm(logFile)
  await mkdir(logFile)
  await assert.doesNotReject(logDebug('doomed line'))
  await rmdir(logFile)
  // The writer recovers: later lines are written again.
  await logDebug('after failure')
  const lines = await readLines()
  assert.ok(lines.some((line) => line.endsWith('after failure')))
  assert.ok(!lines.some((line) => line.endsWith('doomed line')))
})

test('describeError keeps its shape', () => {
  assert.equal(describeError('plain'), 'plain')
  assert.match(describeError(new TypeError('boom')), /^TypeError: boom/)
})
