/**
 * Bangumi 官方 API(api.bgm.tv)封装。
 *
 * 礼貌原则:所有响应裁剪后缓存进 localStorage 并带 TTL,
 * 正常使用一天只会真正打到 API 几次,不给 bgm.tv 添负担。
 */

const API = 'https://api.bgm.tv'
/** 同源转发前缀:生产由 worker.js 的 /api/bgm/* 承担,开发期由 vite proxy 承担;GitHub Pages 镜像没有 */
const PROXY = `${import.meta.env.BASE_URL}api/bgm`
const CACHE_PREFIX = 'btt:cache:'

let proxyMissing = false // 镜像站:代理路径落到静态 404/SPA 页,本次会话不再试
let preferProxy = false // 代理成功过一次后本次会话直接走代理,免得每次先撞一下直连

/**
 * 请求 api.bgm.tv:直连优先,浏览器层失败(fetch 抛 TypeError,通常是 CORS 或断网)才转同源代理。
 * 2026-09 bgm 的 /v0 曾对一切跨站 Origin 请求回 502,浏览器直连全挂而 Worker 侧请求不带 Origin 不受影响;
 * 代理只透传 Authorization,不落日志(见 worker/worker.js bgmProxy)。
 */
export async function bgmFetch(path: string, init?: RequestInit): Promise<Response> {
  if (preferProxy) {
    const r = await viaProxy(path, init)
    if (r) return r
    preferProxy = false
  }
  try {
    return await fetch(API + path, init)
  } catch (e) {
    if (proxyMissing) throw e
    const r = await viaProxy(path, init)
    if (!r) throw e
    preferProxy = true
    return r
  }
}

async function viaProxy(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    const resp = await fetch(PROXY + path, init)
    if (!resp.headers.get('X-Bgm-Proxy')) {
      proxyMissing = true // 不是我们的代理在回话(镜像站的静态 404 / index.html)
      return null
    }
    return resp
  } catch {
    return null
  }
}

interface CacheEntry<T> {
  t: number
  v: T
}

export function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const e = JSON.parse(raw) as CacheEntry<T>
    if (Date.now() - e.t > ttlMs) return null
    return e.v
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, v: T) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }))
  } catch {
    // 配额满:清掉本项目的缓存再试一次,失败就放弃(下次重新拉)
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k)
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }))
    } catch {}
  }
}

export function clearApiCache() {
  for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k)
}

export function clearCacheKey(key: string) {
  try {
    localStorage.removeItem(CACHE_PREFIX + key)
  } catch {}
}

async function cachedJson<T>(key: string, path: string, ttlMs: number, trim: (raw: any) => T): Promise<T> {
  const hit = readCache<T>(key, ttlMs)
  if (hit !== null) return hit
  const resp = await bgmFetch(path)
  if (!resp.ok) throw new Error(`${API}${path} → HTTP ${resp.status}`)
  const v = trim(await resp.json())
  writeCache(key, v)
  return v
}

// ── calendar:每周放送表(裁剪后缓存 6 小时) ──────────────────────────

export interface CalItem {
  id: number
  name: string
  nameCn: string
  weekday: number // ISO 1..7
  score?: number
  rank?: number
  total?: number // 评分人数
  doing?: number
  image?: string
}

export function fetchCalendar(): Promise<CalItem[]> {
  return cachedJson('calendar', '/calendar', 6 * 3600_000, (raw: any[]) =>
    raw.flatMap((day) =>
      (day.items ?? []).map((it: any) => ({
        id: it.id,
        name: it.name,
        nameCn: it.name_cn || it.name,
        weekday: day.weekday.id,
        score: it.rating?.score || undefined,
        rank: it.rank || undefined,
        total: it.rating?.total || undefined,
        doing: it.collection?.doing,
        image: it.images?.common || it.images?.medium,
      })),
    ),
  )
}

// ── subject 详情:集数/简介/封面(缓存 7 天,懒加载) ──────────────────

export interface SubjectInfo {
  id: number
  eps?: number
  summary?: string
  image?: string
  score?: number
  rank?: number
  ratingTotal?: number
  hotTags?: string[] // 大家打得最多的标签,收藏面板的"常用标签"推荐
}

export function fetchSubject(id: number): Promise<SubjectInfo> {
  return cachedJson(`subject:${id}`, `/v0/subjects/${id}`, 7 * 86400_000, (raw: any) => ({
    id: raw.id,
    eps: raw.total_episodes || raw.eps || undefined,
    summary: raw.summary || undefined,
    image: raw.images?.common || raw.images?.medium,
    score: raw.rating?.score || undefined,
    rank: raw.rating?.rank || undefined,
    ratingTotal: raw.rating?.total || undefined,
    hotTags: Array.isArray(raw.tags)
      ? raw.tags
          .slice()
          .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
          .slice(0, 12)
          .map((t: any) => t.name)
      : undefined,
  }))
}

// ── 好友公开收藏:在看(缓存 1 小时) ──────────────────────────────────

export interface FriendCollection {
  subjectId: number
  ep: number
  updatedAt?: string
}

export async function fetchUserWatching(username: string): Promise<FriendCollection[]> {
  const hit = readCache<FriendCollection[]>(`friend:${username}`, 3600_000)
  if (hit !== null) return hit
  const out: FriendCollection[] = []
  let offset = 0
  for (let page = 0; page < 3; page++) {
    const resp = await bgmFetch(`/v0/users/${encodeURIComponent(username)}/collections?subject_type=2&type=3&limit=50&offset=${offset}`)
    if (!resp.ok) throw new Error(`用户 ${username}: HTTP ${resp.status}`)
    const data = await resp.json()
    for (const c of data.data ?? []) {
      out.push({ subjectId: c.subject_id, ep: c.ep_status ?? 0, updatedAt: c.updated_at })
    }
    offset += 50
    if (offset >= (data.total ?? 0)) break
  }
  writeCache(`friend:${username}`, out)
  return out
}
