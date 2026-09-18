/**
 * 追番统计:把 bgm 全量收藏(LibItem[])折成统计页需要的聚合。
 * 纯函数,不碰网络与存储;本机无账号时由调用方用当季 tracking 拼一份 LibItem[] 喂进来。
 */

import type { LibItem } from './bgm'

/** 展示顺序固定:看过 在看 想看 搁置 抛弃(图例与配色按此顺序,永不轮换) */
export const TYPE_ORDER = [2, 3, 1, 4, 5] as const
export type CollType = (typeof TYPE_ORDER)[number]
export const TYPE_LABEL: Record<CollType, string> = { 2: '看过', 3: '在看', 1: '想看', 4: '搁置', 5: '抛弃' }
export const TYPE_VAR: Record<CollType, string> = {
  2: 'var(--st-done)',
  3: 'var(--st-watching)',
  1: 'var(--st-wish)',
  4: 'var(--st-hold)',
  5: 'var(--st-drop)',
}

export interface Bucket {
  key: string // YYYYMM(季)或 YYYY(年)
  label: string
  counts: Record<CollType, number>
  total: number
}
export interface YearStat {
  y: number
  done: number
  mean: number | null
  best: LibItem | null
}
export interface Stats {
  total: number
  counts: Record<CollType, number>
  epsWatched: number
  firstYear: number | null
  rated: number
  myMean: number | null
  myStd: number | null // 打分标准差(总体)
  siteMean: number | null
  hist: number[] // 下标 1..10
  timeline: Bucket[]
  timelineUnit: 'season' | 'year'
  bySeason: Record<string, Bucket> // YYYYMM → 桶(换季对比用,不受时间轴粒度影响)
  tags: { name: string; n: number }[]
  years: YearStat[]
  finishRate: number | null
  best: LibItem[]
}

const zero = (): Record<CollType, number> => ({ 2: 0, 3: 0, 1: 0, 4: 0, 5: 0 })

/** 首播日 → 季度键(YYYYMM,季首月) */
export function seasonKeyOf(date: string | null): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '')
  if (!m) return null
  const q = Math.floor((+m[2] - 1) / 3) * 3 + 1
  return `${m[1]}${String(q).padStart(2, '0')}`
}

export function prevSeasonKey(key: string): string {
  const y = +key.slice(0, 4)
  const m = +key.slice(4)
  return m === 1 ? `${y - 1}10` : `${y}${String(m - 3).padStart(2, '0')}`
}

export function computeStats(items: LibItem[]): Stats {
  const counts = zero()
  let epsWatched = 0
  let firstYear: number | null = null
  const hist = Array(11).fill(0) as number[]
  let rateSum = 0
  let rated = 0
  let scoreSum = 0
  let scored = 0
  const bySeason: Record<string, Bucket> = {}
  const byYear: Record<number, Bucket> = {}
  const tagN = new Map<string, number>()
  const yearAcc: Record<number, { done: number; rsum: number; rn: number; best: LibItem | null }> = {}

  for (const it of items) {
    counts[it.type] += 1
    epsWatched += it.type === 2 && it.eps > 0 ? it.eps : it.ep
    const y = it.date ? +it.date.slice(0, 4) : NaN
    if (Number.isFinite(y) && y > 1900) {
      if (firstYear === null || y < firstYear) firstYear = y
      const sk = seasonKeyOf(it.date)!
      const sb = (bySeason[sk] ??= { key: sk, label: sk, counts: zero(), total: 0 })
      sb.counts[it.type] += 1
      sb.total += 1
      const yb = (byYear[y] ??= { key: String(y), label: String(y), counts: zero(), total: 0 })
      yb.counts[it.type] += 1
      yb.total += 1
      const ya = (yearAcc[y] ??= { done: 0, rsum: 0, rn: 0, best: null })
      if (it.type === 2) ya.done += 1
      if (it.rate > 0) {
        ya.rsum += it.rate
        ya.rn += 1
        if (!ya.best || it.rate > ya.best.rate || (it.rate === ya.best.rate && it.score > ya.best.score)) ya.best = it
      }
    }
    if (it.rate > 0) {
      hist[Math.min(10, Math.max(1, Math.round(it.rate)))] += 1
      rateSum += it.rate
      rated += 1
      if (it.score > 0) {
        scoreSum += it.score
        scored += 1
      }
    }
    if (it.type === 2 || it.type === 3) for (const tg of it.tags) tagN.set(tg, (tagN.get(tg) ?? 0) + 1)
  }

  // 时间轴:季度桶补齐空档;跨度超过 40 季就按年,免得柱子细成头发丝
  const seasonKeys = Object.keys(bySeason).sort()
  let timeline: Bucket[] = []
  let timelineUnit: 'season' | 'year' = 'season'
  if (seasonKeys.length) {
    const first = seasonKeys[0]
    const last = seasonKeys[seasonKeys.length - 1]
    const span = (+last.slice(0, 4) - +first.slice(0, 4)) * 4 + (+last.slice(4) - +first.slice(4)) / 3 + 1
    if (span <= 40) {
      let k = first
      while (k <= last) {
        timeline.push(bySeason[k] ?? { key: k, label: k, counts: zero(), total: 0 })
        const y = +k.slice(0, 4)
        const m = +k.slice(4)
        k = m === 10 ? `${y + 1}01` : `${y}${String(m + 3).padStart(2, '0')}`
      }
    } else {
      timelineUnit = 'year'
      const y0 = +first.slice(0, 4)
      const y1 = +last.slice(0, 4)
      for (let y = y0; y <= y1; y++) timeline.push(byYear[y] ?? { key: String(y), label: String(y), counts: zero(), total: 0 })
    }
  }

  const years: YearStat[] = Object.entries(yearAcc)
    .map(([y, a]) => ({ y: +y, done: a.done, mean: a.rn ? a.rsum / a.rn : null, best: a.best }))
    .filter((r) => r.done > 0 || r.mean !== null)
    .sort((a, b) => b.y - a.y)

  const tags = [...tagN.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, 14)

  const best = items
    .filter((it) => it.rate >= 9)
    .sort((a, b) => b.rate - a.rate || b.score - a.score || (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 12)

  const myMean = rated ? rateSum / rated : null
  let sq = 0
  if (myMean !== null) for (const it of items) if (it.rate > 0) sq += (it.rate - myMean) ** 2
  const fin = counts[2] + counts[5]
  return {
    total: items.length,
    counts,
    epsWatched,
    firstYear,
    rated,
    myMean,
    myStd: rated ? Math.sqrt(sq / rated) : null,
    siteMean: scored ? scoreSum / scored : null,
    hist,
    timeline,
    timelineUnit,
    bySeason,
    tags,
    years,
    finishRate: fin ? counts[2] / fin : null,
    best,
  }
}
