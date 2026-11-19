/**
 * The settings page that stores provider balance credentials.
 *
 * Values are written through the Host's `credentials` Remote namespace, the
 * same seam the harness's own settings pages use: a secret crosses to the
 * Host once and is never read back, and a status row reports only whether a
 * reference is configured and where its value came from. A group is one
 * credential record: its fields are entered and saved together, validated as
 * a whole, and once stored the record renders masked with edit and delete
 * actions.
 *
 * A save is earned: a testable group is verified first through the balance
 * namespace's `testCredentials`, which walks the vendor's live credential
 * chain with the entered pair, and only a pair the vendor accepted is stored.
 */
import * as React from 'react'
import { createElement as h } from 'react'
import { CREDENTIAL_GROUPS, CREDENTIAL_REFS } from './credential-groups.js'
import { activeLanguage } from './locales.js'
import { getBalanceApi } from './namespace.js'

// The card, field, input, and button geometry is copied from the harness's
// own Models settings page so the form reads as part of the same surface.
// Every colour resolves through a `--dsw-alias-*` theme token.
const STYLES = [
  '.dsh-allowance-cfg{display:flex;flex-direction:column;gap:12px;max-width:720px;',
  'color:var(--dsw-alias-label-primary)}',
  '.dsh-allowance-cfg-title{margin:0;font-size:16px;line-height:24px;font-weight:500;',
  'color:var(--dsw-alias-label-primary)}',
  '.dsh-allowance-cfg-card{display:flex;flex-direction:column;gap:12px;padding:12px 14px;',
  'border:0.5px solid var(--dsw-alias-settings-card-stroke);',
  'background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl)}',
  '.dsh-allowance-cfg-card-title{margin:0;font-size:14px;line-height:22px;font-weight:500;',
  'color:var(--dsw-alias-label-primary)}',
  '.dsh-allowance-cfg-card-head{display:flex;align-items:center;gap:8px}',
  '.dsh-allowance-cfg-field{display:flex;flex-direction:column;gap:6px}',
  '.dsh-allowance-cfg-field-label{font-size:12px;line-height:18px;font-weight:500;',
  'color:var(--dsw-alias-label-secondary)}',
  '.dsh-allowance-cfg-text{font-size:14px;line-height:22px;',
  'color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
  '.dsh-allowance-cfg-status{display:inline-flex;align-items:center;height:22px;',
  'padding:0 8px;border-radius:var(--dsw-radius-sm);font-size:12px;line-height:18px;',
  'border:0.5px solid var(--dsw-alias-state-success-primary);',
  'color:var(--dsw-alias-state-success-primary)}',
  '.dsh-allowance-cfg-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;',
  'border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);',
  'font:inherit;font-size:14px;line-height:22px;background:var(--dsw-alias-bg-layer-1);',
  'color:var(--dsw-alias-label-primary)}',
  '.dsh-allowance-cfg-input:focus{outline:none;',
  'border-color:var(--dsw-alias-state-business-primary)}',
  '.dsh-allowance-cfg-input:disabled{opacity:.6;cursor:default}',
  '.dsh-allowance-cfg-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.dsh-allowance-cfg-button{box-sizing:border-box;display:inline-flex;align-items:center;',
  'justify-content:center;height:32px;padding:0 14px;border:none;',
  'border-radius:var(--dsw-radius-md);font:inherit;font-size:14px;line-height:22px;',
  'cursor:pointer}',
  '.dsh-allowance-cfg-button[data-tone="primary"]{',
  'background:var(--dsw-alias-button-primary-fill);',
  'color:var(--dsw-alias-label-primary-foreground)}',
  '.dsh-allowance-cfg-button[data-tone="primary"]:hover:not(:disabled){',
  'background:var(--dsw-alias-button-primary-hover)}',
  '.dsh-allowance-cfg-button[data-tone="secondary"]{',
  'border:0.5px solid var(--dsw-alias-border-l3);background:transparent;',
  'color:var(--dsw-alias-label-primary)}',
  '.dsh-allowance-cfg-button[data-tone="secondary"]:hover:not(:disabled){',
  'background:var(--dsw-alias-interactive-bg-hover-solid)}',
  '.dsh-allowance-cfg-button:disabled{opacity:.5;cursor:default}',
  '.dsh-allowance-cfg-link{font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-state-business-primary);text-decoration:none}',
  '.dsh-allowance-cfg-link:hover{text-decoration:underline}',
  '.dsh-allowance-cfg-saved{margin:0;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-state-success-primary)}',
  '.dsh-allowance-cfg-error{margin:0;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-state-error-primary)}',
  '.dsh-allowance-cfg-hint{margin:0;font-size:12px;line-height:18px;',
  'color:var(--dsh-alias-label-tertiary)}',
].join('')

/**
 * Pick the interface language's text from a bilingual label.
 * @param {{zh: string, en: string}} bilingual The label.
 * @returns {string} The text.
 */
function pick(bilingual) {
  return bilingual[activeLanguage()] ?? bilingual.en ?? bilingual.zh
}

/**
 * One failure as copy. A refused write carries the credential seam's own
 * message, which is what the page must show verbatim.
 * @param {unknown} error The failure.
 * @returns {string} The message.
 */
function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Verify one testable group's entered pair against the vendor's live chain.
 *
 * The balance namespace is looked up without `inject`: an older Host without
 * the method, or a failed mount, leaves the page working — the pair is then
 * saved unverified rather than blocking configuration forever.
 *
 * @param {object} group The group being saved.
 * @param {Record<string, string>} drafts The entered values, by reference.
 * @param {string} refId The credential reference naming the AccessKey ID.
 * @param {string} refSecret The credential reference naming the secret.
 * @param {(key: string) => string} t Translator of the plugin namespace.
 * @returns {Promise<{ok: true} | {ok: false, error: string}>} The outcome.
 */
async function testGroup(group, drafts, refId, refSecret, t) {
  if (group.test !== 'qwen') return { ok: true }
  try {
    const api = await getBalanceApi()
    if (!api || typeof api.testCredentials !== 'function') return { ok: true }
    const result = await api.testCredentials(drafts[refId] ?? '', drafts[refSecret] ?? '')
    if (result.ok && result.value?.ok === true) return { ok: true }
    if (result.ok && result.value?.ok === false) {
      return { ok: false, error: result.value.error ?? t('settings.testRejected') }
    }
    return { ok: false, error: errorText(result.error ?? t('settings.testRejected')) }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

/**
 * Unwrap one Remote namespace answer: the wire layer resolves with
 * `{ok, value}` or `{ok: false, error}` rather than throwing, so a caller
 * that read the raw answer would mistake the wrapper for the result.
 * @param {object} response The namespace call's answer.
 * @returns {object} The value.
 */
function unwrap(response) {
  if (response?.ok) return response.value
  const detail = response?.error
  throw new Error(
    detail instanceof Error
      ? detail.message
      : typeof detail?.message === 'string'
        ? detail.message
        : typeof detail === 'string'
          ? detail
          : 'the Host refused the call',
  )
}

/**
 * The settings section: one credential card per group.
 *
 * @param {object} props Section props.
 * @param {import('@deepseek-ai/cordis').Context} props.ctx Client context.
 * @param {(key: string) => string} props.t Translator of the plugin namespace.
 * @returns {React.ReactNode} The section.
 */
export function CredentialsSection({ ctx, t }) {
  // The namespace is looked up without `inject`: a composition that lacks the
  // credentials controller must still render the badge, and this page then
  // says the store is unavailable instead of taking the plugin down with it.
  const credentials = ctx.get('remote.credentials')
  /** @type {Record<string, {configured: boolean, source?: string, writable: boolean, masked?: string}> | undefined} */
  const [infos, setInfos] = React.useState(undefined)
  const [drafts, setDrafts] = React.useState({})
  const [editing, setEditing] = React.useState({})
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState(undefined)

  const load = React.useCallback(async () => {
    if (credentials === undefined) return
    try {
      setInfos(unwrap(await credentials.describe([...CREDENTIAL_REFS])))
    } catch (error) {
      setInfos({})
      setNotice({ tone: 'error', text: `${t('settings.loadFailed')}: ${errorText(error)}` })
    }
  }, [credentials, t])

  React.useEffect(() => {
    void load()
  }, [load])

  /** Drop one group's draft and edit state. */
  const resetGroup = (group) => {
    setDrafts((previous) => {
      const next = { ...previous }
      for (const field of group.fields) delete next[field.ref]
      return next
    })
    setEditing((previous) => ({ ...previous, [group.id]: false }))
  }

  /**
   * Save one group as a single record. Both fields are validated together:
   * a blank anywhere fails the whole record and writes nothing. A testable
   * group is verified against the vendor's live chain first, and only a
   * pair the vendor accepted is stored.
   */
  const saveGroup = async (group) => {
    const values = group.fields.map((field) => (drafts[field.ref] ?? '').trim())
    if (values.some((value) => value === '')) {
      setNotice({ tone: 'error', text: t('settings.fillAll') })
      return
    }
    setBusy(true)
    setNotice(undefined)
    try {
      const [idField, secretField] = group.fields
      const tested = await testGroup(
        group,
        Object.fromEntries(
          group.fields.map((field) => [field.ref, (drafts[field.ref] ?? '').trim()]),
        ),
        idField.ref,
        secretField.ref,
        t,
      )
      if (!tested.ok) {
        setNotice({ tone: 'error', text: `${t('settings.testFailed')}: ${tested.error}` })
        return
      }
      for (const field of group.fields) {
        unwrap(await credentials.set(field.ref, (drafts[field.ref] ?? '').trim()))
      }
      resetGroup(group)
      setNotice({ tone: 'ok', text: t('settings.saved') })
    } catch (error) {
      setNotice({ tone: 'error', text: `${t('settings.saveFailed')}: ${errorText(error)}` })
    } finally {
      setBusy(false)
      await load()
    }
  }

  /** Remove every stored value of one group. */
  const deleteGroup = async (group) => {
    setBusy(true)
    setNotice(undefined)
    try {
      for (const field of group.fields) {
        unwrap(await credentials.unset(field.ref))
      }
      resetGroup(group)
      setNotice({ tone: 'ok', text: t('settings.deleted') })
    } catch (error) {
      setNotice({ tone: 'error', text: `${t('settings.deleteFailed')}: ${errorText(error)}` })
    } finally {
      setBusy(false)
      await load()
    }
  }

  /**
   * One credential field row: the label with an input while the record is
   * being entered, or the masked stored value once it exists.
   * @param {import('./credential-groups.js').CredentialField} field The field.
   * @param {boolean} editMode Whether the entry form is showing.
   * @returns {React.ReactNode} The field row.
   */
  const renderField = (field, editMode) => {
    const info = infos?.[field.ref]
    return h(
      'div',
      { key: field.ref, className: 'dsh-allowance-cfg-field' },
      h(
        editMode ? 'label' : 'div',
        {
          className: 'dsh-allowance-cfg-field-label',
          htmlFor: editMode ? `dsh-allowance-cfg-${field.ref}` : undefined,
        },
        pick(field.label),
      ),
      editMode
        ? h('input', {
            id: `dsh-allowance-cfg-${field.ref}`,
            className: 'dsh-allowance-cfg-input',
            type: 'password',
            autoComplete: 'off',
            spellCheck: false,
            disabled: busy || info?.writable === false,
            value: drafts[field.ref] ?? '',
            onChange: (event) =>
              setDrafts((previous) => ({ ...previous, [field.ref]: event.target.value })),
          })
        : // A stored record reads as text, not as a box that mimics the
          // entry form: the two states must be told apart at a glance.
          h(
            'span',
            { className: 'dsh-allowance-cfg-text' },
            typeof info?.masked === 'string' && info.masked !== '' ? info.masked : '********',
          ),
    )
  }

  /**
   * One credential card: name, the guide link, the record (masked) or its
   * entry form, and the record's actions.
   * @param {import('./credential-groups.js').CredentialGroup} group The group.
   * @returns {React.ReactNode} The card.
   */
  const renderGroup = (group) => {
    const allStored = group.fields.every((field) => infos?.[field.ref]?.configured === true)
    const editMode = !allStored || editing[group.id] === true
    return h(
      'section',
      { key: group.id, className: 'dsh-allowance-cfg-card' },
      h(
        'div',
        { className: 'dsh-allowance-cfg-card-head' },
        h('h3', { className: 'dsh-allowance-cfg-card-title' }, pick(group.name)),
        // The stored state names itself, so the card reads as configured or
        // as a form to fill without reading any field.
        allStored
          ? h('span', { className: 'dsh-allowance-cfg-status' }, t('settings.configured'))
          : null,
      ),
      group.docUrl
        ? h(
            'a',
            {
              className: 'dsh-allowance-cfg-link',
              href: group.docUrl,
              target: '_blank',
              rel: 'noreferrer noopener',
            },
            `${group.docLabel ? pick(group.docLabel) : t('settings.doc')} ↗`,
          )
        : null,
      group.fields.map((field) => renderField(field, editMode)),
      h(
        'div',
        { className: 'dsh-allowance-cfg-actions' },
        editMode
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-allowance-cfg-button',
                'data-tone': 'primary',
                disabled: busy,
                onClick: () => void saveGroup(group),
              },
              busy ? t('settings.testing') : t('settings.save'),
            )
          : [
              h(
                'button',
                {
                  type: 'button',
                  key: 'edit',
                  className: 'dsh-allowance-cfg-button',
                  'data-tone': 'secondary',
                  disabled: busy,
                  onClick: () => setEditing((previous) => ({ ...previous, [group.id]: true })),
                },
                t('settings.edit'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  key: 'delete',
                  className: 'dsh-allowance-cfg-button',
                  'data-tone': 'secondary',
                  disabled: busy,
                  onClick: () => void deleteGroup(group),
                },
                t('settings.delete'),
              ),
            ],
        allStored && editMode
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-allowance-cfg-button',
                'data-tone': 'secondary',
                disabled: busy,
                onClick: () => resetGroup(group),
              },
              t('settings.cancel'),
            )
          : null,
      ),
    )
  }

  return h(
    React.Fragment,
    null,
    // Component-local styles: React removes them with the component.
    h('style', { key: 'styles' }, STYLES),
    h(
      'div',
      { className: 'dsh-allowance-cfg' },
      h('h2', { className: 'dsh-allowance-cfg-title' }, t('settings.title')),
      credentials === undefined
        ? h('p', { className: 'dsh-allowance-cfg-error' }, t('settings.unavailable'))
        : infos === undefined
          ? h('p', { className: 'dsh-allowance-cfg-hint' }, t('settings.loading'))
          : CREDENTIAL_GROUPS.map((group) => renderGroup(group)),
      notice === undefined
        ? null
        : h(
            'p',
            {
              key: 'notice',
              role: 'status',
              className:
                notice.tone === 'error' ? 'dsh-allowance-cfg-error' : 'dsh-allowance-cfg-saved',
            },
            notice.text,
          ),
    ),
  )
}
