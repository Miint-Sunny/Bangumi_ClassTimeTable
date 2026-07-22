"""
产地标注:识别 bgm 每日放送表里的非日本作品(国创/美漫等),写入 enhance.json 顶层 regions。

  python3 scripts/mark_region.py    # 无需 token,走 bgm 官方公开 API

背景:bgm /calendar 混录全球作品(蝙蝠侠、喜羊羊、Breaking Bear…),
它们既不在 bangumi-data、也不在 yuc 增强数据里,且永远排不出日本档期。
但"两大日本信源查无"不能直接当判据——航海王(bd 标了完结)、暗芝居新季、
web 短篇等真日本番也可能查无。可靠信源是 bgm 官方 subject 的 meta_tags
产地标注(日本/中国/美国…),缺产地标注时退回用户热门标签,再兜不住
一律默认日本(宁漏不误杀)。

判定持久化在 enhance.json 的 regions:{subjectId: "ja"|"ja?"|"cn"|"us"|"kr"|"xx"}。
"ja" 是实锤(meta 产地/假名原名),不再重查;"ja?" 是无信号的暂定值,
每日复查等标签攒够票数(CI 每日跑,增量只有当天新条目 + 少量 ja? 复查)。
前端四类口径(merge.ts regionOf):ja/未标注→日本实锤,cn→中国,
us/kr/xx→其他地区,"ja?"→「未知」诚实展示、不硬归类。
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

API = "https://api.bgm.tv"
UA = "Miint-Sunny/Bangumi_ClassTimeTable (+https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)"
ROOT = Path(__file__).resolve().parent.parent
ENHANCE = ROOT / "public" / "data" / "enhance.json"
BD_CACHE = Path(__file__).resolve().parent / "cache" / "bangumi-data.json"

# meta_tags 的产地词 → 区码;命中"日本"直接 ja
META_REGION = {
    "中国": "cn", "中国大陆": "cn", "中国香港": "cn", "中国台湾": "cn",
    "美国": "us", "加拿大": "us", "欧美": "us", "英国": "us", "法国": "us",
    "德国": "us", "意大利": "us", "西班牙": "us", "俄罗斯": "us", "苏联": "us",
    "韩国": "kr",
}
# 用户标签兜底(meta 无产地时),要求票数 >= 3 防孤票误标
TAG_OTHER = {
    "国产", "国产动画", "中国", "华语", "大陆",
    "欧美", "美漫", "美国", "英国", "法国", "俄罗斯", "加拿大",
    "韩国", "韩漫",
}


def api_get(path: str) -> dict:
    req = urllib.request.Request(f"{API}{path}", headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


KANA = re.compile(r"[぀-ヿ]")  # 平假名/片假名
CJK = re.compile(r"[぀-ヿ㐀-鿿豈-﫿]")  # 含汉字


def classify(subject: dict) -> str:
    meta = set(subject.get("meta_tags") or [])
    if "日本" in meta:
        return "ja"
    for tag, code in META_REGION.items():
        if tag in meta:
            return code
    for t in subject.get("tags") or []:
        if t.get("name") in TAG_OTHER and (t.get("count") or 0) >= 3:
            return "xx"
    name = subject.get("name") or ""
    if KANA.search(name):
        return "ja"  # 原名带假名 = 日文,实锤
    if not CJK.search(name):
        # 纯拉丁原名 ∧ 已知两大日本信源查无 ∧ 无产地标签 → 海外
        # (纯英文名的日本番如 ONE PIECE 都在 bangumi-data 里,到不了这里)
        return "xx"
    return "ja?"  # 汉字原名但无产地信号:暂按日本(宁漏不误杀),每日复查


def main() -> None:
    if not BD_CACHE.is_file():
        print(f"!! 缺 bangumi-data 缓存({BD_CACHE}),先跑 bgm_dataset.fetch_dataset()", file=sys.stderr)
        sys.exit(1)
    bd_ids = {
        int(s["id"])
        for it in (json.loads(BD_CACHE.read_text(encoding="utf-8")).get("items") or [])
        for s in (it.get("sites") or [])
        if s.get("site") == "bangumi" and s.get("id")
    }

    enh = json.loads(ENHANCE.read_text(encoding="utf-8"))
    entries = enh.get("entries") or {}
    regions: dict[str, str] = enh.get("regions") or {}

    try:
        cal = api_get("/calendar")
    except Exception as e:  # bgm 偶发吐 HTML 错误页/超时:当天跳过,别拖垮整个每日任务
        print(f"::warning::bgm /calendar 拉取失败,本日跳过产地标注:{type(e).__name__}: {e}", file=sys.stderr)
        return
    cal_items = [(it["id"], it.get("name_cn") or it.get("name") or "") for day in cal for it in (day.get("items") or [])]

    # 待查:放送表上 bangumi-data 与 yuc/wiki 都不认识,且没查过或上次是暂定 ja?
    todo = [
        (i, n)
        for i, n in cal_items
        if i not in bd_ids and str(i) not in entries and regions.get(str(i), "ja?") == "ja?"
    ]
    print(f"[region] calendar {len(cal_items)} 条,待判定 {len(todo)} 条")

    marked = 0
    for sid, name in todo:
        try:
            subject = api_get(f"/v0/subjects/{sid}")
        except Exception as e:  # 单条失败跳过,下次每日运行重试
            print(f"  ?? {sid} {name}: {e}", file=sys.stderr)
            continue
        verdict = classify(subject)
        regions[str(sid)] = verdict
        if not verdict.startswith("ja"):
            marked += 1
        print(f"  {verdict} {sid} {name}")
        time.sleep(0.4)

    enh["regions"] = dict(sorted(regions.items(), key=lambda kv: int(kv[0])))
    ENHANCE.write_text(json.dumps(enh, ensure_ascii=False, indent=1), encoding="utf-8")
    nonja = sum(1 for v in regions.values() if not v.startswith("ja"))
    print(f"[region] 本次标注 {len(todo)} 条(非日本 {marked}),累计 {len(regions)} 条(非日本 {nonja})")
    print(f"[region] wrote {ENHANCE}")


if __name__ == "__main__":
    main()
