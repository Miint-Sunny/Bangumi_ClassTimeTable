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
  lateNight: false,
  weekStart: 1,
  friends: [],
  panelOpen: true,
  panelWidth: 380,
  panelWidthDay: 560,
}

export function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        tracking: { status: p.tracking?.status ?? {}, watched: p.tracking?.watched ?? {} },
        overrides: p.overrides ?? {},
      }
    }
  } catch {}
  return { settings: { ...DEFAULT_SETTINGS }, tracking: { status: {}, watched: {} }, overrides: {} }
}

export function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}
