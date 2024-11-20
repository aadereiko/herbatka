from ..models import TeaRating
from ..serializers import TeaRatingSerializer
from rest_framework import generics


class TeaRatingList(generics.ListCreateAPIView):
    queryset = TeaRating.objects.all()
    serializer_class = TeaRatingSerializer


class TeaRatingDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = TeaRating.objects.all()
    serializer_class = TeaRatingSerializer
