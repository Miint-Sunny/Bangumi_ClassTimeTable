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


def clean_ep_map(eps: dict[int, int], period_ms: int, model: tuple[int, int] | None = None) -> dict[int, int]:
    """剔除海外延迟放送/重播事件,只留首播链。

    背景:事件是全平台混录的(日本 TV、全球配信、台配电视台、重播频道…)。
    抓取窗口只有几周宽,老集数的日本首播出窗后,窗内残留的台配/重播事件会被
    误当"最早可看时刻"(实例:名探偵プリキュア 台湾 YOYOTV 落后日本 8 周,
    第 11 话台配与第 19 话日本首播同一个周日,课表上一部番出两集)。

    不依赖地区字段(国产动画无 JP 事件),用两条放送常识:
      B 单调:首播链上集号越高播得越晚;比更高集数还晚出现的低集数是掉队者
      C 节奏:集距 ≥2 而时间间隔远小于每集节奏(<0.4×周期),低集数是掉队者
    集距 =1 不设节奏下限,兼容一挙多话与先行配信。
    加一条模型仲裁(传入 model 时):
      D 更高集数有 ≥2 集与线性模型吻合 ⇒ 该番从未顺延,更低集数却迟到 >2 天的
        只能是海外档(实例:神の雫 东南亚配信落后 4 周,离锚点远时 B/C 判不死)。
        已知取舍:休止后"翌週2本立て"里补播的那一集也会被 D 清掉、回落模型时刻,
        误差一周且极罕见;比幽灵重复上表划算。
    """
    if len(eps) <= 1:
        return dict(eps)
    items = sorted(eps.items())
    # B:自最高集向下扫,时间必须不晚于所有更高集(允许同刻 = 一挙)
    kept: list[tuple[int, int]] = []
    min_ts: int | None = None
    for ep, ts in reversed(items):
        if min_ts is None or ts <= min_ts:
            kept.append((ep, ts))
            min_ts = ts
    kept.reverse()
    # 经验周期:相邻集时间差的中位数(日更番的真实节奏),样本不足退回模型周期
    d1 = sorted(b[1] - a[1] for a, b in zip(kept, kept[1:]) if b[0] - a[0] == 1)
    period = d1[len(d1) // 2] if len(d1) >= 3 else period_ms
    # C:栈式回溯,掉队的低集数出栈
    out: list[tuple[int, int]] = []
    for ep, ts in kept:
        while out and ep - out[-1][0] >= 2 and ts - out[-1][1] < 0.4 * period * (ep - out[-1][0]):
            out.pop()
        out.append((ep, ts))
    # D:模型仲裁
    if model:
        dev = {ep: ts - (model[0] + (ep - 1) * model[1]) for ep, ts in out}
        anchors = [ep for ep, d in dev.items() if abs(d) <= DEVIATION_MS]
        if len(anchors) >= 2:
            top = max(anchors)
            out = [(ep, ts) for ep, ts in out if ep >= top or dev[ep] <= 2 * 86400_000]
    return dict(out)


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


def iso_ms(s: str) -> int:
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000)


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

    stats = {"shows": 0, "eps": 0, "no_model": 0, "purged": 0, "max_dev_h": 0.0}
    touched: set[str] = set()

    for bid, raw_eps in sorted(actual.items()):
        key = str(bid)
        model = linear.get(bid)
        period_ms = model[1] if model else 7 * 86400_000
        eps = clean_ep_map(raw_eps, period_ms, model)  # 窗内先剔除海外延迟/重播链

        entry = entries.setdefault(key, {})
        air = entry.setdefault("air", {})
        old = air.get("epDates") or {}
        # 每集取历史与本窗的最早时刻(窗外先行记录不因窗内重播被顶掉),整链再洗一遍
        # —— 已写盘的旧脏数据也会在这里被清掉
        cand = {int(k): iso_ms(v) for k, v in old.items()}
        for ep, ts in eps.items():
            cand[ep] = min(ts, cand.get(ep, ts))
        cand = clean_ep_map(cand, period_ms, model)

        merged: dict[str, str] = {}
        for ep in sorted(cand):
            ts = cand[ep]
            if model:
                dev = abs(ts - (model[0] + (ep - 1) * model[1]))
                if dev <= DEVIATION_MS:
                    continue  # 与线性模型一致,无须落盘
                stats["max_dev_h"] = max(stats["max_dev_h"], dev / 3600_000)
            elif ep in eps:
                stats["no_model"] += 1
            merged[str(ep)] = iso(ts)
        stats["purged"] += sum(1 for k in old if k not in merged)
        if merged:
            air["epDates"] = merged
            air.setdefault("source", "https://bgm.wiki")
            stats["shows"] += 1
            stats["eps"] += sum(1 for e in merged if int(e) in eps)
            touched.add(key)
        else:
            air.pop("epDates", None)  # 全部清空(如整链皆海外档)也要抹掉旧值
            if set(air) <= {"source"}:  # 人工维护的 advanceEps/anchor/note 保留
                entry.pop("air", None)
        if not entry:
            entries.pop(key, None)

    enh["bgmwiki_synced_at"] = now.isoformat().replace("+00:00", "Z")
    ENHANCE.write_text(json.dumps(enh, ensure_ascii=False, indent=1), encoding="utf-8")
    print(
        f"[sync] epDates 覆盖 {stats['shows']} 部 / {stats['eps']} 集偏差修正 "
        f"(无线性模型 {stats['no_model']} 集直录, 清出延迟放送/旧脏数据 {stats['purged']} 集, "
        f"最大偏差 {stats['max_dev_h']:.1f}h)"
    )
    print(f"[sync] wrote {ENHANCE}")


if __name__ == "__main__":
    main()
