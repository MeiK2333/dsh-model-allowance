/**
 * The model list the switch button offers.
 *
 * The card reads the Host's model catalog and offers the models of the
 * provider it points at. These tests pin the three decisions that decide
 * what the list shows: which group belongs to a provider, which entries
 * inside it can be selected, and which of them the session already uses.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { currentModelFor, modelsForProvider, providerGroup } from '../src/client/models.js'

const CATALOG = {
  default: { provider: 'deepseek', model: 'deepseek-chat' },
  routableProviders: ['deepseek', 'minimax-cn'],
  groups: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat' },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
      ],
    },
    {
      id: 'minimax-cn',
      name: 'MiniMax',
      models: [{ id: 'minimax-m2', name: 'MiniMax M2', reasoning: { defaultEffort: 'high' } }],
    },
    { id: 'empty-provider', name: 'Nothing', models: [] },
  ],
  failures: [],
}

test('the group of a provider is the one carrying its id', () => {
  assert.equal(providerGroup(CATALOG, 'minimax-cn')?.name, 'MiniMax')
  assert.equal(providerGroup(CATALOG, 'nope'), undefined)
})

test('a malformed catalog has no group', () => {
  assert.equal(providerGroup(undefined, 'deepseek'), undefined)
  assert.equal(providerGroup({ groups: 'not a list' }, 'deepseek'), undefined)
})

test('the models of a provider are the ones its group lists', () => {
  const models = modelsForProvider(CATALOG, 'minimax-cn')
  assert.equal(models.length, 1)
  assert.equal(models[0].id, 'minimax-m2')
})

test('a model without an id cannot be selected and is dropped', () => {
  const catalog = {
    groups: [
      {
        id: 'deepseek',
        models: [{ id: 'deepseek-chat' }, { name: 'Nameless' }, { id: '' }],
      },
    ],
  }
  const models = modelsForProvider(catalog, 'deepseek')
  assert.deepEqual(
    models.map((model) => model.id),
    ['deepseek-chat'],
  )
})

test('a provider with no models offers none', () => {
  assert.deepEqual(modelsForProvider(CATALOG, 'empty-provider'), [])
  assert.deepEqual(modelsForProvider(CATALOG, 'nope'), [])
})

test('the current model is the one the session uses of that provider', () => {
  const selection = { next: { provider: 'minimax-cn', model: 'minimax-m2' } }
  assert.equal(currentModelFor(selection, 'minimax-cn'), 'minimax-m2')
})

test('a card pointed at another provider has no current model', () => {
  const selection = { next: { provider: 'minimax-cn', model: 'minimax-m2' } }
  assert.equal(currentModelFor(selection, 'deepseek'), undefined)
})

test('the last used model answers when the session has no pending one', () => {
  const selection = { lastUsed: { provider: 'deepseek', model: 'deepseek-chat' } }
  assert.equal(currentModelFor(selection, 'deepseek'), 'deepseek-chat')
  assert.equal(currentModelFor(undefined, 'deepseek'), undefined)
})
