from rest_framework import serializers
from ..models import TeaRating


class TeaRatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeaRating
        fields = "__all__"
