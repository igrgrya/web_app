# -*- coding: utf-8 -*-
"""Комплексная приёмка л.р. №3: БД + API. Запуск: backend/.venv/Scripts/python lab3_acceptance.py"""
import json, re, datetime, urllib.request, urllib.parse, urllib.error
import psycopg2

BASE = "http://127.0.0.1:8000"
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
url = [l.strip().split("=",1)[1] for l in open(__import__("pathlib").Path(__file__).resolve().parent.parent / ".env", encoding="utf-8") if l.strip().startswith("DATABASE_URL=")][0]
u = re.match(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)", url)
conn = psycopg2.connect(host=u.group(3), port=int(u.group(4)), dbname=u.group(5), user=u.group(1), password=u.group(2))
cur = conn.cursor()

cur.execute("SELECT count(*) FROM instruments"); n_inst = cur.fetchone()[0]
check("БД: 18 инструментов", n_inst == 18, n_inst)
cur.execute("SELECT count(*) FROM price_snapshots"); n_snap = cur.fetchone()[0]
check("БД: 558 снимков цен", n_snap == 558, n_snap)
cur.execute("SELECT count(*) FROM price_snapshots WHERE as_of_date = CURRENT_DATE"); n_today = cur.fetchone()[0]
check("БД: у всех 18 есть снимок на сегодня", n_today == 18, n_today)
cur.execute("SELECT count(*), min(as_of_date), max(as_of_date) FROM price_snapshots WHERE as_of_date < CURRENT_DATE")
n_hist, d_min, d_max = cur.fetchone()
check("БД: история 540 строк, завершается до сегодня", n_hist == 540 and d_max < datetime.date.today(), f"{n_hist}, {d_min}..{d_max}")
cur.execute("""SELECT instrument_id, count(*) FROM price_snapshots WHERE as_of_date < CURRENT_DATE
               GROUP BY instrument_id HAVING count(*) <> 30""")
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
check("API: агрегаты — 5 секторов, сумма = 18", st==200 and len(d)==5 and total==18, f"{len(d)}, sum={total}")
check("API: Технологии: 6 шт, ср.цена 204.73", d[0]["sector"]=="Технологии" and d[0]["instruments_count"]==6 and d[0]["avg_price"]==204.73, d[0])

st, d = get("/api/top-movers?limit=5")
cat_changes = sorted((r["change_percent"] for r in cat), reverse=True)
check("API: рост = топ-5 каталога по убыванию", [x["change_percent"] for x in d["gainers"]] == cat_changes[:5], [x["change_percent"] for x in d["gainers"]])
check("API: падение = анти-топ-5 каталога по возрастанию", [x["change_percent"] for x in d["losers"]] == sorted(cat_changes)[:5], [x["change_percent"] for x in d["losers"]])
check("API: в топах по 5 позиций", len(d["gainers"])==5 and len(d["losers"])==5, "")
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
check("API: последняя точка истории = сегодня", d[-1]["date"] == datetime.date.today().isoformat(), d[-1]["date"])
st, d = get("/api/instruments/1/prices?days=1")
check("API: days=1 → 1 точка", st==200 and len(d)==1, len(d))
st, d = get("/api/instruments/1/prices?days=400")
check("API: days=400 → 422 (граница 1..365)", st == 422, st)
st, d = get("/api/instruments/999/prices")
check("API: история несуществующего → 404", st == 404, st)

with urllib.request.urlopen(BASE + "/openapi.json", timeout=10) as r:
    spec = json.loads(r.read().decode())
paths = [p for p in spec["paths"] if p.startswith("/api/")]
check("OpenAPI: 7 API-путей в спецификации", len(paths) == 7, paths)

st, body = get("/")
check("UI: / отдаёт HTML со всеми секциями", st==200 and all(s in body for s in ["Каталог инструментов","Агрегаты по секторам","Лидеры","Динамика цены"]), st)
for asset in ["/static/app.js", "/static/styles.css", "/static/vendor/chart.umd.min.js"]:
    st, _ = get(asset)
    check(f"UI: {asset} 200", st == 200, st)

fails = [r for r in results if not r[1]]
print(f"ИТОГ: {len(results)-len(fails)}/{len(results)} проверок пройдено")
for name, ok, detail in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
