from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from rest_framework import serializers

from subscriptions.models import PlanType


SUPPORTED_FILTERS = {
    "date_from",
    "date_to",
    "contract_type",
    "payment_method",
    "status",
    "partner_id",
    "product_id",
    "category_id",
    "customer_id",
    "branch_id",
    "collected_by_id",
    "overdue_only",
    "unreconciled_only",
}


@dataclass(frozen=True)
class AdminReportFilter:
    date_from: date | None
    date_to: date | None
    contract_type: str
    payment_method: str
    status: str
    partner_id: int | None
    product_id: int | None
    category_id: int | None
    customer_id: int | None
    branch_id: int | None
    collected_by_id: int | None
    overdue_only: bool
    unreconciled_only: bool
    ignored_filters: list[dict[str, str]]

    def payload(self) -> dict:
        return {
            "date_from": self.date_from.isoformat() if self.date_from else None,
            "date_to": self.date_to.isoformat() if self.date_to else None,
            "contract_type": self.contract_type or None,
            "payment_method": self.payment_method or None,
            "status": self.status or None,
            "partner_id": self.partner_id,
            "product_id": self.product_id,
            "category_id": self.category_id,
            "customer_id": self.customer_id,
            "branch_id": self.branch_id,
            "collected_by_id": self.collected_by_id,
            "overdue_only": self.overdue_only,
            "unreconciled_only": self.unreconciled_only,
        }


class _FilterSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    contract_type = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False, allow_blank=True)
    partner_id = serializers.IntegerField(required=False, min_value=1)
    product_id = serializers.IntegerField(required=False, min_value=1)
    category_id = serializers.IntegerField(required=False, min_value=1)
    customer_id = serializers.IntegerField(required=False, min_value=1)
    branch_id = serializers.IntegerField(required=False, min_value=1)
    collected_by_id = serializers.IntegerField(required=False, min_value=1)
    overdue_only = serializers.BooleanField(required=False)
    unreconciled_only = serializers.BooleanField(required=False)

    def validate(self, attrs):
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError({"date_to": "date_to must be on/after date_from."})

        contract_type = (attrs.get("contract_type") or "").upper().strip()
        if contract_type and contract_type not in {*PlanType.values, "DIRECT_SALE", "ALL"}:
            raise serializers.ValidationError({"contract_type": "Unsupported contract_type."})
        attrs["contract_type"] = contract_type
        attrs["payment_method"] = (attrs.get("payment_method") or "").upper().strip()
        attrs["status"] = (attrs.get("status") or "").upper().strip()
        return attrs


def parse_admin_report_filters(query_params, *, applicable_filters: set[str]) -> AdminReportFilter:
    incoming_keys = {key for key in query_params.keys() if key in SUPPORTED_FILTERS}
    unknown = {key for key in query_params.keys() if key not in SUPPORTED_FILTERS and not key.startswith("page")}
    if unknown:
        raise serializers.ValidationError({key: "Unsupported filter." for key in sorted(unknown)})

    serializer = _FilterSerializer(data={key: query_params.get(key) for key in SUPPORTED_FILTERS if key in query_params})
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    ignored_filters = []
    for key in sorted(incoming_keys):
        if key not in applicable_filters:
            ignored_filters.append(
                {
                    "filter": key,
                    "reason": "Filter is not applicable for this report endpoint.",
                }
            )

    def include(name: str, default=None):
        if name not in applicable_filters:
            return default
        return data.get(name, default)

    return AdminReportFilter(
        date_from=include("date_from"),
        date_to=include("date_to"),
        contract_type=include("contract_type", ""),
        payment_method=include("payment_method", ""),
        status=include("status", ""),
        partner_id=include("partner_id"),
        product_id=include("product_id"),
        category_id=include("category_id"),
        customer_id=include("customer_id"),
        branch_id=include("branch_id"),
        collected_by_id=include("collected_by_id"),
        overdue_only=bool(include("overdue_only", False)),
        unreconciled_only=bool(include("unreconciled_only", False)),
        ignored_filters=ignored_filters,
    )

