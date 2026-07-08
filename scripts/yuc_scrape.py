"""
yuc.wiki 新番表解析器
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
作用：读本地保存的 yuc.wiki 季度页 HTML，输出结构化 JSON。
运行：python scrape_yuc.py path/to/2026Q2.html            → data/2026Q2.json
      python scrape_yuc.py path/to/file.html --season 202604
      python scrape_yuc.py path/to/file.html --out out.json

不自动联网 —— 请自行把 yuc 页面另存为 HTML 后喂进来。
"""

import re
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

from bs4 import BeautifulSoup


SOURCE_NAME = "yuc.wiki"

# 周几中日对照：yuc 用日文曜日标记段落（ISO: 周一=1 ... 周日=7）
WEEKDAY_MAP = {
    "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6, "日": 7,
}

# 题材标签 / 改编来源走页面自带的 type_tag_r / type_a_r..type_e_r，不再维护本地词表


SEASON_RE = re.compile(r"(\d{4})年(\d{1,2})月")


def infer_season(html: str) -> str | None:
    """从 <title> 或正文里找"YYYY年M月"，返回 YYYYMM。"""
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.find("title")
    candidates = []
    if title_el:
        candidates.append(title_el.get_text(strip=True))
    h1 = soup.find(["h1", "h2"])
    if h1:
        candidates.append(h1.get_text(strip=True))
    for text in candidates + [html[:4000]]:
        m = SEASON_RE.search(text)
        if m:
            return f"{m.group(1)}{int(m.group(2)):02d}"
    return None


DATE_TAG_RE = re.compile(r"^\((.+)\)$")
DATE_MD_RE = re.compile(r"^(\d{1,2})/(\d{1,2})$")
FULL_COUNT_RE = re.compile(r"全\s*\d+\s*话")


def _clean_tilde(s: str) -> str:
    return s.strip().rstrip("~～").strip()


def _classify_span(start_date: str | None, notes: str | None,
                   season_start_month: int) -> str:
    if notes:
        if any(k in notes for k in ("年番", "泡面", "年度")):
            return "annual"
        if "长篇" in notes or FULL_COUNT_RE.search(notes):
            return "long_run"
        return "other"
    if start_date:
        m = DATE_MD_RE.match(start_date)
        if m:
            mo = int(m.group(1))
            if mo < season_start_month or mo > season_start_month + 2:
                return "carry_over"
    return "seasonal"


def _extract_title(td) -> str:
    """把 <td class="date_title_"> 里的 <br/> 当作空格，再取文本。"""
    for br in td.find_all("br"):
        br.replace_with(" ")
    return re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip()


def _img_url(img) -> str | None:
    if img is None:
        return None
    return img.get("data-src") or img.get("src") or None


def _norm_title(s: str | None) -> str:
    """标题归一化：去空白/全角标点差异，用于两区交叉匹配。"""
    if not s:
        return ""
    s = re.sub(r"\s+", "", s)
    s = s.replace("：", ":").replace("！", "!").replace("？", "?")
    return s


def parse_detail_cards(html: str) -> list[dict]:
    """
    解析页面下半部"新番介绍"卡片区。

    锚点：每张卡片有且仅有一个 <td class="type_tag_r">，据此反推父 table。
    title / source_type / staff 的 CSS class 有 _r / _r1.._r4 等排版变体，
    用 class 前缀通配吞进来。
    """
    soup = BeautifulSoup(html, "html.parser")
    cards: list[dict] = []

    for tag_td in soup.select("td.type_tag_r"):
        table = tag_td.find_parent("table")
        if table is None:
            continue

        title_cn_p = table.select_one('p[class^="title_cn"]')
        title_jp_p = table.select_one('p[class^="title_jp"]')
        title_cn = title_cn_p.get_text(" ", strip=True) if title_cn_p else ""
        title_jp = title_jp_p.get_text(" ", strip=True) if title_jp_p else None

        # source_type：td[class^="type_"] 里排除 type_tag_r
        source_type = None
        for td in table.select('td[class^="type_"]'):
            classes = td.get("class") or []
            if any(c == "type_tag_r" for c in classes):
                continue
            source_type = td.get_text(strip=True)
            break

        tags_raw = tag_td.get_text(strip=True)
        tags = [t.strip() for t in re.split(r"[／/、,，]", tags_raw) if t.strip()]

        # 链接区：按 <a> 文案分 official / pv
        official_url = None
        pv_url = None
        for a in table.select("td.link_a_r a[href]"):
            text = a.get_text(strip=True)
            href = a["href"]
            if "PV" in text or "pv" in text:
                pv_url = pv_url or href
            elif "官网" in text or "官方" in text:
                official_url = official_url or href
            else:
                official_url = official_url or href

        broadcast_p = table.select_one("p.broadcast_r")
        broadcast_text = broadcast_p.get_text(" ", strip=True) if broadcast_p else None

        # 封面是卡片 table 前一个兄弟 div 里的 <img width=180px>
        cover_url = None
        prev_div = table.find_previous("div", style=lambda s: s and "float:left" in s.replace(" ", ""))
        if prev_div:
            img = prev_div.find("img")
            cover_url = _img_url(img)

        cards.append({
            "title_cn": title_cn,
            "title_jp": title_jp,
            "source_type": source_type,
            "tags": tags,
            "official_url": official_url,
            "pv_url": pv_url,
            "broadcast_text": broadcast_text,
            "cover_url_large": cover_url,
        })

    return cards


def _build_card_index(cards: list[dict]) -> dict[str, dict]:
    """归一化中文标题 → 卡片。同标题冲突时取后者（卡片顺序里通常首行更"短"的简写）。"""
    idx: dict[str, dict] = {}
    for c in cards:
        key = _norm_title(c.get("title_cn"))
        if key:
            idx[key] = c
    return idx


def _match_card(show_title: str, card_index: dict[str, dict]) -> dict | None:
    """时间表 title 匹配卡片：精确/包含/被包含 三级。"""
    key = _norm_title(show_title)
    if not key:
        return None
    if key in card_index:
        return card_index[key]
    for ck, card in card_index.items():
        if ck and (ck in key or key in ck):
            return card
    return None


STREAMING_DATE_RE = re.compile(r"(\d{1,2}/\d{1,2})")


def _base_show(current_day: int | None) -> dict:
    return {
        "day_of_week": current_day,
        "time": None,
        "start_date": None,
        "span_type": "seasonal",
        "title": "",
        "title_jp": None,
        "source_type": None,
        "tags": [],
        "platform": None,
        "cover_url": None,
        "official_url": None,
        "pv_url": None,
        "broadcast_text": None,
        "notes": None,
        "source": SOURCE_NAME,
    }


def _fill_common(show: dict, block) -> None:
    """标题/平台/官网链接：两种布局共用。"""
    title_td = block.select_one('td[class^="date_title"]')
    if title_td:
        show["title"] = _extract_title(title_td)

    area_ps = block.select("tr.tr_area p.area")
    if area_ps:
        show["platform"] = area_ps[0].get_text(strip=True)
        if len(area_ps) > 1:
            extra = ", ".join(p.get_text(strip=True) for p in area_ps[1:])
            show["notes"] = f"{show['notes']}; {extra}" if show["notes"] else f"+{extra}"

    link = block.select_one("tr.tr_area a[href]")
    if link:
        show["official_url"] = link["href"]


def _parse_regular_block(block, date_div, current_day,
                         season_start_month) -> dict:
    """有 div_date 的常规周番：时段 + 首播日期 + 封面。"""
    show = _base_show(current_day)

    # imgtext4/imgtext5、imgep/imgep2 变体
    time_p = date_div.select_one('p[class^="imgtext"]')
    date_p = date_div.select_one('p[class^="imgep"]')
    if time_p:
        show["time"] = _clean_tilde(time_p.get_text()).replace("：", ":")
    if date_p is not None:
        raw = _clean_tilde(date_p.get_text())
        m = DATE_TAG_RE.match(raw)
        if m:
            show["notes"] = m.group(1).strip()
        elif raw:
            show["start_date"] = raw

    show["cover_url"] = _img_url(date_div.find("img"))
    _fill_common(show, block)
    show["span_type"] = _classify_span(
        show["start_date"], show["notes"], season_start_month
    )
    return show


def _parse_streaming_block(block, date_div, current_day,
                           season_start_month) -> dict:
    """div_date_（双下划线）布局：Netflix/流媒体番，无时段、以 pmfs2 标放送日。"""
    show = _base_show(current_day=None)  # 流媒体不按周几

    show["cover_url"] = _img_url(date_div.find("img"))

    pmfs = block.select_one('p[class^="pmfs"]')
    if pmfs:
        raw = pmfs.get_text(strip=True)
        m = STREAMING_DATE_RE.search(raw)
        if m:
            show["start_date"] = m.group(1)

    pmex = block.select_one("p.pmex")
    if pmex:
        extra = pmex.get_text(" ", strip=True).strip("()（）").strip()
        if extra:
            show["notes"] = extra

    _fill_common(show, block)
    show["span_type"] = "streaming"
    return show


def _parse_show_block(block, current_day: int | None,
                      season_start_month: int) -> dict | None:
    """把一个 <div style='float:left'> show 块解析成 dict(两种布局分派)。"""
    regular = block.find("div", class_="div_date")  # 精确 token
    if regular is not None:
        return _parse_regular_block(block, regular, current_day, season_start_month)

    alt = block.select_one('div[class^="div_date"]')
    if alt is not None:
        return _parse_streaming_block(block, alt, current_day, season_start_month)

    return None


def parse_shows(html: str, season_start_month: int = 1) -> tuple[list[dict], dict]:
    """
    从 yuc.wiki 季度页 HTML 里提取番剧列表。

    两步：
      1. 解析上半部"时间表"获得 time/date/platform/cover
      2. 解析下半部"新番介绍卡片"获得 title_jp/source_type/tags/pv
      3. 按中文标题把卡片元数据合并到时间表 show 上

    返回 (shows, stats)，stats 记录匹配情况用于诊断。
    """
    soup = BeautifulSoup(html, "html.parser")
    article = soup.select_one("article") or soup

    # --- 第 2 步：先把详细卡片拿全，建索引 ---
    cards = parse_detail_cards(html)
    card_index = _build_card_index(cards)
    matched_cards: set[int] = set()

    shows: list[dict] = []
    current_day: int | None = None
    day_char_re = re.compile(r"\(([月火水木金土日])\)")

    # --- 第 1 步：按 DOM 顺序扫时间表 ---
    for el in article.find_all(["table", "div"], recursive=True):
        if el.name == "table" and "date_" in (el.get("class") or []):
            td = el.select_one("td.date2")
            if td:
                m = day_char_re.search(td.get_text())
                if m:
                    current_day = WEEKDAY_MAP.get(m.group(1))
            continue

        if el.name == "div":
            style = el.get("style") or ""
            if "float:left" not in style.replace(" ", ""):
                continue
            # 两种布局都要接：常规(.div_date) 与 流媒体(.div_date_ 等)
            if el.select_one('div[class^="div_date"]') is None:
                continue
            if el.select_one('td[class^="date_title"]') is None:
                continue
            show = _parse_show_block(el, current_day, season_start_month)
            if show and show.get("title"):
                # --- 第 3 步：合并卡片 ---
                card = _match_card(show["title"], card_index)
                if card is not None:
                    matched_cards.add(id(card))
                    show["title_jp"] = card.get("title_jp")
                    show["source_type"] = card.get("source_type")
                    show["tags"] = card.get("tags") or []
                    show["pv_url"] = card.get("pv_url")
                    show["broadcast_text"] = card.get("broadcast_text")
                    # 卡片的链接更权威，时间表的官网链接常指向平台而非官网
                    if card.get("official_url"):
                        show["official_url"] = card["official_url"]
                shows.append(show)

    stats = {
        "timetable_shows": len(shows),
        "detail_cards": len(cards),
        "shows_matched": sum(1 for s in shows if s["source_type"] is not None),
        "cards_unmatched": [
            c["title_cn"] for c in cards if id(c) not in matched_cards
        ],
    }
    return shows, stats


def scrape(html: str, yyyymm: str, source_url: str | None = None) -> dict:
    season_start_month = int(yyyymm[4:])
    shows, stats = parse_shows(html, season_start_month=season_start_month)
    print(
        f"[yuc] timetable={stats['timetable_shows']} cards={stats['detail_cards']} "
        f"matched={stats['shows_matched']} "
        f"cards_unmatched={len(stats['cards_unmatched'])}",
        flush=True,
    )
    if stats["cards_unmatched"]:
        sample = ", ".join(stats["cards_unmatched"][:5])
        more = "" if len(stats["cards_unmatched"]) <= 5 else f" ... +{len(stats['cards_unmatched'])-5}"
        print(f"[yuc]   unmatched cards sample: {sample}{more}", flush=True)
    return {
        "season": yyyymm,
        "scraped_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": SOURCE_NAME,
        "source_url": source_url,
        "count": len(shows),
        "shows": shows,
        "match_stats": stats,
    }


def _default_out_path(yyyymm: str) -> Path:
    yr, mo = yyyymm[:4], int(yyyymm[4:])
    quarter = (mo - 1) // 3 + 1
    return Path(__file__).resolve().parent / "data" / f"{yr}Q{quarter}.json"


def main():
    parser = argparse.ArgumentParser(
        description="解析本地保存的 yuc.wiki 季度新番表 HTML → JSON",
    )
    parser.add_argument("html_path", type=Path, help="yuc.wiki 页面另存的 HTML 文件")
    parser.add_argument("--season", help="YYYYMM(如 202604);不给则从 <title>/页面推断")
    parser.add_argument("--out", type=Path, help="输出 JSON 路径(默认 data/YYYYQx.json)")
    parser.add_argument("--source-url", help="记录到 JSON 的原始 URL(可选)")
    args = parser.parse_args()

    if not args.html_path.is_file():
        parser.error(f"HTML 文件不存在: {args.html_path}")

    html = args.html_path.read_text(encoding="utf-8")
    yyyymm = args.season or infer_season(html)
    if not yyyymm or not re.fullmatch(r"\d{6}", yyyymm):
        parser.error(
            "无法从 HTML 推断季度,请用 --season YYYYMM 显式指定"
            f"(推断值: {yyyymm!r})"
        )

    out_path = args.out or _default_out_path(yyyymm)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    result = scrape(html, yyyymm, source_url=args.source_url)
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[yuc] wrote {out_path} ({result['count']} shows)")


if __name__ == "__main__":
    main()
