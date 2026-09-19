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

/** 下季新番表的一条(scripts/make_enhance.py 从 yuc 对齐后的数据生成) */
export interface UpcomingShow {
  id: number
  title: string
  titleJp: string
  startDate: string | null // YYYY-MM-DD
  dayOfWeek: number | null // ISO 1..7,yuc 的"周六深夜"归周六
  time: string | null // "24:00" 之类,yuc 未发布时为 null
  broadcast: string | null // 原文,如 "10/3周六深夜"
  web: boolean // 网络放送
  sourceType: string | null
  tags: string[]
  pv: string | null
  official: string | null
  cover: string | null
}
export interface Upcoming {
  season: string // yyyymm
  source: string
  sourceUrl?: string
  scrapedAt?: string
  shows: UpcomingShow[]
}

export interface EnhanceData {
  entries: EnhanceMap
  /** 产地判定(scripts/mark_region.py):非 ja 前缀 = 非日本作品(cn/us/xx…) */
  regions: Record<string, string>
  upcoming?: Upcoming
}

export async function fetchEnhance(): Promise<EnhanceData> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}data/enhance.json`)
    if (!resp.ok) return { entries: {}, regions: {} }
    const data = await resp.json()
    const up = data.upcoming
    return {
      entries: data.entries ?? {},
      regions: data.regions ?? {},
      upcoming: up && Array.isArray(up.shows) && up.shows.length ? up : undefined,
    }
  } catch {
    return { entries: {}, regions: {} }
  }
}

const isoWeekdayOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}

/**
 * 下季新番的条目:没有 begin(时刻未知,周表落在"时刻未定"行),星期来自 yuc 周表;
 * 网络放送只有日期的按日期定星期;封面 / 想看人数由前端进到该季时懒拉 bgm 条目补上。
 */
export function buildUpcomingShows(enhData: EnhanceData): Show[] {
  const up = enhData.upcoming
  if (!up) return []
  const enh = enhData.entries
  return up.shows.map((u) => {
    const e = enh[String(u.id)]
    return {
      id: u.id,
      nameCn: u.title || u.titleJp,
      nameJp: u.titleJp || u.title,
      airWeekdayJst: u.dayOfWeek ?? (u.startDate ? isoWeekdayOf(u.startDate) : undefined),
      periodDays: 7,
      officialSite: u.official ?? undefined,
      sites: [],
      fromCalendar: false,
      tags: u.tags.length ? u.tags : e?.tags,
      pvUrl: u.pv ?? e?.pv,
      sourceType: u.sourceType ?? e?.sourceType,
      airFix: e?.air,
      region: regionOf(undefined, enhData.regions[String(u.id)]),
      upcoming: true,
      firstAirDate: u.startDate ?? undefined,
      airHint: u.broadcast ?? undefined,
      web: u.web,
    }
  })
}

/**
 * 产地归一:undefined = 实锤日本(bd/yuc 收录或官方标注);
 * 'cn' 中国;'unknown' 无可靠信号(诚实标未知,不硬归日本);其余('us'/'kr'/'xx')海外。
 */
const regionOf = (bdOrigin: string | undefined, marked: string | undefined): string | undefined => {
  if (bdOrigin) return bdOrigin.startsWith('zh') ? 'cn' : 'xx' // bangumi-data lang 权威
  if (!marked || marked === 'ja') return undefined
  if (marked === 'ja?') return 'unknown'
  return marked
}

/** 三源合并:calendar(本周在播骨架) × bangumi-data(精确时间/平台) × yuc 增强 */
export function buildShows(cal: CalItem[], bd: BdBundle, enhData: EnhanceData, now: number): Show[] {
  const enh = enhData.entries
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
      region: regionOf(b?.origin, enhData.regions[String(c.id)]),
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
      region: regionOf(b.origin, enhData.regions[String(b.bgmId)]),
    })
  }

  return shows
}
