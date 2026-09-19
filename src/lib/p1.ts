/**
 * bgm 两代接口的切换层。
 *  - v0(api.bgm.tv):正牌开放接口,课表/收藏/统计原本全靠它(经 bgmFetch:直连优先,CORS 失败转 /api/bgm 同源转发)。
 *  - p1(next.bgm.tv):新版站点自用接口,接受同一套个人令牌,但没开 CORS,只能经本站 Worker 同源转发(/api/p1/*)。
 * 2026-09 v0 后端整体 502 时,登录/同步/统计全部改走 p1;v0 一恢复自动切回。
 *
 * 规则:v0 回 5xx 或浏览器层失败 → 记为"v0 不可用"10 分钟,期间直接走 p1,不再每次先撞一下;
 *       p1 转发不存在(GitHub Pages 镜像)→ 维持 v0 的原始错误,让上层照旧提示。
 */
import { bgmFetch } from './api'

/** 401/403:令牌无效或已吊销,上层据此置 invalid 而非无限重试 */
export class BgmAuthError extends Error {}
/** v0 不可用(5xx / 网络层失败),withP1Fallback 据此改走 p1 */
export class V0Down extends Error {}
/** 本站没有 p1 转发(镜像站),或转发本身不通 */
export class P1Unavailable extends Error {}

const COOLDOWN = 10 * 60_000
let v0DownUntil = 0
let lastV0Error = 'v0 unavailable'
function markV0Down(msg: string) {
  v0DownUntil = Date.now() + COOLDOWN
  lastV0Error = msg
}

/** v0 请求。token 为 null 时是公开接口(好友收藏),401/403 不当作令牌失效。 */
export async function v0(token: string | null, path: string, init?: RequestInit): Promise<Response> {
  let resp: Response
  try {
    resp = await bgmFetch(path, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    markV0Down(msg)
    throw new V0Down(msg)
  }
  if (token && (resp.status === 401 || resp.status === 403)) throw new BgmAuthError(`HTTP ${resp.status}`)
  if (resp.status >= 500) {
    markV0Down(`HTTP ${resp.status}`)
    throw new V0Down(`HTTP ${resp.status}`)
  }
  return resp
}

/** p1 请求(经 /api/p1 同源转发)。回包没有 X-Bgm-Proxy 说明不是我们的转发在回话(镜像站的静态 404)。 */
export async function p1(token: string | null, path: string, init?: RequestInit): Promise<Response> {
  let resp: Response
  try {
    resp = await fetch(`${import.meta.env.BASE_URL}api/p1${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    })
  } catch (e) {
    throw new P1Unavailable(e instanceof Error ? e.message : String(e))
  }
  if (!resp.headers.get('X-Bgm-Proxy')) throw new P1Unavailable('no relay')
  if (token && (resp.status === 401 || resp.status === 403)) throw new BgmAuthError(`HTTP ${resp.status}`)
  return resp
}

/** 先走 v0(冷却期内跳过),v0 不可用再走 p1;p1 也没有就把 v0 的错误原样抛回。 */
export async function withP1Fallback<T>(viaV0: () => Promise<T>, viaP1: () => Promise<T>): Promise<T> {
  let v0Err: V0Down | undefined
  try {
    if (Date.now() < v0DownUntil) throw new V0Down(lastV0Error)
    return await viaV0()
  } catch (e) {
    if (!(e instanceof V0Down)) throw e
    v0Err = e
  }
  try {
    return await viaP1()
  } catch (e) {
    if (e instanceof P1Unavailable) throw new Error(v0Err?.message ?? lastV0Error)
    throw e
  }
}

/** p1 的 updatedAt 是秒级时间戳 → YYYY-MM-DD */
export const isoDate = (sec: unknown): string =>
  typeof sec === 'number' && sec > 0 ? new Date(sec * 1000).toISOString().slice(0, 10) : ''

export const JSON_HDR = { 'Content-Type': 'application/json' }
