/**
 * bgm.tv OAuth 令牌代理(Cloudflare Worker,无状态)。
 *
 * 为什么需要它:bgm.tv 的授权码流程强制 client_secret 且不支持 PKCE,
 * secret 不能放进纯静态前端。本 Worker 只做一件事:收到前端送来的
 * 授权码/refresh_token,补上 client_id + client_secret 转发给 bgm.tv,
 * 把响应原样传回。不落任何日志、不存任何令牌,进出都只在内存里。
 *
 * 路由:
 *   POST /token    { code, redirect_uri }          → 授权码换令牌
 *   POST /refresh  { refresh_token, redirect_uri } → 续期
 *
 * 配置(见 README.md):
 *   secret  BGM_CLIENT_ID / BGM_CLIENT_SECRET  ← bgm.tv/dev/app 注册所得
 *   var     ALLOWED_ORIGINS                    ← 允许的前端来源,逗号分隔
 */

const BGM_TOKEN_URL = 'https://bgm.tv/oauth/access_token'
const UA = 'Miint-Sunny/Bangumi_ClassTimeTable (oauth-proxy; https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)'

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const okOrigin = allowed.includes(origin)
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    if (!okOrigin) return json({ error: 'origin not allowed' }, 403)

    const body = await req.json().catch(() => ({}))
    const { pathname } = new URL(req.url)

    let grant
    if (pathname === '/token') {
      if (!body.code) return json({ error: 'missing code' }, 400)
      grant = { grant_type: 'authorization_code', code: body.code }
    } else if (pathname === '/refresh') {
      if (!body.refresh_token) return json({ error: 'missing refresh_token' }, 400)
      grant = { grant_type: 'refresh_token', refresh_token: body.refresh_token }
    } else {
      return json({ error: 'not found' }, 404)
    }

    const form = new URLSearchParams({
      ...grant,
      client_id: env.BGM_CLIENT_ID,
      client_secret: env.BGM_CLIENT_SECRET,
      redirect_uri: body.redirect_uri ?? '',
    })
    const resp = await fetch(BGM_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: form,
    })
    const text = await resp.text()
    return new Response(text, { status: resp.status, headers: { ...cors, 'Content-Type': 'application/json' } })
  },
}
