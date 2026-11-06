"""Read-only acceptance of the complete single-origin service."""
import argparse
from html.parser import HTMLParser
import json
from urllib.parse import urljoin, urlsplit, urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError

PAGES = ["index", "news", "exchanges", "history", "beginners", "glossary", "risks", "links", "contacts", "about", "search", "forum", "services", "xml", "db", "rss"]


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.urls.add(attrs["src"])
        if tag == "img" and attrs.get("src"):
            self.urls.add(attrs["src"])
        if tag == "link" and attrs.get("rel") in {"stylesheet", "icon"}:
            self.urls.add(attrs["href"])
        if tag == "a" and attrs.get("href"):
            href = attrs["href"]
            if not urlsplit(href).scheme and not href.startswith(("#", "//")):
                self.urls.add(href)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("origin")
    args = parser.parse_args()
    origin = args.origin.rstrip("/")
    count = 0

    def get(path, expected=200):
        nonlocal count
        request = Request(urljoin(origin + "/", path), headers={"User-Agent": "FundsLab-Check/1.0"})
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            assert response.status == expected, (path, response.status, expected)
            body = response.read().decode("utf-8", "replace")
            count += 1
            return json.loads(body) if "application/json" in response.headers.get("Content-Type", "") else body

    assets = set()
    for page in PAGES:
        html = get("/" + page + ".html")
        assert "Funds Lab" in html
        assert all(old not in html for old in ["chatgpt.site", "onrender.com", "igrgrya.github.io/web_app/"])
        reader = Resources()
        reader.feed(html)
        for url in reader.urls:
            assert not urlsplit(url).scheme and not url.startswith("//"), (page, url)
            assets.add(urlsplit(urljoin("/" + page + ".html", url)).path)
    for path in sorted(assets):
        if path.endswith("/") and path != "/":
            continue
        get(path)
    assert "id=\"catalog\"" in get("/db.html")
    assert "id=\"data-note\"" in get("/db.html")
    assert get("/") == get("/index.html")
    assert get("/lab3/") == get("/db.html")
    assert get("/static/index.html") == get("/db.html")
    health = get("/api/health")
    assert health["database"] == "connected" and health["instruments"] == 18 and health["price_snapshots"] == 558, health
    catalog = get("/api/instruments")
    assert len(catalog) == 18
    assert all(r["exchange"] == "MOEX" for r in get("/api/instruments?exchange=MOEX"))
    assert get("/api/search?" + urlencode({"q": "ГАЗ"}))
    assert get("/api/search?" + urlencode({"q": "%.__"})) == []
    get("/api/instruments?sort=DROP", 400)
    get("/api/search?q=", 422)
    groups = get("/api/sectors/summary")
    assert sum(row["instruments_count"] for row in groups) == 18
    movers = get("/api/top-movers?limit=18")
    assert all(r["change_percent"] > 0 for r in movers["gainers"])
    assert all(r["change_percent"] < 0 for r in movers["losers"])
    for row in catalog:
        detail = get(f"/api/instruments/{row['id']}")
        history = get(f"/api/instruments/{row['id']}/prices")
        assert len(history) == 30 and history[-1]["date"] == detail["as_of_date"]
    get("/api/instruments/99999", 404)
    get("/backend/.env", 404)
    get("/db/migration.sql", 404)
    get("/missing-page", 404)
    get("/catalog.xml")
    get("/catalog.xsl")
    get("/sitemap.xml")
    get("/robots.txt")
    docs = get("/docs")
    assert 'src="/static/vendor/swagger-ui-bundle.js"' in docs
    assert "cdn.jsdelivr" not in docs
    get("/static/vendor/swagger-ui-bundle.js")
    get("/static/vendor/swagger-ui.css")
    assert len([p for p in get("/openapi.json")["paths"] if p.startswith("/api/")]) == 7
    print(f"PASS: {count} HTTP checks; all pages/assets + PostgreSQL API + local Swagger")


if __name__ == "__main__":
    main()
