"""Produce one portable ZIP from an explicit allowlist, never from the worktree root."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OLD_ORIGIN = "https://igrgrya.github.io/web_app/"
PLACEHOLDER_ORIGIN = "https://funds-lab.invalid/"


def public_text(path, text):
    text = text.replace(OLD_ORIGIN, PLACEHOLDER_ORIGIN if path in {"robots.txt", "sitemap.xml", "contacts.html"} else "/")
    if path.endswith(".html"):
        text = text.replace("D1 — Cloudflare Workers", "PostgreSQL — FastAPI")
        text = text.replace("Cloudflare Workers + D1", "FastAPI + PostgreSQL")
        text = text.replace("Cloudflare Workers", "FastAPI").replace("D1", "PostgreSQL")
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "deployment/funds-lab-full.zip")
    parser.add_argument("--snapshot", type=Path, help="Full PostgreSQL export made by export_db.py")
    args = parser.parse_args()
    entries = {}

    def add(source, target=None, transform=False):
        source = ROOT / source
        if source.is_dir():
            for file in sorted(source.rglob("*")):
                if file.is_file() and not any(part in {"__pycache__", ".venv", "node_modules", ".git"} for part in file.relative_to(source).parts):
                    add(file.relative_to(ROOT), str(Path(target or source.relative_to(ROOT)) / file.relative_to(source)), transform)
        else:
            if source.name == ".env" or source.suffix == ".pyc":
                return
            key = str(target or source.relative_to(ROOT)).replace("\\", "/")
            content = source.read_bytes()
            if transform and source.suffix in {".html", ".js", ".xml", ".txt", ".css"}:
                content = public_text(key.removeprefix("web/"), content.decode("utf-8")).encode("utf-8")
            entries[key] = content

    for source in ["backend/app", "backend/requirements.txt", "backend/tests", "db", "deploy", "frontend/src", "frontend/public", "frontend/index.html", "frontend/package.json", "frontend/package-lock.json", "frontend/vite.config.js", "static", "Dockerfile", ".dockerignore", "DEPLOY_ALWAYSDATA.md"]:
        add(source)
    add("hosting/public", "web", transform=True)
    # Preserve the latest API-client fixes from the original FastAPI app.
    entries["web/static/app.js"] = (ROOT / "backend/app/static/app.js").read_bytes()
    for page in ["web/db.html", "web/lab3/index.html"]:
        html = entries[page].decode("utf-8")
        html = html.replace('<input id="f-query" type="search"', '<input id="f-query" type="search" maxlength="100"')
        html = html.replace('<div class="controls">', '<p id="data-note" class="data-note" hidden></p><div class="controls">', 1)
        entries[page] = html.encode("utf-8")
    entries["web/static/integrated.css"] += b'\n.lab3-tools .status:empty {display:none}\n.lab3-tools .data-note {color:var(--muted);font-size:13px;margin:0 0 12px}\n'
    if args.snapshot:
        entries["db/migration.sql"] = args.snapshot.read_bytes()
    # All API documentation assets are local; no browser CDN dependency.
    vendor = ROOT / "deploy/vendor"
    for name in ["swagger-ui-bundle.js", "swagger-ui.css", "LICENSE", "NOTICE", "VERSION.json"]:
        if not (vendor / name).is_file():
            raise SystemExit("Download the pinned Swagger assets before packaging: " + name)
        entries["web/static/vendor/" + name] = (vendor / name).read_bytes()
    entries["Dockerfile"] = b'''FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY web web
COPY db db
COPY deploy/start.py deploy/start.py
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 IP=0.0.0.0
CMD ["python", "deploy/start.py"]
'''
    for key in list(entries):
        if key.startswith("deploy/vendor/") or key == "deploy/site.json":
            del entries[key]
    entries["MANIFEST.json"] = json.dumps({"files": {k: hashlib.sha256(v).hexdigest() for k, v in sorted(entries.items())}}, indent=2).encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr("funds-lab/" + name, data)
    print(f"Created {args.output}: {len(entries)} files; {args.output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
