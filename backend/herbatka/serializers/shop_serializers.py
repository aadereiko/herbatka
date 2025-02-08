from rest_framework import serializers
from ..models import Shop
from .tea_serializers import TeaSerializer


class ShopSerializer(serializers.ModelSerializer):
    teas = serializers.SerializerMethodField()  # Add this line to include related teas

    class Meta:
        model = Shop
        fields = "__all__"

    def get_teas(self, obj):
        request = self.context.get('request')

        if request and request.resolver_match.view_name == 'shop-detail':
            teas = obj.teas.all()
            return TeaSerializer(teas, many=True).data
        
        return None
