from django.db import migrations

def add_common_ingredients(apps, schema_editor):
    TeaIngredient = apps.get_model('herbatka', 'TeaIngredient')
    
    # List of common tea ingredients
    common_ingredients = [        
        # Herbs
        "Mint",
        "Chamomile",
        "Lavender",
        "Lemongrass",
        "Ginger",
        "Cinnamon",
        "Cardamom",
        "Cloves",
        "Turmeric",
        "Hibiscus",
        "Rose Petals",
        "Jasmine",
        "Elderflower",
        "Lemon Balm",
        "Peppermint",
        "Spearmint",
        "Thyme",
        "Rosemary",
        "Sage",
        "Basil",
        
        # Fruits
        "Orange Peel",
        "Lemon Peel",
        "Bergamot",
        "Apple",
        "Strawberry",
        "Raspberry",
        "Blueberry",
        "Cherry",
        "Peach",
        "Mango",
        "Pineapple",
        "Coconut",
        
        # Spices
        "Vanilla",
        "Star Anise",
        "Fennel",
        "Pepper",
        "Nutmeg",
        "Allspice",
        
        # Flowers
        "Calendula",
        "Cornflower",
        "Marigold",
        "Orchid",
        
        # Other
        "Licorice Root",
        "Dandelion Root",
        "Nettle",
        "Echinacea",
        "Ginseng",
        "Goji Berries",
        "Schisandra",
        "Astragalus",
    ]
    
    # Add ingredients if they don't exist
    for ingredient_name in common_ingredients:
        TeaIngredient.objects.get_or_create(name=ingredient_name)

def remove_common_ingredients(apps, schema_editor):
    TeaIngredient = apps.get_model('herbatka', 'TeaIngredient')
    # We don't remove ingredients in reverse migration to avoid data loss
    pass

class Migration(migrations.Migration):
    dependencies = [
        ('herbatka', '0011_rename_shop_id_tea_shop_and_more'),
    ]

    operations = [
        migrations.RunPython(
            add_common_ingredients,
            remove_common_ingredients
        ),
    ] 