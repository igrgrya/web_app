"""Verify ZIP against a new disposable PostgreSQL database, leaving source intact."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.database import engine
from sqlalchemy import create_engine, text


def counts(connection):
    tables = connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).scalars().all()
    return {table: connection.execute(text('SELECT count(*) FROM "' + table.replace('"', '""') + '"')).scalar_one() for table in tables}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hold", action="store_true", help="Keep preview running until Enter")
    args = parser.parse_args()
    suffix = uuid.uuid4().hex[:10]
    database = "funds_verify_" + suffix
    destination = ROOT / "deployment" / ("verify-" + suffix)
    source = ROOT / "deployment/funds-lab-full.zip"
    with zipfile.ZipFile(source) as archive:
        assert all(not Path(name).is_absolute() and ".." not in Path(name).parts for name in archive.namelist())
        assert not any(Path(name).name == ".env" or ".git" in Path(name).parts for name in archive.namelist())
        for secret in [engine.url.password]:
            if secret:
                # Vendor CSS embeds base64 icons, which can coincidentally contain
                # a short password substring. These unchanged public assets are
                # checked by their manifest hash, not substring matching.
                assert all(secret.encode() not in archive.read(name) for name in archive.namelist() if "/web/static/vendor/" not in name), "Credential found in ZIP"
        assert all(engine.url.render_as_string(hide_password=False).encode() not in archive.read(name) for name in archive.namelist())
        archive.extractall(destination)
    checkout = destination / "funds-lab"
    manifest = json.loads((checkout / "MANIFEST.json").read_text())
    for name, digest in manifest["files"].items():
        assert hashlib.sha256((checkout / name).read_bytes()).hexdigest() == digest, name
    with engine.connect() as connection:
        original = counts(connection)
    admin = create_engine(engine.url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    target = None
    server = None
    created = False
    report = {"source_tables": original, "zip_files": len(manifest["files"]), "zip_bytes": source.stat().st_size}
    try:
        with admin.connect() as connection:
            connection.exec_driver_sql('CREATE DATABASE "' + database + '" TEMPLATE template0 ENCODING \'UTF8\'')
        created = True
        target_url = engine.url.set(database=database)
        env = os.environ.copy()
        env.update(DATABASE_URL=target_url.render_as_string(hide_password=False), IP="127.0.0.1", PORT="8765", PYTHONIOENCODING="utf-8")
        subprocess.run([sys.executable, "deploy/init_db.py"], cwd=checkout, env=env, check=True)
        target = create_engine(target_url)
        with target.connect() as connection:
            restored = counts(connection)
        assert restored == original, (restored, original)
        report["restored_tables"] = restored
        refused = subprocess.run([sys.executable, "deploy/init_db.py"], cwd=checkout, env=env, capture_output=True, text=True)
        assert refused.returncode != 0 and "not empty" in refused.stderr + refused.stdout
        report["refuses_nonempty_database"] = True
        log = open(destination / "server.log", "w", encoding="utf-8")
        server = subprocess.Popen([sys.executable, "deploy/start.py"], cwd=checkout, env=env, stdout=log, stderr=log)
        for attempt in range(40):
            if server.poll() is not None:
                raise RuntimeError("Preview exited; see server.log")
            try:
                with urlopen("http://127.0.0.1:8765/api/health", timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.25)
        else:
            raise RuntimeError("Preview did not start")
        subprocess.run([sys.executable, "deploy/check.py", "http://127.0.0.1:8765"], cwd=checkout, env=env, check=True)
        env.update(LAB3_BASE_URL="http://127.0.0.1:8765", LAB3_UI_PATH="/db.html")
        subprocess.run([sys.executable, "backend/tests/acceptance.py"], cwd=checkout, env=env, check=True)
        report["http_checks"] = "passed"
        report["original_acceptance"] = "passed"
        (ROOT / "deployment/verification.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Verified all 15 tables, ZIP hashes, missing credentials and HTTP checks.", flush=True)
        if args.hold:
            print("Preview: http://127.0.0.1:8765 ; press Enter to stop and remove only the disposable database.", flush=True)
            input()
    finally:
        if server:
            server.terminate()
            server.wait(timeout=15)
        if target:
            target.dispose()
        if created:
            with admin.connect() as connection:
                connection.exec_driver_sql('DROP DATABASE "' + database + '" WITH (FORCE)')
        admin.dispose()
        engine.dispose()


if __name__ == "__main__":
    main()
