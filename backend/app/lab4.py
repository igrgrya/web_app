"""Лабораторная работа №4 — организация обмена данными между приложениями.

Этапы методички и их реализация:
  1. протокол RSS            — см. страницу rss.html (описание формата);
  2. формат обмена на XML    — RSS 2.0-лента из БД: GET /api/rss и GET /rss.xml;
  3. извлечение из БД        — экспорт таблицы news в форматы обмена:
                               GET /api/export/news.csv        (ASCII с разделителем
                                                                и списком полей),
                               GET /api/export/news.tagged.txt (ASCII, оконтуренный
                                                                XML-тегами, тело в CDATA);
  4. обработка файла         — прикладная обработка внешнего RSS-файла:
                               GET  /api/lab4/external-rss  (скачать + разобрать),
                               GET  /api/lab4/combined-news (объединить с БД),
                               GET  /lab4/combined.html     (готовая HTML-страница
                                                               «Объединенные новости»),
                               POST /api/lab4/import        (загрузка внешних новостей
                                                               в таблицу imported_news).

Реализация на stdlib (urllib + xml.etree): новые зависимости не нужны, бандл
для alwaysdata собирается с прежним requirements.txt.
"""

from csv import QUOTE_MINIMAL, writer as csv_writer
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime, parsedate_to_datetime
from html import unescape
import io
import re
import threading
import urllib.error
import urllib.request
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import Base, engine, get_db
from .models import Instrument, News

MOSCOW_TZ = timezone(timedelta(hours=3))  # даты БД наивные — считаем их московскими

FEED_TITLE = "Funds Lab — новости рынка"
FEED_DESCRIPTION = "Новости рынка фондов и акций из базы данных учебного сайта Funds Lab (лабораторная работа №4)."

MAX_FEED_BYTES = 2 * 1024 * 1024  # внешний фид больше 2 МБ считаем ошибкой
FETCH_TIMEOUT = 10                 # секунды на загрузку внешнего RSS
CACHE_TTL = timedelta(minutes=10)   # сколько времени живёт кэш успешной загрузки
ERROR_CACHE_TTL = timedelta(seconds=60)  # ошибки кэшируем ненадолго: источник мог «моргнуть»

USER_AGENT = "Mozilla/5.0 (compatible; FundsLab/1.0; lab 4 data exchange)"

# Рекомендуемые внешние RSS-источники (рис. 2 — «Внешний RSS файл (берется из Интернета)»).
# РБК и Lenta стабильны для серверных клиентов; interfax/tass иногда блокируют
# python-клиента — в этом случае UI показывает явную ошибку, а не тиходорезку.
EXTERNAL_SOURCES = [
    {"id": "rbc", "name": "РБК — главные новости",
     "url": "https://rssexport.rbc.ru/rbcnews/news/30/full.rss"},
    {"id": "lenta", "name": "Lenta.ru — новости",
     "url": "https://lenta.ru/rss/news"},
    {"id": "interfax", "name": "Интерфакс",
     "url": "https://www.interfax.ru/rss.asp"},
    {"id": "tass", "name": "ТАСС",
     "url": "https://tass.ru/rss/v2.xml"},
]
DEFAULT_SOURCE = EXTERNAL_SOURCES[0]

router = APIRouter(tags=["ЛР4 — обмен данными"])

IMPORT_READ_ONLY_NOTICE = (
    "Импорт внешних новостей на этом хостинге отключён: у пользователя БД нет прав "
    "на запись (read-only). Выдайте права на таблицу imported_news — раздел "
    "«Лабораторная работа №4» в DEPLOY_ALWAYSDATA.md. Остальные разделы работы функционируют."
)


def _base_url(request: Request) -> str:
    """Абсолютный адрес сайта для ссылок в RSS и на страницах лабораторной.

    За HTTPS-прокси хостинга uvicorn видит соединение как http, и ссылки
    получаются http://… — учитываем X-Forwarded-Proto. Доверяем заголовку
    только в сторону повышения до https, понижение схемы не допускаем.
    """
    base = str(request.base_url)
    proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    if proto == "https" and base.startswith("http://"):
        return "https://" + base[len("http://"):]
    return base


# --------------------------------------------------------------------------
# Модель таблицы импорта («загрузить полученные данные в СУБД», этап 4)
# --------------------------------------------------------------------------

class NewsImported(Base):
    """Новость, загруженная из внешнего RSS-файла.

    DDL продублирован в db/schema.sql (для новых установок); ниже — ленивое
    CREATE TABLE IF NOT EXISTS, чтобы на уже развернутом инстансе не требовалась
    ручная миграция. При правках структуры синхронизируйте оба места.
    """

    __tablename__ = "imported_news"
    __table_args__ = (sa.UniqueConstraint("source_url", "guid", name="uq_imported_source_guid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_url: Mapped[str] = mapped_column(sa.Text)
    source_title: Mapped[str] = mapped_column(sa.Text, default="")
    guid: Mapped[str] = mapped_column(sa.Text)
    title: Mapped[str] = mapped_column(sa.Text)
    link: Mapped[str] = mapped_column(sa.Text, default="")
    summary: Mapped[str] = mapped_column(sa.Text, default="")
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(sa.DateTime, server_default=sa.func.now())

_import_table_lock = threading.Lock()


def _ensure_import_table() -> None:
    """Идемпотентное создание imported_news (проверка каждый раз — дешева
    и переживает пересоздание таблицы между запросами).

    На хостинге пользователь БД может быть read-only: тогда CREATE TABLE
    запрещён, и импорт честно отвечает 503 с пояснением вместо падения 500
    (таблицу создаёт администратор по DDL из db/schema.sql — см. DEPLOY).
    """
    with _import_table_lock:
        if not sa.inspect(engine).has_table(NewsImported.__tablename__):
            try:
                NewsImported.__table__.create(engine)
            except sa.exc.DBAPIError as exc:
                raise HTTPException(status_code=503, detail=IMPORT_READ_ONLY_NOTICE) from exc


def _is_read_only_error(exc: sa.exc.DBAPIError) -> bool:
    """Отказ прав записи (read-only транзакция / permission denied), а не баг."""
    original = getattr(exc, "orig", None)
    code = getattr(original, "pgcode", None)
    text = str(original or exc).lower()
    return (
        code in {"42501", "25006"}            # insufficient_privilege / read_only_sql_transaction
        or "read-only" in text
        or "permission denied" in text
    )


# --------------------------------------------------------------------------
# Загрузка и разбор внешнего RSS (рис. 2 — «Внешний RSS файл»)
# --------------------------------------------------------------------------

class FeedError(Exception):
    """Не удалось скачать или разобрать внешний RSS-файл."""


class InvalidFeedUrl(FeedError):
    """Адрес фида некорректен сам по себе (не http/https) — это ошибка клиента, не источника."""


def fetch_url(url: str) -> bytes:
    """Скачивает фид: только http(s), таймаут, лимит размера, явный User-Agent."""
    if not url.lower().startswith(("http://", "https://")):
        raise InvalidFeedUrl("поддерживаются только адреса http:// и https://")
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    })
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:
            if response.status != 200:
                raise FeedError(f"сервер вернул HTTP {response.status}")
            return response.read(MAX_FEED_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise FeedError(f"сервер вернул HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise FeedError(f"не удалось скачать фид: {exc.reason}") from exc
    except TimeoutError as exc:
        raise FeedError(f"источник не ответил за {FETCH_TIMEOUT} с") from exc


def _clean_text(text: str | None, limit: int = 500) -> str:
    """Описание фидов часто содержит HTML — снимаем теги и сущности."""
    if not text:
        return ""
    text = unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text).strip()
    return text[: limit - 1].rstrip() + "…" if len(text) > limit else text


def _parse_date(raw: str | None) -> datetime | None:
    """RFC-822 (RSS) или ISO-8601 (Atom) -> timezone-aware datetime."""
    if not raw:
        return None
    raw = raw.strip()
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed is not None:
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=MOSCOW_TZ)
    except (TypeError, ValueError):
        pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=MOSCOW_TZ)
    except ValueError:
        return None


def _local(tag: str) -> str:
    """Имя тега без namespace ({http://...}entry -> entry)."""
    return tag.rsplit("}", 1)[-1]


def parse_feed(data: bytes) -> dict:
    """Разбирает RSS 2.0 (или Atom как запасной вариант) в словарь."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise FeedError(f"файл не является корректным XML: {exc}") from exc

    items: list[dict] = []
    root_kind = _local(root.tag)
    if root_kind == "rss":  # RSS 2.0
        channel = root.find("channel")
        if channel is None:
            raise FeedError("в RSS-файле нет элемента <channel>")
        feed_title = (channel.findtext("title") or "").strip()
        feed_link = (channel.findtext("link") or "").strip()
        feed_description = _clean_text(channel.findtext("description"), 300)
        for node in channel.findall("item"):
            title = (node.findtext("title") or "").strip()
            published = _parse_date(node.findtext("pubDate"))
            items.append({
                "guid": (node.findtext("guid") or node.findtext("link") or title).strip(),
                "title": _clean_text(title, 300) or "(без заголовка)",
                "link": (node.findtext("link") or "").strip(),
                "published": published,
                "published_raw": (node.findtext("pubDate") or "").strip(),
                "summary": _clean_text(node.findtext("description")),
            })
    elif root_kind == "feed":  # Atom — запасной разбор
        ns = {"a": "http://www.w3.org/2005/Atom"}
        feed_title = (root.findtext("a:title", namespaces=ns) or "").strip()
        feed_link = ""
        for link_node in root.findall("a:link", namespaces=ns):
            if link_node.get("rel") in (None, "alternate"):
                feed_link = link_node.get("href", "")
                break
        feed_description = _clean_text(root.findtext("a:subtitle", namespaces=ns), 300)
        for node in root.findall("a:entry", namespaces=ns):
            title = (node.findtext("a:title", namespaces=ns) or "").strip()
            link = ""
            for link_node in node.findall("a:link", namespaces=ns):
                if link_node.get("rel") in (None, "alternate"):
                    link = link_node.get("href", "")
                    break
            items.append({
                "guid": (node.findtext("a:id", namespaces=ns) or link or title).strip(),
                "title": _clean_text(title, 300) or "(без заголовка)",
                "link": link,
                "published": _parse_date(node.findtext("a:published", namespaces=ns)
                                         or node.findtext("a:updated", namespaces=ns)),
                "published_raw": (node.findtext("a:published", namespaces=ns) or "").strip(),
                "summary": _clean_text(node.findtext("a:summary", namespaces=ns)
                                       or node.findtext("a:content", namespaces=ns)),
            })
    else:
        raise FeedError(f"это не RSS/Atom-файл: корневой элемент <{root_kind}>")

    return {
        "title": feed_title or "(без названия)",
        "link": feed_link,
        "description": feed_description,
        "items": items,
    }


# Кэш внешних фидов: url -> (момент загрузки, результат | FeedError).
# Процесс один (workers=1 в deploy/start.py), lock — на случай будущих воркеров.
_feed_cache: dict[str, tuple[datetime, object]] = {}
_feed_cache_lock = threading.Lock()


def _load_feed(url: str) -> dict:
    """Внешний фид с кэшем (успех — 10 минут, ошибка — 60 секунд);
    при ошибке свежей загрузки отдаем устаревшую, но рабочую копию."""
    now = datetime.now(MOSCOW_TZ)
    with _feed_cache_lock:
        cached = _feed_cache.get(url)
    if cached:
        moment, value = cached
        ttl = ERROR_CACHE_TTL if isinstance(value, FeedError) else CACHE_TTL
        if now - moment < ttl:
            if isinstance(value, FeedError):
                _reraise(value)
            return value

    try:
        feed = parse_feed(fetch_url(url))
        _remember(url, now, feed)
        return feed
    except FeedError as exc:
        # Источник мог «моргнуть» — свежая ошибка не должна затирать рабочий кэш.
        if cached and not isinstance(cached[1], FeedError):
            return cached[1]
        _remember(url, now, exc)
        _reraise(exc)


def _reraise(exc: FeedError):
    """FeedError -> HTTPException: некорректный адрес = 400, недоступный источник = 502."""
    if isinstance(exc, InvalidFeedUrl):
        raise HTTPException(status_code=400, detail=f"Некорректный адрес RSS: {exc}") from exc
    raise HTTPException(status_code=502, detail=f"Внешний RSS недоступен: {exc}") from exc


def _remember(url: str, moment: datetime, value: object) -> None:
    with _feed_cache_lock:
        _feed_cache[url] = (moment, value)


def _resolve_source(url: str | None, source: str | None) -> str:
    """URL внешнего фида: явный url > id из каталога источников > источник по умолчанию."""
    if url:
        return url
    if source:
        for item in EXTERNAL_SOURCES:
            if item["id"] == source:
                return item["url"]
        raise HTTPException(status_code=400, detail=f"Неизвестный источник: {source}")
    return DEFAULT_SOURCE["url"]


# --------------------------------------------------------------------------
# Новости из БД (рис. 2 — «БД "Новости"»)
# --------------------------------------------------------------------------

def _db_news(db: Session) -> list[dict]:
    """Таблица news -> единый DTO обмена (JOIN с instruments ради тикера)."""
    stmt = (
        select(News.id, News.title, News.body, News.published_at, Instrument.ticker)
        .join(Instrument, News.related_instrument_id == Instrument.id, isouter=True)
        .order_by(News.published_at.desc(), News.id.desc())
    )
    return [
        {
            "id": row_id,
            "title": title,
            "body": body,
            "published_at": published_at,
            "published": published_at.replace(tzinfo=MOSCOW_TZ) if published_at else None,
            "ticker": ticker,
            "source": "БД funds_lab",
            "link": None,  # заполнится абсолютным адресом сайта при рендере ленты
        }
        for row_id, title, body, published_at, ticker in db.execute(stmt).all()
    ]


def _rfc822(moment: datetime | None) -> str:
    """pubDate по RFC-822; наивные даты БД считаем московскими (+0300)."""
    if moment is None:
        moment = datetime.now(MOSCOW_TZ)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=MOSCOW_TZ)
    return format_datetime(moment.astimezone(MOSCOW_TZ))


def _iso(moment: datetime | None) -> str | None:
    """ISO-8601 с точностью до секунд — микросекунды БД в формат обмена не нужны."""
    return moment.astimezone(MOSCOW_TZ).isoformat(timespec="seconds") if moment else None


# --------------------------------------------------------------------------
# Этап 2–3: лента RSS 2.0 из БД (XML-файл — форма отчетности)
# --------------------------------------------------------------------------

def _render_rss(db: Session, base_url: str) -> str:
    """Собирает RSS 2.0 из таблицы news. Структура канала описана на rss.html."""
    base = base_url.rstrip("/")
    news = _db_news(db)
    channel_link = f"{base}/news.html"
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"<title>{escape(FEED_TITLE)}</title>",
        f"<link>{escape(channel_link)}</link>",
        f"<description>{escape(FEED_DESCRIPTION)}</description>",
        "<language>ru</language>",
        f"<lastBuildDate>{_rfc822(max((n['published'] for n in news), default=None))}</lastBuildDate>",
        f"<atom:link href={quoteattr(f'{base}/rss.xml')} rel='self' type='application/rss+xml'/>",
        "<generator>Funds Lab, лабораторная работа №4 (FastAPI)</generator>",
    ]
    for item in news:
        item_link = f"{base}/news.html#news-{item['id']}"
        parts += [
            "<item>",
            f"<title>{escape(item['title'])}</title>",
            f"<link>{escape(item_link)}</link>",
            f"<guid isPermaLink='true'>{escape(item_link)}</guid>",
            f"<pubDate>{_rfc822(item['published'])}</pubDate>",
            f"<description>{escape(item['body'])}</description>",
            *( [f"<category>{escape(item['ticker'])}</category>"] if item["ticker"] else [] ),
            "</item>",
        ]
    parts += ["</channel>", "</rss>", ""]
    return "\n".join(parts)


@router.get("/api/rss", summary="RSS 2.0-лента из БД (XML-файл)")
def rss_feed(request: Request, db: Session = Depends(get_db)):
    """Формат обмена (этап 2–3): новости из БД в формате RSS 2.0.

    На проде этот же документ доступен по адресу /rss.xml — адрес,
    который указан в <link rel="alternate"> всех страниц сайта.
    """
    return Response(content=_render_rss(db, _base_url(request)),
                    media_type="application/rss+xml; charset=utf-8")


@router.get("/rss.xml", include_in_schema=False)
def rss_feed_alias(request: Request, db: Session = Depends(get_db)):
    """Единый адрес ленты: на GitHub Pages это статический файл из сборки,
    на проде — маршрут FastAPI, который всегда отдает актуальные данные из БД."""
    return Response(content=_render_rss(db, _base_url(request)),
                    media_type="application/rss+xml; charset=utf-8")


# --------------------------------------------------------------------------
# Форма отчетности: ASCII через разделитель со списком полей (CSV)
# --------------------------------------------------------------------------

CSV_FIELDS = ["id", "title", "published_at", "related_ticker", "body"]


def _render_csv(db: Session) -> str:
    """CSV: первая строка — список полей, разделитель «;» (локаль Excel ru), UTF-8 BOM."""
    buffer = io.StringIO()
    writer = csv_writer(buffer, delimiter=";", quoting=QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(CSV_FIELDS)
    for item in _db_news(db):
        writer.writerow([
            item["id"],
            item["title"],
            _iso(item["published"]),
            item["ticker"] or "",
            item["body"],
        ])
    # BOM: Excel по двойному клику открывает такой файл в UTF-8 без танцев с кодировкой.
    return "\ufeff" + buffer.getvalue()  # явный BOM


@router.get("/api/export/news.csv", summary="Экспорт новостей: CSV с разделителем «;» и списком полей")
def export_csv(db: Session = Depends(get_db)):
    """Форма отчетности №1: ASCII-файл через разделитель со списком полей."""
    return Response(
        content=_render_csv(db),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="news.csv"'},
    )


# --------------------------------------------------------------------------
# Форма отчетности: ASCII-файл, оконтуренный XML-тегами
# --------------------------------------------------------------------------

def _render_tagged(db: Session) -> str:
    """Плоский дамп таблицы: поля обрамлены XML-тегами, тело новости — сырой
    ASCII-текст внутри CDATA (в отличие от RSS это дамп таблицы, а не протокол новостей).
    Файл well-formed XML, поэтому «другие приложения» читают его парсером."""
    news = _db_news(db)
    generated = datetime.now(MOSCOW_TZ).isoformat(timespec="seconds")
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f"<news-document source='funds_lab (PostgreSQL)' generated={quoteattr(generated)} "
        f"count='{len(news)}' fields={quoteattr(','.join(CSV_FIELDS))}>",
    ]
    for item in news:
        body = item["body"].replace("]]>", "]]]]><![CDATA[>")  # единственная запрещённая последовательность CDATA
        parts += [
            f"<record id='{item['id']}'>",
            f"<title>{escape(item['title'])}</title>",
            f"<published>{_iso(item['published']) or ''}</published>",
            f"<related_ticker>{escape(item['ticker'] or '')}</related_ticker>",
            "<body><![CDATA[" + body + "]]></body>",
            "</record>",
        ]
    parts += ["</news-document>", ""]
    return "\n".join(parts)


@router.get("/api/export/news.tagged.txt", summary="Экспорт новостей: ASCII-файл, оконтуренный XML-тегами")
def export_tagged(db: Session = Depends(get_db)):
    """Форма отчетности №3: ASCII-файл, оконтуренный XML-тегами (тело — CDATA)."""
    return Response(
        content=_render_tagged(db),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="news.tagged.txt"'},
    )


# --------------------------------------------------------------------------
# Этап 4: прикладная обработка внешнего RSS-файла
# --------------------------------------------------------------------------

@router.get("/api/lab4/sources", summary="Каталог рекомендуемых внешних RSS-источников")
def external_sources():
    return {"default": DEFAULT_SOURCE["id"], "sources": EXTERNAL_SOURCES}


def _feed_to_items(feed: dict, source_url: str) -> list[dict]:
    return [
        {
            "source_type": "external",
            "source": feed["title"],
            "source_url": source_url,
            "guid": item["guid"],
            "title": item["title"],
            "link": item["link"],
            "published": _iso(item["published"]),
            "_published": item["published"],
            "summary": item["summary"],
            "ticker": None,
        }
        for item in feed["items"]
    ]


def _db_to_items(db: Session, base_url: str) -> list[dict]:
    base = base_url.rstrip("/")
    return [
        {
            "source_type": "db",
            "source": "БД funds_lab",
            "source_url": None,
            "guid": f"{base}/news.html#news-{item['id']}",
            "title": item["title"],
            "link": f"{base}/news.html#news-{item['id']}",
            "published": _iso(item["published"]),
            "_published": item["published"],
            "summary": _clean_text(item["body"]),
            "ticker": item["ticker"],
        }
        for item in _db_news(db)
    ]


def _combine(db_items: list[dict], external_items: list[dict], limit: int) -> list[dict]:
    """Объединение источников: сортировка по дате по убыванию, дедуп по заголовку.

    Чтобы объединенная лента всегда демонстрировала ОБА источника (смысл лабы),
    лимит делится по квотам: за новостями БД резервируется до трети слотов
    (минимум 3), остальное добирает внешний фид.
    """
    def sort_key(item: dict):
        moment = item["_published"]
        # Наивные даты считаем московскими; отсутствующая дата — самая старая.
        if moment is None:
            return datetime.min.replace(tzinfo=MOSCOW_TZ)
        return moment if moment.tzinfo else moment.replace(tzinfo=MOSCOW_TZ)

    db_sorted = sorted(db_items, key=sort_key, reverse=True)
    ext_sorted = sorted(external_items, key=sort_key, reverse=True)
    db_quota = min(len(db_sorted), max(min(3, limit), limit // 3))
    merged = sorted(db_sorted[:db_quota] + ext_sorted[: limit - db_quota], key=sort_key, reverse=True)

    seen: set[str] = set()
    result = []
    for item in merged:
        key = re.sub(r"\s+", " ", item["title"]).strip().lower()
        if key in seen:
            continue
        seen.add(key)
        item = dict(item)
        item.pop("_published", None)
        result.append(item)
        if len(result) >= limit:
            break
    return result


@router.get("/api/lab4/external-rss", summary="Скачать и разобрать внешний RSS-файл")
def external_rss(
    url: str | None = Query(None, description="Адрес RSS-файла (или используйте source)"),
    source: str | None = Query(None, description="id из каталога /api/lab4/sources"),
):
    """Скачивает внешний RSS (рис. 2), разбирает на элементы и возвращает JSON."""
    source_url = _resolve_source(url, source)
    feed = _load_feed(source_url)
    return {
        "url": source_url,
        "title": feed["title"],
        "link": feed["link"],
        "description": feed["description"],
        "items_count": len(feed["items"]),
        "items": _feed_to_items(feed, source_url)[:50],
    }


@router.get("/api/lab4/combined-news", summary="Объединенные новости: БД + внешний RSS")
def combined_news(
    request: Request,
    url: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Прикладная обработка: внешний RSS-файл + таблица news -> единая лента.

    Дедуп по нормализованному заголовку, сортировка по дате по убыванию,
    каждая запись помечена источником.
    """
    source_url = _resolve_source(url, source)
    feed = _load_feed(source_url)
    items = _combine(_db_to_items(db, _base_url(request)), _feed_to_items(feed, source_url), limit)
    db_count = sum(1 for i in items if i["source_type"] == "db")
    return {
        "sources": [
            {"type": "db", "name": "БД funds_lab", "items": db_count},
            {"type": "external", "name": feed["title"], "url": source_url,
             "items": len(items) - db_count},
        ],
        "total": len(items),
        "items": items,
    }


@router.post("/api/lab4/import", summary="Загрузить внешние RSS-новости в таблицу imported_news")
def import_external(
    url: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50, description="Сколько свежих записей фида загрузить"),
    db: Session = Depends(get_db),
):
    """Этап 4, ветка «загрузить полученные данные в СУБД»: разобранный внешний
    RSS сохраняется в imported_news (дедуп по (source_url, guid))."""
    source_url = _resolve_source(url, source)
    feed = _load_feed(source_url)
    _ensure_import_table()

    inserted = skipped = 0
    try:
        for item in _feed_to_items(feed, source_url)[:limit]:
            exists = db.execute(
                select(NewsImported.id).where(
                    NewsImported.source_url == source_url,
                    NewsImported.guid == item["guid"],
                )
            ).first()
            if exists:
                skipped += 1
                continue
            db.add(NewsImported(
                source_url=source_url,
                source_title=feed["title"],
                guid=item["guid"][:2048],
                title=item["title"],
                link=item["link"][:2048],
                summary=item["summary"],
                published_at=item["_published"].astimezone(MOSCOW_TZ).replace(tzinfo=None)
                             if item["_published"] else None,
            ))
            inserted += 1
        db.commit()
    except sa.exc.DBAPIError as exc:
        db.rollback()
        if _is_read_only_error(exc):
            raise HTTPException(status_code=503, detail=IMPORT_READ_ONLY_NOTICE) from exc
        raise

    total = db.execute(select(sa.func.count(NewsImported.id))).scalar_one()
    return {
        "source_url": source_url,
        "source_title": feed["title"],
        "fetched": min(len(feed["items"]), limit),
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "total_in_table": total,
    }


@router.get("/api/lab4/imported", summary="Просмотр новостей, загруженных из внешних RSS")
def imported_news(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Список импортированного. Если таблица недоступна (read-only БД хостинга
    без прав на CREATE), отдаём пустой список с пояснением — страница лабы
    продолжает работать, а не падает ошибкой на первом запросе."""
    try:
        _ensure_import_table()
    except HTTPException:
        return {"items": [], "import_available": False, "notice": IMPORT_READ_ONLY_NOTICE}
    stmt = (
        select(NewsImported)
        .order_by(NewsImported.imported_at.desc(), NewsImported.id.desc())
        .limit(limit)
    )
    return {
        "import_available": True,
        "items": [
            {
                "id": row.id,
                "source_title": row.source_title,
                "source_url": row.source_url,
                "title": row.title,
                "link": row.link,
                "summary": row.summary,
                "published_at": row.published_at.isoformat() if row.published_at else None,
                "imported_at": row.imported_at.isoformat() if row.imported_at else None,
            }
            for row in db.scalars(stmt).all()
        ],
    }


# --------------------------------------------------------------------------
# Страница «Объединенные новости» (рис. 2 — результат приложения)
# --------------------------------------------------------------------------

# Пункты меню — копия NAV из static/build.mjs (синхронизировать при изменениях).
NAV_ITEMS = [
    ("index", "Главная", "/index.html"),
    ("news", "Новости", "/news.html"),
    ("exchanges", "Биржи", "/exchanges.html"),
    ("history", "История", "/history.html"),
    ("beginners", "Новичку", "/beginners.html"),
    ("glossary", "Глоссарий", "/glossary.html"),
    ("risks", "Риски", "/risks.html"),
    ("links", "Ссылки", "/links.html"),
    ("contacts", "Контакты", "/contacts.html"),
    ("about", "О проекте", "/about.html"),
    ("search", "Поиск", "/search.html"),
    ("forum", "Форум", "/forum.html"),
    ("services", "Сервисы", "/services.html"),
    ("xml", "XML (лаб. №2)", "/xml.html"),
    ("db", "БД (лаб. №3)", "/db.html"),
    ("rss", "RSS", "/rss.html"),
]

_COMBINED_PAGE = """<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Объединенные новости — Funds Lab</title>
  <meta name="description" content="Лабораторная работа №4: объединенные новости из базы данных Funds Lab и внешнего RSS-файла.">
  <meta name="keywords" content="RSS, обмен данными, объединенные новости, лабораторная работа 4">
  <link rel="icon" type="image/svg+xml" href="{base}/assets/favicon.svg">
  <link rel="stylesheet" href="{base}/styles.css?v=lab4">
  <link rel="alternate" type="application/rss+xml" title="{feed_title}" href="{base}/rss.xml">
  <style>
    /* Минимум собственных стилей прямо в шаблоне: страница работает и в
       автономном режиме, где /static/lab4.css сайта недоступен. */
    .lab4-badge {{ display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 12px; font-weight: 600; white-space: nowrap; }}
    .lab4-badge--db {{ background: #e3edff; color: #1d4fb8; }}
    .lab4-badge--ext {{ background: #e8f6ec; color: #1c7c3c; }}
    .lab4-notice {{ margin: 0 0 12px; padding: 10px 14px; border: 1px solid #e4c444;
      background: #fdf6dd; border-radius: 8px; font-size: 14px; }}
    .data-table td .muted {{ margin: 4px 0 0; font-size: 13px; }}
  </style>
</head>
<body data-page="rss">
  <div class="site-shell">
    <header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="{base}/index.html">Funds Lab</a>
      <form class="site-search" action="{base}/search.html" method="get" role="search">
        <input type="search" name="q" placeholder="Поиск по сайту…" aria-label="Поиск по сайту">
        <button type="submit">Найти</button>
      </form>
      <div class="informers">
        <div class="informer informer--weather" id="weather-widget">Погода: загрузка…</div>
        <div class="informer informer--currency" id="currency-widget">Курсы валют: загрузка…</div>
      </div>
    </div>
    <div class="nav-main">
      <button id="nav-toggle" class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">☰ Меню</button>
      <nav id="site-nav" aria-label="Основная навигация">
        <ul class="nav-list">{nav_items}</ul>
      </nav>
    </div>
  </header>
    <main class="site-main">
      <h1>Объединенные новости</h1>
      <p class="lead">Лабораторная работа №4 — обмен данными: новости из базы данных Funds Lab, объединенные с внешним RSS-файлом (рис. 2 методички: внешний RSS + БД «Новости» → приложение → страница «Объединенные новости»).</p>

      <p class="muted">Источник внешнего фида: <a href="{feed_url}">{feed_url}</a> · страница сформирована приложением {generated} · записей: {total} (из БД: {db_count}, из внешнего фида: {ext_count}).</p>
      {error_notice}
      <table class="data-table">
        <caption>Объединенная лента (свежие сверху)</caption>
        <thead>
          <tr>
            <th scope="col">Дата</th>
            <th scope="col">Источник</th>
            <th scope="col">Новость</th>
            <th scope="col">Инструмент</th>
          </tr>
        </thead>
        <tbody>
{rows}
        </tbody>
      </table>

      <p><a href="{base}/rss.html">← К странице лабораторной работы №4</a></p>
    </main>
    <footer class="site-footer">
    <p class="visit-counter">Всего посещений сайта: <span data-visit-total>0</span></p>
    <p class="author-note">Учебный проект по дисциплине «Веб-программирование». Автор: студент группы БИЗ-Б23, Корнюшкин Игорь.</p>
  </footer>
  </div>
  <script src="{base}/data.js?v=lab4"></script>
  <script src="{base}/app.js?v=lab4"></script>
</body>
</html>
"""


@router.get("/lab4/combined.html", include_in_schema=False)
@router.get("/lab4/combined-news.html", include_in_schema=False)
def combined_page(
    request: Request,
    url: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Готовая HTML-страница «Объединенные новости»: подготовленный web-шаблон,
    в который приложение вставляет элементы из БД и внешнего RSS-файла."""
    base = _base_url(request).rstrip("/")
    source_url = _resolve_source(url, source)
    try:
        feed = _load_feed(source_url)
        external_items = _feed_to_items(feed, source_url)
        error_notice = ""
    except HTTPException as exc:
        external_items = []
        error_notice = (
            f'<p class="lab4-notice">Внешний RSS сейчас недоступен ({exc.detail}). '
            "Показаны только новости из БД — попробуйте другой источник или обновите страницу позже.</p>"
        )

    items = _combine(_db_to_items(db, base), external_items, limit)
    db_count = sum(1 for i in items if i["source_type"] == "db")
    ext_count = len(items) - db_count

    rows = []
    for item in items:
        published = item["published"]
        when = published[:16].replace("T", " ") if published else "—"
        badge = "db" if item["source_type"] == "db" else "ext"
        title = escape(item["title"])
        if item["link"]:
            title = f'<a href="{escape(item["link"])}" target="_blank" rel="noopener">{title}</a>'
        rows.append(
            "          <tr>"
            f"<td>{escape(when)}</td>"
            f'<td><span class="lab4-badge lab4-badge--{badge}">{escape(item["source"])}</span></td>'
            f"<td>{title}<p class=\"muted\">{escape(item['summary'])}</p></td>"
            f"<td>{escape(item['ticker'] or '—')}</td>"
            "</tr>"
        )
    if not rows:
        rows.append('          <tr><td colspan="4">Нет данных.</td></tr>')

    # Без backslash-ов внутри f-строк: хостинг может работать на Python < 3.12.
    nav_parts = []
    for key, label, href in NAV_ITEMS:
        current = ' aria-current="page"' if key == "rss" else ""
        nav_parts.append(f'<li><a href="{href}"{current}>{label}</a></li>')
    nav = "".join(nav_parts)
    html = _COMBINED_PAGE.format(
        base=base,
        feed_title=escape(FEED_TITLE),
        feed_url=escape(source_url),
        generated=datetime.now(MOSCOW_TZ).strftime("%d.%m.%Y %H:%M:%S"),
        total=len(items),
        db_count=db_count,
        ext_count=ext_count,
        error_notice=error_notice,
        rows="\n".join(rows),
        nav_items=nav,
    )
    return Response(content=html, media_type="text/html; charset=utf-8")
