from rest_framework import serializers
from ..models import TeaQualityAssignment


class TeaQualityAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeaQualityAssignment
        fields = "__all__"
