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
      nameHant: b?.titleHant,
      nameEn: b?.titleEn,
      image: c.image,
      score: c.score,
      rank: c.rank,
      ratingTotal: c.total,
      watchers: c.doing,
      airWeekdayJst: c.weekday,
      begin: b?.begin,
      end: b?.end || undefined,
      periodDays: b?.periodDays ?? 7,
      broadcastAt: b?.broadcastAt,
      officialSite: b?.officialSite,
      sites: b?.sites ?? [],
      fromCalendar: true,
      tags: e?.tags,
      pvUrl: e?.pv,
      sourceType: e?.sourceType,
      airFix: e?.air,
    })
  }

  // bangumi-data 独有条目,两类:
  //  1) 当季窗口(前 30 天 ~ 后 100 天开播)的新条目 —— 流媒体全集、尚未进 calendar 的新番
  //  2) 开播已久但仍在播的长篇 —— calendar 每周放送表会漏子供向/长期档
  //    (小鲨鱼、光之美少女、数码宝贝、アイプリ等),bd 标记未完结即收
  const lo = now - 30 * 86400_000
  const hi = now + 100 * 86400_000
  for (const b of bd.byId.values()) {
    if (seen.has(b.bgmId)) continue
    const recent = b.begin >= lo && b.begin <= hi
    const ongoingLong = !b.end && b.begin < lo
    if (!recent && !ongoingLong) continue
    if (b.end && b.end < now) continue
    const e = enh[String(b.bgmId)]
    shows.push({
      id: b.bgmId,
      nameCn: b.titleCn ?? b.title,
      nameJp: b.title,
      nameHant: b.titleHant,
      nameEn: b.titleEn,
      begin: b.begin,
      end: b.end || undefined,
      periodDays: b.periodDays,
      broadcastAt: b.broadcastAt,
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
