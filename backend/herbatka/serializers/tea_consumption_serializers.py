from rest_framework import serializers
from ..models import TeaConsumption
from .tea_serializers import TeaSerializer


class TeaConsumptionSerializer(serializers.ModelSerializer):
    tea_details = TeaSerializer(source='tea', read_only=True)

    class Meta:
        model = TeaConsumption
        fields = ['id', 'tea', 'tea_details', 'consumed_at', 'notes']
        read_only_fields = ['consumed_at']
        extra_kwargs = {
            'tea': {'write_only': True}
        } 