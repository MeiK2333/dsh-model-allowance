/**
 * The credential groups the settings page renders.
 *
 * Each group is one vendor's balance-query credential set, addressed through
 * the DSH credential store by reference name. The Host resolves the same
 * names when a provider adapter reads, so a value saved on the page
 * authorizes the query without further wiring. Groups and fields are declared
 * data: adding another vendor's AccessKey pair is one entry here.
 */

/**
 * @typedef {object} BilingualText
 * @property {string} zh Simplified Chinese text.
 * @property {string} en English text.
 */

/**
 * @typedef {object} CredentialField
 * @property {string} ref Credential reference name (POSIX identifier).
 * @property {BilingualText} label Field label.
 */

/**
 * @typedef {object} CredentialGroup
 * @property {string} id Group identity.
 * @property {BilingualText} name Group title.
 * @property {BilingualText} [docLabel] The guide link's text.
 * @property {string} [docUrl] Guide that walks obtaining the credentials.
 * @property {'qwen'} [test] The credential chain the Host walks to verify a
 *   candidate before it is saved.
 * @property {readonly CredentialField[]} fields Fields saved together.
 */

/** @type {readonly CredentialGroup[]} */
export const CREDENTIAL_GROUPS = Object.freeze([
  {
    id: 'aliyun',
    name: {
      zh: '阿里云（千问 Token Plan）',
      en: 'Alibaba Cloud (Qwen Token Plan)',
    },
    docLabel: {
      zh: '如何获取 AccessKey？',
      en: 'How do I get an AccessKey?',
    },
    docUrl:
      'https://github.com/MeiK2333/dsh-model-allowance/blob/master/docs/qwen-token-plen-cn/README.md',
    test: 'qwen',
    fields: [
      {
        ref: 'ALIBABA_CLOUD_ACCESS_KEY_ID',
        label: { zh: 'AccessKey ID', en: 'AccessKey ID' },
      },
      {
        ref: 'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
        label: { zh: 'AccessKey Secret', en: 'AccessKey Secret' },
      },
    ],
  },
])

/** Every reference the page manages, in declaration order. */
export const CREDENTIAL_REFS = Object.freeze(
  CREDENTIAL_GROUPS.flatMap((group) => group.fields.map((field) => field.ref)),
)
