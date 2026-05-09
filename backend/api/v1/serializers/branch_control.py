from rest_framework import serializers

from branch_control.models import Branch, CashCounter


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = [
            "id",
            "code",
            "name",
            "status",
            "is_primary",
            "phone",
            "email",
            "address",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CashCounterSerializer(serializers.ModelSerializer):
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    finance_account_name = serializers.CharField(source="finance_account.name", read_only=True)
    assigned_user_username = serializers.CharField(source="assigned_user.username", read_only=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        branch = attrs.get("branch")
        finance_account = attrs.get("finance_account")
        if branch is None and self.instance is not None:
            branch = self.instance.branch
        if finance_account is None and self.instance is not None:
            finance_account = self.instance.finance_account
        if branch is None or finance_account is None:
            return attrs
        from accounting.services.finance_account_collection_guard import validate_finance_account_for_cash_counter

        try:
            validate_finance_account_for_cash_counter(
                finance_account=finance_account,
                branch_id=branch.pk,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"finance_account": str(exc)}) from exc
        return attrs

    class Meta:
        model = CashCounter
        fields = [
            "id",
            "code",
            "name",
            "branch",
            "branch_code",
            "branch_name",
            "finance_account",
            "finance_account_name",
            "assigned_user",
            "assigned_user_username",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BranchReportingQuerySerializer(serializers.Serializer):
    branch_id = serializers.IntegerField(required=False, min_value=1)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "end_date must be on or after start_date."})
        return attrs


class BranchImportActionSerializer(serializers.Serializer):
    pass
