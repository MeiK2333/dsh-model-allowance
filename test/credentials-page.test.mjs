/**
 * The settings page's declared credential groups.
 *
 * The page writes through the `credentials` Remote namespace, which refuses a
 * reference outside the POSIX identifier grammar and a blank value. Those are
 * user-time failures; this file checks the declared table so a typo in a new
 * group is caught before it ships.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { CREDENTIAL_GROUPS, CREDENTIAL_REFS } from '../src/client/credential-groups.js'
import { en, zh } from '../src/client/locales.js'

/** The grammar `credentials.set` accepts. */
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

test('credential groups carry valid, unique references', () => {
  assert.ok(CREDENTIAL_GROUPS.length > 0)
  const ids = new Set()
  const refs = new Set()
  for (const group of CREDENTIAL_GROUPS) {
    assert.ok(!ids.has(group.id), `duplicate group id ${group.id}`)
    ids.add(group.id)
    assert.ok(group.fields.length > 0, `group ${group.id} has no fields`)
    for (const field of group.fields) {
      assert.match(field.ref, REF_PATTERN)
      assert.ok(!refs.has(field.ref), `duplicate reference ${field.ref}`)
      refs.add(field.ref)
    }
  }
  assert.deepEqual([...CREDENTIAL_REFS], [...refs])
})

test('group copy names every entry in both languages', () => {
  for (const group of CREDENTIAL_GROUPS) {
    assert.equal(typeof group.name.zh, 'string')
    assert.notEqual(group.name.zh, '')
    assert.equal(typeof group.name.en, 'string')
    assert.notEqual(group.name.en, '')
    for (const field of group.fields) {
      assert.equal(typeof field.label.zh, 'string')
      assert.equal(typeof field.label.en, 'string')
    }
  }
})

test('a guide link is an https URL with bilingual text', () => {
  for (const group of CREDENTIAL_GROUPS) {
    if (group.docUrl === undefined) continue
    assert.match(group.docUrl, /^https:\/\//)
    assert.equal(typeof group.docLabel?.zh, 'string')
    assert.equal(typeof group.docLabel?.en, 'string')
  }
})

test('both dictionaries carry the settings copy', () => {
  for (const dictionary of [zh, en]) {
    for (const key of Object.keys(dictionary)) {
      if (!key.startsWith('settings.')) continue
      const mirror = dictionary === zh ? en : zh
      assert.equal(
        typeof mirror[key],
        'string',
        `${dictionary === zh ? 'en' : 'zh'} is missing ${key}`,
      )
    }
  }
})

test('both dictionaries carry the unconfigured card copy', () => {
  for (const dictionary of [zh, en]) {
    assert.equal(typeof dictionary['badge.setupHint'], 'string')
    assert.notEqual(dictionary['badge.setupHint'], '')
    assert.equal(typeof dictionary['badge.setupDoc'], 'string')
  }
})
