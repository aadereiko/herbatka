from django.db import models


class TeaQuality(models.Model):
    name = models.CharField(max_length=255)
    possible_values = models.JSONField()

    def __str__(self):
        return self.name
