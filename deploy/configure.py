"""Create server-only DB configuration without credentials in shell history."""
import getpass
import json
import os
from pathlib import Path
import re
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def main():
    account = input("alwaysdata account name: ").strip()
    if not re.fullmatch(r"[a-z0-9_-]+", account):
        raise SystemExit("Invalid account name")
    database = input(f"PostgreSQL database [{account}_funds]: ").strip() or f"{account}_funds"
    user = input(f"PostgreSQL user [{account}]: ").strip() or account
    password = getpass.getpass("PostgreSQL password (hidden): ")
    if not password:
        raise SystemExit("Password cannot be empty")
    url = (
        f"postgresql+psycopg2://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@postgresql-{account}.alwaysdata.net:5432/{quote(database, safe='')}?sslmode=require"
    )
    config = ROOT / "backend/.env"
    if config.exists():
        raise SystemExit("backend/.env already exists; configuration was not overwritten")
    fd = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write("DATABASE_URL=" + url + "\n")
    origin = f"https://{account}.alwaysdata.net/"
    for relative in ["web/contacts.html", "web/robots.txt", "web/sitemap.xml"]:
        path = ROOT / relative
        path.write_text(path.read_text(encoding="utf-8").replace("https://funds-lab.invalid/", origin), encoding="utf-8")
    (ROOT / "deploy/site.json").write_text(json.dumps({"origin": origin}), encoding="utf-8")
    print("Configuration saved. Password was not printed. Website:", origin)


if __name__ == "__main__":
    main()
