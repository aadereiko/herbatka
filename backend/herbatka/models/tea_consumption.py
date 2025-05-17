from django.db import models
from .tea import Tea
from .user import User


class TeaConsumption(models.Model):
    tea = models.ForeignKey(Tea, on_delete=models.CASCADE, related_name="consumptions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tea_consumptions")
    consumed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-consumed_at']
        indexes = [
            models.Index(fields=['user', 'consumed_at']),
            models.Index(fields=['tea', 'consumed_at']),
        ]

    def __str__(self):
        return f"{self.user.username} consumed {self.tea.name} at {self.consumed_at}" 