from django.db import models


class TeaIngredient(models.Model):
    name = models.CharField(max_length=100)
    img_url = models.URLField(null=True, blank=True)

    def __str__(self):
        return self.name
