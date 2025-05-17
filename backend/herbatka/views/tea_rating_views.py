from ..models import TeaRating, Tea
from ..serializers import TeaRatingSerializer
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db import models


class TeaRatingList(generics.ListCreateAPIView):
    serializer_class = TeaRatingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        tea_id = self.kwargs.get('tea_id')
        if tea_id:
            return TeaRating.objects.filter(tea_id=tea_id).select_related('user')
        return TeaRating.objects.filter(user=self.request.user).select_related('tea')

    def perform_create(self, serializer):
        tea_id = self.kwargs.get('tea_id')
        tea = get_object_or_404(Tea, id=tea_id)
        
        # Check if user already rated this tea
        existing_rating = TeaRating.objects.filter(user=self.request.user, tea=tea).first()
        if existing_rating:
            serializer.instance = existing_rating
            serializer.save(user=self.request.user, tea=tea)
        else:
            serializer.save(user=self.request.user, tea=tea)


class TeaRatingDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TeaRatingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return TeaRating.objects.filter(user=self.request.user)

    def get_object(self):
        tea_id = self.kwargs.get('tea_id')
        rating_id = self.kwargs.get('pk')
        return get_object_or_404(
            TeaRating,
            id=rating_id,
            tea_id=tea_id,
            user=self.request.user
        )


class TeaRatingStats(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, tea_id):
        tea = get_object_or_404(Tea, id=tea_id)
        ratings = TeaRating.objects.filter(tea=tea)
        
        if not ratings.exists():
            return Response({
                'average_score': 0,
                'total_ratings': 0,
                'score_distribution': {i: 0 for i in range(1, 6)}
            })

        total_ratings = ratings.count()
        average_score = ratings.aggregate(models.Avg('score'))['score__avg']
        score_distribution = {
            i: ratings.filter(score=i).count()
            for i in range(1, 6)
        }

        return Response({
            'average_score': round(average_score, 1),
            'total_ratings': total_ratings,
            'score_distribution': score_distribution
        })
