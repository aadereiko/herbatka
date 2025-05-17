from ..models import Tea
from ..serializers import TeaSerializer
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q


class TeaList(generics.ListCreateAPIView):
    queryset = Tea.objects.all()
    serializer_class = TeaSerializer


class TeaDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Tea.objects.all()
    serializer_class = TeaSerializer


class TeaSearch(APIView):
    def get(self, request):
        query = request.query_params.get('q', '')
        if not query:
            return Response([])

        teas = Tea.objects.filter(
            Q(name__icontains=query) |
            Q(description__icontains=query) |
            Q(shop__name__icontains=query)
        ).select_related('shop')[:10]

        serializer = TeaSerializer(teas, many=True)
        return Response(serializer.data)
