# Can the catalogue be bulk-filled from the internet?

**Measured answer: no — and the reason is interesting.** Recorded here so the question does
not get re-opened from scratch in six months.

## What was tried

[Open Food Facts](https://world.openfoodfacts.org/) is the right shape of source: ~4.8M
packaged products with ingredient lists, [ODbL-licensed](https://world.openfoodfacts.org/data)
so attribution is the only obligation, and a free API with no key. Everything about the
licence and the coverage says this should work.

Three access routes, tested:

| Route | Result |
|---|---|
| `/api/v2/search?categories_tags_en=teas` | **HTTP 503** — bulk search is shut off |
| `search.openfoodfacts.org` | **HTTP 500** |
| Hugging Face `datasets-server` full-text over their Parquet dump | **timeout** on 4.78M rows |
| `/api/v2/product/{barcode}` | ✅ works, reliably |

So: barcode lookups only, and barcodes have to be found by web search first. 20 barcodes were
collected that way and swept. `off_tea_products.json` holds the 11 that returned anything.

## Why the yield does not help

11 of 20 returned ingredient text. Of those 11:

- **4 were the same Earl Grey** and **3 the same Lady Grey**, under different market barcodes.
  Distinct teas: about six, four of which the catalogue already had.
- **Three were not in English** — Portuguese, French and Norwegian ingredient text, each
  needing translation before it could touch the 64-ingredient vocabulary.
- **One was not an ingredient list at all.** Tesco Peppermint Infusion's field contains
  packaging copy: *"WHY NOT TRY OUR OTHER TEA INFUSIONS 20 Peppermint infusion bags.
  PREPARATION GUIDELINES…"*. It is a free-text field, and it is used as one.
- **One listed the same herb twice in two languages** — H-E-B Chamomile:
  `CHAMOMILE, MANZANILLA (Matricaria recutita)`.

And the finding that actually settles it:

> **Twinings Earl Grey, per the package: `black tea, bergamot flavouring (1%)`.**
> The seed data says `Black tea leaf 95%, Bergamot oil 5%`.

A regulated ingredient list says **"flavouring"** because that is the legal term. It is
information-free for our purposes: every flavoured tea in the database contains "natural
flavouring", so as a matrix column it appears everywhere and distinguishes nothing — the
worst possible feature. The hand-written `Bergamot oil` is a *better* row than the real
package's, because a person wrote down what the flavour actually is.

**The curated seed data beats the authoritative source.** That is an unusual outcome and worth
remembering: for this attribute, packaging is not ground truth about flavour, it is ground
truth about labelling law.

## What the module is still good for

`herbatka_analysis.openfoodfacts` stays, scoped down to **verification**: "does Twinings
really put cornflower in Lady Grey?" is a question it answers well, and it did — Lady Grey
came back as `Black Tea, Orange peel (3%), Lemon Peel (2%), Cornflowers, Citrus Flavouring`,
independently confirming a recipe that had been written from memory.

## The real conclusion

Ingredients are the wrong feature for over half this catalogue, and no source fixes that,
because the data does not exist to be found. Ten of 23 teas are single-ingredient *by nature*
— a Sencha genuinely contains only green tea leaf — so in ingredient space every green tea is
the same point.

What distinguishes a Sencha from a Gunpowder is **flavour**: grassy, marine, vegetal versus
smoky, bold, mineral. That is what vendors publish, in prose, and it is a second vocabulary
(`flavour_note`) rather than a gap in the first. See PLAN.md.

## Attribution

`off_tea_products.json` contains data from Open Food Facts, made available under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/); individual facts
under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/).
Retrieved August 2026 via the public API.
