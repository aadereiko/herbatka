"""Starter catalog. Real teas and real ingredients, so the app is never empty."""

# (name, category, is_caffeinated, description)
#
# The descriptions are *tasting notes*, not encyclopaedia entries. Somebody reading
# /ingredients is deciding whether they would like a blend that contains the thing, and
# "Matricaria chamomilla, family Asteraceae" does not help them do that — "apple, straw
# and honey" does. Two sentences at most, because these are read a card at a time in a
# grid of thirty-nine and a paragraph would turn the page into a wall again.
#
# No `image_url` here. Seeding one would mean inventing a URL for a file that does not
# exist, and a catalog of broken images is worse than a catalog of honest illustrations —
# see the per-category drawings in web/src/features/catalog/IngredientImage.tsx.
INGREDIENTS: list[tuple[str, str, bool, str]] = [
    # leaves
    (
        "Green tea leaf",
        "leaf",
        True,
        "Fresh-cut grass and steamed greens with a clean edge. Turns bitter and "
        "spinach-like if the water is anywhere near boiling.",
    ),
    (
        "Black tea leaf",
        "leaf",
        True,
        "Malty, brisk and tannic — the one that stands up to milk without sulking.",
    ),
    (
        "Oolong tea leaf",
        "leaf",
        True,
        "Somewhere between green and black: peachy and floral when light, roasted and "
        "nutty when dark. Re-steeps all afternoon.",
    ),
    (
        "White tea leaf",
        "leaf",
        True,
        "Barely processed and very quiet: hay, melon and honey. Easy to miss, easier to over-brew.",
    ),
    (
        "Pu-erh tea leaf",
        "leaf",
        True,
        "Fermented and frankly earthy — damp forest floor, in the way people mean as a "
        "compliment. Mellows with age.",
    ),
    (
        "Matcha",
        "leaf",
        True,
        "Shade-grown leaf ground to powder and whisked rather than steeped. Thick, "
        "savoury and intensely green, with a sweet finish.",
    ),
    (
        "Yerba mate",
        "leaf",
        True,
        "Vegetal and bracingly bitter, closer to a hard green tea than to coffee. The "
        "most caffeine in the cupboard.",
    ),
    (
        "Rooibos",
        "leaf",
        False,
        "Red bush from South Africa: sweet, woody, a little vanilla. Caffeine-free, and "
        "it will not turn bitter however long you forget it.",
    ),
    (
        "Honeybush",
        "leaf",
        False,
        "Rooibos's gentler cousin — rounder, honeyed, faintly apricot. Good last thing at night.",
    ),
    # herbs
    (
        "Peppermint",
        "herb",
        False,
        "Sharp menthol that cools the whole mouth. Assertive enough to take over any "
        "blend it is put in.",
    ),
    (
        "Spearmint",
        "herb",
        False,
        "Sweeter and softer than peppermint — more garden than toothpaste. What makes "
        "Moroccan mint drinkable by the litre.",
    ),
    (
        "Lemongrass",
        "herb",
        False,
        "A bright citrus lift with none of the sourness of an actual lemon. Wakes up a "
        "dull herbal blend on its own.",
    ),
    (
        "Lemon balm",
        "herb",
        False,
        "Gentle lemon and cut grass with a calming, faintly minty finish. Quieter than "
        "lemongrass and easier to live with.",
    ),
    (
        "Chamomile",
        "herb",
        False,
        "Apple skin, straw and honey, with a soft bitter edge if you leave it too long. "
        "The classic bedtime cup, and it earns it.",
    ),
    (
        "Nettle",
        "herb",
        False,
        "Deeply green and mineral, like spinach water in the best possible way. "
        "Savoury rather than sweet, and it does not sting once dried.",
    ),
    (
        "Lemon verbena",
        "herb",
        False,
        "The most lemon-scented thing here that is not a lemon: perfumed, sherbet-bright "
        "and almost entirely without acidity.",
    ),
    # flowers
    (
        "Jasmine flower",
        "flower",
        False,
        "Heady white-flower perfume, layered over the leaf overnight so the tea takes the "
        "scent. A little goes a very long way.",
    ),
    (
        "Lavender",
        "flower",
        False,
        "Floral and resinous, and soapy the moment there is too much of it. In small "
        "amounts it makes chamomile taste expensive.",
    ),
    (
        "Hibiscus",
        "flower",
        False,
        "Fiercely tart and ruby-red — cranberry without the sugar. Dyes everything it "
        "touches, including the blend it is in.",
    ),
    (
        "Rose petal",
        "flower",
        False,
        "Turkish delight in a cup: sweet, perfumed, a little powdery. Divides a room.",
    ),
    (
        "Elderflower",
        "flower",
        False,
        "Muscat grapes and a hedge in June. Delicate and honeyed, and lost entirely if "
        "the rest of the blend is loud.",
    ),
    (
        "Osmanthus",
        "flower",
        False,
        "Tiny golden flowers that taste of apricot and ripe peach. Traditionally married "
        "to oolong, and it is hard to argue with.",
    ),
    (
        "Blue cornflower",
        "flower",
        False,
        "There for the look, mostly: bright blue flecks through the dry leaf and barely a "
        "whisper of flavour in the cup.",
    ),
    # spices
    (
        "Cinnamon",
        "spice",
        False,
        "Warm, sweet and drying, with a woody heat at the back of the throat. Carries a "
        "chai and bullies anything delicate.",
    ),
    (
        "Cardamom",
        "spice",
        False,
        "Camphorous and citrusy, cooling and warming at the same time. The flavour that "
        "makes chai taste like chai.",
    ),
    (
        "Ginger",
        "spice",
        False,
        "A clean burn that builds slowly at the back of the throat. Sweet and rounded "
        "when dried, much fiercer when fresh.",
    ),
    (
        "Clove",
        "spice",
        False,
        "Numbing, medicinal and enormously strong. One too many and the cup tastes like "
        "a dentist's waiting room.",
    ),
    (
        "Star anise",
        "spice",
        False,
        "Sweet liquorice and warm spice, rounder and softer than aniseed. Two pods "
        "flavour an entire pot.",
    ),
    (
        "Black pepper",
        "spice",
        False,
        "A dry, slow heat rather than a flavour of its own, waking up whatever sits next "
        "to it. Traditional in chai and easy to overdo.",
    ),
    (
        "Vanilla",
        "spice",
        False,
        "Creamy and rounding — it makes a rough tea taste smoother without adding a "
        "grain of sugar.",
    ),
    (
        "Fennel seed",
        "spice",
        False,
        "Sweet aniseed with a cooling finish. Drunk after dinner across half of Europe, "
        "and for good reason.",
    ),
    (
        "Liquorice root",
        "spice",
        False,
        "Startlingly sweet with no sugar in it at all, and a dark, faintly salty finish. "
        "You will either love it or pick it out.",
    ),
    # fruit
    (
        "Orange peel",
        "fruit",
        False,
        "Sweet-bitter citrus oil, closer to marmalade than to juice. Warms up a black "
        "blend and steadies a tart one.",
    ),
    (
        "Lemon peel",
        "fruit",
        False,
        "Sharp zest and a little bitter pith: the smell of a lemon without the sourness of one.",
    ),
    (
        "Apple piece",
        "fruit",
        False,
        "Mild sweetness and body, mostly there to round the sharp edges off a fruit "
        "blend. Chewy in the tin, gentle in the cup.",
    ),
    (
        "Rosehip",
        "fruit",
        False,
        "Tangy and slightly floral, with a jammy thickness to it. Almost always found "
        "holding hands with hibiscus.",
    ),
    (
        "Bergamot oil",
        "fruit",
        False,
        "The perfume that makes Earl Grey Earl Grey: sour orange, lemon and cologne. "
        "Wonderful, right up until there is too much of it.",
    ),
    (
        "Mango piece",
        "fruit",
        False,
        "Sweet tropical fruit that arrives as scent more than as taste. At its best iced, "
        "over a green base.",
    ),
    # other
    (
        "Toasted rice",
        "other",
        False,
        "Popped and toasted grain — nutty, savoury, not far off popcorn. Rounds the "
        "sharpness off a green tea.",
    ),
]

# (name, country, website)
BRANDS: list[tuple[str, str | None, str | None]] = [
    ("Ahmad Tea", "United Kingdom", "https://www.ahmadtea.com"),
    ("Twinings", "United Kingdom", "https://www.twinings.co.uk"),
    ("Kusmi Tea", "France", "https://www.kusmitea.com"),
    ("Dammann Frères", "France", "https://www.dammann.fr"),
    ("Dilmah", "Sri Lanka", "https://www.dilmahtea.com"),
    ("Palais des Thés", "France", "https://www.palaisdesthes.com"),
    ("Yunnan Sourcing", "China", "https://yunnansourcing.com"),
]

# Brewing defaults by tea type: (temp_c, seconds, grams per 100 ml)
BREWING: dict[str, tuple[int, int, float]] = {
    "green": (80, 120, 1.0),
    "black": (95, 180, 1.0),
    "oolong": (90, 150, 1.5),
    "white": (75, 180, 1.0),
    "puerh": (95, 120, 1.5),
    "herbal": (100, 300, 1.5),
    "rooibos": (100, 300, 1.5),
    "blend": (95, 180, 1.0),
}

# (name, tea_type, caffeine, brand, origin, description, [(ingredient, pct, primary)])
TEAS: list[
    tuple[str, str, str, str | None, str | None, str, list[tuple[str, float | None, bool]]]
] = [
    (
        "Earl Grey",
        "black",
        "high",
        "Twinings",
        "India",
        "Black tea scented with bergamot — the archetypal afternoon cup.",
        [("Black tea leaf", 95.0, True), ("Bergamot oil", 5.0, True)],
    ),
    (
        "English Breakfast",
        "black",
        "high",
        "Twinings",
        "India",
        "A brisk malty blend built to stand up to milk.",
        [("Black tea leaf", 100.0, True)],
    ),
    (
        "Lady Grey",
        "black",
        "high",
        "Twinings",
        "India",
        "Earl Grey softened with citrus peel and cornflower.",
        [
            ("Black tea leaf", 90.0, True),
            ("Bergamot oil", 3.0, False),
            ("Orange peel", 4.0, False),
            ("Lemon peel", 2.0, False),
            ("Blue cornflower", 1.0, False),
        ],
    ),
    (
        "Masala Chai",
        "black",
        "high",
        "Ahmad Tea",
        "India",
        "Assam base with the full spice cabinet. Brew strong, add milk.",
        [
            ("Black tea leaf", 60.0, True),
            ("Cinnamon", 10.0, True),
            ("Cardamom", 10.0, True),
            ("Ginger", 10.0, False),
            ("Clove", 5.0, False),
            ("Black pepper", 5.0, False),
        ],
    ),
    (
        "Sencha",
        "green",
        "medium",
        "Palais des Thés",
        "Japan",
        "Steamed Japanese green tea: grassy, marine, a little sweet.",
        [("Green tea leaf", 100.0, True)],
    ),
    (
        "Gunpowder Green",
        "green",
        "medium",
        "Dilmah",
        "China",
        "Rolled pellets that unfurl into a smoky, robust green.",
        [("Green tea leaf", 100.0, True)],
    ),
    (
        "Jasmine Pearls",
        "green",
        "medium",
        "Yunnan Sourcing",
        "China",
        "Hand-rolled pearls scented over fresh jasmine blossom.",
        [("Green tea leaf", 92.0, True), ("Jasmine flower", 8.0, True)],
    ),
    (
        "Ceremonial Matcha",
        "green",
        "high",
        "Palais des Thés",
        "Japan",
        "Stone-ground shade-grown leaf. Whisked, not steeped.",
        [("Matcha", 100.0, True)],
    ),
    (
        "Genmaicha",
        "green",
        "medium",
        "Dilmah",
        "Japan",
        "Green tea with toasted rice — nutty, savoury, forgiving.",
        [("Green tea leaf", 70.0, True), ("Toasted rice", 30.0, True)],
    ),
    (
        "Moroccan Mint",
        "green",
        "medium",
        "Ahmad Tea",
        "Morocco",
        "Gunpowder green and spearmint. Traditionally very sweet.",
        [("Green tea leaf", 70.0, True), ("Spearmint", 30.0, True)],
    ),
    (
        "Tie Guan Yin",
        "oolong",
        "medium",
        "Yunnan Sourcing",
        "China",
        "Iron Goddess of Mercy: orchid-floral, endlessly re-steepable.",
        [("Oolong tea leaf", 100.0, True)],
    ),
    (
        "Milk Oolong",
        "oolong",
        "medium",
        "Kusmi Tea",
        "Taiwan",
        "Creamy and buttery in the cup, with no dairy anywhere near it.",
        [("Oolong tea leaf", 100.0, True)],
    ),
    (
        "Shou Pu-erh",
        "puerh",
        "medium",
        "Yunnan Sourcing",
        "China",
        "Ripened and fermented: earthy, dark, mellow with age.",
        [("Pu-erh tea leaf", 100.0, True)],
    ),
    (
        "Silver Needle",
        "white",
        "low",
        "Palais des Thés",
        "China",
        "Nothing but unopened buds. Delicate, honeyed, easy to over-brew.",
        [("White tea leaf", 100.0, True)],
    ),
    (
        "Elderflower White",
        "white",
        "low",
        "Kusmi Tea",
        "China",
        "White tea lifted with elderflower and a little rose.",
        [("White tea leaf", 88.0, True), ("Elderflower", 8.0, True), ("Rose petal", 4.0, False)],
    ),
    (
        "Chamomile Dream",
        "herbal",
        "none",
        "Ahmad Tea",
        None,
        "Chamomile and lavender. The one you reach for at eleven at night.",
        [("Chamomile", 75.0, True), ("Lavender", 15.0, True), ("Lemon balm", 10.0, False)],
    ),
    (
        "Peppermint Leaf",
        "herbal",
        "none",
        "Ahmad Tea",
        None,
        "Straight peppermint. Sharp, cooling, good after dinner.",
        [("Peppermint", 100.0, True)],
    ),
    (
        "Hibiscus Cooler",
        "herbal",
        "none",
        "Dammann Frères",
        None,
        "Tart and ruby-red. Excellent iced.",
        [
            ("Hibiscus", 55.0, True),
            ("Rosehip", 25.0, True),
            ("Orange peel", 15.0, False),
            ("Apple piece", 5.0, False),
        ],
    ),
    (
        "Lemongrass Ginger",
        "herbal",
        "none",
        "Dilmah",
        "Sri Lanka",
        "Bright lemongrass with a warming ginger finish.",
        [("Lemongrass", 60.0, True), ("Ginger", 30.0, True), ("Lemon peel", 10.0, False)],
    ),
    (
        "Fennel Anise Calm",
        "herbal",
        "none",
        "Dammann Frères",
        None,
        "Sweet, liquorice-leaning, traditionally drunk for digestion.",
        [("Fennel seed", 45.0, True), ("Star anise", 30.0, True), ("Liquorice root", 25.0, False)],
    ),
    (
        "Rooibos Vanilla",
        "rooibos",
        "none",
        "Kusmi Tea",
        "South Africa",
        "Red bush and vanilla — naturally caffeine-free and never bitter.",
        [("Rooibos", 90.0, True), ("Vanilla", 10.0, True)],
    ),
    (
        "Honeybush Orange",
        "rooibos",
        "none",
        "Kusmi Tea",
        "South Africa",
        "Honeybush with citrus peel. Softer and sweeter than rooibos.",
        [("Honeybush", 85.0, True), ("Orange peel", 15.0, True)],
    ),
    (
        "Yerba Mate Verde",
        "herbal",
        "high",
        "Palais des Thés",
        "Argentina",
        "Unsmoked mate: vegetal, bracing, the strongest thing on this list.",
        [("Yerba mate", 100.0, True)],
    ),
]

# (name, website, address, city, country, description)
# Coordinates are real points on the named streets, so the map and "shops near me"
# have something honest to work with straight after `make seed`. The two online-only
# shops have none, which is the case the UI has to handle anyway.
SHOPS: list[
    tuple[str, str | None, str | None, str | None, str | None, str, float | None, float | None]
] = [
    (
        "Czajnik",
        "https://czajnik.example",
        "ul. Floriańska 12",
        "Kraków",
        "Poland",
        "A narrow shop off the main square with more oolong than shelf space.",
        50.0617,
        19.9392,
    ),
    (
        "Herbaciarnia Pod Wierzbą",
        None,
        "ul. Piwna 4",
        "Warsaw",
        "Poland",
        "Tea room first, shop second. They will let you taste before you buy.",
        52.2496,
        21.0123,
    ),
    (
        "Leaf & Lore",
        "https://leafandlore.example",
        None,
        None,
        "United Kingdom",
        "Online only. Small batches, honest harvest dates, sensible postage.",
        None,
        None,
    ),
    (
        "Yunnan Direct",
        "https://yunnandirect.example",
        None,
        None,
        "China",
        "Ships pu-erh and Yunnan blacks direct from the producer.",
        None,
        None,
    ),
    (
        "Tørret Blad",
        "https://torretblad.example",
        "Jægersborggade 21",
        "Copenhagen",
        "Denmark",
        "Nordic minimalism applied to tea. Excellent whites.",
        55.6928,
        12.5456,
    ),
    (
        "Basar Herbat",
        None,
        "Rynek 7",
        "Wrocław",
        "Poland",
        "Market stall. Cash only, but the masala chai is worth the trip.",
        51.1098,
        17.0327,
    ),
]

# (shop, tea, pack_grams, price_minor, currency, product_path or None)
LISTINGS: list[tuple[str, str, float | None, int | None, str | None, str | None]] = [
    ("Czajnik", "Sencha", 50, 3200, "PLN", "/sencha-50g"),
    ("Czajnik", "Sencha", 100, 5800, "PLN", "/sencha-100g"),
    ("Czajnik", "Gunpowder Green", 100, 2900, "PLN", "/gunpowder"),
    ("Czajnik", "Masala Chai", 100, 3400, "PLN", "/masala-chai"),
    ("Czajnik", "Tie Guan Yin", 50, 6500, "PLN", "/tie-guan-yin"),
    ("Herbaciarnia Pod Wierzbą", "Masala Chai", 100, 3100, "PLN", None),
    ("Herbaciarnia Pod Wierzbą", "Chamomile Dream", 80, 2200, "PLN", None),
    ("Herbaciarnia Pod Wierzbą", "Moroccan Mint", 100, 2600, "PLN", None),
    ("Leaf & Lore", "Earl Grey", 125, 1150, "GBP", "/earl-grey"),
    ("Leaf & Lore", "English Breakfast", 125, 950, "GBP", "/english-breakfast"),
    ("Leaf & Lore", "Silver Needle", 25, 2400, "GBP", "/silver-needle"),
    ("Leaf & Lore", "Jasmine Pearls", 50, 1600, "GBP", "/jasmine-pearls"),
    ("Yunnan Direct", "Shou Pu-erh", 100, 2800, "CNY", "/shou-puerh"),
    ("Yunnan Direct", "Tie Guan Yin", 100, 4200, "CNY", "/tie-guan-yin"),
    ("Yunnan Direct", "Jasmine Pearls", 100, 3600, "CNY", "/jasmine-pearls"),
    ("Tørret Blad", "Silver Needle", 25, 21000, "DKK", "/silver-needle"),
    ("Tørret Blad", "Elderflower White", 50, 16500, "DKK", "/elderflower-white"),
    ("Tørret Blad", "Milk Oolong", 50, 19000, "DKK", "/milk-oolong"),
    ("Basar Herbat", "Masala Chai", None, 1800, "PLN", None),
    ("Basar Herbat", "Rooibos Vanilla", None, 1500, "PLN", None),
    ("Basar Herbat", "Hibiscus Cooler", None, 1400, "PLN", None),
]
