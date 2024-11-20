from rest_framework import serializers
from ..models import Tea


class TeaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tea
        fields = "__all__"
