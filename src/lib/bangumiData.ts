/**
 * bangumi-data 数据集(https://github.com/bangumi-data/bangumi-data)。
 *
 * 社区维护的番剧元数据,走 jsDelivr CDN 拉取 —— 完全不产生对 bgm.tv /
 * yuc.wiki 的网页流量。提供:精确放送时刻(begin + broadcast 周期)、
 * 完结时间、播放平台链接。裁剪到近一年窗口后缓存 24 小时。
 */

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/bangumi-data/dist/data.json',
  'https://unpkg.com/bangumi-data/dist/data.json',
]

const CACHE_KEY = 'btt:cache:bd3' // v3:含繁中/英文译名(旧键随清缓存一并清除)
const TTL = 24 * 3600_000

export interface BdItem {
  bgmId: number
  title: string // 日文原名
  titleCn?: string
  titleHant?: string // 繁中译名(titleTranslate['zh-Hant'])
  titleEn?: string // 英文译名(titleTranslate['en'])
  begin: number // epoch ms
  end: number // 0 = 未完结
  periodDays: number
  officialSite?: string
  sites: { site: string; url: string }[]
}

export interface BdBundle {
  byId: Map<number, BdItem>
  fetchedAt: number
}

interface StoredBd {
  t: number
  items: BdItem[]
}

// 播放平台(onair 类)的展示名;info 类(mal 等)不展示
const ONAIR_SITES: Record<string, string> = {
  acfun: 'AcFun',
  bilibili: '哔哩哔哩',
  bilibili_hk_mo_tw: 'B站港澳台',
  bilibili_hk_mo: 'B站港澳',
  bilibili_tw: 'B站台湾',
  youku: '优酷',
  qq: '腾讯视频',
  iqiyi: '爱奇艺',
  mgtv: '芒果TV',
  nicovideo: 'Niconico',
  netflix: 'Netflix',
  gamer: '巴哈动画疯',
  gamer_hk: '巴哈(港)',
  muse_hk: '木棉花(港)',
  ani_one: 'Ani-One',
  crunchyroll: 'Crunchyroll',
  prime: 'Prime Video',
  abema: 'ABEMA',
  disneyplus: 'Disney+',
  unext: 'U-NEXT',
  tropics: 'Tropics',
}

function parseBroadcast(broadcast: string | undefined): number {
  // 形如 R/2026-06-30T13:00:00.000Z/P7D 或 .../P1D
  const m = /P(\d+)D/.exec(broadcast ?? '')
  return m ? +m[1] : 7
}

function trimDataset(raw: any, now: number): BdItem[] {
  const siteMeta = raw.siteMeta ?? {}
  const items: any[] = raw.items ?? raw
  const lo = now - 400 * 86400_000
  const hi = now + 120 * 86400_000
  const out: BdItem[] = []

  for (const it of items) {
    if (it.type !== 'tv' && it.type !== 'web') continue
    const begin = Date.parse(it.begin || '')
    if (Number.isNaN(begin)) continue
    const end = it.end ? Date.parse(it.end) : 0
    const stillAiring = !end && begin <= hi
    const inWindow = begin >= lo && begin <= hi
    if (!stillAiring && !inWindow) continue

    let bgmId = 0
    const sites: { site: string; url: string }[] = []
    const seenUrls = new Set<string>()
    for (const s of it.sites ?? []) {
      if (s.site === 'bangumi') bgmId = +s.id
      const label = ONAIR_SITES[s.site]
      if (!label) continue
      const meta = siteMeta[s.site]
      const url = s.url ?? (meta?.urlTemplate && s.id ? meta.urlTemplate.replace('{{id}}', s.id) : null)
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        sites.push({ site: label, url })
      }
    }
    if (!bgmId) continue

    out.push({
      bgmId,
      title: it.title,
      titleCn: it.titleTranslate?.['zh-Hans']?.[0],
      titleHant: it.titleTranslate?.['zh-Hant']?.[0],
      titleEn: it.titleTranslate?.['en']?.[0],
      begin,
      end: Number.isNaN(end) ? 0 : end,
      periodDays: parseBroadcast(it.broadcast),
      officialSite: it.officialSite || undefined,
      sites,
    })
  }
  return out
}

export async function fetchBangumiData(): Promise<BdBundle> {
  const now = Date.now()
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const stored = JSON.parse(raw) as StoredBd
      if (now - stored.t < TTL) return bundle(stored.items, stored.t)
    }
  } catch {}

  let lastErr: unknown = null
  for (const url of CDN_URLS) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const items = trimDataset(await resp.json(), now)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ t: now, items } satisfies StoredBd))
      } catch {}
      return bundle(items, now)
    } catch (e) {
      lastErr = e
    }
  }
  // 两个 CDN 都失败:退化为空集(课表仍可用 calendar API 渲染,只是没有精确时间)
  console.warn('bangumi-data 拉取失败,课表将缺少精确时间', lastErr)
  return bundle([], now)
}

function bundle(items: BdItem[], fetchedAt: number): BdBundle {
  const byId = new Map<number, BdItem>()
  for (const it of items) byId.set(it.bgmId, it)
  return { byId, fetchedAt }
}
