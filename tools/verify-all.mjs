/**
 * Run every integration verifier in order.
 *
 * The verifiers are standalone scripts: each owns its fixtures and exits
 * non-zero on the first failed expectation. This runner gives `npm test` one
 * command for all of them without making each script import the others.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(here)
  .filter(
    (name) => name.startsWith('verify-') && name.endsWith('.mjs') && name !== 'verify-all.mjs',
  )
  .sort()

if (files.length === 0) {
  console.error('verify-all: no verifier scripts found')
  process.exitCode = 1
} else {
  for (const file of files) {
    console.log(`\n=== ${file} ===`)
    const result = spawnSync(process.execPath, [join(here, file)], {
      stdio: 'inherit',
    })
    if (result.error !== undefined) {
      console.error(`verify-all: ${file} could not start`, result.error)
      process.exitCode = 1
      break
    }
    if (result.status !== 0) {
      console.error(`verify-all: ${file} failed with exit code ${String(result.status)}`)
      process.exitCode = result.status ?? 1
      break
    }
  }
}
