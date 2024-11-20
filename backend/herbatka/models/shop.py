from django.db import models


class Shop(models.Model):
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    img_url = models.URLField(blank=True)

    def _str_(self):
        return self.name
