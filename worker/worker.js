/**
 * bgm.tv OAuth 令牌代理(Cloudflare Worker,无状态)。
 *
 * 为什么需要它:bgm.tv 的授权码流程强制 client_secret 且不支持 PKCE,
 * secret 不能放进纯静态前端。本 Worker 只做一件事:收到前端送来的
 * 授权码/refresh_token,补上 client_id + client_secret 转发给 bgm.tv,
 * 把响应原样传回。不落任何日志、不存任何令牌,进出都只在内存里。
 *
 * 部署形态(根目录 wrangler.toml):静态站点与本代理同域名 ——
 * 命中 dist/ 静态资源的请求直出,其余(/oauth/*)才进到这里,同源无需 CORS;
 * ALLOWED_ORIGINS 仅在需要放行额外来源时填写。
 *
 * 路由:
 *   *(www.bgmtimetable.com)                   → 301 回裸域,唯一正规入口
 *   POST /oauth/token    { code, redirect_uri }          → 授权码换令牌
 *   POST /oauth/refresh  { refresh_token, redirect_uri } → 续期
 *   GET  /api/timeline?user=&limit=&until=    → 转发 bgm 新版 p1 公开时间线(未开 CORS,统计页"时间胶囊"用)
 *   GET/POST /api/bgm/<v0 路径|calendar>       → 转发 api.bgm.tv(前端直连失败时的同源兜底,透传 Authorization,不缓存私有请求)
 *   GET/PUT/PATCH /api/p1/<白名单路径>          → 转发 next.bgm.tv/p1(v0 故障时登录/同步/统计的替代通道;p1 未开 CORS,接受同一套令牌)
 *   其余                                       → 静态资源(ASSETS)
 *
 * 配置(见 README.md):
 *   secret  BGM_CLIENT_ID / BGM_CLIENT_SECRET  ← bgm.tv/dev/app 注册所得
 *   var     ALLOWED_ORIGINS                    ← 额外允许的来源,逗号分隔,可空
 */

const CANONICAL_HOST = 'bgmtimetable.com'

const BGM_TOKEN_URL = 'https://bgm.tv/oauth/access_token'
const UA = 'Miint-Sunny/Bangumi_ClassTimeTable (oauth-proxy; https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)'

export default {
  async fetch(req, env) {
    const url = new URL(req.url)

    // www → 裸域 301(保留路径与查询串)。本地 dev / workers.dev 预览不受影响。
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST
      return Response.redirect(url.toString(), 301)
    }
    if (url.pathname === '/api/timeline') return timelineProxy(url)
    if (url.pathname.startsWith('/api/bgm/')) return relay(req, url, '/api/bgm', 'https://api.bgm.tv', BGM_ROUTES)
    if (url.pathname.startsWith('/api/p1/')) return relay(req, url, '/api/p1', 'https://next.bgm.tv/p1', P1_ROUTES)
    // 非 OAuth 请求原样落回静态资源(run_worker_first 下所有请求都先到这里)
    if (!url.pathname.startsWith('/oauth/')) {
      return env.ASSETS.fetch(req)
    }

    const origin = req.headers.get('Origin') ?? ''
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const okOrigin = origin === url.origin || allowed.includes(origin)
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

    let grant
    if (url.pathname === '/oauth/token') {
      if (!body.code) return json({ error: 'missing code' }, 400)
      grant = { grant_type: 'authorization_code', code: body.code }
    } else if (url.pathname === '/oauth/refresh') {
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

/**
 * 同源转发(前端直连失败时的兜底):/api/bgm/<path> → api.bgm.tv/<path>,/api/p1/<path> → next.bgm.tv/p1/<path>。
 * 2026-09 bgm 的 /v0 对一切跨站 Origin 请求回 502、随后整个 v0 后端 502;这里的子请求不带 Origin,
 * 而 p1(新版站点自用接口)接受同一套个人令牌但没开 CORS,只能这样转一手。
 * 只服务同源页面(Sec-Fetch-Site / Origin 校验,挡住别站浏览器借用);路径与方法按白名单放行;
 * Authorization 原样透传、绝不缓存;公开 GET 边缘缓存 5 分钟。不落日志、不存令牌,进出都只在内存里。
 * 回包统一带 X-Bgm-Proxy: 1,前端据此区分"转发在回话"与"镜像站的静态 404 页"。
 */
const BGM_ROUTES = [[/^\/(v0\/[\w\-.%~]+(\/[\w\-.%~]+)*|calendar)$/, ['GET', 'POST']]]
const P1_ROUTES = [
  [/^\/me$/, ['GET']], // 令牌 → 身份
  [/^\/collections\/subjects$/, ['GET']], // 自己的收藏(含私有、进度)
  [/^\/collections\/subjects\/\d{1,9}$/, ['PUT', 'PATCH']], // 写回:状态/评分/标签/吐槽 · 进度
  [/^\/users\/[A-Za-z0-9_-]{1,32}\/collections\/subjects$/, ['GET']], // 好友公开收藏
  [/^\/subjects\/\d{1,9}$/, ['GET']], // 条目(封面/集数/想看人数/infobox)
  [/^\/subjects\/\d{1,9}\/characters$/, ['GET']], // 角色与声优
]

/** 只服务本站页面:浏览器跨站请求必带 Sec-Fetch-Site: cross-site 或异源 Origin */
function isSameOrigin(req, url) {
  const site = req.headers.get('Sec-Fetch-Site')
  const origin = req.headers.get('Origin')
  return !(site && site !== 'same-origin' && site !== 'none') && !(origin && origin !== url.origin)
}

async function relay(req, url, prefix, upstream, routes) {
  const tag = { 'X-Bgm-Proxy': '1' }
  const json = (obj, status) =>
    new Response(JSON.stringify(obj), { status, headers: { ...tag, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  if (!isSameOrigin(req, url)) return json({ error: 'same-origin only' }, 403)
  const path = url.pathname.slice(prefix.length)
  const route = routes.find(([re]) => re.test(path))
  if (!route || path.includes('..')) return json({ error: 'bad path' }, 400)
  if (!route[1].includes(req.method)) return json({ error: `${route[1].join('/')} only` }, 405)
  const headers = { 'User-Agent': UA, Accept: 'application/json' }
  const auth = req.headers.get('Authorization')
  if (auth) headers.Authorization = auth
  const ct = req.headers.get('Content-Type')
  if (ct) headers['Content-Type'] = ct
  const cacheable = req.method === 'GET' && !auth
  const init = { method: req.method, headers }
  if (req.method !== 'GET') init.body = await req.text()
  if (cacheable) init.cf = { cacheTtl: 300, cacheEverything: true }
  else init.cache = 'no-store'
  const resp = await fetch(`${upstream}${path}${url.search}`, init)
  const cacheHdr = cacheable ? 'public, max-age=300' : 'no-store'
  if (resp.status === 204 || resp.status === 304) return new Response(null, { status: resp.status, headers: { ...tag, 'Cache-Control': 'no-store' } })
  const upstreamCt = resp.headers.get('Content-Type') ?? ''
  if (!upstreamCt.includes('json')) return json({ error: 'upstream', status: resp.status }, resp.status >= 400 ? resp.status : 502)
  return new Response(resp.body, { status: resp.status, headers: { ...tag, 'Content-Type': 'application/json', 'Cache-Control': cacheHdr } })
}

/** bgm 新版 p1 的公开时间线没开 CORS,同源转一手;参数白名单校验,边缘缓存 2 分钟。 */
async function timelineProxy(url) {
  const user = url.searchParams.get('user') ?? ''
  const until = url.searchParams.get('until') ?? ''
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  const bad = (msg) => new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(user)) return bad('bad user')
  if (until && !/^\d{1,12}$/.test(until)) return bad('bad until')
  const upstream = `https://next.bgm.tv/p1/users/${user}/timeline?limit=${limit}${until ? `&until=${until}` : ''}`
  const resp = await fetch(upstream, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 120, cacheEverything: true } })
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
  })
}
