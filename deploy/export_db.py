"""Export all public tables, preserving data; connection secrets never reach argv."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.database import engine


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pg-dump", default=shutil.which("pg_dump"))
    parser.add_argument("--output", type=Path, default=ROOT / "deployment/private/funds.sql")
    args = parser.parse_args()
    if not args.pg_dump:
        raise SystemExit("Specify the PostgreSQL 18 pg_dump executable with --pg-dump")
    url = engine.url
    env = os.environ.copy()
    env.update(PGHOST=url.host or "localhost", PGPORT=str(url.port or 5432), PGUSER=url.username or "", PGPASSWORD=url.password or "", PGDATABASE=url.database or "")
    env.update({"PG" + key.upper(): value for key, value in url.query.items() if key == "sslmode"})
    result = subprocess.run([args.pg_dump, "--schema=public", "--no-owner", "--no-acl", "--inserts", "--encoding=UTF8"], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise SystemExit("Export failed; source database was not modified. Check PostgreSQL connection/version.")
    # --inserts contains no COPY meta commands; remove psql's safety-token wrappers
    # so the exact dump can be imported transactionally by psycopg2.
    sql = b"\n".join(line for line in result.stdout.splitlines() if not line.startswith((b"\\restrict ", b"\\unrestrict ")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(sql)
    print("Exported all public tables to", args.output, "bytes:", len(sql))


if __name__ == "__main__":
    main()
