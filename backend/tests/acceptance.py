# -*- coding: utf-8 -*-
"""Комплексная приёмка л.р. №3: БД + API. Запуск: backend/.venv/Scripts/python lab3_acceptance.py"""
import json, os, sys, urllib.request, urllib.parse, urllib.error
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import DATABASE_URL
from sqlalchemy.engine import make_url
sys.stdout.reconfigure(encoding="utf-8")
import psycopg2

BASE = os.environ.get("LAB3_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))

def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            body = r.read().decode("utf-8")
            try: data = json.loads(body)
            except Exception: data = body
            return r.status, data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try: data = json.loads(body)
        except Exception: data = body
        return e.code, data

# ---------- БД ----------
url = make_url(DATABASE_URL)
conn = psycopg2.connect(**url.translate_connect_args(username="user", database="dbname"))
cur = conn.cursor()

cur.execute("SELECT count(*) FROM instruments"); n_inst = cur.fetchone()[0]
check("БД: 18 инструментов", n_inst == 18, n_inst)
cur.execute("SELECT count(*) FROM price_snapshots"); n_snap = cur.fetchone()[0]
check("БД: 558 снимков цен", n_snap == 558, n_snap)
cur.execute("SELECT max(as_of_date) FROM price_snapshots"); anchor_date = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM price_snapshots WHERE as_of_date = %s", (anchor_date,)); n_today = cur.fetchone()[0]
check("БД: у всех 18 есть снимок на последнюю дату данных", n_today == 18, n_today)
cur.execute("SELECT count(*), min(as_of_date), max(as_of_date) FROM price_snapshots WHERE as_of_date < %s", (anchor_date,))
n_hist, d_min, d_max = cur.fetchone()
check("БД: история 540 строк, завершается до базовой даты", n_hist == 540 and d_max is not None and d_max < anchor_date, f"{n_hist}, {d_min}..{d_max}")
cur.execute("""SELECT instrument_id, count(*) FROM price_snapshots WHERE as_of_date < %s
               GROUP BY instrument_id HAVING count(*) <> 30""", (anchor_date,))
check("БД: у каждого инструмента ровно 30 исторических дней", cur.rowcount == 0, cur.rowcount)
cur.execute("SELECT count(*) FROM price_snapshots WHERE price <= 0")
check("БД: нет нулевых/отрицательных цен", cur.fetchone()[0] == 0)
cur.execute("""SELECT count(*) FROM price_snapshots ps JOIN price_snapshots ps2
               ON ps.instrument_id=ps2.instrument_id AND ps.as_of_date=ps2.as_of_date AND ps.id<>ps2.id""")
check("БД: дубликатов (инструмент, дата) нет — работает UNIQUE", cur.fetchone()[0] == 0)
cur.execute("SELECT count(*) FROM price_snapshots WHERE EXTRACT(ISODOW FROM as_of_date) >= 6")
check("БД: в истории нет выходных дней", cur.fetchone()[0] == 0)
cur.execute("""SELECT count(*) FROM price_snapshots ps
               JOIN price_snapshots ps2
                 ON ps2.instrument_id = ps.instrument_id
                AND ps2.as_of_date = (SELECT max(as_of_date) FROM price_snapshots
                                      WHERE instrument_id = ps.instrument_id AND as_of_date < ps.as_of_date)
               WHERE ps.change_percent IS NULL
                  OR abs(ROUND((ps.price / ps2.price - 1) * 100, 2) - ps.change_percent) > 0.02""")
check("БД: change_percent всех дней стыкуется с ценами (±0.02)", cur.fetchone()[0] == 0)
conn.close()

# ---------- API ----------
st, d = get("/api/health")
check("API: /api/health 200", st == 200, st)
check("API: health db=connected, 18, 558", d.get("status")=="ok" and d.get("instruments")==18 and d.get("price_snapshots")==558, d)

st, d = get("/api/instruments")
check("API: каталог 200, 18 строк", st == 200 and isinstance(d, list) and len(d) == 18, f"{st}, {len(d) if isinstance(d,list) else type(d)}")
cat = d
keys = {"id","ticker","name","type","exchange","sector","currency","price","change_percent","volume","as_of_date","description","listed_date"}
check("API: структура строки каталога полная", bool(d) and all(keys <= set(r) for r in d), sorted(keys - set(d[0])) if d else "?")
check("API: все цены > 0", bool(d) and all(r["price"] and r["price"] > 0 for r in d))

st, d = get("/api/instruments?exchange=MOEX")
check("API: фильтр биржи MOEX = 10", st == 200 and len(d) == 10, len(d))
st, d = get("/api/instruments?sector=" + urllib.parse.quote("Технологии"))
check("API: фильтр сектора «Технологии» = 6", st == 200 and len(d) == 6, len(d))
st, d = get("/api/instruments?instrument_type=etf")
check("API: фильтр etf = 3 (FXIT, SPY, LQDT)", st == 200 and len(d) == 3 and {r["ticker"] for r in d} == {"FXIT","SPY","LQDT"}, len(d))
st, d = get("/api/instruments?exchange=MOEX&instrument_type=stock&sector=" + urllib.parse.quote("Финансы"))
check("API: комбо MOEX+stock+Финансы = SBER,VTBR,TCSG", st == 200 and {r["ticker"] for r in d} == {"SBER","VTBR","TCSG"}, [r["ticker"] for r in d])

st, d = get("/api/instruments?sort=price&direction=desc")
check("API: цена desc начинается с LKOH (7150)", d[0]["ticker"]=="LKOH" and d[0]["price"]==7150.0, d[0]["ticker"])
st, d = get("/api/instruments?sort=volume&direction=asc")
check("API: объём asc начинается с FXIT (320000)", d[0]["ticker"]=="FXIT" and d[0]["volume"]==320000, d[0]["ticker"])
st, d = get("/api/instruments?sort=change&direction=desc")
check("API: изменение desc = максимум каталога", d[0]["change_percent"] == max(r["change_percent"] for r in cat), d[0]["ticker"])
st, d = get("/api/instruments?sort=ticker&direction=asc")
check("API: тикер asc = AAPL..VTBR", d[0]["ticker"]=="AAPL" and d[-1]["ticker"]=="VTBR", f"{d[0]['ticker']}..{d[-1]['ticker']}")

st, d = get("/api/instruments?sort=DROP")
check("API: неизвестная колонка сортировки → 400", st == 400, st)
st, d = get("/api/instruments?direction=sideways")
check("API: неверное направление → 422", st == 422, st)
st, d = get("/api/instruments?instrument_type=crypto")
check("API: неверный тип инструмента → 422", st == 422, st)

st, d = get("/api/search?q=" + urllib.parse.quote("газ"))
check("API: поиск «газ» → GAZP+SNGS", st==200 and {r["ticker"] for r in d} == {"GAZP","SNGS"}, [r["ticker"] for r in d])
st, d = get("/api/search?q=" + urllib.parse.quote("SBER"))
check("API: поиск «SBER» регистронезависим → 1", st==200 and len(d)==1 and d[0]["ticker"]=="SBER", len(d))
st, d = get("/api/search?q=" + urllib.parse.quote("qqqqzz"))
check("API: пустой результат поиска валиден (200, [])", st==200 and d==[], f"{st}, {d}")
st, d = get("/api/search?q=" + urllib.parse.quote("%.__"))
check("API: спецсимволы LIKE экранируются → 0 строк", st==200 and len(d)==0, len(d))
inj = "';DROP TABLE instruments;--"
st, d = get("/api/search?q=" + urllib.parse.quote(inj))
st2, d2 = get("/api/health")
check("API: SQL-инъекция безопасна (0 строк, таблицы целы)", st==200 and isinstance(d,list) and len(d)==0 and d2.get("instruments")==18, f"{st}, instruments={d2.get('instruments')}")
st, d = get("/api/search?q=%27")
check("API: одиночная кавычка → 200 без 500", st == 200, st)

st, d = get("/api/sectors/summary")
total = sum(r["instruments_count"] for r in d)
expected_groups = {}
for row in cat:
    expected_groups.setdefault((row["sector"], row["currency"]), []).append(row)
check("API: агрегаты — сектор и валюта, сумма = 18", st == 200 and len(d) == len(expected_groups) and total == 18)
check("API: средние цены не смешивают валюты", all(
    (r["sector"], r["currency"]) in expected_groups and
    r["instruments_count"] == len(expected_groups[(r["sector"], r["currency"])]) and
    abs(r["avg_price"] - round(sum(x["price"] for x in expected_groups[(r["sector"], r["currency"])]) / r["instruments_count"], 2)) < .011 and
    r["total_volume"] == sum(x["volume"] for x in expected_groups[(r["sector"], r["currency"])])
    for r in d))

st, d = get("/api/top-movers?limit=5")
cat_changes = sorted((r["change_percent"] for r in cat), reverse=True)
check("API: рост = топ-5 каталога по убыванию", [x["change_percent"] for x in d["gainers"]] == cat_changes[:5], [x["change_percent"] for x in d["gainers"]])
check("API: падение = анти-топ-5 каталога по возрастанию", [x["change_percent"] for x in d["losers"]] == sorted(cat_changes)[:5], [x["change_percent"] for x in d["losers"]])
check("API: в топах по 5 позиций", len(d["gainers"])==5 and len(d["losers"])==5, "")
st, d = get("/api/top-movers?limit=18")
check("API: limit=18 — в списке роста только change_percent > 0", st==200 and all(x["change_percent"] > 0 for x in d["gainers"]), [x["ticker"] for x in d["gainers"] if x["change_percent"] <= 0])
check("API: limit=18 — в списке падения только change_percent < 0", st==200 and all(x["change_percent"] < 0 for x in d["losers"]), [x["ticker"] for x in d["losers"] if x["change_percent"] >= 0])
st, d = get("/api/top-movers?limit=19")
check("API: limit=19 → 422 (граница 1..18)", st == 422, st)
st, d = get("/api/top-movers?limit=0")
check("API: limit=0 → 422", st == 422, st)

st, d = get("/api/instruments/1")
check("API: карточка id=1 = SBER с описанием", st==200 and d["ticker"]=="SBER" and "банк" in (d["description"] or ""), d.get("ticker"))
st, d = get("/api/instruments/999")
check("API: карточка id=999 → 404", st == 404, st)
st, d = get("/api/instruments/abc")
check("API: карточка id=abc → 422", st == 422, st)

st, d = get("/api/instruments/1/prices?days=30")
check("API: история SBER 30 точек, по возрастанию даты", st==200 and len(d)==30 and d[0]["date"] < d[-1]["date"], f"{len(d)}, {d[0]['date']}..{d[-1]['date']}")
check("API: последняя точка истории = дата набора", d[-1]["date"] == anchor_date.isoformat(), d[-1]["date"])
st, d = get("/api/instruments/1/prices?days=1")
check("API: days=1 → 1 точка", st==200 and len(d)==1, len(d))
st, d = get("/api/instruments/1/prices?days=400")
check("API: days=400 → 422 (граница 1..365)", st == 422, st)
st, d = get("/api/instruments/999/prices")
check("API: история несуществующего → 404", st == 404, st)

with urllib.request.urlopen(BASE + "/openapi.json", timeout=10) as r:
    spec = json.loads(r.read().decode())
paths = set(p for p in spec["paths"] if p.startswith("/api/"))
lab3_paths = {"/api/instruments", "/api/search", "/api/sectors/summary", "/api/top-movers",
              "/api/instruments/{instrument_id}", "/api/instruments/{instrument_id}/prices", "/api/health"}
# С л.р. №4 в спецификации есть и другие /api/* (RSS, экспорт) — проверяем подмножество л.р. №3.
check("OpenAPI: все пути Q1–Q5 л.р. №3 в спецификации", lab3_paths <= paths, sorted(lab3_paths - paths))

ui_path = os.environ.get("LAB3_UI_PATH", "/")
st, body = get(ui_path)
check(f"UI: {ui_path} отдаёт HTML со всеми секциями", st==200 and all(s in body for s in ["Каталог инструментов","Агрегаты по секторам","Лидеры","Динамика цены"]), st)
for asset in ["/static/app.js", "/static/styles.css", "/static/vendor/chart.umd.min.js"]:
    st, _ = get(asset)
    check(f"UI: {asset} 200", st == 200, st)

# Регрессия: поиск одновременно с фильтрами и сортировкой, до LIMIT.
params = {"q": "a", "exchange": "NASDAQ", "sector": "Технологии", "instrument_type": "stock", "sort": "price", "direction": "desc"}
st, d = get("/api/search?" + urllib.parse.urlencode(params))
expected = sorted([r for r in cat if "a" in (r["ticker"] + " " + r["name"]).lower() and r["exchange"] == "NASDAQ" and r["sector"] == "Технологии" and r["type"] == "stock"], key=lambda r: (-r["price"], r["ticker"]))
check("API: поиск + три фильтра + сортировка", st == 200 and [r["id"] for r in d] == [r["id"] for r in expected])
st, d = get("/api/search?" + urllib.parse.urlencode({**params, "limit": 1}))
check("API: поиск ограничивается после сортировки", st == 200 and [r["id"] for r in d] == [r["id"] for r in expected[:1]])
for suffix in ["sort=DROP", "direction=sideways", "instrument_type=crypto"]:
    st, d = get("/api/search?q=a&" + suffix)
    check("API: поиск отклоняет " + suffix, st == (400 if suffix.startswith("sort=") else 422))

# ---------- Ввод данных: CRUD + сведения о БД (правка к л.р. №4) ----------
# Все операции выполняются над тестовым инструментом ZZTEST и в конце
# удаляются через API (страховка — прямой DELETE в БД), эталонные 18/558
# возвращаются. Проверки, чувствительные к якорю данных, выше уже отработали.

import datetime as _dt

def send(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
            try: parsed = json.loads(body)
            except Exception: parsed = body
            return r.status, parsed
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try: parsed = json.loads(body)
        except Exception: parsed = body
        return e.code, parsed

TEST_TICKER = "ZZTEST"
today_iso = _dt.date.today().isoformat()
future_iso = (_dt.date.today() + _dt.timedelta(days=10)).isoformat()

st, created = send("POST", "/api/instruments", {
    "ticker": TEST_TICKER.lower(),  # сервер нормализует в верхний регистр
    "name": "Тестовый инструмент CRUD",
    "instrument_type": "stock",
    "exchange": "MOEX",
    "sector": "Технологии",
    "currency": "rub",
    "listed_date": today_iso,
    "description": "Создан приёмочным тестом, будет удалён",
})
check("CRUD: POST инструмента → 201, тикер и валюта нормализованы",
      st == 201 and created.get("ticker") == "ZZTEST" and created.get("currency") == "RUB", f"{st}, {created}")
test_id = created.get("id") if st == 201 else None

st, cat2 = get("/api/instruments")
check("CRUD: новый инструмент виден в каталоге (19 строк)",
      st == 200 and isinstance(cat2, list) and len(cat2) == 19 and any(r["ticker"] == "ZZTEST" for r in cat2),
      f"{st}, {len(cat2) if isinstance(cat2, list) else '?'}")

st, dup = send("POST", "/api/instruments", {"ticker": "ZZTEST", "name": "Дубль", "instrument_type": "stock"})
check("CRUD: дубль тикера → 409 с пояснением", st == 409 and "уже существует" in str(dup.get("detail")), f"{st}, {dup}")

st, bad_ref = send("POST", "/api/instruments",
                   {"ticker": "ZZBAD", "name": "Нет биржи", "instrument_type": "stock", "exchange": "NOSUCH"})
check("CRUD: неизвестная биржа → 400", st == 400 and "Неизвестная биржа" in str(bad_ref.get("detail")), f"{st}, {bad_ref}")

st, bad_type = send("POST", "/api/instruments", {"ticker": "ZZBAD", "name": "Плохой тип", "instrument_type": "crypto"})
check("CRUD: неверный тип → 422", st == 422, st)

st, bad_ticker = send("POST", "/api/instruments", {"ticker": "ПЛОХ!", "name": "Паттерн тикера", "instrument_type": "stock"})
check("CRUD: тикер вне [A-Za-z0-9.-] → 422", st == 422, st)

if test_id:
    st, upd = send("PUT", f"/api/instruments/{test_id}", {"name": "Тестовый инструмент v2", "sector": "Финансы"})
    check("CRUD: PUT инструмента → 200, изменения сохранены",
          st == 200 and upd.get("name") == "Тестовый инструмент v2" and upd.get("sector") == "Финансы", f"{st}, {upd}")
    st, card = get(f"/api/instruments/{test_id}")
    check("CRUD: карточка отражает правку", st == 200 and card.get("name") == "Тестовый инструмент v2", st)
    # Явный null у обязательного поля — ошибка ввода 422, а не IntegrityError 500
    # на стороне БД (ревью, пункт 3); необязательные поля null-ом очищаются.
    st, null_name = send("PUT", f"/api/instruments/{test_id}", {"name": None})
    check("CRUD: PUT name=null → 422 (не 500)", st == 422, f"{st}, {null_name}")
    st, null_cur = send("PUT", f"/api/instruments/{test_id}", {"currency": None})
    check("CRUD: PUT currency=null → 422 (не 500)", st == 422, f"{st}, {null_cur}")
    st, clear_desc = send("PUT", f"/api/instruments/{test_id}", {"description": None})
    check("CRUD: PUT description=null → 200, необязательное очищено",
          st == 200 and clear_desc.get("description") is None, f"{st}, {clear_desc}")
    st, clear_sector = send("PUT", f"/api/instruments/{test_id}", {"sector": None})
    check("CRUD: PUT sector=null → 200, сектор очищен",
          st == 200 and clear_sector.get("sector") is None, f"{st}, {clear_sector}")
    # Строки из одних пробелов не проходят (ревью, пункт 4).
    st, ws_name = send("POST", "/api/instruments",
                       {"ticker": "ZZWS", "name": "   ", "instrument_type": "stock"})
    check("CRUD: название из одних пробелов → 422", st == 422, f"{st}, {ws_name}")
    st, ws_cur = send("POST", "/api/instruments",
                      {"ticker": "ZZWS", "name": "Валидно", "instrument_type": "stock", "currency": "   "})
    check("CRUD: валюта из одних пробелов → 422", st == 422, f"{st}, {ws_cur}")
else:
    check("CRUD: PUT инструмента", False, "тестовый инструмент не создан")
st, _ = send("PUT", "/api/instruments/999", {"name": "Нет такого"})
check("CRUD: PUT несуществующего → 404", st == 404, st)

if test_id:
    st, snap = send("POST", f"/api/instruments/{test_id}/prices",
                    {"as_of_date": today_iso, "price": 101.5, "change_percent": 1.25, "volume": 125000})
    check("CRUD: POST снимка цены → 201",
          st == 201 and snap.get("date") == today_iso and snap.get("price") == 101.5, f"{st}, {snap}")
    st, dup_snap = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": today_iso, "price": 100})
    check("CRUD: снимок на ту же дату → 409", st == 409 and "уже существует" in str(dup_snap.get("detail")), f"{st}, {dup_snap}")
    st, fut = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": future_iso, "price": 100})
    check("CRUD: дата в будущем → 400", st == 400 and "будущ" in str(fut.get("detail")), f"{st}, {fut}")
    st, neg = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": future_iso, "price": -5})
    check("CRUD: отрицательная цена → 422", st == 422, st)
    st, zero = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": future_iso, "price": 0})
    check("CRUD: нулевая цена → 422", st == 422, st)
    st, neg_vol = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": future_iso, "price": 10, "volume": -1})
    check("CRUD: отрицательный объём → 422", st == 422, st)
    st, noinst = send("POST", "/api/instruments/999/prices", {"as_of_date": today_iso, "price": 10})
    check("CRUD: снимок несуществующего инструмента → 404", st == 404, st)

    st, hist = get(f"/api/instruments/{test_id}/prices")
    check("CRUD: история тестового инструмента — 1 точка на сегодня",
          st == 200 and len(hist) == 1 and hist[0]["date"] == today_iso and hist[0]["price"] == 101.5, f"{st}, {hist}")
    st, upd_snap = send("PUT", f"/api/instruments/{test_id}/prices/{today_iso}", {"price": 102.75, "volume": 126000})
    check("CRUD: PUT снимка → 200", st == 200 and upd_snap.get("price") == 102.75, f"{st}, {upd_snap}")
    st, hist2 = get(f"/api/instruments/{test_id}/prices")
    check("CRUD: история отражает правку цены", st == 200 and hist2 and hist2[-1]["price"] == 102.75, f"{st}, {hist2}")
    st, cat3 = get("/api/instruments")
    zz = next((r for r in cat3 if r["ticker"] == "ZZTEST"), None)
    check("CRUD: каталог показывает свежую цену тестового инструмента", zz is not None and zz["price"] == 102.75, zz)
    st, no_snap = send("PUT", f"/api/instruments/{test_id}/prices/{future_iso}", {"price": 1})
    check("CRUD: PUT несуществующего снимка → 404", st == 404, st)
    # Цена обязательна: явный null — 422, а не IntegrityError (ревью, пункт 3).
    st, null_price = send("PUT", f"/api/instruments/{test_id}/prices/{today_iso}", {"price": None})
    check("CRUD: PUT снимка с price=null → 422 (не 500)", st == 422, f"{st}, {null_price}")
    st, null_post = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": future_iso, "price": None})
    check("CRUD: POST снимка с price=null → 422 (не 500)", st == 422, f"{st}, {null_post}")
    st, del_snap = send("DELETE", f"/api/instruments/{test_id}/prices/{today_iso}")
    check("CRUD: DELETE снимка → 200", st == 200 and del_snap.get("deleted") == today_iso, f"{st}, {del_snap}")
    st, hist3 = get(f"/api/instruments/{test_id}/prices")
    check("CRUD: после DELETE история пуста", st == 200 and hist3 == [], f"{st}, {hist3}")
    # NUMERIC(14,4): цена, которая уместилась бы только округлением в ноль,
    # и цена с лишней точностью отвергаются (422), минимум 0.0001 валиден
    # (ревью, пункт 4).
    st, tiny = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": today_iso, "price": 0.00001})
    check("CRUD: цена 0.00001 (округлилась бы в 0) → 422", st == 422, f"{st}, {tiny}")
    st, prec = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": today_iso, "price": 150.123456})
    check("CRUD: цена с 6 знаками после запятой → 422", st == 422, f"{st}, {prec}")
    st, min_ok = send("POST", f"/api/instruments/{test_id}/prices", {"as_of_date": today_iso, "price": 0.0001})
    check("CRUD: минимальная цена 0.0001 → 201", st == 201 and min_ok.get("price") == 0.0001, f"{st}, {min_ok}")
    st, del_min = send("DELETE", f"/api/instruments/{test_id}/prices/{today_iso}")
    check("CRUD: минимальный снимок удалён", st == 200, f"{st}, {del_min}")
else:
    for name in ["POST снимка цены", "дубль даты → 409", "будущая дата → 400",
                 "PUT снимка", "DELETE снимка"]:
        check(f"CRUD: {name}", False, "тестовый инструмент не создан")

st, info = get("/api/db-info")
check("СВЕДЕНИЯ: /api/db-info 200, ключи на месте",
      st == 200 and isinstance(info, dict) and all(k in info for k in (
          "dbms", "version", "version_full", "database", "db_user", "server_time",
          "tables", "can_write", "write", "write_auth_required")),
      f"{st}, {sorted(info) if isinstance(info, dict) else '?'}")
check("СВЕДЕНИЯ: СУБД PostgreSQL", st == 200 and info.get("dbms") == "PostgreSQL"
      and str(info.get("version", "")).startswith("PostgreSQL"), info.get("version"))
tbl = {t["name"]: t for t in info.get("tables", [])} if isinstance(info, dict) else {}
check("СВЕДЕНИЯ: 6 таблиц с числом записей",
      set(tbl) == {"exchanges", "sectors", "instruments", "price_snapshots", "news", "imported_news"}
      and all(t.get("rows") is not None for t in tbl.values()), sorted(tbl))
check("СВЕДЕНИЯ: размер таблиц указан", bool(tbl) and all(t.get("size_bytes", 0) > 0 for t in tbl.values()),
      {k: v.get("size_bytes") for k, v in tbl.items()})
check("СВЕДЕНИЯ: instruments.rows = 19 (тестовый ещё жив)", tbl.get("instruments", {}).get("rows") == 19, tbl.get("instruments"))
# Права по операциям (ревью, пункт 6): INSERT без UPDATE/DELETE или секвенции
# даёт лишь часть CRUD — can_write теперь честный флаг полного доступа.
check("СВЕДЕНИЯ: can_write=True (полный CRUD у владельца)", info.get("can_write") is True, info.get("can_write"))
w = info.get("write", {}) if isinstance(info, dict) else {}
_ops = ("select", "insert", "update", "delete", "sequence")
check("СВЕДЕНИЯ: write.instruments — все операции и секвенция разрешены",
      all(w.get("instruments", {}).get(op) is True for op in _ops), w.get("instruments"))
check("СВЕДЕНИЯ: write.price_snapshots — все операции и секвенция разрешены",
      all(w.get("price_snapshots", {}).get(op) is True for op in _ops), w.get("price_snapshots"))
check("СВЕДЕНИЯ: write.missing пуст, imported_news_insert=True",
      w.get("missing") == [] and w.get("imported_news_insert") is True, w.get("missing"))
check("СВЕДЕНИЯ: write_auth_required=False (локальный сервер без ключа)",
      info.get("write_auth_required") is False, info.get("write_auth_required"))

st, del_inst = send("DELETE", f"/api/instruments/{test_id}")
check("CRUD: DELETE инструмента → 200", st == 200 and del_inst.get("deleted") == test_id, f"{st}, {del_inst}")
st, after_del = get(f"/api/instruments/{test_id}")
check("CRUD: после DELETE карточка → 404", st == 404, st)
st, del_again = send("DELETE", f"/api/instruments/{test_id}")
check("CRUD: повторный DELETE → 404", st == 404, st)
st, del_sber = send("DELETE", "/api/instruments/1")
check("CRUD: DELETE инструмента из новостей (SBER) → 409", st == 409, f"{st}, {del_sber}")

crud_paths = {"/api/instruments", "/api/instruments/{instrument_id}",
              "/api/instruments/{instrument_id}/prices",
              "/api/instruments/{instrument_id}/prices/{as_of_date}", "/api/db-info"}
st, spec2 = get("/openapi.json")
check("OpenAPI: пути CRUD и db-info в спецификации",
      st == 200 and crud_paths <= set(spec2.get("paths", {})), sorted(crud_paths - set(spec2.get("paths", {}))))

# Страховочная очистка в обход API (каскад стирает снимки тестового инструмента).
try:
    url2 = make_url(DATABASE_URL)
    with psycopg2.connect(**url2.translate_connect_args(username="user", database="dbname")) as conn2:
        with conn2.cursor() as c2:
            c2.execute("DELETE FROM instruments WHERE ticker IN ('ZZTEST', 'ZZBAD')")
    cleaned = True
except Exception as e:
    cleaned = False
    print(f"  [WARN] очистка тестовых данных: {e}")
check("ОЧИСТКА: тестовый инструмент удалён из БД", cleaned, "")

st, h = get("/api/health")
check("ОЧИСТКА: эталон возвращён — 18 инструментов, 558 снимков",
      st == 200 and h.get("instruments") == 18 and h.get("price_snapshots") == 558, h)

fails = [r for r in results if not r[1]]
print(f"ИТОГ: {len(results)-len(fails)}/{len(results)} проверок пройдено")
for name, ok, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))

sys.exit(1 if fails else 0)
