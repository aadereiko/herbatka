from ..models import Tea
from ..serializers import TeaSerializer
from rest_framework import generics


class TeaList(generics.ListCreateAPIView):
    queryset = Tea.objects.all()
    serializer_class = TeaSerializer


class TeaDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Tea.objects.all()
    serializer_class = TeaSerializer
