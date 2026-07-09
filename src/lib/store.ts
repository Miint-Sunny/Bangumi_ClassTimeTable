import type { AirFix, Settings, Tracking } from '../types'
import type { Continuity } from './progress'
import { detectLang } from './i18n'

const KEY = 'btt:v1'

export type RegionClass = 'jp' | 'cn' | 'other' | 'unknown'

/** 筛选面板的选择,跨会话记住(筛选按钮的角标 + 清除筛选保证可发现/可撤销) */
export interface FilterPrefs {
  cont: Continuity[]
  reg: RegionClass[]
  repMin: number
  src: string | null
  tag: string | null
}

const CONT_ALL: Continuity[] = ['new', 'carry', 'long']
const REG_ALL: RegionClass[] = ['jp', 'cn', 'other', 'unknown']

export const DEFAULT_FILTERS: FilterPrefs = { cont: CONT_ALL, reg: REG_ALL, repMin: 0, src: null, tag: null }

/** 载入校验:枚举值过滤 + 空选集回落全选,坏数据只会回到默认而不是白屏 */
function sanitizeFilters(f: unknown): FilterPrefs {
  const o = (f ?? {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, all: T[]): T[] => {
    const a = Array.isArray(v) ? (v.filter((x) => (all as string[]).includes(x)) as T[]) : []
    return a.length ? a : [...all]
  }
  return {
    cont: pick(o.cont, CONT_ALL),
    reg: pick(o.reg, REG_ALL),
    repMin: typeof o.repMin === 'number' && o.repMin > 0 ? o.repMin : 0,
    src: typeof o.src === 'string' ? o.src : null,
    tag: typeof o.tag === 'string' ? o.tag : null,
  }
}

export interface Persisted {
  settings: Settings
  tracking: Tracking
  overrides: Record<number, AirFix> // 本机放送校正,优先于 enhance.json
  filters: FilterPrefs
}

/** 首访默认主题:系统明确偏好浅色 → 白色,否则 Bangumi 深色;用户选过就存 localStorage 恒久生效 */
const defaultTheme = (): Settings['theme'] =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'bgm-dark'

export const DEFAULT_SETTINGS: Settings = {
  theme: defaultTheme(),
  lang: detectLang(),
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
        filters: sanitizeFilters(p.filters),
      }
    }
  } catch {}
  return {
    settings: { ...DEFAULT_SETTINGS },
    tracking: { status: {}, watched: {}, rates: {}, memos: {} },
    overrides: {},
    filters: { ...DEFAULT_FILTERS },
  }
}

export function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}
