# Generated by Django 5.1.3 on 2025-05-17 00:48

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("herbatka", "0012_add_common_tea_ingredients"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="teaingredient",
            options={"ordering": ["name"]},
        ),
    ]
