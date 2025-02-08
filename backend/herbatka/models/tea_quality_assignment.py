from django.db import models
from .tea_quality import TeaQuality
from .tea import Tea


class TeaQualityAssignment(models.Model):
    value = models.CharField(max_length=255)

    tea_quality = models.ForeignKey(
        TeaQuality, on_delete=models.CASCADE, related_name="quality_assignments"
    )
    tea = models.ForeignKey(
        Tea, on_delete=models.CASCADE, related_name="quality_assignments"
    )

    def __str__(self):
        return f"{self.tea_quality.name} for {self.tea.name}"
