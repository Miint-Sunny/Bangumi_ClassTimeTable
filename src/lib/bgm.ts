/**
 * Bangumi 账号(个人令牌)登录与追番双向同步。
 *
 * 令牌在 https://next.bgm.tv/demo/access-token 生成,存于独立的 localStorage 键:
 * 备份导出只读 btt:v1,令牌天然不会进备份文件。
 * 将来接 OAuth 一键登录(需注册应用 + Worker 保管 secret)只是替换"取得令牌"这一步,
 * 本文件其余逻辑照用。
 *
 * 同步语义:
 *  - 应用内改动 → 立即入队,防抖后逐条写回(bgm API 无删除收藏,本地取消追番不回写)
 *  - bgm 侧改动 → 定期拉取合并,以 bgm 为准(队列里还没推出去的条目除外)
 *  - 首次连接 → 双向合并:状态本机优先、进度取较大值,差异推回 bgm
 *  - bgm 的"搁置"课表不建模:按未追显示,本地进度保留
 */
import type { BgmAccount, CollectMemo, Tracking, WatchStatus } from '../types'
import { bgmFetch, clearCacheKey, readCache, writeCache } from './api'

const ACC_KEY = 'btt:bgm'
const QUEUE_KEY = 'btt:bgm:queue'
/** 「看过」全量可达上千条,只拉到最早归档季(2024Q4)之前一点为止 */
const DONE_CUTOFF = '2024-09-01'

export const STATUS_TO_TYPE: Record<WatchStatus, number> = { wish: 1, done: 2, watching: 3, dropped: 5 }
const TYPE_TO_STATUS: Record<number, WatchStatus> = { 1: 'wish', 2: 'done', 3: 'watching', 5: 'dropped' }

export function loadAccount(): BgmAccount | null {
  try {
    return JSON.parse(localStorage.getItem(ACC_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function saveAccount(a: BgmAccount | null) {
  try {
    if (a) localStorage.setItem(ACC_KEY, JSON.stringify(a))
    else localStorage.removeItem(ACC_KEY)
  } catch {}
}

/** 401/403:令牌无效或已吊销,上层据此置 invalid 而非无限重试 */
export class BgmAuthError extends Error {}

async function authed(token: string, path: string, init?: RequestInit): Promise<Response> {
  const resp = await bgmFetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  if (resp.status === 401 || resp.status === 403) throw new BgmAuthError(`HTTP ${resp.status}`)
  return resp
}

/** 校验令牌并取回身份(GET /v0/me) */
export async function verifyToken(token: string): Promise<Pick<BgmAccount, 'username' | 'nickname' | 'avatar'>> {
  const resp = await authed(token, '/v0/me')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const u = await resp.json()
  return { username: u.username, nickname: u.nickname || u.username, avatar: u.avatar?.small }
}

export interface RemotePull {
  status: Record<number, WatchStatus>
  watched: Record<number, number>
  rates: Record<number, number>
  memos: Record<number, CollectMemo>
  onHold: number[]
}

/** 拉取自己的动画收藏(带 Authorization 可含私有条目),缓存 1 小时 */
export async function pullCollections(acc: BgmAccount, force = false): Promise<RemotePull> {
  const key = `bgm:pull:${acc.username}`
  if (!force) {
    const hit = readCache<RemotePull>(key, 3600_000)
    if (hit) return hit
  }
  const out: RemotePull = { status: {}, watched: {}, rates: {}, memos: {}, onHold: [] }
  for (const type of [3, 1, 4, 5, 2]) {
    const maxPages = type === 2 ? 20 : 10
    for (let page = 0, offset = 0; page < maxPages; page++, offset += 50) {
      const resp = await authed(
        acc.token,
        `/v0/users/${encodeURIComponent(acc.username)}/collections?subject_type=2&type=${type}&limit=50&offset=${offset}`,
      )
      if (!resp.ok) throw new Error(`拉取收藏(type=${type}): HTTP ${resp.status}`)
      const data = await resp.json()
      let pastCutoff = false
      for (const c of data.data ?? []) {
        if (type === 4) out.onHold.push(c.subject_id)
        else out.status[c.subject_id] = TYPE_TO_STATUS[type]
        if (c.ep_status > 0) out.watched[c.subject_id] = c.ep_status
        if (c.rate > 0) out.rates[c.subject_id] = c.rate
        const memo: CollectMemo = {}
        if (Array.isArray(c.tags) && c.tags.length > 0) memo.tags = c.tags
        if (c.comment) memo.comment = c.comment
        if (c.private) memo.private = true
        if (Object.keys(memo).length > 0) out.memos[c.subject_id] = memo
        if (type === 2 && (c.updated_at ?? '9999') < DONE_CUTOFF) pastCutoff = true
      }
      if (offset + 50 >= (data.total ?? 0) || pastCutoff) break
    }
  }
  writeCache(key, out)
  return out
}

export function clearPullCache(username: string) {
  clearCacheKey(`bgm:pull:${username}`)
}

// ── 写回队列(localStorage,断网/刷新不丢) ──────────────────────────

export interface PushPatch {
  type: number
  ep?: number
  rate?: number // 0 = 清除评分
  tags?: string[]
  comment?: string // '' = 清空吐槽
  private?: boolean
  tries?: number
}
type Queue = Record<string, PushPatch>

function loadQueue(): Queue {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function saveQueue(q: Queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {}
}

export function enqueuePush(id: number, patch: Omit<PushPatch, 'tries'>) {
  const q = loadQueue()
  q[id] = { ...q[id], ...patch, tries: 0 }
  saveQueue(q)
}

export function queuedIds(): Set<number> {
  return new Set(Object.keys(loadQueue()).map(Number))
}

export function clearQueue() {
  try {
    localStorage.removeItem(QUEUE_KEY)
  } catch {}
}

let draining = false

/** 逐条 POST /v0/users/-/collections/{id}(新增或修改)。遇 401/403 抛 BgmAuthError 停止。 */
export async function drainQueue(acc: BgmAccount): Promise<void> {
  if (draining) return
  draining = true
  try {
    const ids = Object.keys(loadQueue())
    for (const id of ids) {
      const patch = loadQueue()[id]
      if (!patch) continue
      const body: Record<string, unknown> = { type: patch.type }
      if (patch.ep !== undefined) body.ep_status = patch.ep
      if (patch.rate !== undefined) body.rate = patch.rate
      if (patch.tags !== undefined) body.tags = patch.tags
      if (patch.comment !== undefined) body.comment = patch.comment
      if (patch.private !== undefined) body.private = patch.private
      let ok = false
      try {
        const resp = await authed(acc.token, `/v0/users/-/collections/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        ok = resp.ok
      } catch (e) {
        if (e instanceof BgmAuthError) throw e
        // 网络错误:留在队列,下次再试
      }
      const q = loadQueue() // 期间可能有新入队,重读后再改
      if (ok) delete q[id]
      else if (q[id]) {
        q[id].tries = (q[id].tries ?? 0) + 1
        if (q[id].tries! >= 5) delete q[id] // 多次失败放弃,避免死信堵队列
      }
      saveQueue(q)
      await new Promise((r) => setTimeout(r, 250)) // 写接口逐条慢速,不冲 API
    }
  } finally {
    draining = false
  }
}

/**
 * 云端状态合并进本机。
 * 首次连接:状态本机优先、进度取较大值,差异作为 pushes 返回(推回 bgm)。
 * 此后:bgm 为准(写回队列里尚未推送的条目除外);进度只在云端 > 0 时覆盖,
 * 避免"看过但 bgm 未记集数"这类条目把本机进度抹掉。
 */
export function mergeRemote(
  local: Tracking,
  remote: RemotePull,
  firstMerge: boolean,
  queued: Set<number>,
): { tracking: Tracking; pushes: Record<number, PushPatch> } {
  const status = { ...local.status }
  const watched = { ...local.watched }
  const rates = { ...local.rates }
  const memos = { ...local.memos }
  const pushes: Record<number, PushPatch> = {}
  const onHold = new Set(remote.onHold)

  const ids = new Set<number>(Object.keys(remote.status).map(Number))
  if (firstMerge) for (const k of Object.keys(local.status)) ids.add(Number(k))

  for (const id of ids) {
    if (queued.has(id)) continue
    const rs = remote.status[id]
    const rw = remote.watched[id] ?? 0
    const rr = remote.rates[id] ?? 0
    const rm = remote.memos[id]
    if (firstMerge) {
      const ls = local.status[id]
      const merged = ls ?? rs
      const mw = Math.max(local.watched[id] ?? 0, rw)
      const mr = local.rates[id] ?? rr // 评分:本机优先
      const lm = local.memos[id] // 标签/吐槽:本机有就优先
      const mm = lm ?? rm
      if (merged) status[id] = merged
      if (mw > 0) watched[id] = mw
      if (mr > 0) rates[id] = mr
      if (mm) memos[id] = mm
      const memoDiff = lm && JSON.stringify(lm) !== JSON.stringify(rm ?? {})
      if (merged && !onHold.has(id) && (merged !== rs || mw > rw || (mr > 0 && mr !== rr) || memoDiff)) {
        pushes[id] = {
          type: STATUS_TO_TYPE[merged],
          ...(mw > rw ? { ep: mw } : {}),
          ...(mr > 0 && mr !== rr ? { rate: mr } : {}),
          ...(memoDiff
            ? { tags: lm.tags ?? [], comment: lm.comment ?? '', private: lm.private ?? false }
            : {}),
        }
      }
    } else {
      if (rs) status[id] = rs
      if (rw > 0) watched[id] = rw
      if (rr > 0) rates[id] = rr
      if (rs) {
        if (rm) memos[id] = rm
        else delete memos[id] // bgm 为准:云端清空了就清空
      }
    }
  }
  // 搁置:课表按未追显示(进度/评分保留)。首次合并若本机有状态,以本机为准(上面已推回)。
  for (const id of onHold) {
    if (queued.has(id)) continue
    if (!firstMerge || !local.status[id]) delete status[id]
    if (remote.rates[id]) rates[id] = remote.rates[id]
    if (remote.memos[id]) memos[id] = remote.memos[id]
  }
  return { tracking: { status, watched, rates, memos }, pushes }
}

// ── 统计页:全量收藏(五种状态、全历史,缓存 24h) ─────────────────────

export interface LibItem {
  id: number
  type: 1 | 2 | 3 | 4 | 5 // bgm 收藏类型:1 想看 2 看过 3 在看 4 搁置 5 抛弃
  rate: number // 0 = 未评分
  ep: number // 看到第几集
  at: string // 收藏更新日 YYYY-MM-DD
  name: string
  nameCn: string
  date: string | null // 首播日
  eps: number
  score: number // 站均分
  total: number // 站内收藏人数(冷门指数用)
  image: string // 封面(r/200)
  tags: string[] // 条目热门标签(已剔除年份/形态等噪音)
}
export interface Library {
  items: LibItem[]
  fetchedAt: number
  partial: boolean // 收藏太多,触到分页上限被截断
}

const TAG_NOISE = new Set([
  'TV', 'TVA', 'WEB', 'OVA', 'OAD', '动画', '日本', '日本动画', 'anime', 'Anime', '原创', '漫改',
  '漫画改', '漫画改编', '轻改', '轻小说改', '轻小说改编', '小说改', '小说改编', '游戏改', '游戏改编',
  '续作', '第二季', '第三季', '第四季', '剧场版', '电影', '新番', '完结', '连载中',
])

export async function pullLibrary(acc: BgmAccount, force = false): Promise<Library> {
  const key = `bgm:lib2:${acc.username}` // lib2:加了封面字段,旧缓存作废
  if (!force) {
    const hit = readCache<Library>(key, 86400_000)
    if (hit) return hit
  }
  const items: LibItem[] = []
  let partial = false
  for (const type of [2, 3, 1, 4, 5] as const) {
    let offset = 0
    for (let page = 0; ; page++) {
      if (page >= 80) {
        partial = true // 4000 部封顶,再多就不是统计而是清单了
        break
      }
      const resp = await authed(
        acc.token,
        `/v0/users/${encodeURIComponent(acc.username)}/collections?subject_type=2&type=${type}&limit=50&offset=${offset}`,
      )
      if (!resp.ok) throw new Error(`拉取收藏(type=${type}): HTTP ${resp.status}`)
      const data = await resp.json()
      const rows: any[] = data.data ?? []
      for (const c of rows) {
        const s = c.subject ?? {}
        items.push({
          id: c.subject_id,
          type,
          rate: c.rate ?? 0,
          ep: c.ep_status ?? 0,
          at: String(c.updated_at ?? '').slice(0, 10),
          name: s.name ?? '',
          nameCn: s.name_cn || s.name || '',
          date: s.date ?? null,
          eps: s.eps ?? 0,
          score: s.score ?? 0,
          total: s.collection_total ?? 0,
          image: s.images?.medium ?? s.images?.common ?? '',
          tags: (Array.isArray(s.tags) ? s.tags : [])
            .map((t: any) => String(t?.name ?? ''))
            .filter((n: string) => n && !/^\d{4}$/.test(n) && !TAG_NOISE.has(n))
            .slice(0, 6),
        })
      }
      offset += 50
      if (rows.length === 0 || offset >= (data.total ?? 0)) break
    }
  }
  const lib: Library = { items, fetchedAt: Date.now(), partial }
  writeCache(key, lib)
  return lib
}

export function clearLibraryCache(username: string) {
  clearCacheKey(`bgm:lib2:${username}`)
}

// ── 统计页:时间胶囊(bgm 新版 p1 公开时间线,经同源 /api/timeline 转发) ────

export type CapsuleKind = 'wish' | 'done' | 'watching' | 'hold' | 'drop' | 'progress' | 'ep'
export interface CapsuleEvent {
  id: number
  at: number // ms
  kind: CapsuleKind
  subject: { id: number; name: string; nameCn: string }
  ep?: number // ep:看过第几话;progress:看到第几话
  epsTotal?: number
  rate?: number
  comment?: string
}

// p1 时间线 cat=3(收藏)的 type → 动作;cat=4(进度)type 0 = 批量进度,2 = 单集
const CAP_KIND: Record<number, CapsuleKind> = { 2: 'wish', 6: 'done', 10: 'watching', 13: 'hold', 14: 'drop' }

/** 最近的动画相关动作;until = 上一页最后一条的 id(翻页)。GitHub Pages 镜像没有代理,会抛错,调用方静默。 */
export async function fetchTimeline(username: string, until?: number, limit = 20): Promise<{ events: CapsuleEvent[]; lastId: number | null }> {
  const q = new URLSearchParams({ user: username, limit: String(limit) })
  if (until) q.set('until', String(until))
  const resp = await fetch(`${import.meta.env.BASE_URL}api/timeline?${q}`, { headers: { Accept: 'application/json' } })
  if (!resp.ok) throw new Error(`timeline HTTP ${resp.status}`)
  const rows: any[] = await resp.json()
  if (!Array.isArray(rows)) throw new Error('timeline: bad payload')
  const events: CapsuleEvent[] = []
  for (const r of rows) {
    const at = (r.createdAt ?? 0) * 1000
    const memo = r.memo ?? {}
    if (r.cat === 3 && Array.isArray(memo.subject)) {
      const kind = CAP_KIND[r.type]
      for (const m of memo.subject) {
        const s = m.subject ?? {}
        if (!kind || s.type !== 2) continue
        events.push({
          id: r.id, at, kind,
          subject: { id: s.id, name: s.name ?? '', nameCn: s.nameCN || s.name || '' },
          rate: m.rate || undefined,
          comment: m.comment || undefined,
        })
      }
    } else if (r.cat === 4 && memo.progress) {
      const p = memo.progress
      if (p.batch?.subject?.type === 2) {
        const s = p.batch.subject
        events.push({
          id: r.id, at, kind: 'progress',
          subject: { id: s.id, name: s.name ?? '', nameCn: s.nameCN || s.name || '' },
          ep: Number(p.batch.epsUpdate) || undefined,
          epsTotal: Number(p.batch.epsTotal) || undefined,
        })
      } else if (p.single?.subject?.type === 2) {
        const s = p.single.subject
        events.push({
          id: r.id, at, kind: 'ep',
          subject: { id: s.id, name: s.name ?? '', nameCn: s.nameCN || s.name || '' },
          ep: Number(p.single.episode?.sort) || undefined,
        })
      }
    }
  }
  return { events, lastId: rows.length ? rows[rows.length - 1].id : null }
}

/** 全量时间线(观看节奏用):按 until 翻页,翻到 400 天前或 40 页封顶;缓存 6 小时 */
export async function fetchAllTimeline(username: string, force = false): Promise<CapsuleEvent[]> {
  const key = `bgm:tl:${username}`
  if (!force) {
    const hit = readCache<CapsuleEvent[]>(key, 6 * 3600_000)
    if (hit) return hit
  }
  const all: CapsuleEvent[] = []
  const floor = Date.now() - 400 * 86400_000
  let until: number | undefined
  for (let page = 0; page < 40; page++) {
    const { events, lastId } = await fetchTimeline(username, until, 30)
    all.push(...events)
    if (lastId === null) break
    const oldest = all[all.length - 1]
    if (oldest && oldest.at < floor) break
    until = lastId
  }
  writeCache(key, all)
  return all
}
