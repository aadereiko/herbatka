"""A controlled vocabulary of flavour families, and the mapping onto it.

Why this module exists, in one measurement. Tea tasting notes in the wild are free text —
166 teas from a real vendor catalogue produced **650 distinct terms**, things like
"lamb's lettuce", "naturally sweet" and "intoxicating floral aromas reminiscent of
lavender and hyacinth". Treated as symbols, they are useless: only **8.7%** of tea pairs
shared a single term, which is no better than the 9.1% the raw ingredient matrix managed.

Folding those 650 terms into the 23 families below takes pair overlap to **64.9%**.

That is the whole idea. The sparsity was never a shortage of data — it was a vocabulary
in which almost every word appears once. "Peach" and "apricot" are the same fact about a
tea, and a model that cannot see that has no chance.

The families are a taxonomy rather than data: no dataset's licence attaches to them, and
they can seed the `flavour_note` table directly.
"""

from __future__ import annotations

import re

#: family -> substrings that place a free-text note in it. Substring matching, not exact:
#: "baked apples and pears" must reach `orchard`, and it will never appear in a fixed list.
FAMILIES: dict[str, list[str]] = {
    "floral": ["floral", "flower", "jasmine", "orchid", "lavender", "rose", "lilac",
               "hyacinth", "osmanthus", "magnolia", "violet"],
    "citrus": ["citrus", "lemon", "lime", "orange", "bergamot", "grapefruit", "yuzu",
               "mandarin"],
    "stone_fruit": ["peach", "apricot", "nectarine", "plum", "cherry"],
    "berry": ["berry", "strawberry", "raspberry", "blackberry", "currant", "grape",
              "muscatel"],
    "tropical": ["mango", "pineapple", "lychee", "passion", "papaya", "banana", "coconut",
                 "melon"],
    "orchard": ["apple", "pear", "quince"],
    "dried_fruit": ["raisin", "fig", "date", "dried fruit", "prune"],
    "honey_sweet": ["honey", "sweet", "sugar", "syrup", "nectar"],
    "caramel_malt": ["caramel", "malt", "toffee", "butterscotch", "molasses", "brown sugar"],
    "chocolate": ["chocolate", "cocoa", "cacao"],
    "nutty": ["nut", "almond", "hazelnut", "walnut", "chestnut", "pecan"],
    "vanilla_cream": ["vanilla", "cream", "milk", "butter", "custard"],
    "spice": ["spice", "cinnamon", "clove", "cardamom", "pepper", "ginger", "nutmeg",
              "anise"],
    "herbaceous": ["herb", "mint", "basil", "thyme", "sage", "eucalyptus", "lemongrass"],
    "grassy_vegetal": ["grass", "vegetal", "green", "spinach", "asparagus", "lettuce",
                       "artichoke", "pea", "zucchini", "cucumber", "herbaceous"],
    "marine": ["marine", "sea", "seaweed", "iodine", "oceanic", "algae"],
    "woody": ["wood", "oak", "cedar", "bark", "pine", "resin"],
    "earthy": ["earth", "forest", "moss", "mushroom", "humus", "soil", "undergrowth"],
    "smoky": ["smoke", "smoky", "tobacco", "leather", "campfire"],
    "mineral": ["mineral", "stone", "flint", "slate", "salt"],
    "roasted": ["roast", "toast", "baked", "grilled", "bread", "cereal", "rice"],
    "umami": ["umami", "savory", "savoury", "broth", "dashi"],
    "astringent": ["astringent", "tannic", "bitter", "dry finish", "brisk"],
}


#: Whole words plus an optional plural. Substring matching was tried first and was wrong in
#: a way worth recording: "pea" matched *pears* and *peaches*, so every stone-fruit note also
#: scored as vegetal, and `grassy_vegetal` looked like the commonest family in tea. "nut"
#: matched *nutmeg*, "grape" matched *grapefruit*. A word boundary fixes all three.
_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    family: [re.compile(rf"\b{re.escape(k)}s?\b") for k in keywords]
    for family, keywords in FAMILIES.items()
}


def families_of(note: str) -> set[str]:
    """Every family a single free-text note belongs to. May be empty, may be several."""
    text = note.casefold()
    return {name for name, pats in _PATTERNS.items() if any(p.search(text) for p in pats)}


def families_of_all(notes: list[str]) -> set[str]:
    """The union over a tea's notes — its position in flavour space."""
    found: set[str] = set()
    for note in notes:
        found |= families_of(note)
    return found


# Known limitations, so they are argued about rather than rediscovered:
#
# * `grassy_vegetal` contains "green", which matches "green tea" and mislabels any note
#   that merely names the tea. Strip the tea's own class from its notes before mapping.
#   This one is NOT fixed by the word boundary — "green" really is a whole word there.
# * `honey_sweet` reaches 91 of 166 teas and `floral` 73. A family that common is
#   nearly information-free — the same problem "black tea leaf" caused in the ingredient
#   matrix, which is exactly what IDF weighting exists to handle. The difference is that
#   now there is signal underneath it to weight.
# * 23 families may be too coarse: 65% pair overlap is arguably past the useful point, and
#   somewhere around 40–60 finer families would likely separate teas better. Splitting
#   `honey_sweet` and `grassy_vegetal` first would be the experiment.
