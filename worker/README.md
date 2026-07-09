# Cloudflare 一体化部署(站点 + OAuth 一键登录)

把**整个网站**和 **bgm.tv OAuth 令牌代理**部署到同一个免费的 Cloudflare 域名
(`bangumi-timetable.<你的子域>.workers.dev`)。静态资源直出,`/oauth/*` 落到
[worker.js](worker.js) —— 同源,无 CORS,一条命令发布。

为什么需要代理:bgm.tv 的授权码流程**强制 client_secret 且不支持 PKCE**,
secret 不能进纯静态前端。代理只做"补上 secret 转发",不存储、不记录任何令牌。

## 首次部署(约 15 分钟)

### 1. Cloudflare 账号 + 首次发布

[dash.cloudflare.com](https://dash.cloudflare.com) 注册(免费套餐即可,Workers
每天 10 万请求额度,个人站绰绰有余)。然后在仓库根目录:

```bash
npx wrangler login    # 跳浏览器授权
npm run deploy        # = 构建 + wrangler deploy
```

首次会让你选一个 workers.dev 子域(全账号共用,起个喜欢的)。
完成后输出站点地址,形如:

```
https://bangumi-timetable.<你的子域>.workers.dev
```

打开确认课表能正常访问。**记下这个地址,下面三处都要用它。**

### 2. 注册 Bangumi 应用

登录 [bgm.tv/dev/app](https://bgm.tv/dev/app) → 创建新应用:

- 类型:**网站**
- 回调地址(**精确到末尾斜杠**):`https://bangumi-timetable.<你的子域>.workers.dev/`
- 记下 **App ID**(形如 `bgm4xxxxx...`)和 **App Secret**

### 3. 注入机密

```bash
npx wrangler secret put BGM_CLIENT_ID      # 粘贴 App ID
npx wrangler secret put BGM_CLIENT_SECRET  # 粘贴 App Secret
```

### 4. 启用前端按钮

新建 `public/oauth.json`(三项都是公开信息,放心入库):

```json
{
  "clientId": "bgm4xxxxx...",
  "tokenProxy": "https://bangumi-timetable.<你的子域>.workers.dev",
  "redirectUri": "https://bangumi-timetable.<你的子域>.workers.dev/"
}
```

再跑一次 `npm run deploy`(以及 git 提交推送)。设置页出现「用 Bangumi 登录」。

> 按钮只在 redirectUri 所在域名显示:GitHub Pages 镜像和本地开发会自动隐藏,
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

## 以后想要真·自有域名

Cloudflare Registrar 按成本价卖域名(`.com` 约 $10/年,无溢价):
仪表盘买好后,Workers 设置 → Domains & Routes → 添加自定义域,一键绑定。
然后把 bgm.tv 应用回调地址和 `public/oauth.json` 两处换成新域名即可,
代码零改动。

## 说明

- 授权页在 **bgm.tv** 域名下,访客需要在该域名登录过(bangumi.tv / chii.in
  的登录态不互通)。
- OAuth 令牌 7 天有效,前端到期前 24h 自动经代理静默续期。
- `redirect_uri` 三处必须完全一致:bgm.tv 应用注册页、oauth.json、实际站点地址。
- 代理默认只接受同源请求;确需放行其他来源时改 `wrangler.toml` 的
  `ALLOWED_ORIGINS`(逗号分隔的 Origin,不带路径)。
