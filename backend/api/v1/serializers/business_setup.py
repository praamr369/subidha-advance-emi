from rest_framework import serializers

from subscriptions.models_business_setup import (
    Branch,
    BusinessProfile,
    CashDesk,
    ChartAccount,
    FinanceAccount,
    StaffOperationalAssignment,
)


class BusinessProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessProfile
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class FinanceAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinanceAccount
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class CashDeskSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    default_finance_account_name = serializers.CharField(source="default_finance_account.name", read_only=True)

    class Meta:
        model = CashDesk
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class StaffOperationalAssignmentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    default_cash_desk_name = serializers.CharField(source="default_cash_desk.name", read_only=True)

    class Meta:
        model = StaffOperationalAssignment
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class ChartAccountSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True)

    class Meta:
        model = ChartAccount
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class SetupChecklistSerializer(serializers.Serializer):
    is_ready_for_go_live = serializers.BooleanField()
    percent_complete = serializers.IntegerField()
    items = serializers.ListField(child=serializers.DictField())
