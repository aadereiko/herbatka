from django.urls import path
from rest_framework.urlpatterns import format_suffix_patterns

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
    UserList,
    UserDetail,
    ShopList,
    ShopDetail,
)

urlpatterns = [
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
    path("users/", UserList.as_view()),
    path("users/<int:pk>/", UserDetail.as_view()),
    path("shops/", ShopList.as_view()),
    path("shops/<int:pk>/", ShopDetail.as_view(), name='shop-detail'),
]

urlpatterns = format_suffix_patterns(urlpatterns)
