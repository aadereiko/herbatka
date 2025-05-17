from rest_framework import serializers
from ..models import ShopAddress


class ShopAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopAddress
        fields = ['id', 'street', 'city', 'postal_code', 'country', 'is_primary', 'created_at', 'last_updated_at']
        read_only_fields = ['created_at', 'last_updated_at']
        extra_kwargs = {
            'shop': {'write_only': True}
        } 