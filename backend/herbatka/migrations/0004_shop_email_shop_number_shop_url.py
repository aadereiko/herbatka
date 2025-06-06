# Generated by Django 5.1.3 on 2025-02-08 00:21

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("herbatka", "0003_remove_shop_location_shop_city_shop_country_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="shop",
            name="email",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name="shop",
            name="number",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name="shop",
            name="url",
            field=models.URLField(blank=True, null=True),
        ),
    ]
