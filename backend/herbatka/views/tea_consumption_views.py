from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Count
from ..models import TeaConsumption, Tea
from ..serializers import TeaConsumptionSerializer


class TeaConsumptionList(generics.ListCreateAPIView):
    serializer_class = TeaConsumptionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        tea_id = self.kwargs.get('tea_id')
        if tea_id:
            return TeaConsumption.objects.filter(
                tea_id=tea_id,
                user=self.request.user
            ).select_related('tea')
        return TeaConsumption.objects.filter(
            user=self.request.user
        ).select_related('tea')

    def perform_create(self, serializer):
        tea_id = self.kwargs.get('tea_id')
        if tea_id:
            tea = get_object_or_404(Tea, id=tea_id)
            serializer.save(user=self.request.user, tea=tea)
        else:
            serializer.save(user=self.request.user)


class TeaConsumptionDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TeaConsumptionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return TeaConsumption.objects.filter(user=self.request.user)

    def get_object(self):
        tea_id = self.kwargs.get('tea_id')
        consumption_id = self.kwargs.get('pk')
        return get_object_or_404(
            TeaConsumption,
            id=consumption_id,
            tea_id=tea_id,
            user=self.request.user
        )


class TeaConsumptionStats(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Get user's consumption statistics
        total_consumptions = TeaConsumption.objects.filter(user=request.user).count()
        
        # Get most consumed teas
        most_consumed = TeaConsumption.objects.filter(
            user=request.user
        ).values('tea__name').annotate(
            count=Count('id')
        ).order_by('-count')[:5]

        # Get recent consumption history
        recent_consumptions = TeaConsumption.objects.filter(
            user=request.user
        ).select_related('tea').order_by('-consumed_at')[:5]

        return Response({
            'total_consumptions': total_consumptions,
            'most_consumed_teas': most_consumed,
            'recent_consumptions': TeaConsumptionSerializer(
                recent_consumptions,
                many=True
            ).data
        }) 