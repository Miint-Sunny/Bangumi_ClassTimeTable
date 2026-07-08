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
5. **验证**:`npm run dev` 打开页面,随便点一部番的详情,确认出现标签/PV 链接。

## 换季检查清单

- [ ] 新季 yuc 页面已由用户手动保存
- [ ] 匹配率 ≥ 90%,未匹配条目已人工复核
- [ ] enhance.json 的 season 字段是新季度
- [ ] 若部署了网站,重新构建发布
