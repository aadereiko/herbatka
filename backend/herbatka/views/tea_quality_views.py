from ..models import TeaQuality
from ..serializers import TeaQualitySerializer
from rest_framework import generics


class TeaQualityList(generics.ListCreateAPIView):
    queryset = TeaQuality.objects.all()
    serializer_class = TeaQualitySerializer


class TeaQualityDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = TeaQuality.objects.all()
    serializer_class = TeaQualitySerializer
