/**
 * 制作公司 / 导演 / 声优榜:按需拉每部条目的 infobox(动画制作、导演)与角色表(主角/配角的声优),
 * 官方 API,每部两次请求,结果裁剪后缓存 30 天(再算零请求)。
 */

import { bgmFetch, readCache, writeCache } from './api'
import type { LibItem } from './bgm'

export interface StaffInfo {
  studio: string[]
  director: string[]
  actors: { id: number; name: string }[]
}

function pickInfo(infobox: any[], key: string): string[] {
  const row = infobox.find((x) => x?.key === key)
  if (!row) return []
  const v = row.value
  const list: string[] = typeof v === 'string' ? [v] : Array.isArray(v) ? v.map((o: any) => String(o?.v ?? '')) : []
  return list
    .flatMap((s) => s.split(/[、,，/／]/))
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function fetchStaff(id: number): Promise<StaffInfo> {
  const key = `staff:${id}`
  const hit = readCache<StaffInfo>(key, 30 * 86400_000)
  if (hit) return hit
  const [subj, chars] = await Promise.all([
    bgmFetch(`/v0/subjects/${id}`).then((r) => (r.ok ? r.json() : null)),
    bgmFetch(`/v0/subjects/${id}/characters`).then((r) => (r.ok ? r.json() : [])),
  ])
  const actors: StaffInfo['actors'] = []
  const seen = new Set<number>()
  for (const c of Array.isArray(chars) ? chars : []) {
    if (c.relation !== '主角' && c.relation !== '配角') continue
    for (const a of c.actors ?? []) {
      if (a?.id && !seen.has(a.id)) {
        seen.add(a.id)
        actors.push({ id: a.id, name: a.name })
      }
    }
  }
  const infobox = subj?.infobox ?? []
  const info: StaffInfo = { studio: pickInfo(infobox, '动画制作'), director: pickInfo(infobox, '导演'), actors: actors.slice(0, 24) }
  writeCache(key, info)
  return info
}

export interface StaffRank {
  name: string
  n: number
  avg: number | null // 我给这些作品的平均分
  id?: number
}
export interface StaffRanks {
  studios: StaffRank[]
  directors: StaffRank[]
  actors: StaffRank[]
}

export function aggregateStaff(items: LibItem[], staff: Map<number, StaffInfo>): StaffRanks {
  const rank = (get: (s: StaffInfo) => { name: string; id?: number }[]) => {
    const m = new Map<string, { n: number; rs: number; rn: number; id?: number }>()
    for (const it of items) {
      const s = staff.get(it.id)
      if (!s) continue
      for (const e of get(s)) {
        const r = m.get(e.name) ?? { n: 0, rs: 0, rn: 0, id: e.id }
        r.n += 1
        if (it.rate > 0) {
          r.rs += it.rate
          r.rn += 1
        }
        m.set(e.name, r)
      }
    }
    return [...m.entries()]
      .map(([name, r]) => ({ name, n: r.n, avg: r.rn ? r.rs / r.rn : null, id: r.id }))
      .sort((a, b) => b.n - a.n || (b.avg ?? 0) - (a.avg ?? 0))
      .slice(0, 10)
  }
  return {
    studios: rank((s) => s.studio.map((name) => ({ name }))),
    directors: rank((s) => s.director.map((name) => ({ name }))),
    actors: rank((s) => s.actors),
  }
}
