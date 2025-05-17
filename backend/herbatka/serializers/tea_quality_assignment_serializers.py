from rest_framework import serializers
from ..models import TeaQualityAssignment
from .tea_quality_serializers import SimpleTeaQualitySerializer


class TeaQualityAssignmentSerializer(serializers.ModelSerializer):
    tea_quality = SimpleTeaQualitySerializer(read_only=True)

    class Meta:
        model = TeaQualityAssignment
        fields = "__all__"
