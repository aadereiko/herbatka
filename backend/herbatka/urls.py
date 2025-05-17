from django.urls import path
from rest_framework.urlpatterns import format_suffix_patterns
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    TeaQualityList,
    TeaQualityDetail,
    TeaIngredientList,
    TeaIngredientDetail,
    TeaQualityAssignmentList,
    TeaQualityAssignmentDetail,
    TeaList,
    TeaDetail,
    TeaRatingList,
    TeaRatingDetail,
    TeaRatingStats,
    UserList,
    UserDetail,
    ShopList,
    ShopDetail,
    TeaSearch,
    TeaConsumptionList,
    TeaConsumptionDetail,
    TeaConsumptionStats
)
from .views.auth_views import RegisterView, UserProfileView

urlpatterns = [
    # Authentication endpoints
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/profile/', UserProfileView.as_view(), name='user-profile'),

    # Existing endpoints
    path("teas/", TeaList.as_view()),
    path("teas/<int:pk>/", TeaDetail.as_view()),
    path("tea-qualities/", TeaQualityList.as_view()),
    path("tea-qualities/<int:pk>/", TeaQualityDetail.as_view()),
    path("tea-ingredients/", TeaIngredientList.as_view()),
    path("tea-ingredients/<int:pk>/", TeaIngredientDetail.as_view()),
    path("tea-quality-assignments/", TeaQualityAssignmentList.as_view()),
    path("tea-quality-assignments/<int:pk>/", TeaQualityAssignmentDetail.as_view()),
    path("tea-ratings/", TeaRatingList.as_view()),
    path("tea-ratings/<int:pk>/", TeaRatingDetail.as_view()),
    path("teas/<int:tea_id>/ratings/", TeaRatingList.as_view(), name='tea-rating-list'),
    path("teas/<int:tea_id>/ratings/<int:pk>/", TeaRatingDetail.as_view(), name='tea-rating-detail'),
    path("teas/<int:tea_id>/ratings/stats/", TeaRatingStats.as_view(), name='tea-rating-stats'),
    path("ratings/", TeaRatingList.as_view(), name='user-rating-list'),
    path("users/", UserList.as_view()),
    path("users/<int:pk>/", UserDetail.as_view()),
    path("shops/", ShopList.as_view()),
    path("shops/<int:pk>/", ShopDetail.as_view(), name='shop-detail'),

    # Tea consumption
    path('teas/<int:tea_id>/consumption/', TeaConsumptionList.as_view(), name='tea-consumption-list'),
    path('teas/<int:tea_id>/consumption/<int:pk>/', TeaConsumptionDetail.as_view(), name='tea-consumption-detail'),
    path('consumption/', TeaConsumptionList.as_view(), name='user-consumption-list'),
    path('consumption/stats/', TeaConsumptionStats.as_view(), name='user-consumption-stats'),
]

urlpatterns = format_suffix_patterns(urlpatterns)
