"""A photograph for each seeded ingredient, and the credit it is owed.

Thirty-nine photographs from Wikimedia Commons, cropped square at 600 px and saved as
JPEG in `app/seed/images/`. Every ingredient the starter catalog defines has one, so
`/ingredients` is a page of real pictures rather than a page of drawings.

**Why the files are tracked in the repo rather than downloaded.** `api/media/` is
gitignored — it is upload space, and things a user put there are not ours to recreate. A
seed that wrote *into* the ignored directory from a URL would leave a fresh clone with
thirty-nine broken images until somebody happened to be online, which is exactly the
"catalog of broken pictures" the drawings were introduced to avoid. So the bytes are
committed here, and `seed_catalog` copies them into the media root through the same
`services.images.store()` an admin upload goes through — one code path, hashed names,
content type sniffed from the bytes, and no second definition of where pictures live.

**Licensing is a hard constraint, and this table is the evidence.** Only Public Domain,
CC0, CC BY and CC BY-SA files were accepted; anything unclear, non-commercial or
no-derivatives was rejected and its ingredient would have kept the drawing. The four
fields below are what CC BY and CC BY-SA actually require somebody to *show*: who made
it, under what licence, where that licence says so, and where the original lives. They are
copied onto the row so that the credit travels with the picture — see the comment on
`models.catalog.Ingredient`.

**Every one of these was looked at.** A Commons search for "cloves" returns photographs of
cloves and photographs of unrelated jars of mixed spice, and a plausible-looking wrong
picture is worse than an honest drawing, because nothing downstream can tell it is wrong.

Adding a fortieth ingredient does not require a photograph: an ingredient missing from
this table keeps the per-category drawing, which is still what
`web/src/features/catalog/IngredientImage.tsx` renders for a null `image_url`.
"""

from pathlib import Path
from typing import NamedTuple

#: Beside this module, inside the package, so it survives a `pip install` of the API as
#: well as a checkout. Not `api/media/` — that is gitignored user-upload space.
IMAGE_DIR = Path(__file__).resolve().parent / "images"


class Photo(NamedTuple):
    """One photograph and the four facts needed to credit it.

    `licence_url` is stored rather than derived from `licence`: Commons hands us the exact
    deed, and a lookup table mapping "CC BY-SA 4.0" to a URL would be a second place to get
    it wrong the first time a Public Domain mark or a non-CC licence turned up.
    """

    file: str
    #: The author as Commons records them, with the markup stripped out.
    author: str
    licence: str
    licence_url: str
    #: The Commons *file page*, where the licence and the full author record live — not a
    #: link to the bytes, which say nothing about who may use them.
    source_url: str

    @property
    def path(self) -> Path:
        return IMAGE_DIR / self.file


#: Keyed by ingredient slug — `slugify(name)` for the names in `data.INGREDIENTS`.
#: `tests/test_seed.py` proves every key here is a real ingredient and every file exists,
#: because a typo in either is a broken image on a card and nothing else would catch it.
PHOTOS: dict[str, Photo] = {
    "green-tea-leaf": Photo(
        "green-tea-leaf.jpg",
        "El mosati",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:00122615-Sencha-tea-Leaves.jpg",
    ),
    "black-tea-leaf": Photo(
        "black-tea-leaf.jpg",
        "HeroidShehu",
        "CC BY 3.0",
        "https://creativecommons.org/licenses/by/3.0",
        "https://commons.wikimedia.org/wiki/File:Ceylon_tea_Leafs.JPG",
    ),
    "oolong-tea-leaf": Photo(
        "oolong-tea-leaf.jpg",
        "Benoy",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Darjeeling_Oolong_Tea.jpg",
    ),
    "white-tea-leaf": Photo(
        "white-tea-leaf.jpg",
        "Suguri F （すぐり）",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Hakumou_ginsin.jpg",
    ),
    "pu-erh-tea-leaf": Photo(
        "pu-erh-tea-leaf.jpg",
        "Jason Fasi.",
        "CC BY 2.5",
        "https://creativecommons.org/licenses/by/2.5",
        "https://commons.wikimedia.org/wiki/File:Haiwan_bingcha.jpg",
    ),
    "matcha": Photo(
        "matcha.jpg",
        "dungthuyvunguyen",
        "CC0",
        "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
        "https://commons.wikimedia.org/wiki/File:Matcha_layout_with_leaf,_tea,_and_powder.jpg",
    ),
    "yerba-mate": Photo(
        "yerba-mate.jpg",
        "ChimaAddicted",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Chimarrao_vs_yerba_mate_-_dry_material.jpg",
    ),
    "rooibos": Photo(
        "rooibos.jpg",
        "KENPEI",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Rooibos_tea.jpg",
    ),
    "honeybush": Photo(
        "honeybush.jpg",
        "Graeme Pienaar",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Cyclopia_subternata00.jpg",
    ),
    "peppermint": Photo(
        "peppermint.jpg",
        "Downtowngal",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Chocolate_mint_plant.jpg",
    ),
    "spearmint": Photo(
        "spearmint.jpg",
        "Andreas Kaiser",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Bild_Marokkanische_Minze.jpg",
    ),
    "lemongrass": Photo(
        "lemongrass.jpg",
        "Mespevic",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Citronnelle_appel%C3%A9e_caama_en_fon.jpg",
    ),
    "lemon-balm": Photo(
        "lemon-balm.jpg",
        "Plenuska",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Die_Zitronenmelisse,_Melissa_officinalis_10.jpg",
    ),
    "chamomile": Photo(
        "chamomile.jpg",
        "Joanna Boisse",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Atlas_roslin_pl_Rumianek_pospolity_2097_7384.jpg",
    ),
    "nettle": Photo(
        "nettle.jpg",
        "Stalker",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Atlas_roslin_pl_Pokrzywa_zwyczajna_9002_8134.jpg",
    ),
    "lemon-verbena": Photo(
        "lemon-verbena.jpg",
        "Krzysztof Golik",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Aloysia_citrodora_in_Jardin_des_5_sens.jpg",
    ),
    "jasmine-flower": Photo(
        "jasmine-flower.jpg",
        "Zhuwq",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Arabian-Jasmine.JPG",
    ),
    "lavender": Photo(
        "lavender.jpg",
        "Joanna Boisse",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Atlas_roslin_pl_Lawenda_w%C4%85skolistna_568_8775.jpg",
    ),
    "hibiscus": Photo(
        "hibiscus.jpg",
        "वि.नरसीकर",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Aambadi.JPG",
    ),
    "rose-petal": Photo(
        "rose-petal.jpg",
        "Fumikas Sagisavas",
        "CC0",
        "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
        "https://commons.wikimedia.org/wiki/File:Dried_rose_petals.jpg",
    ),
    "elderflower": Photo(
        "elderflower.jpg",
        "Sten at Danish Wikipedia",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Sambucus-nigra.JPG",
    ),
    "osmanthus": Photo(
        "osmanthus.jpg",
        "Laitr Keiows",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Osmanthus_fragrans_(orange_flowers).jpg",
    ),
    "blue-cornflower": Photo(
        "blue-cornflower.jpg",
        "Sanja565658",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Centaurea_cyanus_04.JPG",
    ),
    "cinnamon": Photo(
        "cinnamon.jpg",
        "Kjokkenutstyr",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:002-Cinnamon.jpg",
    ),
    "cardamom": Photo(
        "cardamom.jpg",
        "Augustus Binu",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:100_Cardamom_pods.jpg",
    ),
    "ginger": Photo(
        "ginger.jpg",
        "Burdigo",
        "CC0",
        "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
        "https://commons.wikimedia.org/wiki/File:Gingembre_(march%C3%A9_de_Bergerac).jpg",
    ),
    "clove": Photo(
        "clove.jpg",
        "Jacek Halicki",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:2023_Go%C5%BAdziki.jpg",
    ),
    "star-anise": Photo(
        "star-anise.jpg",
        "Walter Grassroot",
        "CC0",
        "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
        "https://commons.wikimedia.org/wiki/File:%E5%B9%BF%E8%A5%BF%E5%8D%97%E5%AE%81%E5%85%AB%E8%A7%92.jpg",
    ),
    "black-pepper": Photo(
        "black-pepper.jpg",
        "Ryan Snyder",
        "CC BY 2.0",
        "https://creativecommons.org/licenses/by/2.0",
        "https://commons.wikimedia.org/wiki/File:Black_Peppercorns_(4422070187).jpg",
    ),
    "vanilla": Photo(
        "vanilla.jpg",
        "B.navez",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Vanilla_6beans.JPG",
    ),
    "fennel-seed": Photo(
        "fennel-seed.jpg",
        "Holly Cheng",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Fennel_seed.jpg",
    ),
    "liquorice-root": Photo(
        "liquorice-root.jpg",
        "Salil Kumar Mukherjee",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Sections_of_liquorice_root.jpg",
    ),
    "orange-peel": Photo(
        "orange-peel.jpg",
        "Dvortygirl",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Zesting_an_orange.jpg",
    ),
    "lemon-peel": Photo(
        "lemon-peel.jpg",
        "Rebecca Siegel",
        "CC BY 2.0",
        "https://creativecommons.org/licenses/by/2.0",
        "https://commons.wikimedia.org/wiki/File:Lemon_zest.jpg",
    ),
    "apple-piece": Photo(
        "apple-piece.jpg",
        "Fumikas Sagisavas",
        "CC0",
        "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
        "https://commons.wikimedia.org/wiki/File:Dried_apple_slices.jpg",
    ),
    "rosehip": Photo(
        "rosehip.jpg",
        "Charlie Marshall",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Really_Ripe,_Red_Rose-hips_(54897033613).jpg",
    ),
    "bergamot-oil": Photo(
        "bergamot-oil.jpg",
        "Jacopo Werther",
        "CC BY-SA 3.0",
        "https://creativecommons.org/licenses/by-sa/3.0",
        "https://commons.wikimedia.org/wiki/File:Bergamot_orange_-_Cross_section.jpg",
    ),
    "mango-piece": Photo(
        "mango-piece.jpg",
        "Adrian Michael",
        "CC BY-SA 3.0",
        "http://creativecommons.org/licenses/by-sa/3.0/",
        "https://commons.wikimedia.org/wiki/File:Dried_mangoes.jpg",
    ),
    "toasted-rice": Photo(
        "toasted-rice.jpg",
        "ハヌ",
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0",
        "https://commons.wikimedia.org/wiki/File:Genmaichanomoto.jpg",
    ),
}
