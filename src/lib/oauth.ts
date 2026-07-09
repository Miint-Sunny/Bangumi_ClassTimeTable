/**
 * Bangumi OAuth 一键登录(可选,站长部署 worker/ 下的令牌代理后启用)。
 *
 * bgm.tv 的授权码流程强制 client_secret 且不支持 PKCE,纯静态站无法保管 secret,
 * 因此换取/续期令牌经由一个无状态 Worker 代理(只补 secret 转发,不存令牌)。
 * 站点根目录存在 oauth.json 时,设置页才显示一键登录;个人令牌登录始终可用。
 * 两种方式取得的令牌走完全相同的同步逻辑(lib/bgm.ts)。
 */
import type { BgmAccount } from '../types'
import { verifyToken } from './bgm'

export interface OauthConf {
  clientId: string
  tokenProxy: string // Worker 地址,如 https://bgm-oauth-proxy.xxx.workers.dev
  redirectUri: string // 必须与 bgm.tv/dev/app 注册的回调地址完全一致
}

let confPromise: Promise<OauthConf | null> | null = null

/** 读站点根目录的 oauth.json;不存在(404)= 未启用 OAuth */
export function fetchOauthConf(): Promise<OauthConf | null> {
  confPromise ??= fetch('oauth.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => (c && c.clientId && c.tokenProxy && c.redirectUri ? (c as OauthConf) : null))
    .catch(() => null)
  return confPromise
}

const STATE_KEY = 'btt:oauth:state'

/** 跳到 bgm.tv 授权页(授权页在 bgm.tv 域名,需在该域名下登录过) */
export function beginOauthLogin(conf: OauthConf) {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
  try {
    sessionStorage.setItem(STATE_KEY, state)
  } catch {}
  const u = new URL('https://bgm.tv/oauth/authorize')
  u.searchParams.set('client_id', conf.clientId)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('redirect_uri', conf.redirectUri)
  u.searchParams.set('state', state)
  location.href = u.toString()
}

async function proxy(
  conf: OauthConf,
  path: '/token' | '/refresh',
  body: Record<string, string>,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const resp = await fetch(conf.tokenProxy.replace(/\/+$/, '') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `HTTP ${resp.status}`)
  }
  return data
}

/** 页面 URL 带 ?code= 时完成登录;返回 null 表示本次加载不是 OAuth 回调 */
export async function completeOauthLogin(conf: OauthConf): Promise<BgmAccount | null> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  if (!code) return null
  const expect = sessionStorage.getItem(STATE_KEY)
  try {
    sessionStorage.removeItem(STATE_KEY)
  } catch {}
  history.replaceState(null, '', location.pathname) // 先清 URL,防止刷新重放授权码
  if (!expect || params.get('state') !== expect) throw new Error('state 校验失败,请重新登录')
  const tok = await proxy(conf, '/token', { code, redirect_uri: conf.redirectUri })
  const me = await verifyToken(tok.access_token)
  return {
    token: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 7 * 86400) * 1000,
    kind: 'oauth',
    ...me,
    mergedOnce: false,
  }
}

/**
 * OAuth 令牌到期前 24h 内静默续期。
 * 返回续期后的账号(无需续期时原样返回);已过期且续不回来时返回 null(= 判定失效)。
 */
export async function refreshIfNeeded(conf: OauthConf | null, acc: BgmAccount): Promise<BgmAccount | null> {
  if (acc.kind !== 'oauth' || !acc.refreshToken || !acc.expiresAt) return acc
  if (acc.expiresAt - Date.now() > 24 * 3600_000) return acc
  if (!conf) return acc.expiresAt < Date.now() ? null : acc
  try {
    const tok = await proxy(conf, '/refresh', { refresh_token: acc.refreshToken, redirect_uri: conf.redirectUri })
    return {
      ...acc,
      token: tok.access_token,
      refreshToken: tok.refresh_token ?? acc.refreshToken,
      expiresAt: Date.now() + (tok.expires_in ?? 7 * 86400) * 1000,
    }
  } catch {
    // 网络抖动时旧令牌可能还能用;真过期才判失效
    return acc.expiresAt < Date.now() ? null : acc
  }
}
