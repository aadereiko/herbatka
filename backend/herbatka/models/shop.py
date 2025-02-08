from django.db import models


class Shop(models.Model):
    name = models.CharField(max_length=255)
    street = models.CharField(max_length=255)
    city = models.CharField(max_length=255)
    state = models.CharField(max_length=255, blank=True, null=True)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=255)
    email = models.EmailField(blank=True, null=True)
    number = models.CharField(blank=True, null=True)
    url = models.URLField(blank=True, null=True)
    img_url = models.URLField(blank=True)

    def _str_(self):
        return self.name
