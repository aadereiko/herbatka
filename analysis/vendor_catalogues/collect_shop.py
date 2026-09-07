import csv
import hashlib
import html
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

S = Path(__file__).resolve().parents[1] / "data" / "vendor-catalogues"
S.mkdir(parents=True, exist_ok=True)
UA = "herbatka-research/0.1 (personal tea catalogue research; low rate)"
DELAY = 1.0


def _ssl_context() -> ssl.SSLContext:
    """Some shops (simonlevelt.nl) serve a chain this Python's default store cannot verify,
    while curl can — curl uses the macOS keychain. certifi's bundle covers both, and is the
    fix rather than turning verification off."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


CONTEXT = _ssl_context()


def fetch(url: str, cache: Path) -> str | None:
    cache.mkdir(exist_ok=True)
    target = cache / f"{hashlib.sha1(url.encode()).hexdigest()}.html"
    if target.exists():
        return target.read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30, context=CONTEXT) as r:
                body = r.read().decode("utf-8", errors="replace")
            target.write_text(body, encoding="utf-8")
            time.sleep(DELAY)
            return body
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None
            time.sleep(3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    return None


#: Dropping only the tags leaves the *contents* of <script> behind, and inline Google Tag
#: Manager sits right after the Dutch ingredients block — so "var f d getelementsbytagname"
#: parsed as an ingredient. Remove those elements whole, before any tag stripping.
SCRIPTISH = re.compile(r"(?is)<(script|style|noscript|template)\b.*?</\1\s*>")


def strip_tags(fragment: str) -> str:
    without_code = SCRIPTISH.sub(" ", fragment)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", without_code))).strip()


OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')


def title_of(body: str) -> str:
    m = OG_TITLE.search(body)
    if m:
        return html.unescape(m.group(1)).strip()
    m = re.search(r"<title>(.*?)</title>", body, re.S)
    return html.unescape(strip_tags(m.group(1))) if m else ""


# --------------------------------------------------------------- Bird & Blend (UK)

BB_BLOCK = re.compile(r">\s*Ingredients\s*<")


def bird_and_blend(body: str) -> str:
    m = BB_BLOCK.search(body)
    if not m:
        return ""
    text = strip_tags(body[m.start() : m.start() + 3000])
    text = re.sub(r"^>?\s*Ingredients\s*", "", text)
    # The accordion continues into the next panel; cut at the first heading-like word that
    # cannot be part of an ingredient list.
    text = re.split(
        r"(?i)\b(?:allergen|nutrition|brewing|how to|caffeine level|share|delivery)\b", text
    )[0]
    return text.strip(" .;")


# --------------------------------------------------------------- Cafe Silesia (PL)

# The colon is load-bearing: a bare `sk[lł]ad` also matches inside "składanie zamówienia"
# ("placing an order"), which appears in the checkout boilerplate on every page.
PL_BLOCK = re.compile(r"(?i)\bsk[lł]ad\s*:\s*(.{0,400})")
PL_CUT = re.compile(
    r"(?i)instrukcja|jedna z |temperatura|czas parzenia|opakowanie|ilo[sś][cć] herbaty"
    r"|herbata\s+\w+\s+nie |zala[cć]|aby |dzi[eę]ki |zapewniaj|kawa[lł]ki jab|sk[lł]adanie"
    r"|kosztu dostawy|skontaktuj|zam[oó]wieni"
    r"|pozwalaj|pe[lł]na witamin|s[lł]yn[aą]c|reguluje|ekologicznych|saszetk|min\."
    r"|[0-9]+\s*g ka[zż]d"
)


def cafe_silesia(body: str) -> str:
    text = strip_tags(body)
    m = PL_BLOCK.search(text)
    if not m:
        return ""
    return PL_CUT.split(m.group(1))[0].strip(" .;")


# --------------------------------------------------------------- Ronnefeldt (DE)

DE_BLOCK = re.compile(r"(?i)\bzutaten\s*:?\s*(.{0,400})")
DE_CUT = re.compile(
    r"(?i)inhalt\s*:|artikel-?nr|preis pro|zubereitung|ziehzeit|wasserh[aä]rte"
    r"|wassertemperatur|dosierung|n[aä]hrwert|allergen|\*gesch[uü]tzte"
    r"|preis inkl|zzgl|mwst|versand|lieferzeit|verf[uü]gbar"
)


def ronnefeldt(body: str) -> str:
    m = DE_BLOCK.search(strip_tags(body))
    return DE_CUT.split(m.group(1))[0].strip(" .;") if m else ""


# --------------------------------------------------------------- Oxalis (CZ)

CZ_BLOCK = re.compile(r"(?i)\bslo[zž]en[ií]\s*:?\s*(.{0,400})")
CZ_CUT = re.compile(
    r"(?i)souvisej[ií]c[ií]|p[rř]idat do|odebrat z|hodnocen[ií]|skladem|do ko[sš][ií]ku"
    r"|m[uů][zž]e obsahovat|d[aá]vkov[aá]n[ií]|teplota|doba lou[hz]|p[rř][ií]prava"
    r"|nutri[cč]n[ií] hodnot|v[yý][zž]ivov[eé] [uú]daje|energie|b[ií]lkoviny|tuky|sacharidy"
    r"|s[uů]l\b|vl[aá]knina|na 100"
)


def oxalis(body: str) -> str:
    m = CZ_BLOCK.search(strip_tags(body))
    return CZ_CUT.split(m.group(1))[0].strip(" .;") if m else ""


# --------------------------------------------------------------- Simon Lévelt (NL)

NL_BLOCK = re.compile(r"(?i)\bingredi[eë]nten\s*:?\s*(.{0,400})")
NL_CUT = re.compile(
    r"(?i)zetadvies|regio|cafe[iï]ne|merk\b|land van herkomst|losse thee|voedingswaarde"
    r"|bewaar|inhoud\s*:"
)


def simon_levelt(body: str) -> str:
    m = NL_BLOCK.search(strip_tags(body))
    return NL_CUT.split(m.group(1))[0].strip(" .;") if m else ""


SHOPS = {
    "ronnefeldt": {
        "shop": "Ronnefeldt",
        "country": "DE",
        "urls": "de_urls.txt",
        "cache": "de_cache",
        "parse": ronnefeldt,
        "out": "raw_de.csv",
    },
    "oxalis": {
        "shop": "Oxalis",
        "country": "CZ",
        "urls": "cz_urls.txt",
        "cache": "cz_cache",
        "parse": oxalis,
        "out": "raw_cz.csv",
    },
    "simonlevelt": {
        "shop": "Simon Levelt",
        "country": "NL",
        "urls": "nl_urls.txt",
        "cache": "nl_cache",
        "parse": simon_levelt,
        "out": "raw_nl.csv",
    },
    "birdandblend": {
        "shop": "Bird & Blend",
        "country": "UK",
        "urls": "uk_urls.txt",
        "cache": "uk_cache",
        "parse": bird_and_blend,
        "out": "raw_uk.csv",
    },
    "cafesilesia": {
        "shop": "Cafe Silesia",
        "country": "PL",
        "urls": "pl_urls.txt",
        "cache": "pl_cache",
        "parse": cafe_silesia,
        "out": "raw_pl.csv",
    },
}


def main(key: str) -> None:
    cfg = SHOPS[key]
    urls = [u.strip() for u in (S / cfg["urls"]).read_text().splitlines() if u.strip()]
    print(f"{cfg['shop']}: {len(urls)} urls", flush=True)

    rows, failed = [], 0
    for i, url in enumerate(urls, 1):
        body = fetch(url, S / cfg["cache"])
        if i % 25 == 0:
            print(
                f"  {i}/{len(urls)}, {len(rows)} with ingredients, {failed} unreachable", flush=True
            )
        if not body:
            failed += 1
            continue
        ingredients = cfg["parse"](body)
        if not ingredients:
            continue
        rows.append(
            {
                "shop": cfg["shop"],
                "country": cfg["country"],
                "name": title_of(body),
                "ingredients_raw": ingredients,
                "url": url,
            }
        )

    by_name: dict[str, dict] = {}
    for r in rows:
        if r["name"]:
            by_name.setdefault(r["name"].casefold(), r)

    out = S / cfg["out"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["shop", "country", "name", "ingredients_raw", "url"])
        w.writeheader()
        w.writerows(sorted(by_name.values(), key=lambda r: r["name"]))
    print(f"done: {len(by_name)} unique -> {out}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
