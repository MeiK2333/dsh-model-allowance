/**
 * Static render cases for the badge and the detail panel, using the real
 * React server renderer. The badge reads projections and effects that a
 * static render never runs, so these cases pin what renderToStaticMarkup
 * can see: the empty state, the badge shell, and the panel's rows.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

globalThis.document = { documentElement: { lang: 'zh-CN' } }

const { BalanceBadge } = await import('../src/client/badge.js')
const { BalancePanel } = await import('../src/client/components/balance-panel.js')

const t = (key, params = {}) => {
  const dictionary = {
    'badge.loading': '加载中…',
    'detail.title': '厂商余额',
    'detail.provider': '厂商',
    'detail.amount': '余额',
    'detail.refresh': '刷新',
    'detail.refreshing': '刷新中…',
    'badge.unsupportedWithName': '{name} 暂不支持余额查询',
    'status.loading': '状态加载中…',
  }
  let text = dictionary[key] ?? key
  for (const [name, value] of Object.entries(params))
    text = text.replaceAll(`{${name}}`, String(value))
  return text
}

test('a badge without any provider renders nothing', () => {
  const props = {
    useProjection: () => undefined,
    ctx: {},
    t,
    sessionId: 'session-1',
  }
  assert.equal(renderToStaticMarkup(h(BalanceBadge, props)), '')
})

test('a badge with a provider renders the badge shell in its loading state', () => {
  const props = {
    useProjection: () => ({ next: { provider: 'deepseek', model: 'deepseek-chat' } }),
    ctx: {},
    t,
    sessionId: 'session-1',
  }
  const html = renderToStaticMarkup(h(BalanceBadge, props))
  assert.match(html, /dsh-model-allowance-badge/)
  assert.match(html, /data-provider="deepseek"/)
  assert.match(html, /加载中…/)
  // The panel is closed, so it is not part of the static tree. The inline
  // <style> block mentions the panel's class, so assert on the element id.
  assert.doesNotMatch(html, /id="dsh-model-allowance-panel"/)
})

test('the panel renders an amount reading as a labelled row', () => {
  const view = {
    provider: 'deepseek',
    status: 'ready',
    kind: 'amount',
    amount: 46.71,
    currency: 'CNY',
  }
  const html = renderToStaticMarkup(
    h(BalancePanel, {
      t,
      now: 0,
      view,
      activeProvider: 'deepseek',
      available: [],
      schedule: null,
      currentStatus: null,
      serviceState: 'loading',
      refresh: async () => {},
      refreshing: false,
      canSwitch: false,
      inUse: true,
      switchLabel: '切换',
      selectedEffort: undefined,
      setPicked: () => {},
      nameOf: (route) => route,
      markFor: () => ({ color: '#4d6bfe' }),
      catalog: {
        modelMenuOpen: false,
        modelWrapRef: { current: null },
        shownModelList: [],
        shownModelListState: 'idle',
        modelError: null,
        currentModel: undefined,
        switchingModel: null,
        hoverModel: null,
        showEffortFlyout: () => {},
        scheduleEffortFlyoutClose: () => {},
        keepEffortFlyout: () => {},
        toggleModelMenu: () => {},
        switchToModel: async () => {},
      },
    }),
  )
  assert.match(html, /dsh-model-allowance-panel/)
  assert.match(html, /余额/)
  assert.match(html, /¥46\.71/)
  assert.match(html, /厂商/)
})

test('an unsupported view without a consoleUrl renders no link and keeps the text', () => {
  const view = {
    provider: 'deepseek',
    status: 'unsupported',
  }
  const html = renderToStaticMarkup(
    h(BalancePanel, {
      t,
      now: 0,
      view,
      activeProvider: 'deepseek',
      available: [],
      schedule: null,
      currentStatus: null,
      serviceState: 'loading',
      refresh: async () => {},
      refreshing: false,
      canSwitch: false,
      inUse: true,
      switchLabel: '切换',
      selectedEffort: undefined,
      setPicked: () => {},
      nameOf: (route) => route,
      markFor: () => ({ color: '#4d6bfe' }),
      catalog: {
        modelMenuOpen: false,
        modelWrapRef: { current: null },
        shownModelList: [],
        shownModelListState: 'idle',
        modelError: null,
        currentModel: undefined,
        switchingModel: null,
        hoverModel: null,
        showEffortFlyout: () => {},
        scheduleEffortFlyoutClose: () => {},
        keepEffortFlyout: () => {},
        toggleModelMenu: () => {},
        switchToModel: async () => {},
      },
    }),
  )
  // No consoleUrl means no clickable element: never an <a> with a
  // missing or undefined href.
  assert.doesNotMatch(html, /<a\b/)
  assert.match(html, /deepseek 暂不支持余额查询/)
})
