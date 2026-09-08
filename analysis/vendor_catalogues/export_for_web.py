import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

S = Path(__file__).resolve().parents[1] / "data" / "vendor-catalogues"
DEST = Path(__file__).resolve().parents[2] / "web" / "src" / "dev" / "labs" / "vendor-dataset.json"

COUNTRY_FILES = {
    "France": "teas_france.csv",
    "Poland": "teas_poland.csv",
    "UK": "teas_uk.csv",
    "Germany": "teas_germany.csv",
    "Czechia": "teas_czechia.csv",
    "Netherlands": "teas_netherlands.csv",
    "USA": "teas_usa.csv",
    "Canada": "teas_canada.csv",
    "India": "teas_india.csv",
    "Australia": "teas_australia.csv",
    "Japan": "teas_japan.csv",
    "Taiwan": "teas_taiwan.csv",
    "Switzerland": "teas_switzerland.csv",
    "Finland": "teas_finland.csv",
    "Thailand": "teas_thailand.csv",
    "Sweden": "teas_sweden.csv",
    "Argentina": "teas_argentina.csv",
    "Sri Lanka": "teas_sri_lanka.csv",
    "New Zealand": "teas_new_zealand.csv",
}


def main() -> None:
    ingredient_index: dict[str, int] = {}
    flavour_index: dict[str, int] = {}
    flag_index: dict[str, int] = {}
    shop_index: dict[tuple[str, str], int] = {}
    teas: list[list] = []

    for country, filename in COUNTRY_FILES.items():
        path = S / filename
        if not path.exists():
            continue
        for r in csv.DictReader(path.open(encoding="utf-8")):
            shop_key = (r["shop"], country)
            shop_index.setdefault(shop_key, len(shop_index))
            names = [n.strip() for n in r["ingredients_english"].split(",") if n.strip()]
            for n in names:
                ingredient_index.setdefault(n, len(ingredient_index))
            fams = [f.strip() for f in r["flavour_families"].split(",") if f.strip()]
            for f in fams:
                flavour_index.setdefault(f, len(flavour_index))
            flags = [f.strip() for f in r["quality_flags"].split(";") if f.strip()]
            for f in flags:
                flag_index.setdefault(f, len(flag_index))
            teas.append(
                [
                    r["name"],
                    shop_index[shop_key],
                    r["tea_type"],
                    r["format"],
                    sorted({ingredient_index[n] for n in names}),
                    sorted({flavour_index[f] for f in fams}),
                    sorted({flag_index[f] for f in flags}),
                    r["usable_for_similarity"] == "yes",
                    r["source_quality"] == "composition list",
                    r["url"],
                ]
            )

    # Percentages live only in the per-ingredient file; carry the count so the page can say
    # how much of the set has real quantities rather than only presence.
    with_pct = 0
    rows = list(csv.DictReader((S / "tea_ingredients_all.csv").open(encoding="utf-8")))
    with_pct = sum(1 for r in rows if r["percentage"])

    payload = {
        "generated": date.today().isoformat(),
        "schema": [
            "name",
            "shop",
            "type",
            "format",
            "ingredients",
            "flavours",
            "flags",
            "usable",
            "hasCompositionList",
            "url",
        ],
        "shops": [{"name": s, "country": c} for s, c in shop_index],
        "ingredients": list(ingredient_index),
        "flavours": list(flavour_index),
        "flags": list(flag_index),
        "teas": teas,
        "stats": {
            "ingredientRows": len(rows),
            "rowsWithPercentage": with_pct,
            "distinctIngredients": len(ingredient_index),
        },
    }

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8"
    )

    kb = DEST.stat().st_size / 1024
    print(f"{len(teas)} teas, {len(ingredient_index)} ingredients, {len(shop_index)} shops")
    print(f"top ingredients: {Counter(i for t in teas for i in t[4]).most_common(3)}")
    print(f"wrote {DEST.relative_to(Path(__file__).resolve().parents[2])} ({kb:.0f} KB)")


if __name__ == "__main__":
    main()
