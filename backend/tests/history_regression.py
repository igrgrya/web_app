"""Проверка генератора в изолированной схеме; все изменения откатываются."""
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import DATABASE_URL
from sqlalchemy.engine import make_url
import psycopg2
from psycopg2 import sql

connection = psycopg2.connect(**make_url(DATABASE_URL).translate_connect_args(username="user", database="dbname"))
script = (Path(__file__).resolve().parents[2] / "db/seed_history.sql").read_text(encoding="utf-8")
# Транзакцией управляет тест. DO-блок BEGIN не затрагиваем.
script = script.replace("\nBEGIN;", "").replace("\nCOMMIT;", "")
try:
    with connection.cursor() as cur:
        schema = "history_test_" + uuid.uuid4().hex
        cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        cur.execute(sql.SQL("SET LOCAL search_path TO {}, public").format(sql.Identifier(schema)))
        cur.execute("CREATE TABLE instruments (id integer PRIMARY KEY)")
        cur.execute("CREATE TABLE price_snapshots (id bigserial PRIMARY KEY, instrument_id integer REFERENCES instruments, price numeric(14,4), change_percent numeric(6,2), volume bigint, as_of_date date, UNIQUE(instrument_id, as_of_date))")
        cur.execute("INSERT INTO instruments VALUES (1), (2)")
        cur.execute("INSERT INTO price_snapshots(instrument_id, price, volume, as_of_date) VALUES (1,100,1000,'2020-01-15'), (2,200,2000,'2020-01-15')")
        def rows():
            cur.execute("SELECT instrument_id,price,change_percent,volume,as_of_date FROM price_snapshots ORDER BY instrument_id,as_of_date")
            return cur.fetchall()
        cur.execute(script)
        first = rows()
        assert len(first) == 62 and max(r[-1] for r in first).isoformat() == "2020-01-15"
        cur.execute("DROP TABLE history_anchor")
        cur.execute(script)
        assert rows() == first, "Repeated generation must preserve values"
        cur.execute("DROP TABLE history_anchor")
        cur.execute("DELETE FROM price_snapshots WHERE instrument_id=2 AND as_of_date='2020-01-15'")
        incomplete = rows()
        cur.execute("SAVEPOINT incomplete_input")
        try:
            cur.execute(script)
        except psycopg2.errors.RaiseException:
            cur.execute("ROLLBACK TO SAVEPOINT incomplete_input")
        else:
            raise AssertionError("Incomplete anchor must be rejected")
        assert rows() == incomplete, "Validation failure must preserve history"
        cur.execute("DELETE FROM price_snapshots")
        cur.execute("SAVEPOINT empty_input")
        try:
            cur.execute(script)
        except psycopg2.errors.RaiseException:
            cur.execute("ROLLBACK TO SAVEPOINT empty_input")
        else:
            raise AssertionError("Empty input must be rejected")
        print("PASS: old dates, deterministic rerun, incomplete and empty input; original database unchanged")
finally:
    connection.rollback()
    connection.close()
