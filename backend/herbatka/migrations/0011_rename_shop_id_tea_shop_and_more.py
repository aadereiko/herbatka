# Generated by Django 5.1.3 on 2025-02-08 20:10

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("herbatka", "0010_rename_shop_tea_shop_id_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="tea",
            old_name="shop_id",
            new_name="shop",
        ),
        migrations.RenameField(
            model_name="teaqualityassignment",
            old_name="tea_id",
            new_name="tea",
        ),
        migrations.RenameField(
            model_name="teaqualityassignment",
            old_name="tea_quality_id",
            new_name="tea_quality",
        ),
    ]
