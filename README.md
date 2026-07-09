# 番组课表 · bangumi-timetable

像课表一样看番:bangumi.tv 当季新番的 **日 / 周 / 月** 三视图,带本地追番进度。

## 特色(同类项目没有的)

- **月视图**:日历上标出每一天更新哪些番、第几集,已播的自动变灰
- **日视图**:「刚刚播出 / 接下来 24 小时」时间线,带倒计时和集数
- **周视图**:真·课表(行 = 时间,列 = 星期),支持深夜表记(25:30 归前一天),
  粉色**当前时刻线**横穿整周实时走动;表头与时间轴滚动时吸附,不会看串行列
- **时区换算**:日本时间 ⇄ 本地时间一键切换,跨日自动落对格子
- **进度即作业**:每格显示「看到 X / 已播 Y / 全 Z 集」,落后标红,顶栏汇总"欠了 N 集没看"
- **撞档提示**:同一时段有两部在追的番时标出 ⚡
- **好友进度**:填 bgm 用户名即可看到好友(公开收藏)追同一部番的进度
- **个性化 ICS 导出**:只导出自己在追的番的更新日历,可订阅进系统日历
- **我的课表**:一键过滤到只看自己想看/在看的番
- **换季继承**:上季开播、本季仍在播的番自动标"续",可按"本季新番 / 上季续播"过滤
- **三主题**:深色 / 浅色 / 高对比(纯黑底 + 高亮度文字,弱视环境友好)
- **放送校正**:先行整批放出(如"提前放送 6 集")、1~3 先行后周更回归等不规则放送,
  用 AirFix 规则精确建模——集数进度、日/周/月视图、ICS 全部感知。
  季度默认校正由 refresh-data skill 判读 yuc 备注生成;详情页内置校正编辑器,
  自己查证后即改即生效(本机优先),并可一键复制 JSON 贡献回站点默认数据

- **季度归档**:顶栏切换到任意历史季度(静态数据包,零 API 请求),
  周视图变纯课表、月视图跳到季首月;2026 各季带 yuc 标签/PV,更早季度来自
  bangumi-data + 官方 API 烘焙
- **右侧常驻面板**:详情就地展开(窄屏自动回退弹窗),空闲时是补番清单、
  更新日程、好友动态、共同在追、⚡撞档对比、迷你月历(点日期跳日视图);
  可拖宽(日/周分开记忆)、拖到最窄自动收起
- **键盘快捷键**:`←/→` 翻日/周/月,`Home` 回到今天/本周/本月,`D/W/M` 切视图
- **点标签筛选**:详情页题材标签可点,一键筛出同题材番剧
- **数据备份**:设置里一键导出/导入追番数据 JSON(localStorage 换浏览器必备)
- **PWA**:可安装到桌面/手机主屏,静态资源离线缓存
- **Bangumi 账号双向同步**:设置里粘贴[个人令牌](https://next.bgm.tv/demo/access-token)即可连接
  bgm.tv——应用内改状态/进度即时写回收藏,bgm 侧改动定期拉取合并;
  首次连接双向合并(状态本机优先、进度取较大值),离线改动进队列断网不丢。
  令牌只存本机浏览器、不进备份文件,可随时吊销
- **OAuth 一键登录(站长可选)**:部署 [worker/](worker/) 下的无状态令牌代理并放置
  `public/oauth.json` 后,设置页出现「用 Bangumi 登录」——访客免手动生成令牌,
  授权后自动续期;不配置则按钮隐藏,个人令牌登录始终可用
- **bgm 式评分**:详情页十星评分,沿用 bgm 官方文案(不忍直视 ~ 超神作);
  连接账号后评分随收藏一起双向同步

## 数据来源与流量原则

| 来源 | 用途 | 方式 |
| --- | --- | --- |
| Bangumi 官方 API `/calendar` | 每周放送骨架、评分、封面 | 前端直连,响应裁剪后缓存 6h |
| bangumi-data 数据集 | 精确放送时刻、周期、播放平台 | jsDelivr CDN,缓存 24h |
| Bangumi API `/v0/subjects` | 集数、简介 | 按需懒加载,缓存 7 天 |
| Bangumi API `/v0/users/*/collections` | 好友公开进度 | 缓存 1h |
| Bangumi API `/v0/me`、收藏读写(仅登录后) | 自己的追番双向同步 | 个人令牌 Bearer 认证;写回逐条慢速,拉取缓存 1h |
| yuc.wiki(可选增强:标签/PV) | `public/data/enhance.json` | **不自动抓取**,由 `/refresh-data` skill 人工触发,页面由人手动保存 |
| [番組維基 bgm.wiki](https://bgm.wiki)(每集精确时刻) | `enhance.json` 的 `air.epDates` | 经其**开发者 API**(token 认证)每日 CI 同步,数据由其编辑者社区维护,特此致谢 |

所有远端响应均本地缓存,正常使用一天只产生个位数 API 请求。

## 开发

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 产物在 dist/,纯静态,可部署到任意静态托管
```

## 部署

**正式站点 [bgmtimetable.com](https://bgmtimetable.com)(Cloudflare Workers,含
OAuth 一键登录)**:静态站点与 OAuth 令牌代理同域名,`npm run deploy` 一条命令
发布 + 自动绑定域名;设 `CLOUDFLARE_API_TOKEN` secret 后推 main 自动部署。
完整步骤见 [worker/README.md](worker/README.md)。

**GitHub Pages(纯静态镜像)**:仓库 Settings → Pages 选择 "GitHub Actions",
`.github/workflows/deploy.yml` 每次 push main 自动构建发布。镜像上 OAuth 按钮
自动隐藏(回调域名不匹配),个人令牌登录不受影响。
`vite.config.ts` 已设 `base: './'`,子路径部署无需改动。

## 换季

前端数据(calendar / bangumi-data)自动跟随当季,无需操作。
可选的 yuc 增强数据在 Claude Code 里运行 `/refresh-data` 按提示操作。

归档一个已结束的季度(生成静态数据包 + 更新清单):

```bash
python3 scripts/bake_season.py 202607        # 可一次传多个 YYYYMM
```

官方 subject API 响应缓存在 scripts/cache/subjects/,重跑不产生新请求。

## 协议

[MIT](LICENSE)

## 路线图

- [x] Bangumi 账号云同步 + 收藏双向写回(个人令牌)
- [x] Bangumi OAuth 一键登录(前端 + Worker 代理已就绪,站长按 [worker/README.md](worker/README.md)
      注册应用、部署代理、放置 `public/oauth.json` 即启用)
- [ ] 换季对比(上季 vs 本季追番回顾)
