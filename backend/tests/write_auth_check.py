# -*- coding: utf-8 -*-
"""Проверка авторизации записи (ревью, пункт 1 к лаб. №4).

Поднимает второй инстанс приложения на :8001 с переменной FUNDS_ADMIN_KEY
и проверяет: запись без ключа/с неверным ключом → 401, с верным ключом →
работает, чтение открыто без ключа, db-info показывает write_auth_required=true.

Запускается отдельно от acceptance.py (сам поднимает сервер):
  backend/.venv/Scripts/python backend/tests/write_auth_check.py
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

from app.database import DATABASE_URL  # noqa: E402  (тот же .env, что у сервера)

BASE = "http://127.0.0.1:8001"
KEY = "test-secret-123"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))


def request(method, path, payload=None, key=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"} if data else {}
    if key is not None:
        headers["X-Admin-Key"] = key
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


env = dict(os.environ, FUNDS_ADMIN_KEY=KEY, DATABASE_URL=DATABASE_URL)
print("Запуск второго инстанса на :8001 с FUNDS_ADMIN_KEY…")
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

    # Чтение открыто даже без ключа.
    st, cat = request("GET", "/api/instruments")
    check("Чтение без ключа открыто (GET /api/instruments → 200)", st == 200, st)

    # Запись без ключа и с неверным ключом → 401.
    payload = {"ticker": "ZZAUTH", "name": "Проверка ключа", "instrument_type": "stock"}
    st, no_key = request("POST", "/api/instruments", payload)
    check("POST без ключа → 401", st == 401 and "X-Admin-Key" in str(no_key.get("detail", "")),
          f"{st}, {no_key}")
    st, bad_key = request("POST", "/api/instruments", payload, key="wrong-key")
    check("POST с неверным ключом → 401", st == 401, f"{st}, {bad_key}")

    # db-info честно сообщает, что запись защищена.
    st, info = request("GET", "/api/db-info")
    check("db-info: write_auth_required=true", st == 200 and info.get("write_auth_required") is True,
          f"{st}, {info.get('write_auth_required')}")
    check("db-info: can_write=true (права БД есть, вопрос в ключе)",
          st == 200 and info.get("can_write") is True, info.get("can_write"))

    # С верным ключом все операции CRUD работают.
    st, created = request("POST", "/api/instruments", {**payload, "currency": "rub"}, key=KEY)
    check("POST с верным ключом → 201", st == 201 and created.get("ticker") == "ZZAUTH",
          f"{st}, {created}")
    inst_id = created.get("id") if st == 201 else None
    if inst_id:
        st, snap = request("POST", f"/api/instruments/{inst_id}/prices",
                           {"as_of_date": "2026-01-15", "price": 10.5}, key=KEY)
        check("POST цены с ключом → 201", st == 201, f"{st}, {snap}")
        st, put_no = request("PUT", f"/api/instruments/{inst_id}/prices/2026-01-15", {"price": 11})
        check("PUT цены без ключа → 401 (защищены и правки)", st == 401, f"{st}, {put_no}")
        st, put_ok = request("PUT", f"/api/instruments/{inst_id}/prices/2026-01-15",
                             {"price": 11.5}, key=KEY)
        check("PUT цены с ключом → 200", st == 200 and put_ok.get("price") == 11.5, f"{st}, {put_ok}")
        st, del_ok = request("DELETE", f"/api/instruments/{inst_id}/prices/2026-01-15", key=KEY)
        check("DELETE цены с ключом → 200", st == 200, f"{st}, {del_ok}")
        st, del_inst = request("DELETE", f"/api/instruments/{inst_id}", key=KEY)
        check("DELETE инструмента с ключом → 200", st == 200, f"{st}, {del_inst}")

    st, cat2 = request("GET", "/api/instruments")
    check("ОЧИСТКА: тестовый инструмент удалён через API",
          st == 200 and not any(row.get("ticker") == "ZZAUTH" for row in cat2), st)
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()

fails = [r for r in results if not r[1]]
print(f"ИТОГ: {len(results) - len(fails)}/{len(results)} проверок пройдено")
for name, ok, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
sys.exit(1 if fails else 0)
