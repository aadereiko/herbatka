# Public tea data: what exists, and what survived testing

Every row below was actually requested, not just read about. August 2026.

## Verdict table

| Source | Reachable | Useful here | Licence |
|---|---|---|---|
| **[prrao87/tea-hypervectors](https://huggingface.co/datasets/prrao87/tea-hypervectors)** | ✅ | **✅ the one that fits** | CC BY-**NC** 4.0 ⚠️ |
| [Open Food Facts](https://world.openfoodfacts.org/data) | partly | ❌ worse than our own data | ODbL ✅ |
| [Wikidata SPARQL](https://query.wikidata.org/) | ✅ | ❌ encyclopedic, not sensory | CC0 ✅ |
| [FlavorDB / FlavorDB2](https://cosylab.iiitd.edu.in/flavordb2/) | ❌ **DNS does not resolve** | — | — |
| [FSBI-DB](https://fsbi-db.de/) | ✅ site only | ❌ no API, no bulk export | — |
| `tznurmin/tea_curated` (HF) | ✅ | ❌ tea *plant pathogens*, not drinks | — |
| Kaggle tea datasets | ✅ | ❌ prices, plant disease images | mixed |

Notes on the misses, so nobody re-checks them:

- **FlavorDB** is the one that *should* have been perfect — 25,595 flavour molecules mapped
  to 936 natural ingredients, which would give every ingredient a chemical fingerprint. The
  papers are published and current. The host simply does not resolve; the project appears
  dead. [FSBI-DB](https://fsbi-db.de/) is a live relative but exposes a search page and no
  API, so bulk use would mean scraping a site that has not invited it.
- **Wikidata** answers, quickly and under CC0, but the model is encyclopedic: querying tea
  and its `has part` returns *water* and *caffeine*. True, and no help.
- **Open Food Facts** is written up separately in `README.md`. Short version: regulated
  ingredient lists say "flavouring", which is the same word on every flavoured tea.

## The one that works

**`prrao87/tea-hypervectors`** — 166 teas scraped from a real vendor catalogue, with a
schema that is almost exactly the one this project needs:

```
class            green 65 · black 51 · oolong 35 · white 12 · yellow 3
country          China 59 · Japan 48 · Taiwan 25 · India 21 · Sri Lanka 6 · Nepal 2 · Korea 1
oxidation        low 96 · high 51 · medium 19
roast            none 144 · light 13 · heavy 9
aroma            ['muscatel grapes', 'flowers', 'honey', 'baked apples and pears', ...]
taste            ['almost syrupy texture', 'fruity finish is rich and heady']
title, description, region, elevation_meters, source_url, image
```

It is 166 **single-origin** teas — precisely the population where our ingredient matrix is
degenerate, because every green tea reduces to "green tea leaf". And `oxidation` and `roast`
are the attributes that actually separate a Sencha from a Gunpowder.

### ⚠️ The licence is the catch

**CC BY-NC 4.0 — non-commercial.** Fine for a pet project and for research; a problem the
day Herbatka is a product. It is also one vendor's catalogue, so it is biased toward Chinese,
Japanese and Taiwanese leaf, with no herbals or blends at all.

**Use it to develop and validate the approach, not to populate the shipped catalogue.** The
*taxonomy* derived from it is not encumbered — a list of flavour families is an idea, not a
database — which is why `herbatka_analysis/flavour.py` can be used freely while the rows
themselves stay out of `seed/`.

## The measurement that matters

Raw tasting notes do **not** solve the sparsity problem. Normalising them does.

| Representation | Vocabulary | Pairs sharing ≥ 1 term |
|---|---|---|
| Ingredients (our seed catalogue) | 64 ingredients | **9.1%** |
| Raw tasting notes, as written | 650 free-text terms | **8.7%** |
| **Normalised flavour families** | **23 families** | **64.9%** |
| class + oxidation + roast + country | 4 attributes | 86.5% |

Read the middle row carefully: free-text notes are *no better than ingredients*, because
650 terms across 166 teas means almost every word appears once. "Peach" and "apricot" are
the same fact about a tea, and a model treating them as unrelated symbols has no chance.

The fix was never more data. It was a vocabulary in which two teas can agree.

## What this implies for the schema

A `flavour_note` table shaped like `ingredient` — a controlled admin-managed vocabulary,
seeded from `herbatka_analysis.flavour.FAMILIES` — plus a `tea_flavour_note` join carrying
intensity, exactly as `tea_ingredient` carries percentage.

Then `oxidation` and `roast` as columns on `tea`. They are cheap, dense, uncontroversial,
and on their own they already make single-origin teas comparable.

Similarity becomes the weighted combination of three spaces — ingredients for blends,
flavour families for everything, structural attributes as the floor that is never empty —
and the 91%-of-pairs-are-orthogonal problem goes away.

### A correction worth keeping

The normalised figure was first measured at **74.1%** and is actually **64.9%**. The mapping
used substring matching, so `"pea"` matched *pears* and *peaches*: every stone-fruit note also
scored as vegetal, and `grassy_vegetal` appeared to cover 84 of 166 teas when the true figure
is 60. `"nut"` matched *nutmeg* and `"grape"` matched *grapefruit* the same way.

A word boundary fixes all three, and `flavour.py` now uses one. The conclusion is unchanged —
65% against 9% is still the whole argument — but the first number was wrong, and it was wrong
in the flattering direction, which is the direction to distrust.
