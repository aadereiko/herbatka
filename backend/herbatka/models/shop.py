from django.db import models


class Shop(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    website_url = models.URLField(blank=True, null=True)
    img_url = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    @property
    def primary_address(self):
        return self.addresses.filter(is_primary=True).first() or self.addresses.first()
