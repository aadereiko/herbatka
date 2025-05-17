from django.db import models


class TeaIngredient(models.Model):
    name = models.CharField(max_length=100, unique=True)
    img_url = models.URLField(null=True, blank=True)

    class Meta:
        ordering = ['name']  # This will sort by name alphabetically by default

    def __str__(self):
        return self.name
