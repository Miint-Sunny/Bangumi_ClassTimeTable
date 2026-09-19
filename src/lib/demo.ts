/**
 * 统计页演示数据:不粘令牌也能看到完整效果。
 * 不编假番 —— 从站内归档包按固定随机种子抽样真实作品(真 id / 标签 / 首播日),
 * 再合成最近一个月的时间胶囊动作。每次生成结果一致。
 */

import type { CapsuleEvent, LibItem } from './bgm'
import { fetchSeasonList, fetchSeasonPack } from './seasons'
import { seasonKeyOf } from './stats'
import { currentSeason } from './time'

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoData {
  items: LibItem[]
  events: CapsuleEvent[]
}

export async function buildDemo(now = Date.now()): Promise<DemoData> {
  const list = await fetchSeasonList() // 新 → 旧
  const cur = currentSeason(now).yyyymm
  // 最近 10 季密集采样,更早的每隔 6 季抽一季,让"追番年数"和年度足迹有跨度
  const pick = [cur, ...list.slice(0, 10), ...list.filter((_, i) => i >= 10 && i % 6 === 0).slice(0, 6)].filter((k, i, arr) => arr.indexOf(k) === i)
  const r = mulberry32(20260919)
  const items: LibItem[] = []
  for (const [si, key] of pick.entries()) {
    let shows
    try {
      shows = await fetchSeasonPack(key)
    } catch {
      continue // 当季没有归档包时跳过(当季由下面的在看/想看事件体现)
    }
    const pool = shows
      .filter((s) => s.epsTotal && s.epsTotal <= 26 && s.nameCn)
      .sort((a, b) => (b.ratingTotal ?? 0) - (a.ratingTotal ?? 0))
      .slice(0, 40)
    const n = Math.min(pool.length, si === 0 ? 14 : si < 4 ? 12 : si < 10 ? 9 : 5)
    const chosen = new Set<number>()
    while (chosen.size < n) chosen.add(Math.floor(r() ** 1.6 * pool.length)) // 偏向热门
    for (const i of chosen) {
      const s = pool[i]
      const x = r()
      let type: LibItem['type']
      if (key === cur) type = x < 0.55 ? 3 : x < 0.7 ? 1 : x < 0.9 ? 2 : 5
      else type = x < 0.78 ? 2 : x < 0.86 ? 5 : x < 0.92 ? 4 : x < 0.97 ? 1 : 3
      const eps = s.epsTotal ?? 12
      const rate =
        type === 2 || type === 5
          ? Math.max(1, Math.min(10, Math.round(7.2 + (r() + r() - 1) * 3 + (type === 5 ? -2.5 : 0))))
          : r() < 0.3
            ? Math.round(6 + r() * 3)
            : 0
      const ep = type === 2 ? eps : type === 3 ? Math.max(1, Math.floor(r() * eps * 0.8)) : type === 5 ? Math.max(1, Math.floor(r() * 4)) : 0
      items.push({
        id: s.id,
        type,
        rate,
        ep,
        at: '',
        name: s.nameJp,
        nameCn: s.nameCn,
        date: s.begin ? new Date(s.begin).toISOString().slice(0, 10) : `${key.slice(0, 4)}-${key.slice(4)}-01`,
        eps,
        score: s.score ?? 0,
        tags: s.tags ?? [],
      })
    }
  }

  // 时间胶囊:最近 30 天,来自当季条目
  const events: CapsuleEvent[] = []
  let id = 900000
  let tms = now - 2 * 3600_000
  const step = () => (tms -= (0.3 + r() * 1.4) * 86400_000)
  const recent = items.filter((it) => seasonKeyOf(it.date) === cur)
  for (const it of recent) {
    const subject = { id: it.id, name: it.name, nameCn: it.nameCn }
    if (it.type === 3) {
      for (let k = it.ep; k >= Math.max(1, it.ep - 2); k--) {
        events.push({ id: id--, at: tms, kind: 'progress', subject, ep: k, epsTotal: it.eps })
        step()
      }
      events.push({ id: id--, at: tms, kind: 'watching', subject, rate: it.rate || undefined })
      step()
    } else if (it.type === 2) {
      events.push({ id: id--, at: tms, kind: 'done', subject, rate: it.rate || undefined })
      step()
    } else if (it.type === 1) {
      events.push({ id: id--, at: tms, kind: 'wish', subject })
      step()
    } else if (it.type === 5) {
      events.push({ id: id--, at: tms, kind: 'drop', subject, rate: it.rate || undefined })
      step()
    }
  }
  events.sort((a, b) => b.at - a.at)
  return { items, events: events.slice(0, 30) }
}
