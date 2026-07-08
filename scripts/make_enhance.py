"""
把 align.py 产出的 aligned JSON 转成前端用的增强数据 public/data/enhance.json。

用法：
  python scripts/make_enhance.py data/2026Q3.aligned.json

输出格式(按 Bangumi subject id 索引,前端启动时静默加载):
  { "season": "202607", "generated_at": "...",
    "entries": { "<bgmId>": { "tags": [...], "pv": "...", "sourceType": "..." } } }
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
    entries: dict[str, dict] = {}
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
        if entry:
            entries[str(bgm["id"])] = entry

    out = {
        "season": data.get("season"),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "entries": entries,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[enhance] wrote {args.out} ({len(entries)} entries, {skipped} unmatched skipped)")


if __name__ == "__main__":
    main()
