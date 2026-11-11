/** The locale namespace this plugin owns. */
export const NS = 'model-allowance'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.loading': '加载中…',
  'badge.noData': '暂无数据',
  'badge.amount': '{amount}',
  'badge.quotaPercent': '剩余 {percent}%',
  'badge.quotaRatio': '{remaining} / {total}',
  'badge.quotaDuration': '剩余 {duration}',
  'badge.unsupported': '目前无余额接口',
  'badge.unsupportedWithName': '{name} 目前无余额接口',
  'badge.unconfigured': '未配置凭证',
  'badge.failed': '无法获取',
  'detail.title': '厂商余额',
  'detail.provider': '厂商',
  'detail.amount': '余额',
  'detail.remaining': '剩余',
  'detail.total': '总额',
  'detail.updatedAt': '更新于 {time}',
  'detail.refresh': '刷新',
  'detail.refreshing': '刷新中…',
  'detail.console': '控制台',
  'detail.error': '无法读取厂商余额。',
  'detail.moreProviders': '更多厂商',
  'detail.switchModelHere': '切换 {name}',
  'detail.switchModelThere': '切换到 {name}',
  'model.title': '模型',
  'model.loading': '加载模型…',
  'model.empty': '该厂商暂无可用模型',
  'model.current': '当前',
  'model.effortDefault': '默认',
  'model.switching': '切换中…',
  'model.failed': '切换失败：{error}',
  'model.loadFailed': '读取模型列表失败：{error}',
  'model.unavailable': '本机未提供模型切换接口',
  'status.operational': '运行正常',
  'status.degraded': '服务降级',
  'status.partialOutage': '部分服务中断',
  'status.majorOutage': '大面积中断',
  'status.maintenance': '维护中',
  'status.loading': '状态加载中…',
  'status.unsupported': '未提供状态服务',
  'status.unknown': '状态未知',
  'schedule.peakTitle': '高峰时段',
  'schedule.offPeakTitle': '低谷时段',
  'schedule.daysWeekdays': '工作日',
  'schedule.daysDaily': '每天',
  'schedule.daysOther': '指定日期',
  'schedule.ranges': '{days} {windows}（{timezone}）',
  'schedule.holidays': '法定节假日全天低谷',
  'schedule.toPeak': '距高峰开始 {duration}',
  'schedule.toOffPeak': '距低谷开始 {duration}',
  'badge.consumption': '相对上次读数的变化',
  'window.title.hour': '{count} 小时额度',
  'window.title.day': '{count} 天额度',
  'window.title.week': '每周额度',
  'window.title.month': '每月额度',
  'window.title.unknown': '当前额度',
  'window.usedOfTotal': '{used} / {total}',
  'window.usedPercent': '{percent}% 已使用',
  'window.resetIn': '{duration} 后重置',
  'duration.daysHours': '{days} 天 {hours} 小时',
  'duration.hoursMinutes': '{hours} 小时 {minutes} 分',
  'duration.minutes': '{minutes} 分钟',
  'duration.lessThanMinute': '不到 1 分钟',
}

/** English dictionary. */
export const en = {
  'badge.loading': 'Loading…',
  'badge.noData': 'No data',
  'badge.amount': '{amount}',
  'badge.quotaPercent': '{percent}% left',
  'badge.quotaRatio': '{remaining} / {total}',
  'badge.quotaDuration': '{duration} left',
  'badge.unsupported': 'No balance API',
  'badge.unsupportedWithName': '{name} has no balance API',
  'badge.unconfigured': 'No credential',
  'badge.failed': 'Unavailable',
  'detail.title': 'Provider balance',
  'detail.provider': 'Provider',
  'detail.amount': 'Balance',
  'detail.remaining': 'Remaining',
  'detail.total': 'Total',
  'detail.updatedAt': 'updated {time}',
  'detail.refresh': 'Refresh',
  'detail.refreshing': 'Refreshing…',
  'detail.console': 'Console',
  'detail.error': 'Could not read the provider balance.',
  'detail.moreProviders': 'More providers',
  'detail.switchModelHere': 'Switch within {name}',
  'detail.switchModelThere': 'Switch to {name}',
  'model.title': 'Models',
  'model.loading': 'Loading models…',
  'model.empty': 'No models available for this provider',
  'model.current': 'Current',
  'model.effortDefault': 'Default',
  'model.switching': 'Switching…',
  'model.failed': 'Switch failed: {error}',
  'model.loadFailed': 'Could not read the model list: {error}',
  'model.unavailable': 'This host offers no model switch',
  'status.operational': 'Operational',
  'status.degraded': 'Degraded',
  'status.partialOutage': 'Partial outage',
  'status.majorOutage': 'Major outage',
  'status.maintenance': 'Maintenance',
  'status.loading': 'Loading status…',
  'status.unsupported': 'No status service provided',
  'status.unknown': 'Status unknown',
  'schedule.peakTitle': 'Peak hours',
  'schedule.offPeakTitle': 'Off-peak',
  'schedule.daysWeekdays': 'Weekdays',
  'schedule.daysDaily': 'Every day',
  'schedule.daysOther': 'Selected days',
  'schedule.ranges': '{days} {windows} ({timezone})',
  'schedule.holidays': 'Statutory holidays are off-peak all day',
  'schedule.toPeak': '{duration} until peak',
  'schedule.toOffPeak': '{duration} until off-peak',
  'badge.consumption': 'Change since the last reading',
  'window.title.hour': '{count}-hour quota',
  'window.title.day': '{count}-day quota',
  'window.title.week': 'Weekly quota',
  'window.title.month': 'Monthly quota',
  'window.title.unknown': 'Current quota',
  'window.usedOfTotal': '{used} / {total}',
  'window.usedPercent': '{percent}% used',
  'window.resetIn': 'resets in {duration}',
  'duration.daysHours': '{days}d {hours}h',
  'duration.hoursMinutes': '{hours}h {minutes}m',
  'duration.minutes': '{minutes}m',
  'duration.lessThanMinute': 'under a minute',
}

/**
 * The language the interface is in.
 *
 * The locale service keeps `<html lang>` pointed at the active locale, so
 * reading it is reading the same choice every `t()` call resolves
 * through. A non-browser host has no document, and English is the
 * baseline there.
 *
 * @returns {'zh' | 'en'} The language, collapsed to the two baselines.
 */
export function activeLanguage() {
  const tag = typeof document !== 'undefined' ? document.documentElement?.lang : undefined
  return typeof tag === 'string' && tag.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Pick one route's display name from the Host metadata.
 *
 * A route without metadata falls back to its own id, so a newly added
 * adapter is readable before anyone writes copy for it.
 *
 * @param {{name?: {zh?: string, en?: string}} | undefined} entry Directory entry.
 * @param {string} route Provider route.
 * @returns {string} The display name.
 */
export function pickName(entry, route) {
  const name = entry?.name
  if (!name) return route
  return name[activeLanguage()] ?? name.en ?? name.zh ?? route
}

/** Shared or card-only status state to its locale key. */
const STATUS_LABEL_KEYS = {
  operational: 'status.operational',
  degraded: 'status.degraded',
  'partial-outage': 'status.partialOutage',
  'major-outage': 'status.majorOutage',
  maintenance: 'status.maintenance',
  loading: 'status.loading',
  unsupported: 'status.unsupported',
  unknown: 'status.unknown',
}

/**
 * Name one status display state in the interface language.
 * @param {string} state Shared or card-only status state.
 * @param {(key: string, params?: object) => string} t Translator.
 * @returns {string} The label.
 */
export function statusLabel(state, t) {
  const key = STATUS_LABEL_KEYS[state]
  return key === undefined ? t('status.unknown') : t(key)
}
