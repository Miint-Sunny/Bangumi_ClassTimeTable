"""
从 bgm.wiki 开发者 API 同步每集精确放送时刻,写入 enhance.json 的 air.epDates。

  BGM_WIKI_TOKEN=xxx python3 scripts/bgmwiki_sync.py              # 增量:[now-7d, now+14d]
  BGM_WIKI_TOKEN=xxx python3 scripts/bgmwiki_sync.py --backfill   # 回填:季度起点-30d → now+21d

设计:
  - 每集取全平台"最早"事件时刻(= 最早可观看,天然涵盖先行配信/一举多话)
  - 与线性模型(bangumi-data begin + 周期)偏差 > 30 分钟才写入 epDates,JSON 保持精简
  - air 里人工维护的 advanceEps/anchor/note/source 一律保留;epDates 为机器所有,每次重建
  - token 只从环境变量读,绝不落盘/打印
  - 窗口上限 7 天,逐窗 0.5s 间隔;每日增量 3 个窗口,配额压力≈0

数据来源与致谢:https://bgm.wiki(番組維基)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = "https://bgm.wiki/api"
UA = "Miint-Sunny/Bangumi_ClassTimeTable (+https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)"
ROOT = Path(__file__).resolve().parent.parent
ENHANCE = ROOT / "public" / "data" / "enhance.json"
BD_CACHE = Path(__file__).resolve().parent / "cache" / "bangumi-data.json"

WINDOW_DAYS = 7
DEVIATION_MS = 30 * 60 * 1000  # 超过 30 分钟视为偏差


def api_get(path: str, token: str, params: dict | None = None) -> dict:
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "User-Agent": UA,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_events(token: str, start: datetime, end: datetime) -> list[dict]:
    """按 ≤7 天分窗拉取时间窗口事件。"""
    events: list[dict] = []
    cur = start
    n = 0
    while cur < end:
        nxt = min(cur + timedelta(days=WINDOW_DAYS), end)
        data = api_get("/schedule/window", token, {
            "from": int(cur.timestamp() * 1000),
            "to": int(nxt.timestamp() * 1000),
        })
        chunk = data.get("events") or []
        events.extend(chunk)
        n += 1
        print(f"[bgm.wiki] window {cur:%m/%d} → {nxt:%m/%d}: {len(chunk)} events")
        cur = nxt
        time.sleep(0.5)
    print(f"[bgm.wiki] {n} windows, {len(events)} events total")
    return events


def earliest_per_episode(events: list[dict]) -> dict[int, dict[int, int]]:
    """bgmId → { ep → 最早事件时刻(ms) }。只收正整数集号。"""
    out: dict[int, dict[int, int]] = {}
    for e in events:
        bid = e.get("bgmId")
        sort = e.get("episodeSort")
        ts = e.get("eventTsMs")
        if not bid or ts is None or sort is None:
            continue
        if isinstance(sort, float) and not sort.is_integer():
            continue  # SP/0.5 话不参与集数模型
        ep = int(sort)
        if ep < 1:
            continue
        eps = out.setdefault(int(bid), {})
        if ep not in eps or ts < eps[ep]:
            eps[ep] = ts
    return out


def load_linear_model() -> dict[int, tuple[int, int]]:
    """bangumi-data:bgmId → (begin_ms, period_ms)。"""
    if not BD_CACHE.is_file():
        print(f"!! 缺 bangumi-data 缓存({BD_CACHE}),所有集都会按无模型处理", file=sys.stderr)
        return {}
    raw = json.loads(BD_CACHE.read_text(encoding="utf-8"))
    model: dict[int, tuple[int, int]] = {}
    for it in raw.get("items") or []:
        begin = it.get("begin") or ""
        try:
            begin_ms = int(datetime.fromisoformat(begin.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            continue
        m = re.search(r"P(\d+)D", it.get("broadcast") or "")
        period_ms = int(m.group(1)) * 86400_000 if m else 7 * 86400_000
        for s in it.get("sites") or []:
            if s.get("site") == "bangumi" and s.get("id"):
                model[int(s["id"])] = (begin_ms, period_ms)
    return model


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--backfill", action="store_true", help="回填整季(季度起点-30d 起)")
    args = parser.parse_args()

    token = os.environ.get("BGM_WIKI_TOKEN", "").strip()
    if not token:
        parser.error("缺 BGM_WIKI_TOKEN 环境变量")

    now = datetime.now(timezone.utc)
    if args.backfill:
        cfg = api_get("/season/runtime-config", token)
        cur_slug = None
        for r in cfg.get("seasonRanges") or []:
            if r["startAt"] <= now.isoformat() <= r["endAt"]:
                cur_slug = r
                break
        start = (datetime.fromisoformat(cur_slug["startAt"].replace("Z", "+00:00")) - timedelta(days=30)) if cur_slug else now - timedelta(days=60)
        end = now + timedelta(days=21)
    else:
        start, end = now - timedelta(days=7), now + timedelta(days=14)

    events = fetch_events(token, start, end)
    actual = earliest_per_episode(events)
    linear = load_linear_model()

    enh = json.loads(ENHANCE.read_text(encoding="utf-8")) if ENHANCE.is_file() else {"entries": {}}
    entries = enh.setdefault("entries", {})

    stats = {"shows": 0, "eps": 0, "no_model": 0, "max_dev_h": 0.0}
    touched: set[str] = set()

    for bid, eps in sorted(actual.items()):
        key = str(bid)
        model = linear.get(bid)
        fixes: dict[str, str] = {}
        for ep, ts in sorted(eps.items()):
            if model:
                derived = model[0] + (ep - 1) * model[1]
                dev = abs(ts - derived)
                if dev <= DEVIATION_MS:
                    continue
                stats["max_dev_h"] = max(stats["max_dev_h"], dev / 3600_000)
            else:
                stats["no_model"] += 1
            fixes[str(ep)] = iso(ts)

        entry = entries.setdefault(key, {})
        air = entry.setdefault("air", {})
        old = air.get("epDates") or {}
        merged = {**old, **fixes}  # 增量窗口只更新窗内集,窗外历史保留
        if merged:
            air["epDates"] = merged
            air.setdefault("source", "https://bgm.wiki")
            stats["shows"] += 1
            stats["eps"] += len(fixes)
            touched.add(key)
        elif not any(k for k in air if k != "epDates"):
            entry.pop("air", None)
        if not entry:
            entries.pop(key, None)

    enh["bgmwiki_synced_at"] = now.isoformat().replace("+00:00", "Z")
    ENHANCE.write_text(json.dumps(enh, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        f"[sync] epDates 覆盖 {stats['shows']} 部 / {stats['eps']} 集偏差修正 "
        f"(无线性模型 {stats['no_model']} 集直录, 最大偏差 {stats['max_dev_h']:.1f}h)"
    )
    print(f"[sync] wrote {ENHANCE}")


if __name__ == "__main__":
    main()
