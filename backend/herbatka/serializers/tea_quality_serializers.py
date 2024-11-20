from rest_framework import serializers
from ..models import TeaQuality


class TeaQualitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TeaQuality
        fields = "__all__"
