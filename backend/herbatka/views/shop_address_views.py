from rest_framework import generics, permissions, status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from ..models import ShopAddress, Shop
from ..serializers import ShopAddressSerializer


class ShopAddressList(generics.ListCreateAPIView):
    serializer_class = ShopAddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        shop_id = self.kwargs.get('shop_id')
        return ShopAddress.objects.filter(shop_id=shop_id)

    def perform_create(self, serializer):
        shop_id = self.kwargs.get('shop_id')
        shop = get_object_or_404(Shop, id=shop_id)
        
        # If this is the first address or is_primary is True, update other addresses
        if serializer.validated_data.get('is_primary', False):
            ShopAddress.objects.filter(shop=shop).update(is_primary=False)
        
        serializer.save(shop=shop)


class ShopAddressDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ShopAddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        shop_id = self.kwargs.get('shop_id')
        return ShopAddress.objects.filter(shop_id=shop_id)

    def get_object(self):
        shop_id = self.kwargs.get('shop_id')
        address_id = self.kwargs.get('pk')
        return get_object_or_404(
            ShopAddress,
            id=address_id,
            shop_id=shop_id
        )

    def perform_update(self, serializer):
        # If setting this address as primary, update other addresses
        if serializer.validated_data.get('is_primary', False):
            ShopAddress.objects.filter(shop=self.get_object().shop).update(is_primary=False)
        serializer.save() 