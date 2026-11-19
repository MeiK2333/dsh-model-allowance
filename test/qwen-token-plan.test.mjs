/**
 * The Qwen Token Plan adapter's signing and projection, pinned.
 *
 * The ACS3 signature is verified against a golden vector computed by the
 * Alibaba Cloud HMAC-SHA256 recipe — a signing typo is invisible until a live
 * call is refused, so the algorithm is pinned here instead. The credential
 * test walks the same chain a save does, against the recorded transport.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acs3Authorization,
  qwenTokenPlanAdapters,
  testQwenPlanCredentials,
} from '../lib/providers/qwen_token_plan.js'
import { CREDENTIAL_GROUPS } from '../src/client/credential-groups.js'
import { withFetch } from '../tools/fixture-fetch.mjs'

const adapter = qwenTokenPlanAdapters[0]

test('acs3Authorization reproduces the Alibaba Cloud signature recipe', () => {
  const headers = acs3Authorization({
    accessKeyId: 'LTAItestAK',
    secretAccessKey: 'testSecret',
    host: 'modelstudio.cn-beijing.aliyuncs.com',
    path: '/modelstudio/cli/generateAccessToken',
    action: 'GenerateCLIAccessToken',
    version: '2026-02-10',
    body: '',
    date: '2026-01-02T03:04:05Z',
    nonce: 'fixed-nonce',
  })
  assert.equal(
    headers['x-acs-content-sha256'],
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )
  assert.equal(headers['x-acs-date'], '2026-01-02T03:04:05Z')
  assert.equal(headers['x-acs-signature-nonce'], 'fixed-nonce')
  assert.equal(
    headers.authorization,
    'ACS3-HMAC-SHA256 Credential=LTAItestAK,' +
      'SignedHeaders=content-type;host;x-acs-action;x-acs-content-sha256;' +
      'x-acs-date;x-acs-signature-nonce;x-acs-version,' +
      'Signature=132fe7575ac078c9d9b6b9c59c238ee2b7ca4d6d1ccea26f6b25122ccd491308',
  )
})

/** The console token reply the recorded chain starts with. */
const TOKEN = { cliAccessToken: 'recorded-console-token' }

test('testQwenPlanCredentials accepts a pair the usage endpoint answers', async () => {
  const usage = adapter.fixtures[0].responses[1]
  const { result } = await withFetch({ responses: [TOKEN, usage] }, () =>
    testQwenPlanCredentials({ accessKeyId: 'LTAItest', secretAccessKey: 'secret' }),
  )
  assert.deepEqual(result, { ok: true })
})

test('testQwenPlanCredentials reports the RAM refusal with its grants', async () => {
  const refusal = {
    code: '200',
    data: {
      success: false,
      errorCode: 'BailianGateway.Team.NotAuthorised',
      errorMsg: 'BailianGateway.Team.NotAuthorised',
    },
  }
  const { result } = await withFetch({ responses: [TOKEN, refusal] }, () =>
    testQwenPlanCredentials({ accessKeyId: 'LTAItest', secretAccessKey: 'secret' }),
  )
  assert.equal(result.ok, false)
  assert.match(result.error, /AliyunTokenPlanReadOnlyAccess/)
})

test('testQwenPlanCredentials reports a token refusal', async () => {
  const { result } = await withFetch({ httpStatus: 403, responses: [{}] }, () =>
    testQwenPlanCredentials({ accessKeyId: 'LTAItest', secretAccessKey: 'secret' }),
  )
  assert.equal(result.ok, false)
  assert.match(result.error, /GenerateCLIAccessToken/)
})

test('the adapter carries the setup guide for the unconfigured card', () => {
  assert.ok(adapter.setupUrl, 'the adapter declares no setup guide')
  assert.match(adapter.setupUrl, /^https:\/\/github\.com\//)
  assert.deepEqual(
    [...adapter.credentialRefs],
    ['ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'],
  )
  // The settings page links the same guide, so the card and the page cannot
  // drift apart on where the walkthrough lives.
  assert.equal(
    CREDENTIAL_GROUPS.find((group) => group.test === 'qwen')?.docUrl,
    adapter.setupUrl,
    'the settings page guide and the adapter guide differ',
  )
})
