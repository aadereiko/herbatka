import collections
import csv
import html
import json
import re
import sys
from pathlib import Path

import lexicon

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from herbatka_analysis import flavour  # noqa: E402

S = Path(__file__).resolve().parents[1] / "data" / "vendor-catalogues"
S.mkdir(parents=True, exist_ok=True)

TYPE_RULES = [
    ("rooibos", r"rooibos|honeybush|czerwonokrzew"),
    ("puerh", r"pu-?erh|pu ?er|czerwona"),
    ("oolong", r"\boolong\b|wu ?long"),
    ("white", r"th[ée] blanc|white tea|herbata biala|biala herbata"),
    ("green", r"th[ée] vert|green tea|matcha|sencha|gyokuro|zielona|hojicha"),
    ("black", r"th[ée] noir|black tea|czarna"),
    (
        "herbal",
        r"infusion|verveine|camomille|menthe|tilleul|hibiscus|rumianek|owocowa|zioowa|ziolowa",
    ),
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


# Adagio titles its pages for search, not for people: "Lemongrass Tea | Southeast Asian
# Citrus Herbal Tea | Adagio Teas", "… | Buy Online | Free Shipping Over $49". Everything
# from the first pipe onward is marketing, and the same is true of the format suffix other
# shops put there ("… 20x2g | PIRAMIDKI").
PIPE_TAIL = re.compile(r"\s*\|.*$")


def clean_name(raw: str) -> str:
    name = PIPE_TAIL.sub("", raw)
    name = SHOP_SUFFIX.sub("", name)
    name = re.sub(r"®|™", "", name)
    return TRAILING_SIZE.sub("", name).strip(" ,-|")


# How the tea is sold, which no shop states in a field — it is in the product name, the URL
# or the pack size, in whichever language the shop trades in.
FORMAT_RULES = [
    (
        "bags",
        r"sachet|teebeutel|beutel|builen|theezakje|zakje|saszetk|torebk|porcovan"
        r"|s[aá][cč]k|tea ?bags?|teabag|pyramid|bustine|infusettes?|filtro|piramidk",
    ),
    ("powder", r"\bmatcha\b|poudre|pulver|poeder|pr[aá][sš]ek|proszek|powder|instant"),
    (
        "loose",
        r"\bvrac\b|\blose[rn]?\b|losse thee|sypan|li[sś]ciast|loose ?-?leaf|volumine"
        r"|sypk|na wag[eę]|lo[sš]e",
    ),
]


def tea_format(text: str) -> str:
    """`bags`, `loose`, `powder`, or empty when the shop does not say.

    Order matters: a matcha sold in sachets is checked for bags first, and "loose" is last
    because a page mentioning "loose leaf" in passing is weaker evidence than an explicit
    pack format in the title.
    """
    hay = lexicon.fold(text)
    return next((f for f, pat in FORMAT_RULES if re.search(pat, hay)), "")


# A composition list says what is *in* a tea and never that it is smoky or honeyed. That
# vocabulary lives only in the shop's prose, and it is a genuinely separate axis — but only
# where there is prose to read. Measured over this harvest:
#
#   shops with real descriptions   84% of teas get a family, rescuing 27% of the pairs that
#                                  share no ingredient (coverage 30% -> 48%)
#   composition-list shops         27% of teas, rescuing ~1% — their meta description is a
#                                  one-liner like "sypaný černý čaj aromatizovaný"
#
# Scraping the page body instead was tried and is worse than nothing: Adagio's body starts
# "Skip to main content ACCOUNT" and a Czech page's checkout boilerplate scored a spurious
# `chocolate`. Nav text would hand every tea the same families and destroy the axis.
SELF_LABEL = re.compile(r"(?i)\b(green|black|white|herbal|rooibos|oolong) tea\b")


def flavour_families(text: str) -> list[str]:
    """The flavour families a shop's own description places a tea in.

    The tea's class is stripped first, on `flavour.py`'s own warning: `grassy_vegetal`
    matches "green", so every green tea would otherwise label itself vegetal for no reason
    beyond having its type printed on the page.
    """
    return sorted(flavour.families_of_all([SELF_LABEL.sub(" ", text)]))


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
                "shop": "Palais des Thes",
                "country": "France",
                "name": clean_name(r["name"]),
                "ingredients_source": ing,
                "source_quality": "composition list",
                "url": r["url"],
                "format": tea_format(f"{r['name']} {r['url']}"),
                "blurb": "",
            }
        )
    return rows


NOT_A_TEA_PRODUCT = re.compile(
    r"(?i)\b(?:bundle|sampler|gift set|gift box|advent|teaware|infuser|kettle|mug|teapot|"
    r"tin only|merch|card|subscription|teepurkki|joulukalenteri|kalenteri|purkki|"
    r"mok|becher|tasse)\b"
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
        prose = re.sub(
            r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p.get("body_html") or ""))
        )
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
        # Shops that sell coffee beside tea reach this loader too — Sirocco's espresso
        # descriptions name cinnamon and cocoa and would otherwise pass as blends.
        if NOT_TEA.search(prose):
            continue
        rows.append(
            {
                "shop": shop,
                "country": country,
                "name": clean_name(title),
                "ingredients_source": ", ".join(found),
                "source_quality": "named in prose",
                "url": f"https://{host}/products/{p['handle']}",
                # Variant titles are where a Shopify shop actually states the format
                # ("50 Tea Bags", "Loose Leaf Pouch"); the product title rarely does.
                "format": tea_format(
                    f"{title} {' '.join(v.get('title') or '' for v in p.get('variants', []))} "
                    f"{prose[:300]}"
                ),
                "blurb": prose,
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
                "shop": r["shop"],
                "country": country,
                "name": clean_name(r["name"]),
                "ingredients_source": ing,
                "source_quality": "composition list",
                "url": r["url"],
                "format": tea_format(f"{r['name']} {r['url']}"),
                "blurb": r.get("description", ""),
            }
        )
    return rows


def load_raw_prose(filename: str, shop: str, country: str) -> list[dict]:
    """Sitemap-crawled shops that publish prose rather than a composition list.

    Same treatment as a Shopify description — sweep the lexicon for ingredients, hand the
    text to the flavour families — but sourced from `collect_shop.page_prose` instead of a
    products.json. Adagio is the reason this exists: no ingredient list anywhere, and some
    of the best tasting notes in the harvest.
    """
    path = S / filename
    if not path.exists():
        return []
    rows = []
    for r in csv.DictReader(path.open(encoding="utf-8")):
        # The meta description, not the page body. Measured on both: Adagio's body text
        # starts with "Skip to main content ACCOUNT" and a Czech page yields checkout
        # boilerplate that scored a spurious `chocolate` family, while the description says
        # "Honey, orchid, spring grass, buttery finish". Page scrape is the fallback, not
        # the source.
        prose = r.get("description", "").strip()
        if len(prose) < 40:
            prose = r["ingredients_raw"].strip()
        if len(prose) < 40:
            continue
        folded = lexicon.fold(prose)
        found: list[str] = []
        for key in lexicon.KEYS:
            name = lexicon.LEXICON[key]
            if key in folded and name not in found:
                found.append(name)
        if len(found) < 2 or NOT_TEA.search(prose):
            continue
        rows.append(
            {
                "shop": shop,
                "country": country,
                "name": clean_name(r["name"]),
                "ingredients_source": ", ".join(found),
                "source_quality": "named in prose",
                "url": r["url"],
                "format": tea_format(f"{r['name']} {r['url']} {prose[:300]}"),
                "blurb": prose,
            }
        )
    return rows


# Words that mean a row may not be one tea. Deliberately *flags* rather than filters: "Apple
# Strudel Tea Bag Gift" is a single tea in a gift wrapper, "Black Tea Selection Box" is five
# teas whose ingredients belong to none of them, and no pattern separates those two honestly.
MAYBE_MULTI_TEA = re.compile(
    r"(?i)\b(?:selection|collection|sampler|assortment|advent|starter set|discovery|"
    r"variety|d[aá]rkov\w*|zestaw|probier\w*|proefpakket)\b"
)
#: Things a tea shop sells that are not tea. Dilmah sells books; several sell teaware.
MAYBE_NOT_TEA = re.compile(
    r"(?i)\b(?:book|poster|calendar|mug|cup|teapot|strainer|infuser|tray|spoon|candle|soap|"
    r"apron|voucher|t-?shirt|kettle|timer|scoop|caddy)\b"
)
NON_LATIN = re.compile(r"[\u3000-\u9fff\u0e00-\u0e7f\uac00-\ud7af\u0400-\u04ff]")


def quality_flags(row: dict, duplicate_names: set[str]) -> list[str]:
    """Why this row might not be trustworthy — never a verdict, always a reason.

    Nothing is dropped on the strength of these. They exist so a notebook can say
    `df[~df.quality_flags.str.contains("maybe-multi-tea")]` and know exactly what it excluded,
    instead of a filter having quietly made that choice upstream.
    """
    ingredients = [i for i in row["ingredients_english"].split(",") if i.strip()]
    flags = []
    # Deliberately not flagged here: an empty `format`, `tea_type` or `flavour_families`, and
    # the fact that ingredients came from prose. Those are already legible in their own
    # columns, and including them flagged 98% of rows — a flag on everything says nothing.
    if not ingredients and not row["flavour_families"].strip():
        flags.append("no-signal")
    elif not ingredients:
        flags.append("no-ingredients")
    elif len(ingredients) == 1:
        # Correct for a single-origin Darjeeling, and near-useless for similarity: it can
        # only ever match every other tea sharing that one leaf.
        flags.append("single-ingredient")
    if MAYBE_MULTI_TEA.search(row["name"]):
        flags.append("maybe-multi-tea")
    if MAYBE_NOT_TEA.search(row["name"]):
        flags.append("maybe-not-tea")
    if NON_LATIN.search(row["name"]):
        flags.append("non-latin-name")
    if row["name"].strip().casefold() in duplicate_names:
        flags.append("duplicate-name")
    return flags


def usable_for_similarity(row: dict) -> str:
    """Can this row contribute to a similarity model at all?

    The bar is two ingredients or one flavour family — anything less can only say "is a tea",
    which every row already says. This is the column to filter on; `quality_flags` is the
    column that explains why a row failed.
    """
    ingredients = [i for i in row["ingredients_english"].split(",") if i.strip()]
    has_flavour = bool(row["flavour_families"].strip())
    return "yes" if len(ingredients) >= 2 or has_flavour else "no"


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
    fields = [
        "shop",
        "country",
        "name",
        "tea_type",
        "format",
        "ingredients_english",
        "flavour_families",
        "usable_for_similarity",
        "quality_flags",
        "ingredients_source",
        "n_ingredients",
        "source_quality",
        "url",
    ]
    with dest.open("w", newline="", encoding="utf-8") as f:
        # `blurb` is the shop's prose, carried between loaders only so the flavour families
        # can be read out of it. It is working state, not a column.
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    groups = {
        "teas_france.csv": load_palais() + load_kusmi(),
        "teas_poland.csv": load_raw(S / "raw_pl.csv", "Poland"),
        "teas_uk.csv": (
            load_raw(S / "raw_uk.csv", "UK")
            + load_shopify_prose("shopify_jingtea.json", "JING Tea", "UK", "www.jingtea.com")
            + load_shopify_prose(
                "shopify_tregothnan.json", "Tregothnan", "UK", "www.tregothnan.co.uk"
            )
        ),
        "teas_germany.csv": load_raw(S / "raw_de.csv", "Germany"),
        "teas_czechia.csv": load_raw(S / "raw_cz.csv", "Czechia"),
        "teas_netherlands.csv": (
            load_raw(S / "raw_nl.csv", "Netherlands")
            # A Dutch retailer specialising in Chinese tea — filed by where the shop is,
            # which is what every other row in this column means.
            + load_shopify_prose("shopify_teasenz.json", "Teasenz", "Netherlands", "www.teasenz.eu")
        ),
        "teas_usa.csv": (
            load_shopify_prose("shopify_harney.json", "Harney & Sons", "USA", "www.harney.com")
            + load_shopify_prose("shopify_rishi.json", "Rishi Tea", "USA", "rishi-tea.com")
            + load_shopify_prose("shopify_artoftea.json", "Art of Tea", "USA", "www.artoftea.com")
            + load_shopify_prose("shopify_teaforte.json", "Tea Forte", "USA", "teaforte.com")
            + load_shopify_prose(
                "shopify_whistlingkettle.json",
                "The Whistling Kettle",
                "USA",
                "thewhistlingkettle.com",
            )
            + load_shopify_prose(
                "shopify_smithtea.json", "Smith Teamaker", "USA", "www.smithtea.com"
            )
            + load_shopify_prose(
                "shopify_teaspot.json", "The Tea Spot", "USA", "www.theteaspot.com"
            )
            + load_shopify_prose(
                "shopify_simplelooseleaf.json", "Simple Loose Leaf", "USA", "simplelooseleaf.com"
            )
            + load_shopify_prose(
                "shopify_looseleafmarket.json",
                "Loose Leaf Tea Market",
                "USA",
                "looseleafteamarket.com",
            )
            + load_shopify_prose("shopify_uptontea.json", "Upton Tea", "USA", "www.uptontea.com")
            + load_raw_prose("raw_us_adagio.csv", "Adagio Teas", "USA")
        ),
        "teas_canada.csv": load_shopify_prose(
            "shopify_davidstea.json", "DAVIDsTEA", "Canada", "www.davidstea.com"
        ),
        "teas_india.csv": (
            load_shopify_prose("shopify_vahdam.json", "Vahdam Teas", "India", "www.vahdamteas.com")
            + load_shopify_prose("shopify_teabox.json", "Teabox", "India", "www.teabox.com")
        ),
        "teas_sri_lanka.csv": (
            load_shopify_prose(
                "shopify_basilur.json", "Basilur Tea", "Sri Lanka", "lk.basilurtea.com"
            )
            + load_shopify_prose("shopify_dilmah.json", "Dilmah", "Sri Lanka", "shop.dilmahtea.com")
            + load_shopify_prose(
                "shopify_ceylontstore.json", "Ceylon T Store", "Sri Lanka", "www.ceylontstore.com"
            )
        ),
        "teas_new_zealand.csv": load_raw_prose("raw_nz.csv", "Zealong", "New Zealand"),
        "teas_australia.csv": load_shopify_prose(
            "shopify_t2.json", "T2 Tea", "Australia", "t2tea.com"
        ),
        "teas_sweden.csv": load_shopify_prose(
            "shopify_johanochnystrom.json",
            "Johan & Nystrom",
            "Sweden",
            "www.johanochnystrom.se",
        ),
        "teas_argentina.csv": load_shopify_prose(
            "shopify_teaconnection.json",
            "Tea Connection",
            "Argentina",
            "www.teaconnection.com.ar",
        ),
        "teas_japan.csv": load_shopify_prose(
            "shopify_yunomi.json", "Yunomi", "Japan", "yunomi.life"
        ),
        "teas_taiwan.csv": load_shopify_prose(
            "shopify_ecocha.json", "Eco-Cha", "Taiwan", "eco-cha.com"
        ),
        "teas_switzerland.csv": load_shopify_prose(
            "shopify_sirocco.json", "Sirocco", "Switzerland", "sirocco.ch"
        ),
        "teas_finland.csv": load_shopify_prose(
            "shopify_nordqvist.json", "Nordqvist", "Finland", "www.nordqvist.fi"
        ),
        "teas_thailand.csv": load_shopify_prose(
            "shopify_chaidim.json", "Chaidim", "Thailand", "www.chaidim.com"
        ),
    }

    # Stripping the pack size off a name collapses "Masala Chai 60 g" and "Masala Chai 1 kg"
    # into the same tea, which is right — but leaves duplicate rows. Keep the first, which is
    # the one with the fuller ingredient text more often than not.
    for rows in groups.values():
        seen: set[str] = set()
        deduped = [
            r for r in rows if not (r["name"].casefold() in seen or seen.add(r["name"].casefold()))
        ]
        rows[:] = deduped

    ingredient_rows = []
    summary = []
    for rows in groups.values():
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
                        "country": r["country"],
                        "shop": r["shop"],
                        "tea_name": r["name"],
                        "format": r.get("format", ""),
                        "position": position,
                        "ingredient_source": term,
                        "ingredient_english": mapped,
                        "percentage": pct,
                        "is_flavouring": "yes" if noise else "",
                        "in_herbatka_vocabulary": "yes" if mapped else "",
                        "url": r["url"],
                    }
                )
            r["ingredients_english"] = ", ".join(dict.fromkeys(english))
            r["n_ingredients"] = str(len(parsed))
            r["tea_type"] = tea_type(r["name"], r["ingredients_source"])
            r["flavour_families"] = ", ".join(flavour_families(f"{r['name']} {r.get('blurb', '')}"))

    # Duplicate names are only visible across the whole harvest — the same Genmaicha sold by
    # five shops sits in five different country files — so flagging waits until every row of
    # every group has its fields.
    seen: collections.Counter[str] = collections.Counter(
        r["name"].strip().casefold() for rows in groups.values() for r in rows
    )
    duplicate_names = {name for name, count in seen.items() if count > 1}

    for filename, rows in groups.items():
        for r in rows:
            r["quality_flags"] = "; ".join(quality_flags(r, duplicate_names))
            r["usable_for_similarity"] = usable_for_similarity(r)
        rows.sort(key=lambda x: x["name"])
        write_teas(rows, S / filename)
        summary.append((filename, len(rows)))

    dest = S / "tea_ingredients_all.csv"
    fields = [
        "country",
        "shop",
        "tea_name",
        "format",
        "position",
        "ingredient_source",
        "ingredient_english",
        "percentage",
        "is_flavouring",
        "in_herbatka_vocabulary",
        "url",
    ]
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
