"""
bangumi-data 数据集管理。

bangumi-data (https://github.com/bangumi-data/bangumi-data) 是一个按季度维护的番剧
元数据集，每条记录带多语言 titleTranslate 和 sites[].bangumi.id(即 Bangumi subject id)。
我们用它做本地标题对齐，避免逐条调 Bangumi API —— 也能离线工作。

数据走 jsDelivr CDN 拉取（不直接爬 Bangumi 网站），首次运行缓存到 bangumi/data.json，
之后用本地文件；--refresh 强制重下。
"""

from __future__ import annotations

import json
import re
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

USER_AGENT = "bangumi-timetable/0.1 (+https://github.com/sunnymiint/bangumi-timetable)"


# 数据源：jsDelivr 走 npm 包路径，比 GitHub raw 稳
DATASET_CDN_URL = "https://cdn.jsdelivr.net/npm/bangumi-data/dist/data.json"
DATASET_FALLBACK_URL = (
    "https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/dist/data.json"
)

DEFAULT_CACHE = Path(__file__).resolve().parent / "cache" / "bangumi-data.json"

_BANGUMI_SITE = "bangumi"


# ── 下载 / 加载 ──────────────────────────────────────────────────────────

def fetch_dataset(dest: Path = DEFAULT_CACHE, timeout: int = 30) -> Path:
    """从 CDN 拉 bangumi-data/dist/data.json 到 dest。"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    for url in (DATASET_CDN_URL, DATASET_FALLBACK_URL):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            dest.write_bytes(data)
            size_kb = len(data) // 1024
            print(f"[bangumi-data] fetched {size_kb} KB from {url}")
            return dest
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"[bangumi-data] fetch failed from {url}: {e}")
    raise RuntimeError(f"所有下载源都失败,最后一次错误: {last_err}")


def load_dataset(path: Path = DEFAULT_CACHE) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    # bangumi-data 的 dist/data.json 顶层直接是数组；少数镜像可能包成 {"items": [...]}
    if isinstance(data, dict) and "items" in data:
        data = data["items"]
    if not isinstance(data, list):
        raise ValueError(f"意外的 bangumi-data 格式: {type(data).__name__}")
    return data


# ── 季度筛选 ──────────────────────────────────────────────────────────────

def _parse_yyyymm(yyyymm: str) -> tuple[int, int]:
    if not re.fullmatch(r"\d{6}", yyyymm):
        raise ValueError(f"非法 yyyymm: {yyyymm!r}")
    return int(yyyymm[:4]), int(yyyymm[4:])


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = (year * 12 + (month - 1)) + delta
    return idx // 12, idx % 12 + 1


def filter_by_season(
    items: list[dict], yyyymm: str, window_before: int = 1, window_after: int = 1
) -> list[dict]:
    """
    按季度窗口筛：默认 [前一个月, 季末后一个月]，容 yuc 的 carry_over 与延期播出。
    季度 = 3 个月：yyyymm=202604 → 4/5/6 月是"正季"，含 3 月(carry_over)到 7 月底。
    """
    year, month = _parse_yyyymm(yyyymm)
    y0, m0 = _add_months(year, month, -window_before)
    y1, m1 = _add_months(year, month, 3 + window_after)  # 上限是排他的
    start = datetime(y0, m0, 1)
    end = datetime(y1, m1, 1)

    out = []
    for it in items:
        begin = it.get("begin") or ""
        if not begin:
            continue
        try:
            dt = datetime.fromisoformat(begin.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            continue
        if start <= dt < end:
            out.append(it)
    return out


# ── 标题归一化 & 索引 ────────────────────────────────────────────────────

_PUNCT_MAP = {
    "：": ":", "！": "!", "？": "?", "，": ",", "。": ".",
    "（": "(", "）": ")", "【": "[", "】": "]",
    "「": '"', "」": '"', "『": '"', "』": '"',
    "·": "", "・": "", "•": "", "～": "~",
    "‐": "-", "–": "-", "—": "-",  # 各种连字符统一
}

# Unicode 罗马数字 → 拉丁字母(用于剥季数识别)
_ROMAN_MAP = {
    "Ⅰ": "i", "Ⅱ": "ii", "Ⅲ": "iii", "Ⅳ": "iv", "Ⅴ": "v",
    "Ⅵ": "vi", "Ⅶ": "vii", "Ⅷ": "viii", "Ⅸ": "ix", "Ⅹ": "x",
    "ⅰ": "i", "ⅱ": "ii", "ⅲ": "iii", "ⅳ": "iv", "ⅴ": "v",
}


def norm_title(s: str | None) -> str:
    if not s:
        return ""
    s = s.strip()
    for a, b in _PUNCT_MAP.items():
        s = s.replace(a, b)
    for a, b in _ROMAN_MAP.items():
        s = s.replace(a, b)
    s = re.sub(r"\s+", "", s)
    return s.lower()


# 续作/季数后缀模式(作用于已归一化的 lowercase 标题)
_SEASON_SUFFIX_PATTERNS = [
    # 中日文带括号或不带:  第X期 / 第X部 / 第Xシーズン / 第Xシリーズ / X期
    r"\(?第[0-9零一二三四五六七八九十]+(期|部|シーズン|シリーズ|季)\)?$",
    r"[0-9]+(期|部|季|シーズン|シリーズ)$",
    # season X / seasonX / -secondseason-
    r"-?season\s*-?[0-9]+-?$",
    r"-?secondseason-?$",
    r"-?thirdseason-?$",
    # actN / actⅡ(已转 ii)
    r"act(ii|iii|iv|v|2|3|4|5)$",
    # part.N / partN
    r"part\.?[0-9]+$",
    # 结尾孤零零的 2/3/4/5 (比如 "ドロヘドロ2","件2")
    r"[0-9]$",
    # 结尾罗马数字拉丁字母
    r"(ii|iii|iv|v|vi|vii|viii)$",
]
_SEASON_SUFFIX_RES = [re.compile(p) for p in _SEASON_SUFFIX_PATTERNS]


def strip_season_suffix(s: str) -> str:
    """从归一化标题中剥掉续作季数后缀。可重复剥(比如先剥'(第4期)'再剥')')。"""
    cur = s
    for _ in range(3):  # 最多剥 3 层,防止死循环
        trimmed = cur
        for pat in _SEASON_SUFFIX_RES:
            trimmed = pat.sub("", trimmed)
        if trimmed == cur:
            break
        cur = trimmed
    return cur


def bangumi_subject_id(item: dict) -> str | None:
    for site in item.get("sites") or []:
        if site.get("site") == _BANGUMI_SITE:
            return site.get("id")
    return None


class TitleIndexes:
    """一组四份倒排索引:zh / ja 各自的完整 key 与剥季数的 base key。"""

    __slots__ = ("zh", "ja", "zh_base", "ja_base")

    def __init__(self) -> None:
        self.zh: dict[str, list[dict]] = defaultdict(list)
        self.ja: dict[str, list[dict]] = defaultdict(list)
        self.zh_base: dict[str, list[dict]] = defaultdict(list)
        self.ja_base: dict[str, list[dict]] = defaultdict(list)


def build_title_indexes(items: list[dict]) -> TitleIndexes:
    """
    建四份索引:
      zh / ja        = 归一化后的完整标题 → items
      zh_base / ja_base = 再剥季数后缀 → items(用于续作兜底)
    """
    idx = TitleIndexes()

    def add(bucket, bucket_base, key):
        if not key:
            return
        bucket[key].append(it)
        base = strip_season_suffix(key)
        if base and base != key:
            bucket_base[base].append(it)

    for it in items:
        if it.get("title"):
            add(idx.ja, idx.ja_base, norm_title(it["title"]))
        tt = it.get("titleTranslate") or {}
        for name in tt.get("ja") or []:
            add(idx.ja, idx.ja_base, norm_title(name))
        for name in (tt.get("zh-Hans") or []) + (tt.get("zh-Hant") or []):
            add(idx.zh, idx.zh_base, norm_title(name))

    return idx


# ── 匹配 ────────────────────────────────────────────────────────────────

_DATE_MD_RE = re.compile(r"^(\d{1,2})/(\d{1,2})$")


def _begin_date(item: dict) -> datetime | None:
    begin = item.get("begin") or ""
    if not begin:
        return None
    try:
        return datetime.fromisoformat(begin.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _yuc_start_date(show: dict, season_year: int) -> datetime | None:
    sd = show.get("start_date")
    if not sd:
        return None
    m = _DATE_MD_RE.match(sd)
    if not m:
        return None
    return datetime(season_year, int(m.group(1)), int(m.group(2)))


def _pick_by_date(candidates: list[dict], target: datetime | None,
                  tolerance_days: int = 10) -> dict | None:
    """从候选里选 begin 距 target 最近的那条(需在容忍窗口内)。"""
    if not candidates:
        return None
    if target is None:
        return candidates[0]  # 无日期约束,按索引顺序
    best = None
    best_diff = None
    for c in candidates:
        b = _begin_date(c)
        if b is None:
            continue
        diff = abs((b - target).days)
        if diff <= tolerance_days and (best_diff is None or diff < best_diff):
            best, best_diff = c, diff
    return best


def match_show(
    show: dict, indexes: TitleIndexes, season_year: int | None = None
) -> tuple[dict | None, str | None]:
    """
    按优先级试匹配,返回 (item, method)。
    method ∈ {exact_zh, exact_ja, substring_zh, substring_ja,
              base_zh_date, base_ja_date, None}
    """
    zh_key = norm_title(show.get("title"))
    ja_key = norm_title(show.get("title_jp"))
    target = _yuc_start_date(show, season_year) if season_year else None

    if zh_key and zh_key in indexes.zh:
        return indexes.zh[zh_key][0], "exact_zh"
    if ja_key and ja_key in indexes.ja:
        return indexes.ja[ja_key][0], "exact_ja"

    if zh_key:
        cands = sorted(
            ((k, v) for k, v in indexes.zh.items() if k and (k in zh_key or zh_key in k)),
            key=lambda kv: -len(kv[0]),
        )
        if cands:
            return cands[0][1][0], "substring_zh"

    if ja_key:
        cands = sorted(
            ((k, v) for k, v in indexes.ja.items() if k and (k in ja_key or ja_key in k)),
            key=lambda kv: -len(kv[0]),
        )
        if cands:
            return cands[0][1][0], "substring_ja"

    # base(剥季数)匹配 + 日期窗口验证 —— 同一作品多季会同 base,用日期筛对应季
    ja_base = strip_season_suffix(ja_key) if ja_key else ""
    if ja_base and ja_base in indexes.ja_base:
        picked = _pick_by_date(indexes.ja_base[ja_base], target)
        if picked is not None:
            return picked, "base_ja_date"

    zh_base = strip_season_suffix(zh_key) if zh_key else ""
    if zh_base and zh_base in indexes.zh_base:
        picked = _pick_by_date(indexes.zh_base[zh_base], target)
        if picked is not None:
            return picked, "base_zh_date"

    return None, None
