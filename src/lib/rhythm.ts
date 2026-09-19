/**
 * 观看节奏:由时间线事件折成 GitHub 贡献图式的日历、周几×小时热力、深夜党指数、
 * 一集平均耗时、连续追番周数、最长追番。纯函数。
 */

import type { CapsuleEvent } from './bgm'

const DAY = 86400_000
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export interface Rhythm {
  days: { date: string; n: number; wd: number }[] // 最近 53 周,周一对齐,到今天为止
  weekHour: number[][] // 7(周一→周日)× 24
  nightRatio: number | null // 0–5 点动作占比
  medianGapH: number | null // 同一部相邻进度事件的中位间隔(小时)
  streakWeeks: number // 截至本周连续有记录的周数
  longest: { id: number; name: string; days: number } | null
  busiest: { date: string; n: number } | null
  total: number
  activeDays: number
}

export function computeRhythm(events: CapsuleEvent[], now: number): Rhythm {
  const counts = new Map<string, number>()
  const weekHour = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  let night = 0
  const perSubject = new Map<number, number[]>()
  for (const e of events) {
    const d = new Date(e.at)
    const k = ymd(d)
    counts.set(k, (counts.get(k) ?? 0) + 1)
    weekHour[(d.getDay() + 6) % 7][d.getHours()] += 1
    if (d.getHours() < 5) night += 1
    if (e.kind === 'progress' || e.kind === 'ep') {
      const a = perSubject.get(e.subject.id) ?? []
      a.push(e.at)
      perSubject.set(e.subject.id, a)
    }
  }

  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end.getTime() - 370 * DAY)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // 回退到周一
  const days: Rhythm['days'] = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const d = new Date(t)
    const k = ymd(d)
    days.push({ date: k, n: counts.get(k) ?? 0, wd: (d.getDay() + 6) % 7 })
  }

  const gaps: number[] = []
  for (const arr of perSubject.values()) {
    arr.sort((a, b) => a - b)
    for (let i = 1; i < arr.length; i++) {
      const g = arr[i] - arr[i - 1]
      if (g > 10 * 60_000 && g < 60 * DAY) gaps.push(g) // 十分钟内的连点与两个月以上的断档不算
    }
  }
  gaps.sort((a, b) => a - b)

  const weekOf = (t: number) => Math.floor((t - start.getTime()) / (7 * DAY))
  const weeks = new Set(events.filter((e) => e.at >= start.getTime()).map((e) => weekOf(e.at)))
  let streak = 0
  for (let w = weekOf(end.getTime()); w >= 0 && weeks.has(w); w--) streak++

  let longest: Rhythm['longest'] = null
  for (const [id, arr] of perSubject) {
    if (arr.length < 2) continue
    const span = (arr[arr.length - 1] - arr[0]) / DAY
    if (!longest || span > longest.days) {
      const ev = events.find((e) => e.subject.id === id)!
      longest = { id, name: ev.subject.nameCn || ev.subject.name, days: Math.round(span) }
    }
  }
  let busiest: Rhythm['busiest'] = null
  for (const d of days) if (d.n > 0 && (!busiest || d.n > busiest.n)) busiest = { date: d.date, n: d.n }

  return {
    days,
    weekHour,
    nightRatio: events.length ? night / events.length : null,
    medianGapH: gaps.length ? gaps[Math.floor(gaps.length / 2)] / 3600_000 : null,
    streakWeeks: streak,
    longest,
    busiest,
    total: events.length,
    activeDays: counts.size,
  }
}
