/**
 * The installed package contract: what the plugin manager and DSH read before
 * any code runs.
 *
 * These checks are cheap and catch the packaging mistakes that make a working
 * plugin invisible in the Plugin Manager — a missing locale title, a `files`
 * list that omits a runtime module, or a client declaration without a bundle.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('the package declares a loadable Host and client half', () => {
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./client'], './client.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.ok(pkg.dsh.bundle.patch)
})

test('the published file list carries every runtime module and resource', () => {
  const files = pkg.files
  assert.ok(files.includes('index.js'))
  assert.ok(files.includes('client.js'))
  assert.ok(files.includes('cordis.patch.yml'))
  assert.ok(files.includes('lib/*.js'))
  assert.ok(files.includes('lib/providers/*.js'))
  assert.ok(files.includes('locale/*.json'))
  assert.ok(files.includes('icon.svg'))
})

test('both locales name the plugin for the Plugin Manager', () => {
  for (const language of ['en', 'zh']) {
    const locale = JSON.parse(readFileSync(join(root, 'locale', `${language}.json`), 'utf8'))
    assert.equal(typeof locale.meta?.title, 'string')
    assert.notEqual(locale.meta.title, '')
    assert.equal(typeof locale.meta?.description, 'string')
    assert.notEqual(locale.meta.description, '')
  }
})

test('the declared compatibility is a real version range', () => {
  assert.match(pkg.engines.dsh, /^>=/)
  assert.match(pkg.engines.dsh, /<0\.3\.0/)
})
