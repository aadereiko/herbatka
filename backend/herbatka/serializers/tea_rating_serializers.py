from rest_framework import serializers
from ..models import TeaRating
from .tea_serializers import TeaSerializer


class TeaRatingSerializer(serializers.ModelSerializer):
    tea_details = TeaSerializer(source='tea', read_only=True)

    class Meta:
        model = TeaRating
        fields = ['id', 'score', 'comment', 'created_at', 'last_updated_at', 'user', 'tea', 'tea_details']
        read_only_fields = ['created_at', 'last_updated_at']
        extra_kwargs = {
            'tea': {'write_only': True},
            'user': {'write_only': True}
        }
