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

Правки к лаб. №4 — ввод данных и сведения о БД (как требует задание):
  CRUD /api/instruments[...]                        — инструменты (POST/PUT/DELETE)
  CRUD /api/instruments/{id}/prices[/{as_of_date}]  — снимки цен (POST/PUT/DELETE)
  GET  /api/db-info        — сведения о БД: СУБД, версия, таблицы, права записи

Актуальная цена — снимок каждого инструмента с его максимальной датой as_of_date
(сид генерирует все ряды одним массивом, даты у инструментов совпадают).
Правка к лаб. №4: пользовательский снимок одного инструмента с датой новее набора
не сдвигает «якорь» и не прячет остальные инструменты из каталога.
"""

import re
from datetime import date
import os
from pathlib import Path
from typing import Literal, Optional

import sqlalchemy as sa
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager

from .database import get_db
from .lab4 import NewsImported, _is_read_only_error, router as lab4_router
from .models import Exchange, Instrument, News, PriceSnapshot, Sector

PUBLIC_DIR = os.environ.get("FUNDS_PUBLIC_DIR")
PUBLIC_DIR = Path(PUBLIC_DIR).resolve() if PUBLIC_DIR else None

app = FastAPI(
    title="Funds Lab API",
    description="Веб-приложение с динамическим доступом к БД (лаб. №3), обмен данными "
                "в форматах RSS/XML/CSV (лаб. №4), ввод данных (CRUD) и сведения о БД.",
    version="1.2.0",
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


# Актуальный снимок каждого инструмента: коррелированный подзапрос с его
# максимальной датой. Правка к лаб. №4: раньше актуальность определялась
# глобальным якорем (max по всей таблице), и пользовательский снимок одного
# инструмента на более позднюю дату «прятал» остальные 17 из каталога.
_LATEST_SNAP = sa.alias(PriceSnapshot.__table__, "latest_snap")
LATEST_PER_INSTRUMENT = (
    select(func.max(_LATEST_SNAP.c.as_of_date))
    .where(_LATEST_SNAP.c.instrument_id == Instrument.id)
    .correlate(Instrument)
    .scalar_subquery()
)


def _catalog_stmt(db: Session):
    """Базовый запрос каталога: инструмент + его свежий снимок + справочники.

    Явные JOIN + contains_eager: и фильтровать/сортировать можно по любой из
    таблиц, и связанные объекты заполняются из тех же строк без доп. запросов.
    """
    stmt = (
        select(Instrument, PriceSnapshot, Exchange, Sector)
        .select_from(Instrument)  # явная левая сторона: в подзапросе якоря есть алиас той же таблицы
        .join(PriceSnapshot, sa.and_(
            PriceSnapshot.instrument_id == Instrument.id,
            PriceSnapshot.as_of_date == LATEST_PER_INSTRUMENT,
        ), isouter=True)  # LEFT: только что введённый инструмент виден до первой котировки
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
        .select_from(Sector)  # явная левая сторона, как в _catalog_stmt
        .join(Instrument, Instrument.sector_id == Sector.id, isouter=True)
        .join(PriceSnapshot, sa.and_(
            PriceSnapshot.instrument_id == Instrument.id,
            PriceSnapshot.as_of_date == LATEST_PER_INSTRUMENT,
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
        .select_from(Instrument)  # явная левая сторона, как в _catalog_stmt
        .join(PriceSnapshot, sa.and_(
            PriceSnapshot.instrument_id == Instrument.id,
            PriceSnapshot.as_of_date == LATEST_PER_INSTRUMENT,
        ), isouter=True)  # LEFT: WHERE по change_percent отфильтрует инструменты без котировок
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


# Ввод данных: CRUD (правка к лабораторной №4) --------------------------------
# Задание: приложение должно включать «ввод данных». Реализованы создание,
# изменение и удаление инструментов и снимков цен; биржи и секторы —
# справочники, они выбираются в формах, но не редактируются.

WRITE_READ_ONLY_NOTICE = (
    "Ввод данных на этом хостинге отключён: у пользователя БД нет прав на запись "
    "(read-only). Выдайте права на таблицы instruments и price_snapshots — раздел "
    "«Права на запись для ввода данных» в DEPLOY_ALWAYSDATA.md. "
    "Остальные разделы приложения работают."
)

# Ограничения по схеме БД (db/schema.sql): numeric(14,4) для цены,
# numeric(6,2) для изменения и BIGINT для объёма — лишние разряды
# отбраковываем на валидации, а не ловим ошибку базы.
_PRICE_MAX = 9_999_999_999
_CHANGE_MAX = 9_999.99
_VOLUME_MAX = 9_000_000_000_000


class InstrumentCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.\-]+$",
                        description="Биржевой тикер, напр. GAZP")
    name: str = Field(min_length=1, max_length=255)
    instrument_type: Literal["stock", "etf", "fund", "bond"]
    exchange: Optional[str] = Field(None, max_length=20, description="Код биржи из справочника")
    sector: Optional[str] = Field(None, max_length=100, description="Название сектора из справочника")
    currency: str = Field("RUB", min_length=1, max_length=10)
    description: Optional[str] = Field(None, max_length=2000)
    listed_date: Optional[date] = None


class InstrumentUpdate(BaseModel):
    """Частичное изменение: None-поля и не переданные поля не трогаем."""
    ticker: Optional[str] = Field(None, min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.\-]+$")
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    instrument_type: Optional[Literal["stock", "etf", "fund", "bond"]] = None
    exchange: Optional[str] = Field(None, max_length=20)
    sector: Optional[str] = Field(None, max_length=100)
    currency: Optional[str] = Field(None, min_length=1, max_length=10)
    description: Optional[str] = Field(None, max_length=2000)
    listed_date: Optional[date] = None


class PriceCreate(BaseModel):
    as_of_date: date
    price: float = Field(gt=0, le=_PRICE_MAX)
    change_percent: Optional[float] = Field(None, ge=-_CHANGE_MAX, le=_CHANGE_MAX)
    volume: Optional[int] = Field(None, ge=0, le=_VOLUME_MAX)


class PriceUpdate(BaseModel):
    """Дата снимка неизменяема (это его ключ) — правим только значения."""
    price: Optional[float] = Field(None, gt=0, le=_PRICE_MAX)
    change_percent: Optional[float] = Field(None, ge=-_CHANGE_MAX, le=_CHANGE_MAX)
    volume: Optional[int] = Field(None, ge=0, le=_VOLUME_MAX)


def _write_http_error(exc: sa.exc.DBAPIError, unique_detail: Optional[str] = None,
                      fk_detail: Optional[str] = None) -> Optional[HTTPException]:
    """HTTP-ответ ошибки записи: 503 read-only с уведомлением; 409 при нарушении
    уникальности (23505) или внешнего ключа (23503); None — ошибка не наша."""
    if _is_read_only_error(exc):
        return HTTPException(status_code=503, detail=WRITE_READ_ONLY_NOTICE)
    pgcode = getattr(exc.orig, "pgcode", None)
    if pgcode == "23505" and unique_detail:
        return HTTPException(status_code=409, detail=unique_detail)
    if pgcode == "23503" and fk_detail:
        return HTTPException(status_code=409, detail=fk_detail)
    return None


def _commit_writes(db: Session, unique_detail: Optional[str] = None,
                   fk_detail: Optional[str] = None) -> None:
    """Фиксация ввода с graceful-обработкой ошибок записи (как импорт лаб. №4):
    read-only пользователь → 503 с уведомлением; конфликт ограничений → 409.
    ORM-изменения исполняются в момент commit, поэтому ловим его."""
    try:
        db.commit()
    except sa.exc.DBAPIError as exc:
        db.rollback()
        http_exc = _write_http_error(exc, unique_detail, fk_detail)
        if http_exc is not None:
            raise http_exc from exc
        raise


def _exchange_id_or_400(db: Session, code: Optional[str]) -> Optional[int]:
    if code is None:
        return None
    found = db.execute(select(Exchange).where(Exchange.code == code)).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=400, detail=f"Неизвестная биржа: {code}")
    return found.id


def _sector_id_or_400(db: Session, name: Optional[str]) -> Optional[int]:
    if name is None:
        return None
    found = db.execute(select(Sector).where(Sector.name == name)).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=400, detail=f"Неизвестный сектор: {name}")
    return found.id


def _price_dto(snap: PriceSnapshot) -> dict:
    return {
        "instrument_id": snap.instrument_id,
        "date": snap.as_of_date.isoformat(),
        "price": float(snap.price),
        "change_percent": float(snap.change_percent) if snap.change_percent is not None else None,
        "volume": snap.volume,
    }


@app.post("/api/instruments", tags=["Ввод данных (CRUD)"], status_code=201)
def create_instrument(body: InstrumentCreate, db: Session = Depends(get_db)):
    """CRUD: добавить инструмент. Тикер уникален, справочники проверяются."""
    inst = Instrument(
        ticker=body.ticker.strip().upper(),
        name=body.name.strip(),
        instrument_type=body.instrument_type,
        exchange_id=_exchange_id_or_400(db, body.exchange),
        sector_id=_sector_id_or_400(db, body.sector),
        currency=body.currency.strip().upper(),
        description=body.description,
        listed_date=body.listed_date,
    )
    db.add(inst)
    _commit_writes(db, unique_detail=f"Инструмент с тикером {inst.ticker} уже существует")
    db.refresh(inst)
    return _instrument_dto(inst)


@app.put("/api/instruments/{instrument_id}", tags=["Ввод данных (CRUD)"])
def update_instrument(instrument_id: int, body: InstrumentUpdate, db: Session = Depends(get_db)):
    """CRUD: изменить инструмент — только переданные поля (PATCH-семантика)."""
    inst = db.get(Instrument, instrument_id)
    if inst is None:
        raise HTTPException(status_code=404, detail="Инструмент не найден")
    data = body.model_dump(exclude_unset=True)
    if data.get("ticker"):
        data["ticker"] = data["ticker"].strip().upper()
    if data.get("name"):
        data["name"] = data["name"].strip()
    if data.get("currency"):
        data["currency"] = data["currency"].strip().upper()
    if "exchange" in data:
        data["exchange_id"] = _exchange_id_or_400(db, data.pop("exchange"))
    if "sector" in data:
        data["sector_id"] = _sector_id_or_400(db, data.pop("sector"))
    for key, value in data.items():
        setattr(inst, key, value)
    _commit_writes(db, unique_detail=f"Инструмент с тикером {inst.ticker} уже существует")
    db.refresh(inst)
    return _instrument_dto(inst)


@app.delete("/api/instruments/{instrument_id}", tags=["Ввод данных (CRUD)"])
def delete_instrument(instrument_id: int, db: Session = Depends(get_db)):
    """CRUD: удалить инструмент. История цен стирается каскадно (ON DELETE CASCADE,
    db/schema.sql); инструмент, на который ссылаются новости/события, не удалить."""
    inst = db.get(Instrument, instrument_id)
    if inst is None:
        raise HTTPException(status_code=404, detail="Инструмент не найден")
    ticker, snapshots = inst.ticker, db.execute(
        select(func.count(PriceSnapshot.id)).where(PriceSnapshot.instrument_id == instrument_id)
    ).scalar_one()
    # Bulk-DELETE в обход ORM-каскада: история цен стирается самой БД (ON DELETE
    # CASCADE из db/schema.sql), а новости/события с их FK-ограничением дают
    # IntegrityError 23503, который переводится в 409. DELETE исполняется сразу,
    # поэтому try охватывает и его, а не только commit.
    try:
        db.execute(sa.delete(Instrument).where(Instrument.id == instrument_id))
        db.commit()
    except sa.exc.DBAPIError as exc:
        db.rollback()
        http_exc = _write_http_error(
            exc,
            fk_detail="Инструмент используется в связанных записях "
                      "(новости, события, ссылки) — сначала отвяжите их",
        )
        if http_exc is not None:
            raise http_exc from exc
        raise
    return {"deleted": instrument_id, "ticker": ticker, "cascade_price_snapshots": snapshots}


@app.post("/api/instruments/{instrument_id}/prices", tags=["Ввод данных (CRUD)"], status_code=201)
def create_price(instrument_id: int, body: PriceCreate, db: Session = Depends(get_db)):
    """CRUD: добавить снимок цены (уникален парой инструмент + дата)."""
    if db.get(Instrument, instrument_id) is None:
        raise HTTPException(status_code=404, detail="Инструмент не найден")
    if body.as_of_date > date.today():
        raise HTTPException(status_code=400, detail="Дата снимка не может быть в будущем")
    snap = PriceSnapshot(
        instrument_id=instrument_id,
        as_of_date=body.as_of_date,
        price=body.price,
        change_percent=body.change_percent,
        volume=body.volume,
    )
    db.add(snap)
    _commit_writes(db, unique_detail=f"Снимок цены на {body.as_of_date.isoformat()} уже существует")
    db.refresh(snap)
    return _price_dto(snap)


@app.put("/api/instruments/{instrument_id}/prices/{as_of_date}", tags=["Ввод данных (CRUD)"])
def update_price(instrument_id: int, as_of_date: date, body: PriceUpdate,
                 db: Session = Depends(get_db)):
    """CRUD: исправить снимок цены на дату (цена, изменение, объём)."""
    snap = db.execute(select(PriceSnapshot).where(
        PriceSnapshot.instrument_id == instrument_id,
        PriceSnapshot.as_of_date == as_of_date,
    )).scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail="Снимок цены не найден")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(snap, key, value)
    _commit_writes(db)
    db.refresh(snap)
    return _price_dto(snap)


@app.delete("/api/instruments/{instrument_id}/prices/{as_of_date}", tags=["Ввод данных (CRUD)"])
def delete_price(instrument_id: int, as_of_date: date, db: Session = Depends(get_db)):
    """CRUD: удалить снимок цены — точка исчезает из истории и графика."""
    snap = db.execute(select(PriceSnapshot).where(
        PriceSnapshot.instrument_id == instrument_id,
        PriceSnapshot.as_of_date == as_of_date,
    )).scalar_one_or_none()
    if snap is None:
        raise HTTPException(status_code=404, detail="Снимок цены не найден")
    db.delete(snap)
    _commit_writes(db)
    return {"deleted": as_of_date.isoformat(), "instrument_id": instrument_id}


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


@app.get("/api/db-info", tags=["Сведения о БД"])
def db_info(db: Session = Depends(get_db)):
    """Сведения о БД: СУБД и версия, база, пользователь, объём таблиц и права записи.

    Только SELECT — раздел безопасен на read-only-хостинге. Права определяются
    без попытки записи: has_table_privilege(current_user, таблица, 'INSERT').
    """
    full_version, database, db_user, server_time = db.execute(sa.text(
        "SELECT version(), current_database(), current_user, now() AS server_time"
    )).one()

    tables = []
    for model in (Exchange, Sector, Instrument, PriceSnapshot, News):
        name = model.__table__.name
        rows = db.execute(select(func.count(model.id))).scalar_one()
        size = db.execute(
            sa.text(f"SELECT pg_total_relation_size('{name}')")
        ).scalar_one()
        tables.append({"name": name, "rows": rows, "size_bytes": int(size)})

    # imported_news создаётся лениво (lab4): на свежей БД её может не быть.
    try:
        imported_rows = db.execute(select(func.count(NewsImported.id))).scalar_one()
        imported_size = db.execute(
            sa.text("SELECT pg_total_relation_size('imported_news')")
        ).scalar_one()
    except sa.exc.DBAPIError:
        db.rollback()
        imported_rows, imported_size = None, None
    if imported_rows is not None:
        tables.append({"name": "imported_news", "rows": imported_rows,
                       "size_bytes": int(imported_size)})

    # to_regclass → NULL для отсутствующей таблицы, COALESCE → False.
    priv = db.execute(sa.text(
        "SELECT has_table_privilege('instruments', 'INSERT') AS instruments, "
        "       has_table_privilege('price_snapshots', 'INSERT') AS price_snapshots, "
        "       COALESCE(has_table_privilege(to_regclass('imported_news'), 'INSERT'), false) "
        "           AS imported_news"
    )).one()

    return {
        "dbms": "PostgreSQL",
        "version": re.match(r"PostgreSQL\s+[\d.]+", full_version).group(0),
        "version_full": full_version,
        "database": database,
        "db_user": db_user,
        "server_time": server_time.isoformat(),
        "tables": tables,
        "can_write": {key: bool(value) for key, value in priv._mapping.items()},
    }


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
