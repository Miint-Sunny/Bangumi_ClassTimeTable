import type { AirFix, Settings, Tracking } from '../types'

const KEY = 'btt:v1'

export interface Persisted {
  settings: Settings
  tracking: Tracking
  overrides: Record<number, AirFix> // 本机放送校正,优先于 enhance.json
}

/** 首访默认主题:系统明确偏好浅色 → 白色,否则 Bangumi 深色;用户选过就存 localStorage 恒久生效 */
const defaultTheme = (): Settings['theme'] =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'bgm-dark'

export const DEFAULT_SETTINGS: Settings = {
  theme: defaultTheme(),
  tzMode: 'local',
  lateNightCutoff: 2, // 默认凌晨 2:00 前归前日(表记到 25:59)
  weekStart: 1,
  friends: [],
  panelOpen: true,
  panelWidth: 380,
  panelWidthDay: 640,
}

export function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }
      // 旧默认值一次性升级(560 是曾经的出厂日视图宽度,手动拖到正好 560 的概率可忽略)
      if (settings.panelWidthDay === 560) settings.panelWidthDay = 640
      // 旧布尔版深夜表记迁移:开着的迁到新默认 2 点边界,关着的保持按实际日期
      if ('lateNight' in settings && !('lateNightCutoff' in (p.settings ?? {}))) {
        settings.lateNightCutoff = (settings as Record<string, unknown>).lateNight ? 2 : 0
      }
      delete (settings as Record<string, unknown>).lateNight
      return {
        settings,
        tracking: {
          status: p.tracking?.status ?? {},
          watched: p.tracking?.watched ?? {},
          rates: p.tracking?.rates ?? {},
          memos: p.tracking?.memos ?? {},
        },
        overrides: p.overrides ?? {},
      }
    }
  } catch {}
  return {
    settings: { ...DEFAULT_SETTINGS },
    tracking: { status: {}, watched: {}, rates: {}, memos: {} },
    overrides: {},
  }
}

export function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}
