import csv
import html
import json
import re
from pathlib import Path

import lexicon

S = Path(__file__).resolve().parents[1] / "data" / "vendor-catalogues"
S.mkdir(parents=True, exist_ok=True)

TYPE_RULES = [
    ("rooibos", r"rooibos|honeybush|czerwonokrzew"),
    ("puerh", r"pu-?erh|pu ?er|czerwona"),
    ("oolong", r"\boolong\b|wu ?long"),
    ("white", r"th[ée] blanc|white tea|herbata biala|biala herbata"),
    ("green", r"th[ée] vert|green tea|matcha|sencha|gyokuro|zielona|hojicha"),
    ("black", r"th[ée] noir|black tea|czarna"),
    ("herbal", r"infusion|verveine|camomille|menthe|tilleul|hibiscus|rumianek|owocowa|zioowa|ziolowa"),
]


CUT = re.compile(
    r"(?i)\*\s*(?:ingr[ée]dients?|produits?)\s+issus?"
    r"|allerg[eè]ne\s*:"
    r"|informations? nutritionnelle"
    r"|valeurs? nutritionnelle"
    r"|[ée]nergie\s*\d"
    r"|pour 100\s*(?:ml|g)"
    r"|cette infusion contient"
    r"|conseils? de pr[ée]paration"
    r"|instrukcja|temperatura|czas parzenia"
    r"|nutrition|allergen|brewing"
)


def clean(raw: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    # Everything after one of these is packaging copy, not a recipe: organic footnotes,
    # allergen notices and the nutrition table all sit in the same field.
    text = CUT.split(text)[0]
    return re.sub(r"\s+", " ", text.replace("*", "")).strip(" .;")


SHOP_SUFFIX = re.compile(
    r"(?i)\s*[|–—-]\s*(?:cafe silesia|bird & blend|ronnefeldt|simon\s*l[ée]velt|oxalis|"
    r"palais des th[ée]s|kusmi).*$"
)
TRAILING_SIZE = re.compile(r"(?i),?\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|szt|ks|st[uü]ck|pcs)\b\.?$")


def clean_name(raw: str) -> str:
    name = SHOP_SUFFIX.sub("", raw)
    name = re.sub(r"®|™", "", name)
    return TRAILING_SIZE.sub("", name).strip(" ,-|")


# How the tea is sold, which no shop states in a field — it is in the product name, the URL
# or the pack size, in whichever language the shop trades in.
FORMAT_RULES = [
    ("bags", r"sachet|teebeutel|beutel|builen|theezakje|zakje|saszetk|torebk|porcovan"
             r"|s[aá][cč]k|tea ?bags?|teabag|pyramid|bustine|infusettes?|filtro|piramidk"),
    ("powder", r"\bmatcha\b|poudre|pulver|poeder|pr[aá][sš]ek|proszek|powder|instant"),
    ("loose", r"\bvrac\b|\blose[rn]?\b|losse thee|sypan|li[sś]ciast|loose ?-?leaf|volumine"
              r"|sypk|na wag[eę]|lo[sš]e"),
]


def tea_format(text: str) -> str:
    """`bags`, `loose`, `powder`, or empty when the shop does not say.

    Order matters: a matcha sold in sachets is checked for bags first, and "loose" is last
    because a page mentioning "loose leaf" in passing is weaker evidence than an explicit
    pack format in the title.
    """
    hay = lexicon.fold(text)
    return next((f for f, pat in FORMAT_RULES if re.search(pat, hay)), "")


def tea_type(name: str, ingredients: str) -> str:
    hay = lexicon.fold(f"{name} {ingredients}")
    return next((t for t, pat in TYPE_RULES if re.search(pat, hay)), "")


def load_palais() -> list[dict]:
    rows = []
    for r in csv.DictReader((S / "french_teas.csv").open(encoding="utf-8")):
        ing = clean(r["ingredients_fr"])
        if not ing or len(ing) < 4:
            continue
        rows.append(
            {
                "shop": "Palais des Thes", "country": "France", "name": clean_name(r["name"]),
                "ingredients_source": ing, "source_quality": "composition list",
                "url": r["url"], "format": tea_format(f"{r['name']} {r['url']}"),
            }
        )
    return rows


NOT_A_TEA_PRODUCT = re.compile(
    r"(?i)\b(?:bundle|sampler|gift set|gift box|advent|teaware|infuser|kettle|mug|teapot|"
    r"tin only|merch|card|subscription)\b"
)


def load_shopify_prose(filename: str, shop: str, country: str, host: str) -> list[dict]:
    """Shops that publish no composition list, only marketing copy.

    The ingredients are whatever the prose happens to name, found by sweeping the lexicon
    across it. Presence only — never a percentage, and never a guarantee of completeness,
    which is why these rows are labelled differently in `source_quality`.
    """
    path = S / filename
    if not path.exists():
        return []
    # A raw /products.json is {"products": [...]}; the trimmed files written here are bare
    # lists. Accept both rather than keeping two loaders.
    payload = json.load(path.open(encoding="utf-8"))
    products = payload["products"] if isinstance(payload, dict) else payload

    rows = []
    for p in products:
        title = p.get("title") or ""
        if NOT_A_TEA_PRODUCT.search(title):
            continue
        prose = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p.get("body_html") or "")))
        if not prose:
            continue
        folded = lexicon.fold(prose)
        found: list[str] = []
        for key in lexicon.KEYS:
            name = lexicon.LEXICON[key]
            if key in folded and name not in found:
                found.append(name)
        # One match is usually just the word "tea" in a sentence, not a recipe.
        if len(found) < 2:
            continue
        rows.append(
            {
                "shop": shop, "country": country, "name": clean_name(title),
                "ingredients_source": ", ".join(found), "source_quality": "named in prose",
                "url": f"https://{host}/products/{p['handle']}",
                # Variant titles are where a Shopify shop actually states the format
                # ("50 Tea Bags", "Loose Leaf Pouch"); the product title rarely does.
                "format": tea_format(
                    f"{title} {' '.join(v.get('title') or '' for v in p.get('variants', []))} "
                    f"{prose[:300]}"
                ),
            }
        )
    return rows


def load_kusmi() -> list[dict]:
    products = json.load((S / "kusmi_all.json").open(encoding="utf-8"))
    teas = [p for p in products if (p.get("product_type") or "").upper() == "TEA"]
    json.dump(teas, (S / "_kusmi_teas.json").open("w", encoding="utf-8"))
    return load_shopify_prose("_kusmi_teas.json", "Kusmi Tea", "France", "www.kusmitea.com")


# A gift box lists each tea it contains as "Tea Name: ingredient, ingredient." Two or more of
# those headings means the row is a box, not a tea, and its ingredients belong to no single one.
BOX = re.compile(r"[A-Z][A-Za-z'’&\- ]{3,30}:")

NOT_TEA = re.compile(
    r"(?i)\bpra[zž]en[aá] k[aá]va|\bk[aá]vov[eé]|\bkaffeebohnen|\bkoffiebonen"
    r"|\bcoffee bean|\barabica\b|\brobusta\b|\bcacaobonen"
)


def load_raw(path: Path, country: str) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for r in csv.DictReader(path.open(encoding="utf-8")):
        ing = clean(r["ingredients_raw"])
        if not ing or len(ing) < 4:
            continue
        if len(BOX.findall(ing)) >= 2:
            continue
        # Shops that sell coffee alongside tea leak it in however the URL is filtered, and
        # the ingredient list is the only reliable place to see it.
        if NOT_TEA.search(ing):
            continue
        rows.append(
            {
                "shop": r["shop"], "country": country,
                "name": clean_name(r["name"]),
                "ingredients_source": ing, "source_quality": "composition list", "url": r["url"],
                "format": tea_format(f"{r['name']} {r['url']}"),
            }
        )
    return rows


def keep_in_summary(term: str, mapped: str, noise: bool) -> bool:
    """Does this ingredient belong in the tea's `ingredients_english` summary?

    `noise` covers three different things the lexicon lumps together: flavouring
    ("arôme naturel" — on every flavoured tea, so it separates nothing), origin countries
    ("Chine", which rides inside the ingredient field), and additives ("E171"). The per-row
    CSV keeps all of them either way; this decides the summary column only.
    """
    # TODO(human): decide the policy. The line below is the interim default the shipped
    # CSVs were built with — drop everything flagged as noise.
    return bool(mapped) and not noise


def write_teas(rows: list[dict], dest: Path) -> None:
    fields = ["shop", "country", "name", "tea_type", "format", "ingredients_english",
              "ingredients_source", "n_ingredients", "source_quality", "url"]
    with dest.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    groups = {
        "teas_france.csv": load_palais() + load_kusmi(),
        "teas_poland.csv": load_raw(S / "raw_pl.csv", "Poland"),
        "teas_uk.csv": load_raw(S / "raw_uk.csv", "UK"),
        "teas_germany.csv": load_raw(S / "raw_de.csv", "Germany"),
        "teas_czechia.csv": load_raw(S / "raw_cz.csv", "Czechia"),
        "teas_netherlands.csv": load_raw(S / "raw_nl.csv", "Netherlands"),
        "teas_usa.csv": (
            load_shopify_prose("shopify_harney.json", "Harney & Sons", "USA", "www.harney.com")
            + load_shopify_prose("shopify_rishi.json", "Rishi Tea", "USA", "rishi-tea.com")
            + load_shopify_prose("shopify_artoftea.json", "Art of Tea", "USA", "www.artoftea.com")
        ),
        "teas_canada.csv": load_shopify_prose(
            "shopify_davidstea.json", "DAVIDsTEA", "Canada", "www.davidstea.com"),
        "teas_india.csv": load_shopify_prose(
            "shopify_vahdam.json", "Vahdam Teas", "India", "www.vahdamteas.com"),
        "teas_australia.csv": load_shopify_prose(
            "shopify_t2.json", "T2 Tea", "Australia", "t2tea.com"),
    }

    # Stripping the pack size off a name collapses "Masala Chai 60 g" and "Masala Chai 1 kg"
    # into the same tea, which is right — but leaves duplicate rows. Keep the first, which is
    # the one with the fuller ingredient text more often than not.
    for rows in groups.values():
        seen: set[str] = set()
        deduped = [r for r in rows if not (r["name"].casefold() in seen or seen.add(r["name"].casefold()))]
        rows[:] = deduped

    ingredient_rows = []
    summary = []
    for filename, rows in groups.items():
        for r in rows:
            parsed = lexicon.parse(r["ingredients_source"])
            english = []
            for position, (term, pct) in enumerate(parsed):
                mapped = lexicon.to_english(term)
                noise = lexicon.is_noise(term)
                if keep_in_summary(term, mapped, noise):
                    english.append(mapped)
                ingredient_rows.append(
                    {
                        "country": r["country"], "shop": r["shop"], "tea_name": r["name"],
                        "format": r.get("format", ""), "position": position, "ingredient_source": term,
                        "ingredient_english": mapped, "percentage": pct,
                        "is_flavouring": "yes" if noise else "",
                        "in_herbatka_vocabulary": "yes" if mapped else "",
                        "url": r["url"],
                    }
                )
            r["ingredients_english"] = ", ".join(dict.fromkeys(english))
            r["n_ingredients"] = str(len(parsed))
            r["tea_type"] = tea_type(r["name"], r["ingredients_source"])
        rows.sort(key=lambda x: x["name"])
        write_teas(rows, S / filename)
        summary.append((filename, len(rows)))

    dest = S / "tea_ingredients_all.csv"
    fields = ["country", "shop", "tea_name", "format", "position", "ingredient_source",
              "ingredient_english", "percentage", "is_flavouring",
              "in_herbatka_vocabulary", "url"]
    with dest.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(ingredient_rows)

    for filename, n in summary:
        print(f"{filename:<22} {n:>4} teas")
    total = len(ingredient_rows)
    mapped = sum(1 for r in ingredient_rows if r["ingredient_english"])
    noise = sum(1 for r in ingredient_rows if r["is_flavouring"])
    print(f"\n{dest.name:<22} {total:>4} ingredient rows")
    print(f"  mapped to English vocabulary : {mapped} ({mapped / total:.0%})")
    print(f"  flavouring / aroma noise     : {noise} ({noise / total:.0%})")

    unmapped: dict[str, int] = {}
    for r in ingredient_rows:
        if not r["ingredient_english"] and not r["is_flavouring"]:
            key = lexicon.fold(r["ingredient_source"])[:40]
            unmapped[key] = unmapped.get(key, 0) + 1
    print("\ntop unmapped terms (candidates for new Herbatka ingredients):")
    for term, n in sorted(unmapped.items(), key=lambda kv: -kv[1])[:20]:
        print(f"  {n:>4}  {term}")


if __name__ == "__main__":
    main()
