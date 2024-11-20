from django.urls import path
from rest_framework.urlpatterns import format_suffix_patterns

from .views import TodoList, TodoDetail

urlpatterns = [
    path("todos/", TodoList.as_view()),
    path("todos/<int:pk>/", TodoDetail.as_view()),
]

urlpatterns = format_suffix_patterns(urlpatterns)
