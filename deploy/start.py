"""One website process: all pages + FastAPI, with PostgreSQL in the same account."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["FUNDS_PUBLIC_DIR"] = str(ROOT / "web")
if not (ROOT / "web/index.html").is_file():
    raise SystemExit("Missing web/: extract the complete funds-lab-full.zip first.")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host=os.environ.get("IP", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1,::1"),
    )
