from rest_framework import serializers
from subscriptions.models import ReconciliationCase, ReconciliationEvent


class ReconciliationEventSerializer(serializers.ModelSerializer):

    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = ReconciliationEvent
        fields = [
            "id",
            "event_type",
            "old_status",
            "new_status",
            "message",
            "actor",
            "actor_username",
            "created_at",
        ]


class ReconciliationSerializer(serializers.ModelSerializer):

    events = ReconciliationEventSerializer(many=True, read_only=True)

    class Meta:
        model = ReconciliationCase
        fields = "__all__"