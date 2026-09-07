import csv
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

S = Path(__file__).resolve().parents[1] / "data" / "vendor-catalogues"
S.mkdir(parents=True, exist_ok=True)
CACHE = S / "pdt_cache"
CACHE.mkdir(exist_ok=True)
UA = "herbatka-research/0.1 (personal tea catalogue research; low rate)"
DELAY = 1.0

SKU = re.compile(r"^[a-z]{0,3}\d{2,}[a-z]*$")


def dedup_key(url: str) -> str:
    slug = url.rsplit("/", 1)[-1].removesuffix(".html")
    return "-".join(p for p in slug.split("-") if not SKU.match(p)) or slug


def fetch(url: str) -> str | None:
    key = hashlib.sha1(url.encode()).hexdigest()
    cached = CACHE / f"{key}.html"
    if cached.exists():
        return cached.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", errors="replace")
            cached.write_text(body, encoding="utf-8")
            time.sleep(DELAY)
            return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    return None


ING_BLOCK = re.compile(r"tea-ingredients\"[^>]*>(.{0,800}?)</div>", re.S)
ING_JSON = re.compile(r'"tea_ingredients":"((?:[^"\\]|\\.)*)"')
OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')

TYPE_RULES = [
    ("rooibos", r"rooibos"),
    ("puerh", r"pu-?erh|pu ?er"),
    ("oolong", r"\boolong\b|wu ?long"),
    ("white", r"th[ée] blanc"),
    ("green", r"th[ée] vert|matcha|sencha|gyokuro"),
    ("black", r"th[ée] noir"),
    ("herbal", r"infusion|verveine|camomille|menthe|tilleul|hibiscus"),
]


def unescape_json_string(raw: str) -> str:
    try:
        return json.loads(f'"{raw}"')
    except Exception:
        return raw


def strip_tags(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def parse(url: str, body: str) -> dict | None:
    ingredients = ""
    m = ING_JSON.search(body)
    if m:
        ingredients = unescape_json_string(m.group(1)).strip()
    if not ingredients:
        m = ING_BLOCK.search(body)
        if m:
            ingredients = re.sub(r"^Ingr[ée]dients\s*", "", strip_tags(m.group(1)))
    if not ingredients:
        return None
    m = OG_TITLE.search(body)
    name = html.unescape(m.group(1)) if m else ""
    low = ingredients.lower()
    tea_type = next((t for t, pat in TYPE_RULES if re.search(pat, low)), "")
    return {
        "shop": "Palais des Thes",
        "name": name,
        "tea_type": tea_type,
        "ingredients_fr": ingredients,
        "n_ingredients": str(len(re.findall(r",|\bet\b", ingredients)) + 1),
        "url": url,
    }


def main() -> None:
    xml = (S / "pdt_sitemap.xml").read_text(encoding="utf-8")
    urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if re.search(r"/fr/[^/]+\.html$", u)]

    seen: dict[str, str] = {}
    for u in urls:
        seen.setdefault(dedup_key(u), u)
    targets = sorted(seen.values())
    print(f"{len(urls)} product urls -> {len(targets)} after dedup", flush=True)

    rows, skipped = [], 0
    for i, url in enumerate(targets, 1):
        body = fetch(url)
        if body is None:
            skipped += 1
            continue
        row = parse(url, body)
        if row and row["name"]:
            rows.append(row)
        else:
            skipped += 1
        if i % 25 == 0:
            print(f"  {i}/{len(targets)} fetched, {len(rows)} with ingredients", flush=True)

    by_name: dict[str, dict] = {}
    for r in rows:
        by_name.setdefault(r["name"].strip().casefold(), r)

    out = S / "french_teas.csv"
    fields = ["shop", "name", "tea_type", "ingredients_fr", "n_ingredients", "url"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(sorted(by_name.values(), key=lambda r: r["name"]))
    print(f"done: {len(by_name)} unique teas, {skipped} skipped -> {out}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
