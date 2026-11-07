# -*- coding: utf-8 -*-
"""Симуляция read-only/частичных прав БД (ревью к лаб. №4, пункты 1 и 6).

Поднимает второй инстанс приложения на :8001 от имени временной роли
crud_ro_test с урезанными правами: SELECT + INSERT на instruments и
price_snapshots (без UPDATE/DELETE и без секвенций), SELECT на
справочники и news. Ожидается:

  - все операции записи CRUD → 503 с уведомлением (INSERT падает на
    nextval секвенции: 42501, что _is_read_only_error переводит в 503);
  - db-info честно показывает частичные права: добавление ✅, изменение/
    удаление/секвенция ⛔, can_write=false, список missing заполнен;
  - чтение работает.

Запускается отдельно от acceptance.py (сам поднимает сервер и создаёт роль):
  backend/.venv/Scripts/python backend/tests/read_only_check.py
Требуется локальный PostgreSQL (DATABASE_URL — как у acceptance.py).
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.stdout.reconfigure(encoding="utf-8")

from app.database import DATABASE_URL  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
import psycopg2  # noqa: E402
from psycopg2 import sql  # noqa: E402

BASE = "http://127.0.0.1:8001"
ROLE = "crud_ro_test"
PASSWORD = "ro-test-pw"
RO_URL = "postgresql+psycopg2://%s:%s@%s:%s/%s" % (
    ROLE, PASSWORD,
    make_url(DATABASE_URL).host, make_url(DATABASE_URL).port or 5432,
    make_url(DATABASE_URL).database,
)
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))


def request(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body


# --- временная роль с урезанными правами ------------------------------------
admin = psycopg2.connect(
    **make_url(DATABASE_URL).translate_connect_args(username="user", database="dbname"))
admin.autocommit = True
with admin.cursor() as cur:
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (ROLE,))
    if cur.fetchone():
        cur.execute(sql.SQL("DROP OWNED BY {}").format(sql.Identifier(ROLE)))
        cur.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(ROLE)))
    cur.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}")
                .format(sql.Identifier(ROLE), sql.Literal(PASSWORD)))
    # SELECT+INSERT на таблицы CRUD, но НЕ UPDATE/DELETE и НЕ секвенции:
    # имитируем ровно тот случай пункта 6 — «INSERT недостаточно для CRUD».
    cur.execute(sql.SQL("GRANT SELECT, INSERT ON instruments, price_snapshots TO {}")
                .format(sql.Identifier(ROLE)))
    cur.execute(sql.SQL("GRANT SELECT ON exchanges, sectors, news TO {}")
                .format(sql.Identifier(ROLE)))

env = dict(os.environ, DATABASE_URL=RO_URL)
print("Запуск второго инстанса на :8001 от роли %s…" % ROLE)
server = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8001", "--log-level", "warning"],
    cwd=str(BACKEND_DIR), env=env,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    for _ in range(60):
        try:
            with urllib.request.urlopen(BASE + "/api/health", timeout=2) as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError("второй инстанс не поднялся за 30 с")

    st, cat = request("GET", "/api/instruments")
    check("Чтение работает (GET /api/instruments → 200)", st == 200 and len(cat) == 18, st)

    st, info = request("GET", "/api/db-info")
    w = info.get("write", {})
    inst = w.get("instruments", {})
    check("db-info: частичные права видны — добавление ✅, изменение/удаление/секвенция ⛔",
          inst.get("insert") is True and inst.get("update") is False
          and inst.get("delete") is False and inst.get("sequence") is False, inst)
    check("db-info: can_write=false (INSERT без остального — не полный CRUD)",
          info.get("can_write") is False, info.get("can_write"))
    missing = w.get("missing", [])
    check("db-info: missing перечисляет недостающие права",
          any("изменение" in s for s in missing) and any("удаление" in s for s in missing)
          and any("секвенц" in s for s in missing), missing)

    notice_fragment = "Ввод данных на этом хостинге отключён"
    st, resp = request("POST", "/api/instruments",
                       {"ticker": "ZZRO", "name": "Запись без прав", "instrument_type": "stock"})
    check("POST инструмента → 503 с уведомлением (nextval секвенции запрещён)",
          st == 503 and notice_fragment in str(resp.get("detail", "")), f"{st}, {resp}")

    st, resp2 = request("PUT", "/api/instruments/1", {"name": "X"})
    check("PUT инструмента → 503 (UPDATE запрещён)",
          st == 503 and notice_fragment in str(resp2.get("detail", "")), f"{st}, {resp2}")
    st, resp3 = request("DELETE", "/api/instruments/1")
    check("DELETE инструмента → 503 (DELETE запрещён; SBER остаётся жив)",
          st == 503 and notice_fragment in str(resp3.get("detail", "")), f"{st}, {resp3}")
    st, resp4 = request("POST", "/api/instruments/1/prices",
                        {"as_of_date": "2026-01-15", "price": 10})
    check("POST цены → 503", st == 503 and notice_fragment in str(resp4.get("detail", "")),
          f"{st}, {resp4}")
    st, after = request("GET", "/api/instruments")
    check("ОЧИСТКА: попытки записи ничего не создали (18 инструментов)",
          st == 200 and len(after) == 18, len(after) if st == 200 else st)
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
    with admin.cursor() as cur:
        cur.execute(sql.SQL("DROP OWNED BY {}").format(sql.Identifier(ROLE)))
        cur.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(ROLE)))
admin.close()

fails = [r for r in results if not r[1]]
print(f"ИТОГ: {len(results) - len(fails)}/{len(results)} проверок пройдено")
for name, ok, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
sys.exit(1 if fails else 0)
