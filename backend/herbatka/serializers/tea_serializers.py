from rest_framework import serializers
from ..models import Tea, TeaIngredient, Shop


class TeaIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeaIngredient
        fields = ["id", "name"]


class TeaShopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shop
        fields = ["id", "name"]


class TeaSerializer(serializers.ModelSerializer):
    tea_ingredients = TeaIngredientSerializer(many=True)
    shop = TeaShopSerializer()

    class Meta:
        model = Tea
        fields = "__all__"
