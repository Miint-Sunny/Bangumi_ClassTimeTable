"""
把 align.py 产出的 aligned JSON 转成前端用的增强数据 public/data/enhance.json。

用法：
  python scripts/make_enhance.py data/2026Q3.aligned.json

输出格式(按 Bangumi subject id 索引,前端启动时静默加载):
  { "season": "202607", "generated_at": "...",
    "entries": { "<bgmId>": {
      "tags": [...], "pv": "...", "sourceType": "...",
      "yuc": { "start_date": "7/4", "time": "24:00", "broadcast_text": "...", "notes": "..." },
      "air": { ... 放送校正 AirFix,由人/AI 判读 yuc 备注后手工维护 ... }
    } },
    "upcoming": { "season": "202610", "shows": [ { "id", "title", "titleJp", "startDate", "dayOfWeek",
                  "time", "broadcast", "web", "sourceType", "tags", "pv", "official", "cover" } ] } }

重跑安全:已存在的 entries[*].air 字段会原样保留(那是人工判读成果,机器不覆盖)。
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def _iso_date(md: str | None, season: str) -> str | None:
    """yuc 的 '10/3' → '2026-10-03';季度首月之前的月份算下一年(1 月档表里的 12 月先行属上一年,这里不处理)。"""
    if not md or "/" not in md or len(season) != 6:
        return None
    try:
        m, d = (int(x) for x in md.split("/", 1))
        y, sm = int(season[:4]), int(season[4:])
    except ValueError:
        return None
    if m < sm - 1:
        y += 1
    return f"{y:04d}-{m:02d}-{d:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("aligned_json", type=Path, help="align.py 的输出文件")
    parser.add_argument(
        "--out", type=Path,
        default=Path(__file__).resolve().parent.parent / "public" / "data" / "enhance.json",
    )
    args = parser.parse_args()

    data = json.loads(args.aligned_json.read_text(encoding="utf-8"))

    # 增量合并:旧文件整体保留(上季续播番的 tags/epDates、人工 air 校正、顶层
    # regions 产地判定等都不能因为换季重跑而丢),本季 yuc 条目覆盖同 id 的 yuc 字段。
    old: dict = {}
    if args.out.is_file():
        try:
            old = json.loads(args.out.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            old = {}
    old_entries: dict[str, dict] = dict(old.get("entries") or {})
    old_air: dict[str, dict] = {k: v["air"] for k, v in old_entries.items() if v.get("air")}

    entries: dict[str, dict] = old_entries
    skipped = 0
    for show in data.get("shows", []):
        bgm = show.get("bangumi")
        if not bgm or not bgm.get("id"):
            skipped += 1
            continue
        entry = {}
        if show.get("tags"):
            entry["tags"] = show["tags"]
        if show.get("pv_url"):
            entry["pv"] = show["pv_url"]
        if show.get("source_type"):
            entry["sourceType"] = show["source_type"]
        # yuc 原始放送信息透传:给 AI/人判读先行放送等特例用
        yuc = {k: show.get(k) for k in ("start_date", "time", "broadcast_text", "notes") if show.get(k)}
        if yuc:
            entry["yuc"] = yuc
        key = str(bgm["id"])
        if key in old_air:
            entry["air"] = old_air[key]
        if entry:
            entries[key] = entry

    kept_air = sum(1 for e in entries.values() if e.get("air"))

    # 下季新番表(前瞻页用):本次处理的这一季 yuc 全表,按 bgm id 对齐后的精简视图。
    # 只保留对齐成功的条目;日期补上年份(季度首月之前的月份视为跨年)。
    season = str(data.get("season") or "")
    upcoming_shows = []
    for show in data.get("shows", []):
        bgm = show.get("bangumi")
        if not bgm or not bgm.get("id"):
            continue
        upcoming_shows.append({
            "id": int(bgm["id"]),
            "title": show.get("title") or "",
            "titleJp": show.get("title_jp") or "",
            "startDate": _iso_date(show.get("start_date"), season),
            "dayOfWeek": show.get("day_of_week"),
            "time": show.get("time"),
            "broadcast": show.get("broadcast_text"),
            "web": "网络" in (show.get("broadcast_text") or ""),
            "sourceType": show.get("source_type"),
            "tags": show.get("tags") or [],
            "pv": show.get("pv_url"),
            "official": show.get("official_url"),
            "cover": show.get("cover_url"),
        })
    upcoming_shows.sort(key=lambda x: (x["startDate"] or "9999", x["dayOfWeek"] or 9, x["title"]))
    upcoming = {
        "season": season,
        "source": data.get("source") or "yuc.wiki",
        "sourceUrl": data.get("source_url"),
        "scrapedAt": data.get("scraped_at"),
        "shows": upcoming_shows,
    }

    out = {
        **{k: v for k, v in old.items() if k not in ("season", "generated_at", "entries")},
        "season": data.get("season"),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "entries": dict(sorted(entries.items(), key=lambda kv: int(kv[0]))),
        "upcoming": upcoming,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        f"[enhance] wrote {args.out} ({len(entries)} entries, "
        f"{skipped} unmatched skipped, {kept_air} air fixes preserved)"
    )


if __name__ == "__main__":
    main()
