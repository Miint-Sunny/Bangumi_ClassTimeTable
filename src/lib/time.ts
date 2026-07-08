import type { AirSlot, Settings, Show } from '../types'

export const JST = 'Asia/Tokyo'
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export const displayTz = (s: Settings) => (s.tzMode === 'jst' ? JST : LOCAL_TZ)

export const WEEKDAY_CN = ['', '一', '二', '三', '四', '五', '六', '日']
export const DAY_MS = 86400_000

export interface ZParts {
  y: number
  mo: number
  d: number
  hh: number
  mm: number
  wd: number // ISO 1..7
}

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const fmtCache = new Map<string, Intl.DateTimeFormat>()

function zoneFmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
    fmtCache.set(tz, f)
  }
  return f
}

export function partsInZone(t: number, tz: string): ZParts {
  const parts: Record<string, string> = {}
  for (const p of zoneFmt(tz).formatToParts(new Date(t))) parts[p.type] = p.value
  return {
    y: +parts.year,
    mo: +parts.month,
    d: +parts.day,
    hh: +parts.hour,
    mm: +parts.minute,
    wd: WD[parts.weekday],
  }
}

export const pad = (n: number) => String(n).padStart(2, '0')

/** 计算某番在展示时区下的课表格位置(锚点校正优先于 begin) */
export function slotFor(show: Show, settings: Settings): AirSlot {
  const tz = displayTz(settings)
  const anchorT = show.airFix?.anchorAt ? Date.parse(show.airFix.anchorAt) : NaN
  const slotBase = Number.isNaN(anchorT) ? show.begin : anchorT
  if (slotBase && show.periodDays === 7) {
    const p = partsInZone(slotBase, tz)
    let day = p.wd
    let minutes = p.hh * 60 + p.mm
    if (settings.lateNight && p.hh < 6) {
      minutes += 1440
      day = day === 1 ? 7 : day - 1
    }
    return {
      show,
      day,
      minutes,
      label: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
      known: true,
    }
  }
  // 无精确时间:退回 calendar API 的 JST 周几(本地模式下可能偏一天,但无从校正)
  return { show, day: show.airWeekdayJst ?? 0, minutes: -1, label: '未定', known: false }
}

/** 展示时区下本周起点(周起始日 0 点)的时刻 */
export function startOfWeekInstant(now: number, tz: string, weekStart: 1 | 7): number {
  const p = partsInZone(now, tz)
  const diff = weekStart === 1 ? p.wd - 1 : p.wd % 7
  const d = new Date(now)
  const midToday = now - (p.hh * 60 + p.mm) * 60_000 - d.getSeconds() * 1000 - d.getMilliseconds()
  return midToday - diff * DAY_MS
}

/** "3 小时后" / "昨天" 之类的相对时间 */
export function relTime(t: number, now: number): string {
  const diff = t - now
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? '后' : '前'
  if (abs < 60_000) return diff >= 0 ? '马上' : '刚刚'
  if (abs < 3600_000) return `${Math.round(abs / 60_000)} 分钟${suffix}`
  if (abs < DAY_MS) return `${Math.round(abs / 3600_000)} 小时${suffix}`
  return `${Math.round(abs / DAY_MS)} 天${suffix}`
}

/** 当前季度,如 { yyyymm: '202607', label: '2026年7月' } */
export function currentSeason(now: number) {
  const p = partsInZone(now, JST)
  const startMonth = Math.floor((p.mo - 1) / 3) * 3 + 1
  return { yyyymm: `${p.y}${pad(startMonth)}`, label: `${p.y}年${startMonth}月` }
}

/** 当季季度起点(JST 当季首月 1 日 0 点)的时刻 */
export function seasonStartInstant(now: number): number {
  const p = partsInZone(now, JST)
  const startMonth = Math.floor((p.mo - 1) / 3) * 3 + 1
  return Date.UTC(p.y, startMonth - 1, 1) - 9 * 3600_000
}

/**
 * 上季续播:开播早于所选季度起点 20 天以上(留出提前首播的容差)。
 * 无精确开播时间的按新番处理。
 */
export function isCarryOver(show: Show, seasonStart: number): boolean {
  if (!show.begin) return false
  return show.begin < seasonStart - 20 * DAY_MS
}

export function dayOrder(weekStart: 1 | 7): number[] {
  return weekStart === 1 ? [1, 2, 3, 4, 5, 6, 7] : [7, 1, 2, 3, 4, 5, 6]
}
