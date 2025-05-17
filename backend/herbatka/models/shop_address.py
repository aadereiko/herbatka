from django.db import models
from .shop import Shop


class ShopAddress(models.Model):
    street = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=100)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_updated_at = models.DateTimeField(auto_now=True)

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='addresses')

    def __str__(self):
        return f"{self.street}, {self.city}, {self.country}"

    class Meta:
        verbose_name_plural = "Shop addresses"
        ordering = ['-is_primary', 'city', 'street'] 