/**
 * 好友重合度:拉好友的公开收藏(全量,只留 id/状态/评分),算共同看过数与评分相关系数。
 */

import { bgmFetch, readCache, writeCache } from './api'
import type { LibItem } from './bgm'
import { pearson } from './stats'

export interface FriendLib {
  items: { id: number; type: number; rate: number }[]
  fetchedAt: number
}

export async function fetchFriendLibrary(username: string): Promise<FriendLib> {
  const key = `friendlib:${username}`
  const hit = readCache<FriendLib>(key, 86400_000)
  if (hit) return hit
  const items: FriendLib['items'] = []
  for (const type of [2, 3, 5, 4, 1]) {
    let offset = 0
    for (let p = 0; p < 20; p++) {
      const r = await bgmFetch(`/v0/users/${encodeURIComponent(username)}/collections?subject_type=2&type=${type}&limit=50&offset=${offset}`)
      if (!r.ok) {
        if (r.status === 404 || r.status === 403) break
        throw new Error(`HTTP ${r.status}`)
      }
      const d = await r.json()
      const rows: any[] = d.data ?? []
      for (const c of rows) items.push({ id: c.subject_id, type, rate: c.rate ?? 0 })
      offset += 50
      if (!rows.length || offset >= (d.total ?? 0)) break
    }
  }
  const lib = { items, fetchedAt: Date.now() }
  writeCache(key, lib)
  return lib
}

export interface Overlap {
  username: string
  common: number // 双方都收藏过的
  commonDone: number // 双方都看过的
  ratedBoth: number
  corr: number | null // 评分相关系数(≥5 部共同打分才算)
  theirs: number
}

export function overlap(mine: LibItem[], theirs: FriendLib, username: string): Overlap {
  const my = new Map(mine.map((i) => [i.id, i]))
  let common = 0
  let commonDone = 0
  const xs: number[] = []
  const ys: number[] = []
  for (const t of theirs.items) {
    const m = my.get(t.id)
    if (!m) continue
    common++
    if (m.type === 2 && t.type === 2) commonDone++
    if (m.rate > 0 && t.rate > 0) {
      xs.push(m.rate)
      ys.push(t.rate)
    }
  }
  return { username, common, commonDone, ratedBoth: xs.length, corr: xs.length >= 5 ? pearson(xs, ys) : null, theirs: theirs.items.length }
}
