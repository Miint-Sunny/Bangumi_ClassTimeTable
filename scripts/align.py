"""
对齐 yuc 抓取的季度 shows 与 bangumi-data 数据集,为每条 show 挂上 Bangumi subject id。

用法：
  python align.py yuc/data/2026Q2.json                       # 默认输出 data/2026Q2.aligned.json
  python align.py yuc/data/2026Q2.json --out path/to/foo.json
  python align.py yuc/data/2026Q2.json --refresh             # 强制重下 bangumi-data 数据集

首次运行会从 jsDelivr CDN 拉 bangumi-data/dist/data.json 缓存到 bangumi/data.json。
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from bgm_dataset import (
    DEFAULT_CACHE,
    bangumi_subject_id,
    build_title_indexes,
    fetch_dataset,
    filter_by_season,
    load_dataset,
    match_show,
)


def enrich(item: dict, method: str) -> dict:
    bgm_id = bangumi_subject_id(item)
    return {
        "id": bgm_id,
        "url": f"https://bgm.tv/subject/{bgm_id}" if bgm_id else None,
        "type": item.get("type"),
        "title_ja": item.get("title"),
        "title_zh_hans": (item.get("titleTranslate") or {}).get("zh-Hans") or [],
        "begin": item.get("begin"),
        "matched_by": method,
    }


def _default_out(season: str) -> Path:
    yr, mo = season[:4], int(season[4:])
    quarter = (mo - 1) // 3 + 1
    return Path("data") / f"{yr}Q{quarter}.aligned.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("yuc_json", type=Path, help="yuc 产出的 JSON,如 yuc/data/2026Q2.json")
    parser.add_argument("--out", type=Path, help="输出 aligned JSON 路径")
    parser.add_argument(
        "--dataset", type=Path, default=DEFAULT_CACHE,
        help=f"bangumi-data JSON 路径(默认 {DEFAULT_CACHE.name},放在 bangumi/)",
    )
    parser.add_argument("--refresh", action="store_true",
                        help="强制重下 bangumi-data 数据集")
    args = parser.parse_args()

    if not args.yuc_json.is_file():
        parser.error(f"yuc JSON 不存在: {args.yuc_json}")

    if args.refresh or not args.dataset.is_file():
        fetch_dataset(args.dataset)

    yuc = json.loads(args.yuc_json.read_text(encoding="utf-8"))
    season = yuc.get("season")
    if not season:
        parser.error("yuc JSON 缺少 season 字段")

    items_all = load_dataset(args.dataset)
    items = filter_by_season(items_all, season)
    indexes = build_title_indexes(items)
    season_year = int(season[:4])

    stats: Counter[str] = Counter()
    unmatched_titles: list[str] = []
    for show in yuc["shows"]:
        item, method = match_show(show, indexes, season_year=season_year)
        if item is not None:
            show["bangumi"] = enrich(item, method)
        else:
            show["bangumi"] = None
            unmatched_titles.append(show.get("title") or "<no title>")
        stats[method or "unmatched"] += 1

    yuc["aligned_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    yuc["bangumi_match_stats"] = {
        "method_counts": dict(stats),
        "window_items": len(items),
        "dataset_total": len(items_all),
        "unmatched_titles": unmatched_titles,
    }

    out = args.out or _default_out(season)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(yuc, ensure_ascii=False, indent=2), encoding="utf-8")

    total = len(yuc["shows"])
    matched = total - stats["unmatched"]
    print(
        f"[align] season={season} shows={total} matched={matched}"
        f" ({matched/total:.0%}) in-window={len(items)}/{len(items_all)}"
    )
    for k, v in stats.most_common():
        print(f"  {k:<14} {v}")
    print(f"[align] wrote {out}")


if __name__ == "__main__":
    main()
