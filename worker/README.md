# bgm.tv OAuth 令牌代理(Cloudflare Worker)

让访客在网站上「用 Bangumi 登录」一键授权,免去手动生成个人令牌。

bgm.tv 的授权码流程**强制 client_secret 且不支持 PKCE**,secret 不能进纯静态前端,
所以需要这个无状态代理:收授权码 → 补上 secret 转发给 bgm.tv → 原样返回令牌。
不存储、不记录任何令牌。前端拿到令牌后,同步逻辑与个人令牌登录完全一致。

## 部署(一次性,约 10 分钟)

1. **注册 Bangumi 应用**:登录 [bgm.tv/dev/app](https://bgm.tv/dev/app) → 创建新应用
   - 类型选「网站」
   - 回调地址填你的站点地址,**精确到末尾斜杠**:
     `https://miint-sunny.github.io/Bangumi_ClassTimeTable/`
   - 记下 **App ID**(形如 `bgm4xxxxx...`)和 **App Secret**

2. **部署 Worker**(需要一个免费 Cloudflare 账号):

   ```bash
   cd worker
   npx wrangler login      # 首次:浏览器里授权
   npx wrangler deploy     # 记下输出的 https://bgm-oauth-proxy.<你>.workers.dev
   npx wrangler secret put BGM_CLIENT_ID      # 粘贴 App ID
   npx wrangler secret put BGM_CLIENT_SECRET  # 粘贴 App Secret
   ```

   如果站点部署在别的域名,先改 `wrangler.toml` 里的 `ALLOWED_ORIGINS`(只写 Origin,不带路径)。

3. **告诉前端**:在仓库 `public/oauth.json` 写入(这三项都是公开信息,可以入库):

   ```json
   {
     "clientId": "bgm4xxxxx...",
     "tokenProxy": "https://bgm-oauth-proxy.<你>.workers.dev",
     "redirectUri": "https://miint-sunny.github.io/Bangumi_ClassTimeTable/"
   }
   ```

   提交推送,Pages 重新部署后,设置页自动出现「用 Bangumi 登录」按钮。
   (没有这个文件时按钮隐藏,个人令牌登录始终可用。)

## 说明

- 授权页在 **bgm.tv** 域名下,访客需要在该域名登录过(bangumi.tv / chii.in 的
  登录态不互通)。
- OAuth 令牌 7 天有效,前端会在到期前用 refresh_token 静默续期(也经此代理)。
- `redirect_uri` 三处必须完全一致:bgm.tv 应用注册页、oauth.json、实际站点地址。
