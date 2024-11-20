from ..models import TeaIngredient
from ..serializers import TeaIngredientSerializer
from rest_framework import generics


class TeaIngredientList(generics.ListCreateAPIView):
    queryset = TeaIngredient.objects.all()
    serializer_class = TeaIngredientSerializer


class TeaIngredientDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = TeaIngredient.objects.all()
    serializer_class = TeaIngredientSerializer
