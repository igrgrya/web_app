"""Seed the entire teaching schema in an EMPTY database; never drop existing data."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.database import engine
from sqlalchemy import text


def main():
    with engine.connect() as conn:
        tables = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )).scalars().all()
    if tables:
        raise SystemExit("Database is not empty. Import stopped; existing data was preserved.")
    snapshot = ROOT / "db/migration.sql"
    if snapshot.exists():
        with engine.begin() as conn:
            cursor = conn.connection.driver_connection.cursor()
            try:
                sql = snapshot.read_text(encoding="utf-8")
                # PostgreSQL creates public in a new database; pg_dump 18 can
                # include it again when explicitly exporting --schema=public.
                sql = sql.replace("\nCREATE SCHEMA public;", "\nCREATE SCHEMA IF NOT EXISTS public;")
                # The hosting provider owns the pre-existing public schema.
                # Its descriptive comment is not part of the application's data.
                sql = sql.replace("COMMENT ON SCHEMA public IS 'standard public schema';", "")
                cursor.execute(sql)
            finally:
                cursor.close()
        print("Restored the complete PostgreSQL snapshot (all public tables).")
        return
    # Original files contain explicit BEGIN/COMMIT. AUTOCOMMIT lets PostgreSQL
    # honor these transaction boundaries without SQLAlchemy nesting them.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        cursor = conn.connection.driver_connection.cursor()
        try:
            for name in ["schema.sql", "seed.sql", "seed_history.sql"]:
                cursor.execute((ROOT / "db" / name).read_text(encoding="utf-8"))
                print("Imported", name)
        finally:
            cursor.close()
        for name in ["instruments", "price_snapshots"]:
            print(name, conn.execute(text(f"SELECT COUNT(*) FROM {name}")).scalar_one())


if __name__ == "__main__":
    main()
