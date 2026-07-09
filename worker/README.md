# Cloudflare 部署:bgmtimetable.com(站点 + OAuth 一键登录)

**整个网站**和 **bgm.tv OAuth 令牌代理**部署在同一个域名
[bgmtimetable.com](https://bgmtimetable.com) 下:静态资源直出,`/oauth/*` 落到
[worker.js](worker.js) —— 同源,无 CORS,一条命令发布。域名绑定写在根目录
`wrangler.toml` 里(`custom_domain = true`),deploy 时自动创建,不用去仪表盘点。

为什么需要代理:bgm.tv 的授权码流程**强制 client_secret 且不支持 PKCE**,
secret 不能进纯静态前端。代理只做"补上 secret 转发",不存储、不记录任何令牌。

## 首次部署

### 1. 发布 + 绑定域名(一步完成)

前提:bgmtimetable.com 已在你的 Cloudflare 账号里(Registrar 购入即自动满足;
若在别家注册,先在仪表盘 Add a site 把 DNS 接管过来)。

```bash
npx wrangler login    # 首次:跳浏览器授权
npm run deploy        # 构建 + 发布 + 自动绑定 bgmtimetable.com
```

打开 https://bgmtimetable.com 确认课表正常(新绑域名的证书生效可能要等一两分钟)。

### 2. 注册 Bangumi 应用

登录 [bgm.tv/dev/app](https://bgm.tv/dev/app) → 创建新应用:

- 类型:**网站**
- 回调地址(**精确到末尾斜杠**):`https://bgmtimetable.com/`
- 记下 **App ID**(形如 `bgm4xxxxx...`)和 **App Secret**

### 3. 注入机密

```bash
npx wrangler secret put BGM_CLIENT_ID      # 粘贴 App ID
npx wrangler secret put BGM_CLIENT_SECRET  # 粘贴 App Secret
```

### 4. 启用前端按钮

新建 `public/oauth.json`,只需替换 clientId(三项都是公开信息,放心入库):

```json
{
  "clientId": "<App ID>",
  "tokenProxy": "https://bgmtimetable.com",
  "redirectUri": "https://bgmtimetable.com/"
}
```

再跑一次 `npm run deploy`(以及 git 提交推送)。设置页出现「用 Bangumi 登录」。

> 按钮只在 bgmtimetable.com 上显示:GitHub Pages 镜像和本地开发会自动隐藏,
> 那里个人令牌登录仍然可用。

## 推 main 自动部署(可选)

Cloudflare 仪表盘 → My Profile → [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
→ 用「编辑 Cloudflare Workers」模板创建 token,然后:

```bash
gh secret set CLOUDFLARE_API_TOKEN   # 粘贴 token
```

之后每次推 main,`deploy-cloudflare.yml` 自动构建发布(与 GitHub Pages 并行,
互不影响)。若报账号相关错误,再补一个 `CLOUDFLARE_ACCOUNT_ID` secret
(仪表盘右侧栏可查)。

## 说明

- 需要 `www.bgmtimetable.com` 也能访问的话:仪表盘该域名 → Rules →
  Redirect Rules 加一条 www → 根域名的 301(或在 wrangler.toml 的 routes
  里再加一行 www 的 custom_domain,但那样 OAuth 按钮在 www 上会隐藏,
  推荐用重定向)。
- 授权页在 **bgm.tv** 域名下,访客需要在该域名登录过(bangumi.tv / chii.in
  的登录态不互通)。
- OAuth 令牌 7 天有效,前端到期前 24h 自动经代理静默续期。
- `redirect_uri` 三处必须完全一致:bgm.tv 应用注册页、oauth.json、实际站点地址。
- 代理默认只接受同源请求;确需放行其他来源时改 `wrangler.toml` 的
  `ALLOWED_ORIGINS`(逗号分隔的 Origin,不带路径)。
