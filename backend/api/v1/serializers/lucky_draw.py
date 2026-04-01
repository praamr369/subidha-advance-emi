from rest_framework import serializers

from subscriptions.models import LuckyDraw


class LuckyDrawSerializer(serializers.ModelSerializer):
    winner_lucky_number = serializers.IntegerField(source="winner_lucky_id.lucky_number", read_only=True)
    executed_at = serializers.DateTimeField(source="draw_date", read_only=True)
    winner_context = serializers.SerializerMethodField()

    def get_winner_context(self, obj: LuckyDraw):
        if not obj.winner_lucky_id_id:
            return None
        return {
            "winner_lucky_id": obj.winner_lucky_id_id,
            "winner_lucky_number": obj.winner_lucky_id.lucky_number,
            "draw_month": obj.draw_month,
            "batch_id": obj.batch_id,
        }

    class Meta:
        model = LuckyDraw
        fields = (
            "id",
            "batch",
            "draw_month",
            "committed_hash",
            "winner_lucky_id",
            "winner_lucky_number",
            "draw_date",
            "executed_at",
            "is_revealed",
            "winner_context",
        )
