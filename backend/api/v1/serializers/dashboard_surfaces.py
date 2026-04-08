from rest_framework import serializers

from subscriptions.services.dashboard_canonical_financial_summary_service import (
    WINDOW_CUSTOM,
    WINDOW_DEFAULT,
    WINDOW_LAST_30_DAYS,
    WINDOW_THIS_MONTH,
)


class DashboardWindowQuerySerializer(serializers.Serializer):
    window = serializers.ChoiceField(
        choices=[
            WINDOW_DEFAULT,
            WINDOW_THIS_MONTH,
            WINDOW_LAST_30_DAYS,
            WINDOW_CUSTOM,
        ],
        required=False,
        default=WINDOW_DEFAULT,
    )
    as_of = serializers.DateField(required=False)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and start_date > end_date:
            attrs["start_date"] = end_date
            attrs["end_date"] = start_date
        return attrs


class DashboardSurfaceQuerySerializer(DashboardWindowQuerySerializer):
    limit = serializers.IntegerField(required=False, min_value=1, max_value=50, default=10)
