/**
 * 季度归档:bake_season.py 烘焙的静态数据包(public/data/season-YYYYMM.json)。
 * 当季走 calendar API 实时数据,历史季走这里,零 API 请求。
 */

import type { Show } from '../types'
import { seasonLabel } from './i18n'

export function fmtSeason(yyyymm: string): string {
  return seasonLabel(+yyyymm.slice(0, 4), +yyyymm.slice(4))
}

/** 该季度起点(JST 首月 1 日 0 点)的时刻 */
export function seasonStartOf(yyyymm: string): number {
  return Date.UTC(+yyyymm.slice(0, 4), +yyyymm.slice(4) - 1, 1) - 9 * 3600_000
}

export function seasonMonthOf(yyyymm: string): { y: number; mo: number } {
  return { y: +yyyymm.slice(0, 4), mo: +yyyymm.slice(4) }
}

export async function fetchSeasonList(): Promise<string[]> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}data/seasons.json`)
    if (!resp.ok) return []
    const data = await resp.json()
    return Array.isArray(data.seasons) ? data.seasons : []
  } catch {
    return []
  }
}

export async function fetchSeasonPack(yyyymm: string): Promise<Show[]> {
  const resp = await fetch(`${import.meta.env.BASE_URL}data/season-${yyyymm}.json`)
  if (!resp.ok) throw new Error(`季度数据包 ${yyyymm} 加载失败(HTTP ${resp.status})`)
  const data = await resp.json()
  return (data.shows ?? []).map(
    (s: any): Show => ({
      id: s.id,
      nameCn: s.nameCn ?? s.nameJp ?? String(s.id),
      nameJp: s.nameJp ?? s.nameCn ?? String(s.id),
      image: s.image ?? undefined,
      score: s.score ?? undefined,
      rank: s.rank ?? undefined,
      ratingTotal: s.ratingTotal ?? undefined,
      airWeekdayJst: s.airWeekdayJst ?? undefined,
      begin: s.begin ? Date.parse(s.begin) : undefined,
      end: s.end ? Date.parse(s.end) : undefined,
      periodDays: s.periodDays ?? 7,
      epsTotal: s.epsTotal ?? undefined,
      officialSite: s.officialSite ?? undefined,
      sites: s.sites ?? [],
      fromCalendar: !s.streaming,
      tags: s.tags ?? undefined,
      pvUrl: s.pv ?? undefined,
      sourceType: s.sourceType ?? undefined,
      airFix: s.air ?? undefined,
    }),
  )
}
