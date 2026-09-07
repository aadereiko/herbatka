# Vendor catalogues: teas and their ingredients

Harvested from thirteen shops in ten countries, September 2026. This answers the gap
`public-datasets.md` closes with: no open dataset publishes tea *recipes*, because vendors do
— one shop at a time, in their own language.

## Why the CSVs are gitignored and the scripts are not

The rows are the shops' own catalogue copy. They are fine for developing and validating the
similarity work, and they must not become `api/app/seed/` data — the same rule
`public-datasets.md` already applies to the CC BY-NC `tea-hypervectors` set.

The scripts are ours and reproduce every row in about fifteen minutes, so the repository keeps
the method and not the harvest. Regenerate with `analysis/vendor_catalogues/`.

## What was collected

**1,641 teas from 13 shops in 10 countries**, and 8,150 ingredient rows.

| Shop | Country | Teas | Ingredient data |
|---|---|---|---|
| Ronnefeldt | Germany | 357 | `Zutaten:` composition list |
| Oxalis | Czechia | 286 | `Složení` composition list |
| Harney, Rishi, Art of Tea | USA | 229 | named in prose |
| Palais des Thés + Kusmi | France | 215 | composition list **with percentages** / prose |
| Simon Lévelt | Netherlands | 187 | `Ingredienten` composition list |
| Cafe Silesia | Poland | 159 | `Skład:` composition list |
| Bird & Blend | UK | 103 | composition list **with percentages** |
| Vahdam Teas | India | 45 | named in prose |
| T2 Tea | Australia | 36 | named in prose |
| DAVIDsTEA | Canada | 24 | named in prose |

461 rows carry a real percentage; the rest are presence only. 79% of terms map onto the
English vocabulary in `vendor_catalogues/lexicon.py`, which holds **French, Polish, English,
German, Czech and Dutch** keys.

### `format` — bags, loose or powder

No shop publishes this as a field, so it is read out of the product name, the URL and the
Shopify variant titles, in six languages (`sachet`, `Teebeutel`, `saszetki`, `porcovaný`,
`theezakje`, `tea bags`…). It resolves for **46%** of teas; the rest genuinely never say,
which is itself the honest answer for a loose-leaf specialist.

### Shops that were tried and did not work

- **Mariage Frères** — `robots.txt` says `Allow: /`, but the site returns **403** to
  automated requests. Their infrastructure declines regardless of what the text file permits,
  and that is a no. Not worked around.
- **Dammann** — no sitemap at any conventional path; would need category crawling.
- **Whittard, Teapigs, Pukka** — not Shopify, no cheap structured route; 403 for Pukka.
- **eherbata.pl, ministerstwoherbaty.pl, czasnaherbate.com.pl** — 403 or DNS failure.
- **Paper & Tea (DE), Tea Shop (ES)** — Shopify, but publish no composition anywhere;
  only prose and tag chips.
- **Neavita (IT)** — sitemap covers posts and pages, no products.
- **La Via del Tè (IT), A.C. Perch's (DK), TeeGschwendner (DE)** — no sitemap.
- **Demmer (AT), Or Tea? (BE)** — do not resolve.

## How it was collected, and the manners involved

Every shop's `robots.txt` was read first; on all of them, product pages are permitted (what they
block is search, filters, sorting and checkout). Requests run at **1 per second** with a
User-Agent that says what the crawler is, and every page is cached to disk so a re-run costs
the shop nothing.

Product URLs come from each shop's own **sitemap** (or, for Shopify shops, from
`/products.json`) rather than from crawling category pages — one request instead of hundreds.

## Where this data is used

`vendor_catalogues/export_for_web.py` writes a compact indexed JSON to
`web/src/dev/labs/vendor-dataset.json` (214 KB), which the **data-science bench** at
`/dev/labs` reads. That route is mounted behind `import.meta.env.DEV` exactly as the OCR
bench is, so these rows are browsable locally and are **dropped from any production
bundle** — see the note in `web/src/app/router.tsx`.

## The traps in this data

**1. The ingredients field is not only ingredients.** Palais des Thés puts the recipe, the
organic footnote, the allergen notice and the per-100ml nutrition table in one HTML blob.
Parsed naively, `de glucides dont sucres` and `de protéines` become the two commonest
"ingredients" in the French catalogue, on 26 teas each. `build_csvs.py` cuts the text at those
markers; that one fix moved vocabulary mapping from 69% to 83%.

**2. "Arôme naturel" is the worst possible feature, and it is everywhere.** It is ~16% of all
ingredient rows. `analysis/data/README.md` already measured why: a regulated label says
*flavouring* for every flavoured tea, so as a matrix column it appears everywhere and
distinguishes nothing. These rows are **flagged** (`is_flavouring`) rather than dropped —
what to do with them is a modelling decision, not a parsing one, and it is the open
`TODO(human)` in `build_csvs.py`.

**3. Every language broke a different assumption.** Polish `ł` is not an accented `l`, so
Unicode NFD leaves it alone and naive folding turned *jabłko* into `jab ko` — apple matched
nothing in the entire Polish catalogue. German glues compounds, so a flavouring rule
anchored at the start (`^arôme`) missed *Natürliches Orangen**aroma***. Czech `Složení`
shares its stem with `składanie zamówienia`-style checkout copy, so the colon is
load-bearing. Czech and Polish both inflect nouns, so those lexicon keys are stems.

**4. `<script>` contents survive tag stripping.** `re.sub(r"<[^>]+>", "", html)` removes
markup but not the *text inside* a script element — and Simon Lévelt's inline Google Tag
Manager sits right after the ingredients block, so `var f d getelementsbytagname` parsed as
an ingredient. Script, style, noscript and template elements are now removed whole first.

## Files

| File | One row per | Notes |
|---|---|---|
| `teas_<country>.csv` | tea | one per country: france, poland, uk, germany, czechia, netherlands, usa, canada, india, australia |
| `tea_ingredients_all.csv` | (tea, ingredient) | the shape `tea_ingredient` wants |
| `raw_*.csv`, `shopify_*.json` | — | the untouched harvest each loader reads |

`ingredient_english` is the term mapped onto Herbatka's vocabulary through
`vendor_catalogues/lexicon.py`, which holds French, Polish and English keys. It is empty where
nothing matched; `in_herbatka_vocabulary` says so explicitly, and those rows are the candidate
list for new `ingredient` rows.

Gift boxes are dropped: their ingredients field concatenates several teas' recipes under
`Tea Name:` headings, so the ingredients belong to no single tea.

## Attribution

Catalogue data retrieved September 2026 from palaisdesthes.com, kusmitea.com, cafesilesia.pl,
birdandblendtea.com, ronnefeldt.com, oxalis.cz, simonlevelt.nl, harney.com, rishi-tea.com,
artoftea.com, davidstea.com, vahdamteas.com and t2tea.com. Each remains the property of its
shop; nothing here is redistributed.
