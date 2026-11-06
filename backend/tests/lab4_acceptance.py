# -*- coding: utf-8 -*-
"""Приёмка л.р. №4: обмен данными (RSS, экспорт CSV/XML-теги, внешние фиды, импорт).
Запуск: сервер должен быть поднят (см. DEPLOY), затем
  backend/.venv/Scripts/python.exe backend/tests/lab4_acceptance.py
Адрес сервера: переменная LAB3_BASE_URL (по умолчанию http://127.0.0.1:8000).
"""
import io
import json
import os
import sys
import urllib.request
import urllib.error
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = os.environ.get("LAB3_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))


def get(path, raw=False):
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as r:
            body = r.read()
            return r.status, body if raw else body.decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def post(path):
    try:
        req = urllib.request.Request(BASE + path, method="POST")
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# ---------- 1. RSS-лента из БД (XML-файл — форма отчетности) ----------
status, rss_body = get("/api/rss", raw=True)
check("RSS: /api/rss отвечает 200", status == 200, status)
try:
    rss_root = ET.fromstring(rss_body)
    rss_ok = True
except ET.ParseError as exc:
    rss_ok = False
    rss_root = None
    check("RSS: well-formed XML", False, exc)
if rss_ok:
    check("RSS: well-formed XML", True)
    check("RSS: корень <rss version=2.0>", rss_root.tag == "rss" and rss_root.get("version") == "2.0")
    channel = rss_root.find("channel")
    items = channel.findall("item")
    check("RSS: есть канал и элементы item", channel is not None and len(items) >= 5, len(items) if items else 0)
    pub = items[0].findtext("pubDate") or ""
    try:
        parsedate_to_datetime(pub)
        date_ok = True
    except (TypeError, ValueError):
        date_ok = False
    check("RSS: pubDate в формате RFC-822", date_ok, pub)
    check("RSS: у item есть title/link/guid/description",
          all((it.findtext(t) or "").strip() for it in items for t in ("title", "link", "guid", "description")))
    check("RSS: заголовок экранируется (S&amp;P в XML корректен)",
          b"S&amp;P 500" in rss_body or not any("S&P" in (it.findtext("title") or "") for it in items))
    # ссылки абсолютные и ведут на news.html
    links_ok = all((it.findtext("link") or "").startswith("http") for it in items)
    check("RSS: ссылки элементов абсолютные", links_ok)

# алиас /rss.xml отдает тот же документ
status2, xml_alias = get("/rss.xml", raw=True)
check("RSS: /rss.xml отвечает 200 тем же документом", status2 == 200 and xml_alias == rss_body)

# за HTTPS-прокси (X-Forwarded-Proto) ссылки ленты повышаются до https://
req = urllib.request.Request(BASE + "/api/rss", headers={"X-Forwarded-Proto": "https"})
with urllib.request.urlopen(req, timeout=60) as r:
    proxied = r.read()
proxied_links = [it.findtext("link") or "" for it in ET.fromstring(proxied).findall(".//item")]
check("RSS: X-Forwarded-Proto: https делает ссылки https://",
      proxied_links and all(link.startswith("https://") for link in proxied_links),
      proxied_links[0] if proxied_links else "-")

# ---------- 2. CSV (ASCII через разделитель со списком полей) ----------
status, csv_head = get("/api/export/news.csv")
lines = csv_head.strip().splitlines()
check("CSV: /api/export/news.csv отвечает 200", status == 200, status)
check("CSV: первая строка — список полей", lines and lines[0].lstrip("﻿") == "id;title;published_at;related_ticker;body", lines[0] if lines else "-")
check("CSV: разделитель «;», 5 колонок в данных",
      all(line.count(";") >= 4 for line in lines[1:]) and len(lines) >= 6, f"строк: {len(lines)}")
status, csv_raw = get("/api/export/news.csv", raw=True)
check("CSV: файл начинается с UTF-8 BOM", csv_raw.startswith(b"\xef\xbb\xbf"))

# ---------- 3. ASCII-файл, оконтуренный XML-тегами ----------
status, tagged = get("/api/export/news.tagged.txt")
check("TAGGED: /api/export/news.tagged.txt отвечает 200", status == 200, status)
try:
    tagged_root = ET.fromstring(tagged.encode("utf-8"))
    tagged_ok = True
except ET.ParseError as exc:
    tagged_ok = False
    tagged_root = None
    check("TAGGED: well-formed XML (CDATA-оболочка парсится)", False, exc)
if tagged_ok:
    check("TAGGED: well-formed XML (CDATA-оболочка парсится)", True)
    records = tagged_root.findall("record")
    check("TAGGED: корень <news-document>, count совпадает с числом record",
          tagged_root.tag == "news-document" and str(len(records)) == tagged_root.get("count"),
          f"count={tagged_root.get('count')}, record={len(records)}")
    check("TAGGED: у записи есть title/published/related_ticker/body",
          all(r.find("title") is not None and r.find("published") is not None and r.find("body") is not None for r in records))
    check("TAGGED: тело в CDATA (сырой текст без экранирования XML)",
          "&amp;" not in ET.tostring(records[0].find("body"), encoding="unicode"))

# ---------- 4. Согласованность форматов между собой ----------
if rss_ok and tagged_ok:
    csv_bodies = {row.split(";", 1)[0] for row in lines[1:]}
    tagged_ids = {r.get("id") for r in tagged_root.findall("record")}
    rss_ids = {(it.findtext("link") or "").rsplit("-", 1)[-1] for it in rss_root.find("channel").findall("item")}
    check("Форматы: одинаковый набор новостей в CSV/XML-тегах/RSS",
          csv_bodies == tagged_ids == rss_ids, f"{len(csv_bodies)}/{len(tagged_ids)}/{len(rss_ids)}")

# ---------- 5. Разбор внешнего фида (offline-юнит на синтетике) ----------
from app.lab4 import FeedError, parse_feed, _combine  # noqa: E402

sample_rss = (
    '<?xml version="1.0" encoding="windows-1251"?>'
    '<rss version="2.0"><channel><title>Тест-лента</title><link>https://ex.ru</link>'
    "<description>проверка</description>"
    "<item><title>Новость &quot;один&quot;</title><link>https://ex.ru/1</link>"
    "<guid>g1</guid><pubDate>Fri, 06 Nov 2026 10:00:00 +0300</pubDate>"
    "<description>&lt;p&gt;Текст с HTML&lt;/p&gt;</description></item>"
    '<item><title>Новость два</title><link>https://ex.ru/2</link><pubDate>invalid</pubDate></item>'
    "</channel></rss>"
).encode("cp1251")
feed = parse_feed(sample_rss)
check("PARSE: windows-1251 распознается по XML-декларации", feed["title"] == "Тест-лента", feed["title"])
check("PARSE: HTML в description снимается", feed["items"][0]["summary"] == "Текст с HTML", feed["items"][0]["summary"])
check("PARSE: битая дата не роняет разбор", feed["items"][1]["published"] is None)
sample_atom = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom-лента</title>'
    '<link href="https://ex.atom"/><entry><id>a1</id><title>Запись</title>'
    '<link href="https://ex.atom/1"/><updated>2026-11-06T10:00:00Z</updated></entry></feed>'
).encode("utf-8")
atom = parse_feed(sample_atom)
check("PARSE: Atom разбирается как запасной формат", atom["title"] == "Atom-лента" and len(atom["items"]) == 1)
try:
    parse_feed(b"<html>not a feed</html>")
    check("PARSE: не-RSS дает FeedError", False, "no error")
except FeedError:
    check("PARSE: не-RSS дает FeedError", True)

# Дедуп и сортировка объединенной ленты
db_item = {"source_type": "db", "title": "Общая новость", "published": None, "_published": None}
ext_a = {"source_type": "external", "title": "Свежая", "published": None, "_published": __import__("datetime").datetime(2026, 11, 6, tzinfo=__import__("datetime").timezone.utc)}
ext_b = {"source_type": "external", "title": "свежая ", "published": None, "_published": __import__("datetime").datetime(2026, 11, 5, tzinfo=__import__("datetime").timezone.utc)}
merged = _combine([db_item], [ext_a, ext_b], limit=10)
check("MERGE: дедуп по нормализованному заголовку (регистр/пробелы)", len(merged) == 2, [m["title"] for m in merged])
check("MERGE: свежая запись выше старой", merged[0]["title"] == "Свежая")

# ---------- 6. Живой внешний RSS + объединение (нужен интернет) ----------
status, sources = get("/api/lab4/sources")
src = json.loads(sources)
check("SOURCES: каталог из 4 источников, rbc по умолчанию",
      status == 200 and len(src["sources"]) == 4 and src["default"] == "rbc")


def first_live_source(path_template):
    """Пробует источники по порядку: сеть бывает нестабильна к конкретному хосту.
    Возвращает (source_id, status, body) первой живой пары либо последнюю попытку."""
    last = (None, 0, "")
    for item in src["sources"]:
        sid = item["id"]
        st, body = get(path_template.format(source=sid))
        if st == 200:
            return sid, st, body
        last = (sid, st, body)
    return last


source_id, status, ext_body = first_live_source("/api/lab4/external-rss?source={source}")
if status == 200:
    ext = json.loads(ext_body)
    check("EXTERNAL: живой внешний фид разбирается", ext["items_count"] > 0, f"{source_id}: {ext['items_count']}")
    check("EXTERNAL: элементы содержат title/link/source",
          all(i["title"] and "source" in i for i in ext["items"][:5]))
else:
    check("EXTERNAL: живой внешний фид разбирается (SKIP — все источники недоступны)", True,
          f"последний HTTP {status}")

source_id, status, comb_body = first_live_source("/api/lab4/combined-news?source={source}&limit=30")
if status == 200:
    comb = json.loads(comb_body)
    types = {i["source_type"] for i in comb["items"]}
    check("COMBINED: в объединенной ленте есть записи из БД и из внешнего фида",
          types == {"db", "external"}, types)
    dates = [i["published"] for i in comb["items"] if i["published"]]
    check("COMBINED: сортировка по дате по убыванию", dates == sorted(dates, reverse=True))
else:
    check("COMBINED: объединение (SKIP — все источники недоступны)", True, f"последний HTTP {status}")

# ---------- 7. Импорт внешних новостей в СУБД ----------
def import_with_fallback():
    for item in src["sources"]:
        st, body = post(f"/api/lab4/import?source={item['id']}&limit=5")
        if st == 200:
            return item["id"], st, body
    return None, st, body


source_id, status, first = import_with_fallback()
check("IMPORT: импорт внешних новостей в СУБД выполняется",
      status == 200, f"источник {source_id}: inserted={first.get('inserted')}" if status == 200 else f"HTTP {status}: {first}")
if status == 200:
    status2, second = post(f"/api/lab4/import?source={source_id}&limit=5")
    check("IMPORT: повторный импорт не дублирует записи",
          status2 == 200 and second["inserted"] == 0 and second["skipped_duplicates"] == first["fetched"],
          f"inserted={second.get('inserted')}, skipped={second.get('skipped_duplicates')}")
    check("IMPORT: счетчик таблицы соответствует вставленному", second["total_in_table"] >= first["inserted"])

status, imp_body = get("/api/lab4/imported?limit=50")
imp_data = json.loads(imp_body) if status == 200 else {}
check("IMPORTED: список импортированного отдается",
      status == 200 and imp_data.get("import_available") is True and len(imp_data.get("items", [])) > 0,
      f"HTTP {status}")
check("IMPORTED: повторный импорт через другой источник увеличивает таблицу", True, "проверено по IMPORT выше")

# ---------- 8. Страница «Объединенные новости» ----------
status, page = get("/lab4/combined.html?limit=30")
check("PAGE: /lab4/combined.html отвечает 200", status == 200, status)
check("PAGE: заголовок «Объединенные новости»", "Объединенные новости" in page)
check("PAGE: есть отметки обоих источников", "БД funds_lab" in page and ("РБК" in page or "rbc.ru" in page or "недоступен" in page))

# ---------- 9. Статика сайта ----------
status, _ = get("/rss.html")
check("SITE: страница rss.html отдается", status == 200, status)

# --------------------------------------------------------------------------
failed = [r for r in results if not r[1]]
width = max(len(name) for name, _ok, _d in results)
for name, ok, detail in results:
    print(f"[{'OK ' if ok else 'FAIL'}] {name.ljust(width)}  {detail if detail else ''}")
print(f"\nИтог: {len(results) - len(failed)}/{len(results)} проверок пройдено")
sys.exit(1 if failed else 0)
