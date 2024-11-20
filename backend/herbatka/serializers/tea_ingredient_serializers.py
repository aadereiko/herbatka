from rest_framework import serializers
from ..models import TeaIngredient


class TeaIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeaIngredient
        fields = "__all__"
