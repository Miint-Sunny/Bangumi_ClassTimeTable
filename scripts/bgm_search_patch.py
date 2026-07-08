"""
用 Bangumi 官方搜索 API 为 aligned JSON 里未匹配的番剧出候选。

  python scripts/bgm_search_patch.py data/2026Q3.aligned.json            # 打印候选
  python scripts/bgm_search_patch.py data/2026Q3.aligned.json --apply map.json
      # map.json: { "<yuc title>": <subject_id | null> },人工判读后回填

只调官方 API(api.bgm.tv),带 UA、逐条 0.4s 间隔,结果缓存到 scripts/cache/search/。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

UA = "Miint-Sunny/Bangumi_ClassTimeTable (https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)"
CACHE = Path(__file__).resolve().parent / "cache" / "search"

SUFFIX_RE = re.compile(r"(第?\s*[0-9一二三四五六七八九十]+期|Part\.?\s*\d+|P\d+|#\d+~?\d*|第\d+クール|[0-9]+)\s*$")


def clean_kw(title: str) -> str:
    t = re.sub(r"\s+", " ", title).strip()
    for _ in range(2):
        t = SUFFIX_RE.sub("", t).strip()
    return t or title


def search(keyword: str) -> list[dict]:
    key = hashlib.md5(keyword.encode()).hexdigest()[:16]
    cache_file = CACHE / f"{key}.json"
    if cache_file.is_file():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    body = json.dumps({
        "keyword": keyword,
        "filter": {"type": [2]},
    }).encode()
    req = urllib.request.Request(
        "https://api.bgm.tv/v0/search/subjects?limit=6",
        data=body,
        headers={"User-Agent": UA, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
    except Exception as e:  # noqa: BLE001
        print(f"  !! search failed for {keyword!r}: {e}")
        return []
    out = [
        {
            "id": it.get("id"),
            "name": it.get("name"),
            "name_cn": it.get("name_cn"),
            "date": it.get("date"),
        }
        for it in data.get("data") or []
    ]
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.4)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("aligned_json", type=Path)
    parser.add_argument("--apply", type=Path, help="人工判读后的 title→id 映射 JSON")
    args = parser.parse_args()

    data = json.loads(args.aligned_json.read_text(encoding="utf-8"))

    if args.apply:
        mapping = json.loads(args.apply.read_text(encoding="utf-8"))
        patched = 0
        for s in data["shows"]:
            if s.get("bangumi"):
                continue
            sid = mapping.get(s["title"])
            if sid:
                s["bangumi"] = {
                    "id": str(sid),
                    "url": f"https://bgm.tv/subject/{sid}",
                    "type": "tv",
                    "title_ja": s.get("title_jp"),
                    "title_zh_hans": [],
                    "begin": None,
                    "matched_by": "manual_search",
                }
                patched += 1
        args.aligned_json.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"[patch] {args.aligned_json.name}: applied {patched} manual matches")
        return

    for s in data["shows"]:
        if s.get("bangumi"):
            continue
        kw = clean_kw(s.get("title_jp") or s["title"])
        cands = search(kw)
        print(f"\n### {s['title']!r} (jp={s.get('title_jp')!r}, start={s.get('start_date')}, kw={kw!r})")
        for c in cands:
            print(f"    {c['id']}  {c['date']}  {c['name_cn'] or ''} / {c['name']}")


if __name__ == "__main__":
    main()
