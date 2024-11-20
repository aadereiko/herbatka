# Generated by Django 5.1.3 on 2024-11-20 00:00

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('herbatka', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='shop',
            name='img_url',
            field=models.URLField(blank=True),
        ),
        migrations.AlterField(
            model_name='tea',
            name='description',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='user',
            name='avatar_url',
            field=models.URLField(blank=True),
        ),
    ]
