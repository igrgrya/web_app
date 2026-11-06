"""ORM-модели таблиц db/schema.sql.

Лабораторная №3 использует exchanges/sectors/instruments/price_snapshots;
news — таблица ленты новостей, задействована в лабораторной №4 (обмен
данными: RSS-лента, экспорт, объединение с внешними RSS-файлами).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Exchange(Base):
    __tablename__ = "exchanges"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    country: Mapped[Optional[str]] = mapped_column(String(100))
    timezone: Mapped[Optional[str]] = mapped_column(String(50))
    website_url: Mapped[Optional[str]] = mapped_column(Text)


class Sector(Base):
    __tablename__ = "sectors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    instrument_type: Mapped[str] = mapped_column(String(20))
    exchange_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exchanges.id"))
    sector_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sectors.id"))
    currency: Mapped[str] = mapped_column(String(10), default="RUB")
    description: Mapped[Optional[str]] = mapped_column(Text)
    listed_date: Mapped[Optional[date]] = mapped_column(Date)

    exchange: Mapped[Optional[Exchange]] = relationship(lazy="joined")
    sector: Mapped[Optional[Sector]] = relationship(lazy="joined")
    snapshots: Mapped[list["PriceSnapshot"]] = relationship(back_populates="instrument")


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id", ondelete="CASCADE"))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 4))
    change_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    volume: Mapped[Optional[int]] = mapped_column(BigInteger)
    as_of_date: Mapped[date] = mapped_column(Date)
    # В схеме есть UNIQUE (instrument_id, as_of_date); на уровне ORM не дублируем.

    instrument: Mapped[Instrument] = relationship(back_populates="snapshots")


class News(Base):
    """Новостная лента сайта (лабораторная №4): RSS-лента и форматы экспорта."""

    __tablename__ = "news"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime)  # TIMESTAMP without TZ — трактуем как московское время
    related_instrument_id: Mapped[Optional[int]] = mapped_column(ForeignKey("instruments.id"))

    related_instrument: Mapped[Optional[Instrument]] = relationship(lazy="joined")
