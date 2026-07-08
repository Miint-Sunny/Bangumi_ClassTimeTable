"""
烘焙季度静态数据包 public/data/season-YYYYMM.json,供前端归档浏览。

  python scripts/bake_season.py 202410 202501 202504 202507 202510 202601 202604 202607

数据源:
  - bangumi-data 数据集(scripts/cache/bangumi-data.json,align.py 已下载)
  - 可选 data/YYYYQx.aligned.json(yuc 增强:标签/PV/精确时段,并补 bd 缺失的番)
  - Bangumi 官方 /v0/subjects/{id}(封面/评分/集数;磁盘缓存,0.35s 限速,重跑零请求)

跑完自动重建 public/data/seasons.json 清单。
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

UA = "Miint-Sunny/Bangumi_ClassTimeTable (+https://github.com/Miint-Sunny/Bangumi_ClassTimeTable)"
ROOT = Path(__file__).resolve().parent.parent
CACHE_SUBJ = Path(__file__).resolve().parent / "cache" / "subjects"
BD_CACHE = Path(__file__).resolve().parent / "cache" / "bangumi-data.json"
OUT_DIR = ROOT / "public" / "data"

JST = timezone(timedelta(hours=9))

# 与 src/lib/bangumiData.ts 的 ONAIR_SITES 对应
ONAIR_SITES = {
    "acfun": "AcFun", "bilibili": "哔哩哔哩", "bilibili_hk_mo_tw": "B站港澳台",
    "bilibili_hk_mo": "B站港澳", "bilibili_tw": "B站台湾", "youku": "优酷",
    "qq": "腾讯视频", "iqiyi": "爱奇艺", "mgtv": "芒果TV", "nicovideo": "Niconico",
    "netflix": "Netflix", "gamer": "巴哈动画疯", "gamer_hk": "巴哈(港)",
    "muse_hk": "木棉花(港)", "ani_one": "Ani-One", "crunchyroll": "Crunchyroll",
    "prime": "Prime Video", "abema": "ABEMA", "disneyplus": "Disney+", "unext": "U-NEXT",
}


def season_start(yyyymm: str) -> datetime:
    return datetime(int(yyyymm[:4]), int(yyyymm[4:]), 1, tzinfo=JST)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z").replace(".000000", ".000")


def parse_bd_time(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def period_days(broadcast: str | None) -> int:
    m = re.search(r"P(\d+)D", broadcast or "")
    return int(m.group(1)) if m else 7


def yuc_begin(start_date: str | None, time_str: str | None, ss: datetime) -> datetime | None:
    """yuc 的 '7/6' + '25:00'(JST) → UTC datetime;年份按落在季度窗口推断。"""
    m = re.match(r"^(\d{1,2})/(\d{1,2})$", start_date or "")
    if not m:
        return None
    mo, d = int(m.group(1)), int(m.group(2))
    year = ss.year - 1 if (ss.month == 1 and mo >= 11) else ss.year
    hh, mm = 12, 0  # 无时段时挂正午,标记 timeUnknown 由调用方处理
    known = False
    tm = re.match(r"^(\d{1,2}):(\d{2})$", (time_str or "").strip())
    if tm:
        hh, mm = int(tm.group(1)), int(tm.group(2))
        known = True
    try:
        base = datetime(year, mo, d, tzinfo=JST)
    except ValueError:
        return None
    dt = base + timedelta(hours=hh, minutes=mm)
    return dt if known else None  # 时间未知就不给 begin,让前端归"未定"行


def fetch_subject(sid: int) -> dict:
    CACHE_SUBJ.mkdir(parents=True, exist_ok=True)
    f = CACHE_SUBJ / f"{sid}.json"
    if f.is_file():
        return json.loads(f.read_text(encoding="utf-8"))
    req = urllib.request.Request(
        f"https://api.bgm.tv/v0/subjects/{sid}", headers={"User-Agent": UA}
    )
    trimmed: dict = {}
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = json.loads(resp.read())
        trimmed = {
            "name": raw.get("name"),
            "name_cn": raw.get("name_cn"),
            "eps": raw.get("total_episodes") or raw.get("eps") or None,
            "score": (raw.get("rating") or {}).get("score") or None,
            "rank": (raw.get("rating") or {}).get("rank") or None,
            "image": (raw.get("images") or {}).get("common") or None,
            "date": raw.get("date"),
        }
    except urllib.error.HTTPError as e:
        print(f"  !! subject {sid}: HTTP {e.code}")
    except Exception as e:  # noqa: BLE001
        print(f"  !! subject {sid}: {e}")
    f.write_text(json.dumps(trimmed, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.35)
    return trimmed


def find_aligned(yyyymm: str) -> Path | None:
    yr, mo = yyyymm[:4], int(yyyymm[4:])
    q = (mo - 1) // 3 + 1
    p = ROOT / "data" / f"{yr}Q{q}.aligned.json"
    return p if p.is_file() else None


def bake(yyyymm: str, bd_items: list[dict], enhance_air: dict[str, dict]) -> None:
    ss = season_start(yyyymm)
    lo, hi = ss - timedelta(days=14), ss + timedelta(days=92)
    shows: dict[int, dict] = {}

    # ── bangumi-data:季度窗口内开播的 tv/web ──
    for it in bd_items:
        if it.get("type") not in ("tv", "web"):
            continue
        begin = parse_bd_time(it.get("begin"))
        if begin is None or not (lo <= begin < hi):
            continue
        bgm_id = 0
        sites = []
        seen_urls = set()
        site_meta = bd_items_meta
        for s in it.get("sites") or []:
            if s.get("site") == "bangumi":
                bgm_id = int(s.get("id") or 0)
            label = ONAIR_SITES.get(s.get("site") or "")
            if not label:
                continue
            meta = site_meta.get(s["site"]) or {}
            url = s.get("url") or (
                meta.get("urlTemplate", "").replace("{{id}}", str(s.get("id")))
                if meta.get("urlTemplate") and s.get("id") else None
            )
            if url and url not in seen_urls:
                seen_urls.add(url)
                sites.append({"site": label, "url": url})
        if not bgm_id:
            continue
        end = parse_bd_time(it.get("end"))
        shows[bgm_id] = {
            "id": bgm_id,
            "nameCn": (it.get("titleTranslate") or {}).get("zh-Hans", [None])[0] or it.get("title"),
            "nameJp": it.get("title"),
            "begin": iso(begin),
            "end": iso(end),
            "periodDays": period_days(it.get("broadcast")),
            "officialSite": it.get("officialSite") or None,
            "sites": sites,
        }

    # ── yuc aligned:标签/PV/时段增强,并补 bd 缺失的当季番 ──
    aligned = find_aligned(yyyymm)
    if aligned:
        ydata = json.loads(aligned.read_text(encoding="utf-8"))
        for s in ydata.get("shows", []):
            bgm = s.get("bangumi") or {}
            sid = int(bgm.get("id") or 0)
            if not sid:
                continue
            entry = shows.get(sid)
            is_seasonal = s.get("span_type") in ("seasonal", "streaming") or bool(s.get("start_date"))
            if entry is None:
                if not is_seasonal:
                    continue  # yuc 的跨季续播行,归属其原季数据包
                begin = yuc_begin(s.get("start_date"), s.get("time"), ss)
                entry = shows[sid] = {
                    "id": sid,
                    "nameCn": s.get("title"),
                    "nameJp": s.get("title_jp") or s.get("title"),
                    "begin": iso(begin),
                    "end": None,
                    "periodDays": 7,
                    "officialSite": s.get("official_url") or None,
                    "sites": [],
                    "airWeekdayJst": s.get("day_of_week"),
                }
            if s.get("tags"):
                entry["tags"] = s["tags"]
            if s.get("pv_url"):
                entry["pv"] = s["pv_url"]
            if s.get("source_type"):
                entry["sourceType"] = s["source_type"]
            if s.get("span_type") == "streaming":
                entry["streaming"] = True
        print(f"[{yyyymm}] merged yuc {aligned.name}")

    # ── 当季 enhance.json 里人工判读的 air 校正(仅当季匹配时) ──
    for sid_str, air in enhance_air.items():
        sid = int(sid_str)
        if sid in shows:
            shows[sid]["air"] = air

    # ── 官方 subject API:封面/评分/集数 ──
    miss = 0
    for sid, entry in shows.items():
        info = fetch_subject(sid)
        if not info:
            miss += 1
            continue
        entry["image"] = info.get("image")
        entry["score"] = info.get("score")
        entry["rank"] = info.get("rank")
        entry["epsTotal"] = info.get("eps")
        if info.get("name_cn"):
            entry["nameCn"] = info["name_cn"]

    out = {
        "season": yyyymm,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "shows": sorted(shows.values(), key=lambda x: (x.get("begin") or "9999", x["id"])),
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"season-{yyyymm}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[{yyyymm}] wrote {out_path.name}: {len(shows)} shows ({miss} subject misses)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("seasons", nargs="+", help="YYYYMM …")
    args = parser.parse_args()

    if not BD_CACHE.is_file():
        parser.error(f"缺 bangumi-data 缓存: {BD_CACHE}(先跑一次 align.py)")
    raw = json.loads(BD_CACHE.read_text(encoding="utf-8"))
    global bd_items_meta
    bd_items_meta = raw.get("siteMeta") or {}
    bd_items = raw.get("items") or raw

    enhance_air: dict[str, dict] = {}
    enh_path = OUT_DIR / "enhance.json"
    if enh_path.is_file():
        enh = json.loads(enh_path.read_text(encoding="utf-8"))
        for k, v in (enh.get("entries") or {}).items():
            if v.get("air"):
                enhance_air[k] = v["air"]

    for yyyymm in args.seasons:
        if not re.fullmatch(r"\d{6}", yyyymm):
            print(f"skip 非法季度 {yyyymm}")
            continue
        bake(yyyymm, bd_items, enhance_air)

    manifest = sorted(
        (p.stem.removeprefix("season-") for p in OUT_DIR.glob("season-*.json")),
        reverse=True,
    )
    (OUT_DIR / "seasons.json").write_text(
        json.dumps({"seasons": manifest}, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[manifest] seasons.json: {manifest}")


if __name__ == "__main__":
    main()
