"""Fetch the pinned official Swagger UI files for reproducible packaging."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

VERSION = "5.34.1"
URL = f"https://registry.npmjs.org/swagger-ui-dist/-/swagger-ui-dist-{VERSION}.tgz"
SHA256 = "8e7286de0230e431fc8a5a75490d28117af3d0c306413b6f9e17f7bb55045fb6"


def main():
    with urlopen(URL, timeout=60) as response:
        content = response.read()
    if hashlib.sha256(content).hexdigest() != SHA256:
        raise SystemExit("Official archive hash mismatch; no files were installed")
    destination = Path(__file__).resolve().parent / "vendor"
    destination.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as archive:
        for name in ["swagger-ui-bundle.js", "swagger-ui.css", "LICENSE", "NOTICE"]:
            (destination / name).write_bytes(archive.extractfile("package/" + name).read())
    (destination / "VERSION.json").write_text(json.dumps({"package": "swagger-ui-dist", "version": VERSION, "source": URL, "sha256": SHA256}, indent=2), encoding="utf-8")
    print("Downloaded official swagger-ui-dist", VERSION)


if __name__ == "__main__":
    main()
