from rest_framework import serializers
from ..models import Shop
from .tea_serializers import TeaSerializer
from .shop_address_serializers import ShopAddressSerializer


class ShopSerializer(serializers.ModelSerializer):
    teas = serializers.SerializerMethodField()
    addresses = ShopAddressSerializer(many=True, read_only=True)
    primary_address = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = ['id', 'name', 'description', 'email', 'phone', 'website_url', 'img_url', 
                 'created_at', 'last_updated_at', 'teas', 'addresses', 'primary_address']
        read_only_fields = ['created_at', 'last_updated_at']

    def get_teas(self, obj):
        request = self.context.get('request')
        if request and request.resolver_match.view_name == 'shop-detail':
            teas = obj.teas.all()
            return TeaSerializer(teas, many=True).data
        return None

    def get_primary_address(self, obj):
        primary = obj.primary_address
        if primary:
            return ShopAddressSerializer(primary).data
        return None
