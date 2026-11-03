"""Разовое наполнение облачной базы для публикации лабораторной №3 (Amvera).

Выполняет на указанной базе db/schema.sql -> db/seed.sql -> db/seed_history.sql.
URL подключения передаётся аргументом командной строки и никуда не записывается —
пароль не должен попадать в файлы репозитория (то же правило, что у hosting/).

Адрес базы Amvera (вкладка «Инфо» проекта БД):
  внешне:  postgresql://<user>:<pass>@<проект>-<логин>.db-msk0.amvera.tech:5432/<имя-бд>?sslmode=require
  изнутри: postgresql://<user>:<pass>@amvera-<логин>-cnpg-<проект>-rw:5432/<имя-бд>

Запуск из корня репозитория:
  backend/.venv/Scripts/python db/seed_amvera.py "<URL>"
Повторный запуск на непустой базе прерывается; --force пересоздаёт схему
(DROP SCHEMA public CASCADE) и заливает данные заново.
"""

import argparse
from pathlib import Path

import sqlalchemy as sa

DB_DIR = Path(__file__).resolve().parent
SCRIPTS = ("schema.sql", "seed.sql", "seed_history.sql")


def main() -> int:
    parser = argparse.ArgumentParser(description="Заливка учебных данных funds_lab.")
    parser.add_argument("url", help="DATABASE_URL целевой базы (пароль только в командной строке)")
    parser.add_argument("--force", action="store_true",
                        help="пересоздать схему: DROP SCHEMA public CASCADE и залить заново")
    args = parser.parse_args()

    url = args.url
    scheme = url.split("://", 1)[0]
    if "+" not in scheme:
        url = "postgresql+psycopg2://" + url.split("://", 1)[1]

    engine = sa.create_engine(url)
    with engine.begin() as conn:
        exists = conn.execute(sa.text("SELECT to_regclass('public.instruments')")).scalar()
        rows = 0 if exists is None else conn.execute(
            sa.text("SELECT count(*) FROM instruments")).scalar()
        if rows and not args.force:
            print(f"База уже содержит данные (instruments = {rows}).")
            print("Для пересоздания запустите ещё раз с --force (данные будут удалены).")
            return 1
        if args.force:
            print("Пересоздаю схему (DROP SCHEMA public CASCADE)...")
            conn.exec_driver_sql("DROP SCHEMA public CASCADE")
            conn.exec_driver_sql("CREATE SCHEMA public")
        dbapi_conn = conn.connection.driver_connection
        for name in SCRIPTS:
            print(f"Выполняю db/{name} ...")
            # Сырой курсор psycopg2: батч инструкций одним вызовом, без разбора
            # :bind-параметров (в скриптах есть литералы с двоеточиями и
            # DO $$-блок в seed_history.sql) и без словаря параметров SQLAlchemy
            # (exec_driver_sql передаёт immutabledict, который psycopg2 не принимает).
            cursor = dbapi_conn.cursor()
            cursor.execute((DB_DIR / name).read_text(encoding="utf-8"))
            cursor.close()
        total = conn.execute(sa.text("SELECT count(*) FROM instruments")).scalar()
        history = conn.execute(sa.text("SELECT count(*) FROM price_snapshots")).scalar()
    print(f"Готово: instruments = {total}, price_snapshots = {history}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
