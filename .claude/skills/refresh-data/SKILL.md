---
name: refresh-data
description: AI 辅助刷新番组课表的 yuc.wiki 增强数据(标签/PV/改编来源)。当用户说"刷新数据"、"更新增强数据"、"导入 yuc"、"换季了"时使用。人工触发、一季一次,绝不自动批量抓取。
---

# 刷新增强数据(yuc.wiki)

## 背景与原则

课表的核心数据**不需要**这个流程:每周放送表来自 Bangumi 官方 API(`/calendar`),
精确放送时间来自 bangumi-data 数据集(jsDelivr CDN),都在前端运行时自动拉取。

这个 skill 只负责**可选的增强字段**:题材标签、PV 链接、改编来源(yuc.wiki 独有)。

**流量原则(用户明确要求,不可违背):**
- 不写、不跑任何针对 yuc.wiki 或 bgm.tv 网页的定时/批量爬虫。
- yuc 页面必须由用户本人在浏览器里正常访问并手动另存 HTML(= 一次普通人类访问)。
- 一个季度只需要做一次,换季时才有必要重跑。

## 流程

1. **请用户保存页面**:让用户用浏览器打开当季 yuc.wiki 页面(如 `https://yuc.wiki/202607`),
   右键"另存为 HTML",告知保存路径。不要替用户去抓这个页面。
2. **解析**(离线,输入是本地 HTML):
   ```bash
   python3 scripts/yuc_scrape.py <保存的.html> --season 202607 --out data/2026Q3.json
   ```
   依赖 beautifulsoup4:`pip install beautifulsoup4`。
3. **对齐 Bangumi subject id**(数据集走 jsDelivr CDN,不碰 bgm.tv 网页):
   ```bash
   python3 scripts/align.py data/2026Q3.json --dataset scripts/cache/bangumi-data.json --out data/2026Q3.aligned.json
   ```
   关注输出的匹配率;`unmatched_titles` 里列出的番,用你对番剧译名的知识人工判断:
   在 bgm.tv 搜索确认 subject id 后手动补进 aligned JSON(这正是"AI 辅助"的价值,
   纯程序化匹配做不到)。
4. **生成前端增强文件**:
   ```bash
   python3 scripts/make_enhance.py data/2026Q3.aligned.json
   ```
   产出 `public/data/enhance.json`,前端下次加载自动生效。
   重跑安全:已有条目的 `air` 校正会被保留,不会被机器输出覆盖。
5. **判读放送校正(air 字段)——这一步是 AI 的核心价值**:
   enhance.json 每个条目带有 `yuc` 原始信息(start_date/time/broadcast_text/notes)。
   通读一遍,把其中的**不规则放送**翻译成结构化的 `air` 字段(AirFix,定义见
   `src/types.ts`),典型两类:

   - "先行放送6集" / "1~6话先行配信"(整批提前,之后周更回归):
     ```json
     "air": { "advanceEps": 6, "advanceAt": "2026-07-04T15:00:00.000Z",
              "anchorEp": 7, "anchorAt": "2026-08-15T15:00:00.000Z",
              "note": "1~6 集 7/4 全网先行,第 7 集起 8/15 每周六更新",
              "source": "https://yuc.wiki/202607" }
     ```
   - "1~3话先行" 后从第 4 集正常周更:
     ```json
     "air": { "advanceEps": 3, "advanceAt": "<先行时刻ISO>",
              "anchorEp": 4, "anchorAt": "<第4集时刻ISO>", "note": "1~3 先行" }
     ```
   规则语义:已播集数 = max(线性推导, 先行批, 锚点推导);anchorEp/anchorAt 定义
   "从第 N 集起,以该时刻为锚每周期一集"。时刻一律 ISO UTC(JST 时间减 9 小时)。

   **查证方法(按可信度排序)**:官网 ON AIR 页 > 官方 X/推特公告 > yuc 备注 >
   bgm.tv 讨论区。把依据 URL 写进 `source`,把人话结论写进 `note`。
   拿不准就不写 air —— 宁缺勿错,错误的校正比没有校正更糟。
6. **合并用户的本机校正**:用户可在应用详情页"校正放送信息"里自行修正,
   界面会给出一段 `{ "<id>": { "air": {...} } }` JSON。收到这样的 JSON 时,
   把它合并进 enhance.json 对应条目(人工复核 note/source 是否齐全)。
7. **验证**:`npm run dev` 打开页面,点一部有校正的番,确认详情页出现 📌 备注、
   "已播出 N 集"符合实际、周/日/月视图位置正确。

## 换季检查清单

- [ ] 新季 yuc 页面已由用户手动保存
- [ ] 匹配率 ≥ 90%,未匹配条目已人工复核
- [ ] yuc notes/broadcast_text 已通读,先行放送等特例已写成 air 校正(带 note + source)
- [ ] enhance.json 的 season 字段是新季度
- [ ] 若部署了网站,重新构建发布
