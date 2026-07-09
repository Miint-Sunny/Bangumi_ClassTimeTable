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

/**
 * 线性推导的相位对齐:begin 定集数,broadcast 锚点定"周几几点"。
 * 长篇换档后 bangumi-data 会更新 broadcast(柯南 begin=1996 年周一档,
 * 锚点=2009 年周六 18:00),把 begin 相位的推导时刻平移到锚点相位的最近时刻。
 */
function alignPhase(t: number, s: Show): number {
  const a = s.broadcastAt
  if (a === undefined) return t
  const pm = periodMs(s)
  const d = (((a - t) % pm) + pm) % pm // 0..pm
  return d <= pm / 2 ? t + d : t + d - pm
}

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
  const exact = epDateOf(s, ep)
  if (exact !== null) return exact
  const f = s.airFix
  if (f?.advanceEps && ep <= f.advanceEps) return advanceAt(s)
  if (f?.anchorEp != null && ep >= f.anchorEp) {
    const at = parseAt(f.anchorAt)
    if (at !== null) return at + (ep - f.anchorEp) * periodMs(s)
  }
  if (s.begin) return alignPhase(s.begin + (ep - 1) * periodMs(s), s)
  return null
}

/** 指定集的精确时刻覆盖(bgm.wiki 同步/人工校正),最高优先 */
function epDateOf(s: Show, ep: number): number | null {
  const d = s.airFix?.epDates?.[String(ep)]
  return d ? parseAt(d) : null
}

function epDateKeys(s: Show): number[] {
  const m = s.airFix?.epDates
  return m ? Object.keys(m).map(Number).filter((n) => Number.isFinite(n) && n > 0) : []
}

/**
 * 已放送集数 = 满足 epTime <= now 的最大集号,封顶总集数。
 * 无任何可用规则(无 begin 且无校正,或长篇周数折算不可靠)返回 undefined。
 */
export function airedCount(s: Show, now: number): number | undefined {
  const total = totalEps(s)
  const f = s.airFix
  const keys = epDateKeys(s)

  const hasRule = !!(s.begin || f?.advanceEps || (f?.anchorEp != null && f.anchorAt) || keys.length)
  if (!hasRule) return undefined
  // 开播 400 天以上且不知总集数的长篇,周数折算不可靠(除非有校正兜底)
  if (s.begin && !total && now - s.begin > 400 * DAY_MS && !f) return undefined

  // 扫描上限:总集数,否则取线性推导与各校正键的最大值加余量
  let cap = total ?? 0
  if (!cap) {
    const linear = s.begin && now >= s.begin ? Math.floor((now - s.begin) / periodMs(s)) + 1 : 0
    cap = Math.max(linear, f?.advanceEps ?? 0, f?.anchorEp ?? 0, keys.length ? Math.max(...keys) : 0) + 2
  }
  cap = Math.min(Math.max(cap, 1), 500)

  let aired = 0
  for (let ep = 1; ep <= cap; ep++) {
    const t = epTime(s, ep)
    if (t !== null && t <= now) aired = ep
  }
  return total ? Math.min(aired, total) : aired
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

/** [lo, hi] 时间窗内的所有放出,按时刻排序;同刻连续集合并为单条 */
export function occurrencesBetween(s: Show, lo: number, hi: number): Occurrence[] {
  const total = totalEps(s)
  const f = s.airFix
  const pm = periodMs(s)
  const raw: { ep: number; t: number }[] = []
  const covered = new Set(epDateKeys(s)) // epDates 覆盖的集不再由其他规则生成

  // 精确时刻段(最高优先)
  if (f?.epDates) {
    for (const ep of covered) {
      if (total && ep > total) continue
      const t = epDateOf(s, ep)
      if (t !== null && t >= lo && t <= hi) raw.push({ ep, t })
    }
  }

  // 整批先行段
  if (f?.advanceEps) {
    const at = advanceAt(s)
    if (at !== null && at >= lo && at <= hi) {
      for (let ep = 1; ep <= f.advanceEps; ep++) {
        if (!covered.has(ep)) raw.push({ ep, t: at })
      }
    }
  }

  // 线性段(避开先行/锚点覆盖的集数区间)
  if (s.begin) {
    const linLo = (f?.advanceEps ?? 0) + 1
    const linHi = f?.anchorEp != null && parseAt(f.anchorAt) !== null ? f.anchorEp - 1 : Infinity
    // 前后各放宽一集:相位对齐(±半周期)可能把边缘集移入窗口,靠下面的窗口过滤收口
    const e0 = Math.max(linLo, Math.ceil((lo - s.begin) / pm + 1) - 1)
    const e1 = Math.min(linHi, Math.floor((hi - s.begin) / pm) + 2, total ?? Infinity)
    for (let ep = e0; ep <= e1; ep++) {
      if (covered.has(ep)) continue
      const t = alignPhase(s.begin + (ep - 1) * pm, s)
      if (s.end && t > s.end && !f) continue
      if (t < lo || t > hi) continue // 相位平移可能移出窗口
      raw.push({ ep, t })
    }
  }

  // 锚点周更段
  if (f?.anchorEp != null) {
    const at = parseAt(f.anchorAt)
    if (at !== null) {
      const e0 = Math.max(f.anchorEp, f.anchorEp + Math.ceil((lo - at) / pm))
      const e1 = Math.min(f.anchorEp + Math.floor((hi - at) / pm), total ?? Infinity)
      for (let ep = e0; ep <= e1; ep++) {
        if (!covered.has(ep)) raw.push({ ep, t: at + (ep - f.anchorEp) * pm })
      }
    }
  }

  // 同刻连续集合并为批(先行整批/一举多话)
  raw.sort((a, b) => a.t - b.t || a.ep - b.ep)
  const out: Occurrence[] = []
  for (const r of raw) {
    const last = out[out.length - 1]
    if (last && last.t === r.t && r.ep === last.epEnd + 1) last.epEnd = r.ep
    else out.push({ ep: r.ep, epEnd: r.ep, t: r.t })
  }
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
