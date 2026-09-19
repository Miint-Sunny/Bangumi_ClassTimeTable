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
export interface Deviation {
  n: number
  picky: number | null // 我的分 − 站均分 的平均
  hist: number[] // 9 桶:≤-4 … 0 … ≥+4
  corr: number | null
  hidden: LibItem[] // 私藏神作:我 ≥8 且高出站均 ≥1.5
  contrarian: LibItem[] // 众人皆醉:我 ≤5 且低于站均 ≥2
}
export interface Drops {
  n: number
  avgEp: number | null
  hist: number[] // 下标 1..13,13 = 13 话及以后
  byTag: { name: string; rate: number; n: number }[]
  byLength: { label: string; rate: number | null; n: number }[]
}
export interface Catchup {
  n: number
  inSeasonRate: number | null // 在开播 120 天内看完的比例
  avgLagDays: number | null // 开播到看完的平均天数
  debt: { y: number; total: number; backlog: number }[] // 每年看完的里有多少是往年的番
}
export interface Obscure {
  medianTotal: number | null
  list: LibItem[]
}
export interface Taste {
  tags: string[] // 前 5 标签,最后一列是「其他」
  rows: { y: number; counts: number[]; total: number }[]
}

export interface Stats {
  deviation: Deviation
  drops: Drops
  catchup: Catchup
  obscure: Obscure
  taste: Taste
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

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

const DAY_MS = 86400_000
const yearOf = (d: string | null) => (d && /^\d{4}/.test(d) ? +d.slice(0, 4) : NaN)

function computeExtras(items: LibItem[]): Pick<Stats, 'deviation' | 'drops' | 'catchup' | 'obscure' | 'taste'> {
  // 口味逆风盘
  const rated = items.filter((it) => it.rate > 0 && it.score > 0)
  const diffs = rated.map((it) => it.rate - it.score)
  const dhist = Array(9).fill(0) as number[]
  for (const d of diffs) dhist[Math.max(-4, Math.min(4, Math.round(d))) + 4] += 1
  const deviation: Deviation = {
    n: rated.length,
    picky: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
    hist: dhist,
    corr: pearson(rated.map((i) => i.rate), rated.map((i) => i.score)),
    hidden: rated.filter((it) => it.rate >= 8 && it.rate - it.score >= 1.5).sort((a, b) => b.rate - b.score - (a.rate - a.score)).slice(0, 8),
    contrarian: rated.filter((it) => it.rate <= 5 && it.score - it.rate >= 2).sort((a, b) => a.rate - a.score - (b.rate - b.score)).slice(0, 8),
  }

  // 弃番解剖
  const dropped = items.filter((it) => it.type === 5)
  const dhist2 = Array(14).fill(0) as number[]
  const eps = dropped.filter((it) => it.ep > 0).map((it) => it.ep)
  for (const e of eps) dhist2[Math.min(13, e)] += 1
  const finished = items.filter((it) => it.type === 2 || it.type === 5)
  const tagAcc = new Map<string, { n: number; drop: number }>()
  for (const it of finished)
    for (const tg of it.tags) {
      const r = tagAcc.get(tg) ?? { n: 0, drop: 0 }
      r.n += 1
      if (it.type === 5) r.drop += 1
      tagAcc.set(tg, r)
    }
  const byTag = [...tagAcc.entries()]
    .filter(([, r]) => r.n >= 4)
    .map(([name, r]) => ({ name, rate: r.drop / r.n, n: r.n }))
    .sort((a, b) => b.rate - a.rate || b.n - a.n)
    .slice(0, 8)
  const lenBucket = (n: number) => (n <= 13 ? 0 : n <= 26 ? 1 : 2)
  const lens = [
    { label: '≤13', done: 0, drop: 0 },
    { label: '14–26', done: 0, drop: 0 },
    { label: '>26', done: 0, drop: 0 },
  ]
  for (const it of finished) if (it.eps > 0) lens[lenBucket(it.eps)][it.type === 2 ? 'done' : 'drop'] += 1
  const drops: Drops = {
    n: dropped.length,
    avgEp: eps.length ? eps.reduce((a, b) => a + b, 0) / eps.length : null,
    hist: dhist2,
    byTag,
    byLength: lens.map((l) => ({ label: l.label, rate: l.done + l.drop ? l.done / (l.done + l.drop) : null, n: l.done + l.drop })),
  }

  // 追新 vs 补番(需要收藏更新日 at)
  const doneAt = items.filter((it) => it.type === 2 && it.at && it.date && /^\d{4}-\d{2}-\d{2}/.test(it.date))
  const lags = doneAt.map((it) => (Date.parse(it.at) - Date.parse(it.date!.slice(0, 10))) / DAY_MS).filter((d) => Number.isFinite(d))
  const debtMap = new Map<number, { total: number; backlog: number }>()
  for (const it of doneAt) {
    const y = +it.at.slice(0, 4)
    const r = debtMap.get(y) ?? { total: 0, backlog: 0 }
    r.total += 1
    if (yearOf(it.date) < y) r.backlog += 1
    debtMap.set(y, r)
  }
  const catchup: Catchup = {
    n: lags.length,
    inSeasonRate: lags.length ? lags.filter((d) => d >= -30 && d <= 120).length / lags.length : null,
    avgLagDays: lags.length ? lags.filter((d) => d > 0).reduce((a, b) => a + b, 0) / Math.max(1, lags.filter((d) => d > 0).length) : null,
    debt: [...debtMap.entries()]
      .map(([y, r]) => ({ y, ...r }))
      .sort((a, b) => a.y - b.y)
      .slice(-10),
  }

  // 冷门指数
  const watched = items.filter((it) => (it.type === 2 || it.type === 3) && it.total > 0).sort((a, b) => a.total - b.total)
  const obscure: Obscure = {
    medianTotal: watched.length ? watched[Math.floor(watched.length / 2)].total : null,
    list: watched.slice(0, 6),
  }

  // 口味演变:前 5 标签 + 其他,按首播年
  const tagTot = new Map<string, number>()
  const wl = items.filter((it) => (it.type === 2 || it.type === 3) && Number.isFinite(yearOf(it.date)))
  for (const it of wl) for (const tg of it.tags) tagTot.set(tg, (tagTot.get(tg) ?? 0) + 1)
  const top = [...tagTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n)
  const rowsMap = new Map<number, number[]>()
  for (const it of wl) {
    const y = yearOf(it.date)
    const row = rowsMap.get(y) ?? (Array(top.length + 1).fill(0) as number[])
    for (const tg of it.tags) {
      const i = top.indexOf(tg)
      row[i >= 0 ? i : top.length] += 1
    }
    rowsMap.set(y, row)
  }
  const taste: Taste = {
    tags: top,
    rows: [...rowsMap.entries()]
      .map(([y, counts]) => ({ y, counts, total: counts.reduce((a, b) => a + b, 0) }))
      .filter((r) => r.total >= 3)
      .sort((a, b) => a.y - b.y)
      .slice(-12),
  }
  return { deviation, drops, catchup, obscure, taste }
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
    ...computeExtras(items),
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
