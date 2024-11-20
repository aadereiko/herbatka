from ..models import TeaQualityAssignment
from ..serializers import TeaQualityAssignmentSerializer
from rest_framework import generics


class TeaQualityAssignmentList(generics.ListCreateAPIView):
    queryset = TeaQualityAssignment.objects.all()
    serializer_class = TeaQualityAssignmentSerializer


class TeaQualityAssignmentDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = TeaQualityAssignment.objects.all()
    serializer_class = TeaQualityAssignmentSerializer
