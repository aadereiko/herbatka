from django.db import models
from .shop import Shop
from .tea_ingredient import TeaIngredient


class Tea(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="teas")
    tea_ingredients = models.ManyToManyField(TeaIngredient, related_name="teas", blank=True)

    def _str_(self):
        return self.name
