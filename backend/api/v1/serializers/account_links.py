from rest_framework import serializers


class AccountLinkMutateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, max_length=1000)
    disable_portal_access = serializers.BooleanField(required=False, default=False)
