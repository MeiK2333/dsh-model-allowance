/**
 * Render the pieces that are pure functions returning React elements with the
 * real React server renderer. This replaces string-shaped assertions with a
 * renderer that understands React's element contract.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

globalThis.document = { documentElement: { lang: 'zh-CN' } }

const { formatAmount, formatDuration } = await import('../src/client/format.js')
const { scheduleView, formatCountdown } = await import('../src/client/schedule.js')
const { markOf, providerIcon } = await import('../src/client/icons.js')
const { windowTitle } = await import('../src/client/windows.js')
const { statusDisplayState, entryCovers } = await import('../src/client/badge.js')
const { en, statusLabel, zh } = await import('../src/client/locales.js')

const t = (key, params = {}) => {
  const dictionary = {
    'schedule.peakTitle': '高峰时段',
    'schedule.offPeakTitle': '低谷时段',
    'schedule.daysWeekdays': '工作日',
    'schedule.daysDaily': '每天',
    'schedule.daysOther': '指定日期',
    'schedule.ranges': '{days} {windows}（{timezone}）',
    'schedule.holidays': '法定节假日全天低谷',
    'schedule.toPeak': '距高峰开始 {duration}',
    'schedule.toOffPeak': '距低谷开始 {duration}',
    'window.usedPercent': '{percent}% 已使用',
    'duration.daysHours': '{days} 天 {hours} 小时',
    'duration.hoursMinutes': '{hours} 小时 {minutes} 分',
    'duration.minutes': '{minutes} 分钟',
    'duration.lessThanMinute': '不到 1 分钟',
  }
  let text = dictionary[key] ?? key
  for (const [name, value] of Object.entries(params))
    text = text.replaceAll(`{${name}}`, String(value))
  return text
}

const schedule = {
  provider: 'deepseek',
  timezone: 'Asia/Shanghai',
  timezoneLabel: { zh: '北京时间', en: 'Beijing time' },
  days: [1, 2, 3, 4, 5],
  windows: [
    { from: '09:00', to: '12:00' },
    { from: '14:00', to: '18:00' },
  ],
  holidays: [],
  note: { zh: '低谷时段 API 价格减半', en: 'API prices are halved off-peak' },
}

test('the schedule renders as a real React tree with the current phase', () => {
  // 10:30 on a Friday in Beijing: inside the morning peak window.
  const now = Date.parse('2026-11-06T02:30:00Z')
  const html = renderToStaticMarkup(scheduleView(schedule, now, t))
  assert.match(html, /高峰时段/)
  assert.match(html, /09:00–12:00/)
  assert.match(html, /距低谷开始/)
  assert.match(html, /dsh-model-allowance-schedule-timeline-peak/)
})

test('a holiday renders as an off-peak day without peak blocks', () => {
  const holiday = { ...schedule, holidays: ['2026-10-01'] }
  const now = Date.parse('2026-10-01T02:30:00Z')
  const html = renderToStaticMarkup(scheduleView(holiday, now, t))
  assert.match(html, /低谷时段/)
  assert.doesNotMatch(html, /timeline-peak/)
})

test('the provider mark renders a whole-pixel svg', () => {
  const mark = markOf({ color: '#4d6bfe', iconHint: 'deepseek' }, 'deepseek')
  const html = renderToStaticMarkup(providerIcon('deepseek', 14, mark))
  assert.match(html, /<svg/)
  const width = Number(/width="(\d+)"/.exec(html)?.[1])
  const height = Number(/height="(\d+)"/.exec(html)?.[1])
  assert.ok(Number.isInteger(width) && width % 2 === 0)
  assert.ok(Number.isInteger(height) && height % 2 === 0)
})

test('Kimi, OpenCode, and Qwen use their official marks instead of a letter', () => {
  for (const [route, hint] of [
    ['kimi-coding', 'kimi'],
    ['opencode-go', 'opencode'],
    ['qwen-token-plan-cn', 'qwen'],
  ]) {
    const html = renderToStaticMarkup(
      providerIcon(route, 14, markOf({ color: '#64748b', iconHint: hint }, route)),
    )
    assert.match(html, /<svg/)
    assert.doesNotMatch(html, /tab-letter/)
    const width = Number(/width="(\d+)"/.exec(html)?.[1])
    const height = Number(/height="(\d+)"/.exec(html)?.[1])
    assert.ok(Number.isInteger(width) && width % 2 === 0)
    assert.ok(Number.isInteger(height) && height % 2 === 0)
  }
})

test("Qwen's petals carry the vendor's own paint", () => {
  const html = renderToStaticMarkup(
    providerIcon('qwen-token-plan-cn', 14, markOf({ color: '#082DFF', iconHint: 'qwen' }, 'qwen')),
  )
  // The mark is painted by its own gradients, not by the brand colour.
  assert.match(html, /linearGradient/)
  assert.match(html, /#082DFF/)
  assert.match(html, /#3FD2F9/)
  assert.match(html, /fill="url\(#dsh-balance-qwen-0\)"/)
})

test('a vendor label distinguishes windows that share a unit', () => {
  assert.equal(
    windowTitle(
      { id: 'monthly-total', unit: 'month', label: { zh: '每月总额度', en: 'Monthly total' } },
      t,
    ),
    '每月总额度',
  )
  assert.equal(
    windowTitle(
      { id: 'monthly-code', unit: 'month', label: { zh: '每月代码额度', en: 'Monthly code' } },
      t,
    ),
    '每月代码额度',
  )
  // A plain monthly window still falls back to the generic label.
  assert.equal(windowTitle({ id: 'monthly', unit: 'month' }, t), 'window.title.month')
})

test('the card distinguishes loading, no status source, and a failed status reading', () => {
  assert.equal(statusDisplayState(null), 'loading')
  assert.equal(statusDisplayState({ state: 'unknown' }), 'unsupported')
  assert.equal(
    statusDisplayState({ state: 'unknown', url: 'https://status.example.com' }),
    'unknown',
  )
  assert.equal(statusDisplayState({ state: 'unknown', error: 'offline' }), 'unknown')
  assert.equal(statusDisplayState({ state: 'operational' }), 'operational')

  const zhT = (key) => zh[key] ?? key
  const enT = (key) => en[key] ?? key
  assert.equal(statusLabel('loading', zhT), '状态加载中…')
  assert.equal(statusLabel('unsupported', zhT), '未提供状态服务')
  assert.equal(statusLabel('loading', enT), 'Loading status…')
  assert.equal(statusLabel('unsupported', enT), 'No status service provided')
})

test('a directory entry answers for every id of its vendor', () => {
  // The balance route and the route that lists the vendor's models are not
  // always the same id, and one entry must answer for both.
  const entry = { route: 'deepseek', aliases: ['deepseek-official'] }
  assert.equal(entryCovers(entry, 'deepseek'), true)
  assert.equal(entryCovers(entry, 'deepseek-official'), true)
  assert.equal(entryCovers(entry, 'qwen-token-plan-cn'), false)
  // An entry without aliases still answers for its own route.
  assert.equal(entryCovers({ route: 'zai' }, 'zai'), true)
  assert.equal(entryCovers({ route: 'zai' }, 'zai-coding-cn'), false)
  assert.equal(entryCovers(undefined, 'zai'), false)
})

test('every floating surface of the card is solid', async () => {
  // The card, its provider overflow menu, the model list, and the effort
  // flyout all float over the conversation. A frosted panel there let the
  // text underneath show through, so every one of them is painted on a solid
  // layer instead of the translucent menu surface.
  const { STYLES } = await import('../src/client/styles.js')
  const rule = (selector) => {
    const start = STYLES.indexOf(selector)
    assert.notEqual(start, -1, `the rule ${selector} is missing`)
    return STYLES.slice(start, STYLES.indexOf('}', start))
  }
  for (const selector of [
    '.dsh-model-allowance-panel{',
    '.dsh-model-allowance-menu{',
    '.dsh-model-allowance-model-menu{',
    '.dsh-model-allowance-effort-menu{',
  ]) {
    const surface = rule(selector)
    assert.match(surface, /background:var\(--dsw-alias-bg-layer-2\)/)
    assert.doesNotMatch(surface, /backdrop-filter/)
  }
})

test('money and duration formatting stay readable at the badge edges', () => {
  assert.equal(formatAmount(46.71, 'CNY'), '¥46.71')
  assert.equal(formatAmount(1.2, 'USD'), '$1.20')
  assert.equal(formatAmount(1.2, 'CHF'), 'CHF 1.20')
  assert.equal(formatDuration(3 * 24 * 3_600_000 + 2 * 3_600_000, t), '3 天 2 小时')
  assert.equal(formatDuration(10_000, t), '不到 1 分钟')
  assert.equal(formatCountdown(3_661_000), '01:01:01')
})
