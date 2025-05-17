from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Count, Avg
from django.utils import timezone
from datetime import timedelta
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
        # Get user's tea consumptions
        consumptions = TeaConsumption.objects.filter(user=request.user)
        
        # Calculate total consumptions
        total_consumptions = consumptions.count()
        
        # Get most consumed tea
        most_consumed_tea = (
            consumptions
            .values('tea__id', 'tea__name')
            .annotate(count=Count('id'))
            .order_by('-count')
            .first()
        )
        
        # Calculate average consumptions per day
        first_consumption = consumptions.order_by('consumed_at').first()
        if first_consumption:
            days_since_first = (timezone.now().date() - first_consumption.consumed_at.date()).days + 1
            average_per_day = total_consumptions / days_since_first if days_since_first > 0 else 0
        else:
            average_per_day = 0
        
        # Get recent consumptions
        recent_consumptions = consumptions.order_by('-consumed_at')[:10]
        
        return Response({
            'total_consumptions': total_consumptions,
            'most_consumed_tea': {
                'id': most_consumed_tea['tea__id'],
                'name': most_consumed_tea['tea__name'],
                'count': most_consumed_tea['count']
            } if most_consumed_tea else None,
            'average_per_day': round(average_per_day, 1),
            'recent_consumptions': TeaConsumptionSerializer(recent_consumptions, many=True).data
        }) 