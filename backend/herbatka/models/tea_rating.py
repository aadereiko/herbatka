from django.db import models
from .tea import Tea
from .user import User


class TeaRating(models.Model):
    score = models.IntegerField()
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_updated_at = models.DateTimeField(auto_now=True)

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ratings")
    tea = models.ForeignKey(Tea, on_delete=models.CASCADE, related_name="ratings")

    def __str__(self):
        return f"{self.score} - {self.tea.name} by {self.user.username}"
