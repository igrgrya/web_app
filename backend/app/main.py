"""Funds Lab API — лабораторные работы №3 и №4 (FastAPI + SQLAlchemy + PostgreSQL).

Лабораторная №3 — пять типов запросов к БД (нумерация как в отчёте):
  Q1  GET /api/instruments           — каталог: JOIN 4 таблиц, фильтры, сортировка
  Q2  GET /api/search                — поиск по тикеру/названию (ILIKE, экранирование)
  Q3  GET /api/sectors/summary       — агрегаты по секторам (GROUP BY, COUNT/AVG/SUM)
  Q4  GET /api/top-movers            — лидеры роста и падения (ORDER BY + LIMIT)
  Q5  GET /api/instruments/{id}      — карточка инструмента
      GET /api/instruments/{id}/prices — история цен (данные линейного графика)

Лабораторная №4 — обмен данными между приложениями (маршруты в lab4.py):
  GET  /api/rss, /rss.xml          — RSS 2.0-лента из таблицы news (XML-файл)
  GET  /api/export/news.csv        — CSV «;» со списком полей (ASCII с разделителем)
  GET  /api/export/news.tagged.txt — ASCII-файл, оконтуренный XML-тегами
  GET  /api/lab4/...               — внешний RSS, объединенные новости, импорт
  GET  /lab4/combined.html         — страница «Объединенные новости»

Актуальная цена — снимок с максимальной датой as_of_date (сид генерирует все
ряды одним массивом, даты у инструментов совпадают).
"""

from datetime import date
import os
from pathlib import Path
from typing import Optional

import sqlalchemy as sa
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager

from .database import get_db
from .lab4 import router as lab4_router
from .models import Exchange, Instrument, PriceSnapshot, Sector

PUBLIC_DIR = os.environ.get("FUNDS_PUBLIC_DIR")
PUBLIC_DIR = Path(PUBLIC_DIR).resolve() if PUBLIC_DIR else None

app = FastAPI(
    title="Funds Lab API",
    description="Веб-приложение с динамическим доступом к БД (лаб. №3) и обмен данными "
                "в форматах RSS/XML/CSV (лаб. №4).",
    version="1.1.0",
    docs_url=None if PUBLIC_DIR else "/docs",
    redoc_url=None if PUBLIC_DIR else "/redoc",
)

STATIC_DIR = PUBLIC_DIR / "static" if PUBLIC_DIR else Path(__file__).resolve().parent / "static"


# --------------------------------------------------------------------------
# Сериализация строк БД в JSON
# --------------------------------------------------------------------------

def _snapshot_dto(snap: Optional[PriceSnapshot]) -> dict:
    return {
        "price": float(snap.price) if snap else None,
        "change_percent": float(snap.change_percent) if snap and snap.change_percent is not None else None,
        "volume": snap.volume if snap else None,
        "as_of_date": snap.as_of_date.isoformat() if snap else None,
    }


def _instrument_dto(inst: Instrument, snap: Optional[PriceSnapshot] = None) -> dict:
    return {
        "id": inst.id,
        "ticker": inst.ticker,
        "name": inst.name,
        "type": inst.instrument_type,
        "exchange": inst.exchange.code if inst.exchange else None,
        "sector": inst.sector.name if inst.sector else None,
        "currency": inst.currency,
        "description": inst.description,
        "listed_date": inst.listed_date.isoformat() if inst.listed_date else None,
        **_snapshot_dto(snap),
    }


def _latest_date(db: Session) -> date:
    """Максимальная дата снимка цен — «сегодня» с точки зрения данных."""
    latest = db.execute(select(func.max(PriceSnapshot.as_of_date))).scalar_one()
    if latest is None:
        raise HTTPException(status_code=503, detail="Таблица price_snapshots пуста")
    return latest


def _catalog_stmt(db: Session):
    """Базовый запрос каталога: инструмент + его свежий снимок + справочники.

    Явные JOIN + contains_eager: и фильтровать/сортировать можно по любой из
    таблиц, и связанные объекты заполняются из тех же строк без доп. запросов.
    """
    stmt = (
        select(Instrument, PriceSnapshot, Exchange, Sector)
        .join(PriceSnapshot, sa.and_(
            PriceSnapshot.instrument_id == Instrument.id,
            PriceSnapshot.as_of_date == _latest_date(db),
        ))
        .join(Exchange, Instrument.exchange_id == Exchange.id, isouter=True)
        .join(Sector, Instrument.sector_id == Sector.id, isouter=True)
        .options(contains_eager(Instrument.exchange), contains_eager(Instrument.sector))
    )
    return stmt


# Q1 ------------------------------------------------------------------------
SORTABLE = {
    "ticker": Instrument.ticker,
    "name": Instrument.name,
    "type": Instrument.instrument_type,
    "exchange": Exchange.code,
    "sector": Sector.name,
    "price": PriceSnapshot.price,
    "change": PriceSnapshot.change_percent,
    "volume": PriceSnapshot.volume,
}


@app.get("/api/instruments", tags=["Q1 — каталог"])
def list_instruments(
    exchange: Optional[str] = Query(None, description="Код биржи, напр. MOEX"),
    sector: Optional[str] = Query(None, description="Название сектора"),
    instrument_type: Optional[str] = Query(None, pattern="^(stock|etf|fund|bond)$",
                                            description="Тип инструмента"),
    sort: str = Query("ticker", description="Колонка сортировки"),
    direction: str = Query("asc", pattern="^(asc|desc)$", description="Направление"),
    db: Session = Depends(get_db),
):
    """Q1: каталог инструментов — SELECT с JOIN четырёх таблиц, фильтрами и сортировкой."""
    column = SORTABLE.get(sort)
    if column is None:
        raise HTTPException(status_code=400, detail=f"sort должен быть одним из: {', '.join(SORTABLE)}")

    stmt = _catalog_stmt(db)
    if exchange:
        stmt = stmt.where(Exchange.code == exchange)
    if sector:
        stmt = stmt.where(Sector.name == sector)
    if instrument_type:
        stmt = stmt.where(Instrument.instrument_type == instrument_type)
    stmt = stmt.order_by(
        column.desc() if direction == "desc" else column.asc(),
        Instrument.ticker.asc(),  # вторичный ключ — стабильный порядок
    )
    rows = db.execute(stmt).all()
    return [_instrument_dto(inst, snap) for inst, snap, _e, _s in rows]


# Q2 ------------------------------------------------------------------------
def _escape_like(q: str) -> str:
    """Экранирование спецсимволов LIKE, чтобы '%.__' искался как текст."""
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/search", tags=["Q2 — поиск"])
def search(
    q: str = Query(min_length=1, max_length=100, description="Подстрока тикера или названия"),
    limit: int = Query(20, ge=1, le=100),
    exchange: Optional[str] = None,
    sector: Optional[str] = None,
    instrument_type: Optional[str] = Query(None, pattern="^(stock|etf|fund|bond)$"),
    sort: str = "ticker",
    direction: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    """Q2: параметризованный поиск ILIKE по тикеру и названию (регистронезависимый)."""
    column = SORTABLE.get(sort)
    if column is None:
        raise HTTPException(status_code=400, detail="Неизвестная колонка сортировки")
    pattern = f"%{_escape_like(q)}%"
    stmt = _catalog_stmt(db).where(sa.or_(
        Instrument.ticker.ilike(pattern, escape="\\"),
        Instrument.name.ilike(pattern, escape="\\"),
    ))
    if exchange:
        stmt = stmt.where(Exchange.code == exchange)
    if sector:
        stmt = stmt.where(Sector.name == sector)
    if instrument_type:
        stmt = stmt.where(Instrument.instrument_type == instrument_type)
    stmt = stmt.order_by(column.desc() if direction == "desc" else column.asc(), Instrument.ticker.asc()).limit(limit)
    rows = db.execute(stmt).all()
    return [_instrument_dto(inst, snap) for inst, snap, _e, _s in rows]


# Q3 ------------------------------------------------------------------------
@app.get("/api/sectors/summary", tags=["Q3 — агрегаты"])
def sectors_summary(db: Session = Depends(get_db)):
    """Q3: агрегаты по секторам — GROUP BY + COUNT/AVG/SUM (столбчатая диаграмма)."""
    stmt = (
        select(
            Sector.name.label("sector"),
            Instrument.currency.label("currency"),
            func.count(Instrument.id).label("instruments_count"),
            func.avg(PriceSnapshot.price).label("avg_price"),
            func.sum(PriceSnapshot.volume).label("total_volume"),
        )
        .join(Instrument, Instrument.sector_id == Sector.id, isouter=True)
        .join(PriceSnapshot, sa.and_(
            PriceSnapshot.instrument_id == Instrument.id,
            PriceSnapshot.as_of_date == _latest_date(db),
        ), isouter=True)
        .group_by(Sector.name, Instrument.currency)
        .order_by(Sector.name.asc(), Instrument.currency.asc())
    )
    result = []
    for name, currency, cnt, avg_price, total_volume in db.execute(stmt).all():
        result.append({
            "sector": name,
            "currency": currency,
            "instruments_count": cnt,
            "avg_price": round(float(avg_price), 2) if avg_price is not None else None,
            "total_volume": total_volume,
        })
    return result


# Q4 ------------------------------------------------------------------------
@app.get("/api/top-movers", tags=["Q4 — лидеры движения"])
def top_movers(limit: int = Query(5, ge=1, le=18), db: Session = Depends(get_db)):
    """Q4: топ-N роста и падения за последний день — ORDER BY + LIMIT.

    Списки фильтруются по знаку изменения (рост строго > 0, падение строго
    < 0): без фильтра при большом LIMIT список просто продолжался бы по
    порядку, и в «лидерах роста» оказывались падающие инструменты.
    """
    base = (
        select(Instrument, PriceSnapshot, Exchange, Sector)
        .join(PriceSnapshot, sa.and_(
            PriceSnapshot.instrument_id == Instrument.id,
            PriceSnapshot.as_of_date == _latest_date(db),
        ))
        .join(Exchange, Instrument.exchange_id == Exchange.id, isouter=True)
        .join(Sector, Instrument.sector_id == Sector.id, isouter=True)
        .options(contains_eager(Instrument.exchange), contains_eager(Instrument.sector))
    )
    gainers = db.execute(
        base.where(PriceSnapshot.change_percent > 0)
        .order_by(PriceSnapshot.change_percent.desc(), Instrument.ticker)
        .limit(limit)
    ).all()
    losers = db.execute(
        base.where(PriceSnapshot.change_percent < 0)
        .order_by(PriceSnapshot.change_percent.asc(), Instrument.ticker)
        .limit(limit)
    ).all()
    return {
        "gainers": [_instrument_dto(i, s) for i, s, _e, _sec in gainers],
        "losers": [_instrument_dto(i, s) for i, s, _e, _sec in losers],
    }


# Q5 ------------------------------------------------------------------------
@app.get("/api/instruments/{instrument_id}", tags=["Q5 — карточка и история"])
def get_instrument(instrument_id: int, db: Session = Depends(get_db)):
    """Q5а: карточка одного инструмента (JOIN со справочниками и свежей ценой)."""
    stmt = _catalog_stmt(db).where(Instrument.id == instrument_id)
    row = db.execute(stmt).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Инструмент не найден")
    inst, snap, _e, _s = row
    return _instrument_dto(inst, snap)


@app.get("/api/instruments/{instrument_id}/prices", tags=["Q5 — карточка и история"])
def instrument_prices(
    instrument_id: int,
    days: int = Query(30, ge=1, le=365, description="Сколько последних торговых дней вернуть"),
    db: Session = Depends(get_db),
):
    """Q5б: история цен за последние `days` торговых дней (линейный график)."""
    if db.get(Instrument, instrument_id) is None:
        raise HTTPException(status_code=404, detail="Инструмент не найден")
    stmt = (
        select(PriceSnapshot.as_of_date, PriceSnapshot.price,
               PriceSnapshot.change_percent, PriceSnapshot.volume)
        .where(PriceSnapshot.instrument_id == instrument_id)
        .order_by(PriceSnapshot.as_of_date.desc())
        .limit(days)
    )
    rows = db.execute(stmt).all()
    return [
        {
            "date": d.isoformat(),
            "price": float(p),
            "change_percent": float(c) if c is not None else None,
            "volume": v,
        }
        for d, p, c, v in reversed(rows)  # хронологический порядок для графика
    ]


# Лабораторная №4: обмен данными (RSS, экспорт, внешние фиды, импорт).
app.include_router(lab4_router)


# Служебные маршруты и статика ----------------------------------------------

@app.get("/api/health", tags=["служебные"])
def health(db: Session = Depends(get_db)):
    """Проверка живости: соединение с БД + объём данных."""
    instruments = db.execute(select(func.count(Instrument.id))).scalar_one()
    snapshots = db.execute(select(func.count(PriceSnapshot.id))).scalar_one()
    return {"status": "ok", "database": "connected",
            "instruments": instruments, "price_snapshots": snapshots}


@app.get("/", include_in_schema=False)
def index():
    """Полный сайт при публикации; автономная лабораторная при локальном запуске."""
    return FileResponse((PUBLIC_DIR or STATIC_DIR) / "index.html")


if PUBLIC_DIR:
    @app.get("/docs", include_in_schema=False)
    def local_docs():
        return get_swagger_ui_html(
            openapi_url="/openapi.json", title="Funds Lab API",
            swagger_js_url="/static/vendor/swagger-ui-bundle.js",
            swagger_css_url="/static/vendor/swagger-ui.css",
            swagger_favicon_url="/assets/favicon.svg",
            swagger_ui_parameters={"validatorUrl": None},
        )

    @app.get("/redoc", include_in_schema=False)
    def docs_alias():
        return RedirectResponse("/docs", status_code=308)

    @app.get("/lab3", include_in_schema=False)
    @app.get("/lab3/", include_in_schema=False)
    @app.get("/lab3/index.html", include_in_schema=False)
    @app.get("/static/index.html", include_in_schema=False)
    def legacy_lab():
        return RedirectResponse("/db.html", status_code=308)

    # После API и служебных маршрутов: сайт не перехватывает запросы к БД.
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="website")
else:
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
