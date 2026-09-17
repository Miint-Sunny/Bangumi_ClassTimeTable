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
    } } }

重跑安全:已存在的 entries[*].air 字段会原样保留(那是人工判读成果,机器不覆盖)。
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


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

    out = {
        **{k: v for k, v in old.items() if k not in ("season", "generated_at", "entries")},
        "season": data.get("season"),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "entries": dict(sorted(entries.items(), key=lambda kv: int(kv[0]))),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        f"[enhance] wrote {args.out} ({len(entries)} entries, "
        f"{skipped} unmatched skipped, {kept_air} air fixes preserved)"
    )


if __name__ == "__main__":
    main()
