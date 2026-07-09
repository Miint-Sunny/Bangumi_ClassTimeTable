# 番组课表 · Bangumi ClassTimetable

**像课表一样追番。** bangumi.tv 当季新番的日 / 周 / 月三视图课表,带追番进度与
bgm 账号双向同步。

**👉 正式站点:[bgmtimetable.com](https://bgmtimetable.com/)**
(可安装为 PWA;GitHub Pages [镜像](https://miint-sunny.github.io/Bangumi_ClassTimeTable/) 同步更新)

## 功能

### 三个视图

- **周视图**:真·课表(行 = 时刻,列 = 星期),粉色当前时刻线横穿整周实时走动,
  表头与时间轴滚动吸附
- **日视图**:单日时间轴,「刚刚播出 / 接下来 24 小时」带倒计时;侧栏速览自动双栏
- **月视图**:日历上标出每天更新哪些番、第几集,已播自动变灰
- 时区一键切换(日本 ⇄ 本地,跨日自动落对格子);深夜表记边界可自定义
  (默认凌晨 2:00 前归前日,表记 24+ 小时制),"今天"的归属跟随深夜日界
- 翻页/切视图用 View Transitions 交叉淡化,视图区与侧栏独立快照,不闪不残影

### 追番与同步

- **Bangumi 账号双向同步**:OAuth 一键登录(或粘贴[个人令牌](https://next.bgm.tv/demo/access-token))
  ——应用内改状态/进度/评分/标签即时写回 bgm 收藏,bgm 侧改动定期拉取合并;
  首次连接双向合并(状态本机优先、进度取较大值),离线改动进队列断网不丢
- **bgm 式收藏面板**:十星评分(官方文案:不忍直视 ~ 超神作)、标签
  (常用/我的标签一键选)、吐槽、仅自己可见
- **进度即作业**:每格显示「看到 X / 已播 Y / 全 Z 集」,落后标红,
  顶栏汇总"欠了 N 集没看";补番清单一键 +1 / 补齐
- **好友进度**:填 bgm 用户名看好友(公开收藏)的进度;共同在追、好友动态
- 撞档提醒(⚡ 同时段两部在追)、个性化 ICS 日历导出、我的课表过滤、
  数据备份导入导出
- **跨季自动分级**:上季续播(半年番下半,金色垫底 + 续)与长期放送
  (年番/柯南们,季初已播 >20 集,冷色垫底 + 长期)自动区分
- **筛选面板**:范围(新番/续播/长期多选)· 口碑(按评分人数加权的分数下限)·
  改编来源 · 题材标签(均带当季数量),详情页点标签直接落入筛选

### 数据可信

- **评分按人数加权**(IMDb 式贝叶斯收缩):三五个人打的 10.0 不再霸榜,
  小众好番也不被误伤;评分人数直接展示,不足 10 人的分数降调标注
- **放送校正(AirFix)**:先行整批放出、1~3 先行后周更等不规则放送精确建模,
  集数进度、三视图、ICS 全部感知;详情页内置校正编辑器,自己查证即改即生效,
  可一键复制 JSON 贡献回站点
- **每集精确时刻**:经 [番組維基 bgm.wiki](https://bgm.wiki) 开发者 API 每日
  CI 同步(自动开 PR 人工复核),年番休播漂移、一举多话都对得上

### 其他

- 季度归档:顶栏切到任意历史季度(静态数据包,零 API 请求),2024Q4 起八季
- 四主题(Bangumi 深色 / 深色 / 高对比深色 / 白色),首访跟随系统偏好
- 界面四语言(简中 / 繁中 / 日本語 / EN),首访跟随浏览器语言;
  站内「关于」窗口含版本信息与更新历史
- 键盘快捷键:`←/→` 翻页,`Home` 回今天,`D/W/M` 切视图
- 右侧常驻面板:详情就地展开、可拖宽、拖到最窄收起;迷你月历点日期跳日视图
- 全站动效只动 transform/opacity(不卡顿),尊重"减弱动态效果";
  弹窗轻磨砂(Liquid Glass 式)

## 反馈

用得不顺、数据不对、想要新功能 →
[**提一个 Issue**](https://github.com/Miint-Sunny/Bangumi_ClassTimeTable/issues/new)。
站内「设置 → 反馈问题」也能直达。放送时间错误可先用详情页的校正编辑器自查自纠,
把生成的 JSON 贴进 Issue 就是一份完整的修正报告。

## 数据来源与流量原则

| 来源 | 用途 | 方式 |
| --- | --- | --- |
| Bangumi 官方 API `/calendar` | 每周放送骨架、评分、封面 | 前端直连,响应裁剪后缓存 6h |
| bangumi-data 数据集 | 精确放送时刻、周期、播放平台 | jsDelivr CDN,缓存 24h |
| Bangumi API `/v0/subjects` | 集数、简介、热门标签 | 按需懒加载,缓存 7 天 |
| Bangumi API `/v0/users/*/collections` | 好友公开进度 | 缓存 1h |
| Bangumi API 收藏读写(仅登录后) | 自己的追番双向同步 | Bearer 认证;写回逐条慢速,拉取缓存 1h |
| [番組維基 bgm.wiki](https://bgm.wiki)(每集精确时刻) | `enhance.json` 的 `air.epDates` | 经其**开发者 API**(token 认证)每日 CI 同步,数据由其编辑者社区维护,特此致谢 |
| yuc.wiki(可选增强:标签/PV/改编来源) | `public/data/enhance.json` | **不自动抓取**,由 `/refresh-data` skill 人工触发,页面由人手动保存 |

所有远端响应均本地缓存,正常使用一天只产生个位数 API 请求。
**不写、不跑任何针对 yuc.wiki 或 bgm.tv 网页的定时/批量爬虫。**

## 自部署

**Cloudflare Workers(推荐,含 OAuth 一键登录)**:静态站点与 OAuth 令牌代理
同域名,`npm run deploy` 一条命令发布 + 自动绑定域名;设 `CLOUDFLARE_API_TOKEN`
secret 后推 main 自动部署。完整步骤见 [worker/README.md](worker/README.md)。

**GitHub Pages(纯静态镜像)**:Settings → Pages 选 "GitHub Actions" 即可,
`deploy.yml` 每次 push main 自动构建发布。镜像上 OAuth 按钮自动隐藏
(回调域名不匹配),个人令牌登录不受影响。

## 开发

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 产物在 dist/,纯静态
```

换季:前端数据自动跟随当季;yuc 增强数据在 Claude Code 里运行
`/refresh-data` 按提示操作。归档已结束的季度:

```bash
python3 scripts/bake_season.py 202607   # 可一次传多个 YYYYMM
```

## 路线图

- [ ] 换季对比(上季 vs 本季追番回顾)
- [ ] 「搁置」状态(目前课表按未追显示)

## 协议

[MIT](LICENSE) · 数据归各来源所有,致谢 Bangumi、bangumi-data、番組維基与
yuc.wiki 的维护者们。
