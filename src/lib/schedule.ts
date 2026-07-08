/**
 * 放送日程推导:线性周更 + AirFix 例外规则(整批先行 / 锚点回归)。
 * 所有视图与进度统计都从这里取"第 N 集什么时候播"。
 */

import type { Show } from '../types'
import { DAY_MS } from './time'

/** 一次放出:ep..epEnd 集于 t 时刻(整批先行时 epEnd > ep) */
export interface Occurrence {
  ep: number
  epEnd: number
  t: number
}

const periodMs = (s: Show) => s.periodDays * DAY_MS

const parseAt = (iso: string | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** 总集数(校正优先) */
export function totalEps(s: Show): number | undefined {
  return s.airFix?.eps ?? s.epsTotal
}

/** 整批先行的放出时刻(有 advanceEps 时) */
function advanceAt(s: Show): number | null {
  if (!s.airFix?.advanceEps) return null
  return parseAt(s.airFix.advanceAt) ?? s.begin ?? null
}

/** 第 ep 集的播出时刻;无法推导返回 null */
export function epTime(s: Show, ep: number): number | null {
  const f = s.airFix
  if (f?.advanceEps && ep <= f.advanceEps) return advanceAt(s)
  if (f?.anchorEp != null && ep >= f.anchorEp) {
    const at = parseAt(f.anchorAt)
    if (at !== null) return at + (ep - f.anchorEp) * periodMs(s)
  }
  if (s.begin) return s.begin + (ep - 1) * periodMs(s)
  return null
}

/**
 * 已放送集数:各规则推得的最大值,封顶总集数。
 * 无任何可用规则(无 begin 且无校正,或长篇周数折算不可靠)返回 undefined。
 */
export function airedCount(s: Show, now: number): number | undefined {
  const total = totalEps(s)
  const f = s.airFix
  const vals: number[] = []

  if (s.begin) {
    const longRunUnreliable = !total && now - s.begin > 400 * DAY_MS
    if (!longRunUnreliable) {
      vals.push(now < s.begin ? 0 : Math.floor((now - s.begin) / periodMs(s)) + 1)
    }
  }
  if (f?.advanceEps) {
    const at = advanceAt(s)
    if (at !== null) vals.push(now >= at ? f.advanceEps : 0)
  }
  if (f?.anchorEp != null) {
    const at = parseAt(f.anchorAt)
    if (at !== null && now >= at) vals.push(f.anchorEp + Math.floor((now - at) / periodMs(s)))
  }

  if (vals.length === 0) return undefined
  const n = Math.max(...vals)
  return total ? Math.min(n, total) : Math.max(n, 0)
}

/** 下一次放出(含整批);完结或无法推导返回 null */
export function nextEpisode(s: Show, now: number): Occurrence | null {
  const aired = airedCount(s, now)
  if (aired === undefined) return null
  const total = totalEps(s)
  const ep = aired + 1
  if (total && ep > total) return null
  const t = epTime(s, ep)
  if (t === null) return null
  // bangumi-data 标了完结且无人工校正 → 不再排未来集
  if (s.end && t > s.end && !s.airFix) return null
  let epEnd = ep
  while ((!total || epEnd + 1 <= total) && epTime(s, epEnd + 1) === t) epEnd++
  return { ep, epEnd, t }
}

/** [lo, hi] 时间窗内的所有放出,按时刻排序;整批合并为单条 */
export function occurrencesBetween(s: Show, lo: number, hi: number): Occurrence[] {
  const total = totalEps(s)
  const f = s.airFix
  const pm = periodMs(s)
  const out: Occurrence[] = []

  // 整批先行段
  if (f?.advanceEps) {
    const at = advanceAt(s)
    if (at !== null && at >= lo && at <= hi) out.push({ ep: 1, epEnd: f.advanceEps, t: at })
  }

  // 线性段(避开先行/锚点覆盖的集数区间)
  if (s.begin) {
    const linLo = (f?.advanceEps ?? 0) + 1
    const linHi = f?.anchorEp != null && parseAt(f.anchorAt) !== null ? f.anchorEp - 1 : Infinity
    const e0 = Math.max(linLo, Math.ceil((lo - s.begin) / pm + 1))
    const e1 = Math.min(linHi, Math.floor((hi - s.begin) / pm) + 1, total ?? Infinity)
    for (let ep = e0; ep <= e1; ep++) {
      const t = s.begin + (ep - 1) * pm
      if (s.end && t > s.end && !f) continue
      out.push({ ep, epEnd: ep, t })
    }
  }

  // 锚点周更段
  if (f?.anchorEp != null) {
    const at = parseAt(f.anchorAt)
    if (at !== null) {
      const e0 = Math.max(f.anchorEp, f.anchorEp + Math.ceil((lo - at) / pm))
      const e1 = Math.min(f.anchorEp + Math.floor((hi - at) / pm), total ?? Infinity)
      for (let ep = e0; ep <= e1; ep++) out.push({ ep, epEnd: ep, t: at + (ep - f.anchorEp) * pm })
    }
  }

  out.sort((a, b) => a.t - b.t || a.ep - b.ep)
  return out
}

/** 已完结:最后一集已播(校正感知),或 bangumi-data 标了 end 且无人工校正 */
export function hasEnded(s: Show, now: number): boolean {
  const total = totalEps(s)
  if (total) {
    const t = epTime(s, total)
    if (t !== null) return t < now
  }
  return !!(s.end && s.end < now && !s.airFix)
}

/** 集数标签:"03" 或 "01-06" */
export function epLabel(o: Occurrence): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return o.epEnd > o.ep ? `${p(o.ep)}-${p(o.epEnd)}` : p(o.ep)
}
