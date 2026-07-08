import type { Show } from '../types'
import type { CalItem } from './api'
import type { BdBundle } from './bangumiData'

import type { AirFix } from '../types'

/** yuc 增强数据(public/data/enhance.json,由 refresh-data skill 生成) */
export interface EnhanceEntry {
  tags?: string[]
  pv?: string
  sourceType?: string
  air?: AirFix // 放送校正(先行放送等,由 skill 人工判读 yuc 备注生成)
}

export type EnhanceMap = Record<string, EnhanceEntry>

export async function fetchEnhance(): Promise<EnhanceMap> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}data/enhance.json`)
    if (!resp.ok) return {}
    const data = await resp.json()
    return data.entries ?? {}
  } catch {
    return {}
  }
}

/** 三源合并:calendar(本周在播骨架) × bangumi-data(精确时间/平台) × yuc 增强 */
export function buildShows(cal: CalItem[], bd: BdBundle, enh: EnhanceMap, now: number): Show[] {
  const shows: Show[] = []
  const seen = new Set<number>()

  for (const c of cal) {
    seen.add(c.id)
    const b = bd.byId.get(c.id)
    const e = enh[String(c.id)]
    shows.push({
      id: c.id,
      nameCn: b?.titleCn && c.nameCn === c.name ? b.titleCn : c.nameCn,
      nameJp: c.name,
      image: c.image,
      score: c.score,
      rank: c.rank,
      watchers: c.doing,
      airWeekdayJst: c.weekday,
      begin: b?.begin,
      end: b?.end || undefined,
      periodDays: b?.periodDays ?? 7,
      officialSite: b?.officialSite,
      sites: b?.sites ?? [],
      fromCalendar: true,
      tags: e?.tags,
      pvUrl: e?.pv,
      sourceType: e?.sourceType,
      airFix: e?.air,
    })
  }

  // bangumi-data 独有条目:流媒体全集上架、尚未进 calendar 的新番。
  // 只收当季窗口(前 30 天 ~ 后 100 天开播)且未完结的,避免长尾旧番涌入。
  const lo = now - 30 * 86400_000
  const hi = now + 100 * 86400_000
  for (const b of bd.byId.values()) {
    if (seen.has(b.bgmId)) continue
    if (b.begin < lo || b.begin > hi) continue
    if (b.end && b.end < now) continue
    const e = enh[String(b.bgmId)]
    shows.push({
      id: b.bgmId,
      nameCn: b.titleCn ?? b.title,
      nameJp: b.title,
      begin: b.begin,
      end: b.end || undefined,
      periodDays: b.periodDays,
      officialSite: b.officialSite,
      sites: b.sites,
      fromCalendar: false,
      tags: e?.tags,
      pvUrl: e?.pv,
      sourceType: e?.sourceType,
      airFix: e?.air,
    })
  }

  return shows
}
