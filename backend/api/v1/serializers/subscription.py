from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from api.v1.serializers.delivery import CustomerSubscriptionDeliveryReadSerializer
from api.v1.serializers.media import serialize_media_url
from subscriptions.models import Emi, Payment, PlanType, Subscription
from deliveries.services.delivery_service import (
    get_current_subscription_delivery,
)
from contracts.services.contract_number_service import (
    get_or_assign_subscription_number,
)
from subscriptions.services.subscription_financial_service import (
    attach_subscription_financial_snapshot,
    build_subscription_financial_snapshot,
)


class CustomerEmiSerializer(serializers.ModelSerializer):
    paid_amount = serializers.SerializerMethodField()
    waived_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = Emi
        fields = (
            "id",
            "subscription",
            "month_no",
            "due_date",
            "amount",
            "paid_amount",
            "waived_amount",
            "outstanding_amount",
            "status",
        )
        read_only_fields = fields

    def get_paid_amount(self, obj):
        payment_total = (
            obj.payments.aggregate(total=Sum("amount")).get("total")
            or Decimal("0.00")
        )
        return str(payment_total)

    def get_waived_amount(self, obj):
        if obj.status == "WAIVED":
            return str(obj.amount or Decimal("0.00"))
        return "0.00"

    def get_outstanding_amount(self, obj):
        amount = obj.amount or Decimal("0.00")
        paid_amount = Decimal(self.get_paid_amount(obj))
        waived_amount = Decimal(self.get_waived_amount(obj))

        outstanding = amount - paid_amount - waived_amount
        if outstanding < 0:
            outstanding = Decimal("0.00")

        return str(outstanding)


class BaseSubscriptionSerializer(serializers.ModelSerializer):
    subscription_number = serializers.SerializerMethodField()
    delivery_status = serializers.SerializerMethodField()
    deposit_status = serializers.SerializerMethodField()
    security_deposit_amount = serializers.SerializerMethodField()
    security_deposit_percent = serializers.SerializerMethodField()
    refundable_security_deposit = serializers.SerializerMethodField()
    amendments_count = serializers.SerializerMethodField()
    fulfillment_status = serializers.CharField(read_only=True)
    branch_id = serializers.IntegerField(source="branch.id", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    product_id = serializers.IntegerField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_image = serializers.SerializerMethodField()
    product_base_price = serializers.DecimalField(
        source="product.base_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    batch_id = serializers.IntegerField(source="batch.id", read_only=True)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    batch_status = serializers.CharField(source="batch.status", read_only=True)

    partner_id = serializers.IntegerField(source="partner.id", read_only=True)
    partner_username = serializers.CharField(source="partner.username", read_only=True)
    partner_phone = serializers.CharField(source="partner.phone", read_only=True)

    lucky_id = serializers.IntegerField(source="lucky_id.id", read_only=True)
    lucky_number = serializers.IntegerField(source="lucky_id.lucky_number", read_only=True)

    emi_count = serializers.SerializerMethodField()
    paid_emi_count = serializers.SerializerMethodField()
    pending_emi_count = serializers.SerializerMethodField()
    waived_emi_count = serializers.SerializerMethodField()
    overdue_emi_count = serializers.SerializerMethodField()

    total_paid_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    financial_summary = serializers.SerializerMethodField()

    last_payment_date = serializers.SerializerMethodField()
    next_due_date = serializers.SerializerMethodField()
    contract_items = serializers.SerializerMethodField()
    security_deposit_paid = serializers.SerializerMethodField()
    security_deposit_pending = serializers.SerializerMethodField()

    has_customer_signature = serializers.SerializerMethodField()
    customer_signature_signed_at = serializers.SerializerMethodField()
    customer_signature_url = serializers.SerializerMethodField()
    signing_path = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            "id",
            "subscription_number",
            "branch_id",
            "branch_code",
            "branch_name",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "product",
            "product_id",
            "product_name",
            "product_code",
            "product_image",
            "product_base_price",
            "contract_items",
            "batch",
            "batch_id",
            "batch_code",
            "batch_status",
            "partner",
            "partner_id",
            "partner_username",
            "partner_phone",
            "lucky_id",
            "lucky_number",
            "plan_type",
            "tenure_months",
            "start_date",
            "total_amount",
            "monthly_amount",
            "status",
            "winner_month",
            "waived_amount",
            "delivery_status",
            "deposit_status",
            "security_deposit_amount",
            "security_deposit_paid",
            "security_deposit_pending",
            "security_deposit_percent",
            "refundable_security_deposit",
            "amendments_count",
            "fulfillment_status",
            "created_at",
            "emi_count",
            "paid_emi_count",
            "pending_emi_count",
            "waived_emi_count",
            "overdue_emi_count",
            "total_paid_amount",
            "outstanding_amount",
            "financial_summary",
            "last_payment_date",
            "next_due_date",
            "has_customer_signature",
            "customer_signature_signed_at",
            "customer_signature_url",
            "signing_path",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        return get_or_assign_subscription_number(obj) or f"SUB-{obj.id}"

    def get_delivery_status(self, obj):
        current_delivery = get_current_subscription_delivery(obj)
        return getattr(current_delivery, "status", None)

    def _get_deposit_summary(self, obj):
        cached = getattr(obj, "_cached_deposit_summary", None)
        if cached is None:
            from contracts.services.contract_activation_readiness_service import (
                get_subscription_deposit_summary,
            )
            cached = get_subscription_deposit_summary(obj)
            setattr(obj, "_cached_deposit_summary", cached)
        return cached

    def get_deposit_status(self, obj):
        return self._get_deposit_summary(obj)["deposit_status"]

    def get_security_deposit_amount(self, obj):
        return self._get_deposit_summary(obj)["security_deposit_amount"]

    def get_security_deposit_paid(self, obj):
        return self._get_deposit_summary(obj)["security_deposit_paid"]

    def get_security_deposit_pending(self, obj):
        return self._get_deposit_summary(obj)["security_deposit_pending"]

    def get_refundable_security_deposit(self, obj):
        return self._get_deposit_summary(obj)["refundable_security_deposit"]

    def get_security_deposit_percent(self, obj):
        return self._get_deposit_summary(obj)["security_deposit_percent"]

    def get_amendments_count(self, obj):
        try:
            if hasattr(obj, "amendments"):
                return obj.amendments.count()
        except Exception:
            pass
        return 0

    def get_contract_items(self, obj):
        if obj.plan_type not in (PlanType.RENT, PlanType.LEASE):
            return []
        items = list(obj.contract_items.select_related("product").all())
        if items:
            return [
                {
                    "id": it.id,
                    "product": it.product_id,
                    "product_id": it.product_id,
                    "product_name": it.product.name,
                    "product_code": it.product.product_code,
                    "sku": getattr(it.product, "sku", ""),
                    "category": getattr(it.product, "category", ""),
                    "quantity": it.quantity,
                    "unit_base_price": str(it.unit_base_price),
                    "total_base_price": str(it.total_base_price),
                    "monthly_yield_percent": str(it.monthly_yield_percent),
                    "monthly_amount": str(it.monthly_amount),
                    "security_deposit_percent": str(getattr(it, "security_deposit_percent", "20.00")),
                    "security_deposit_amount": str(it.security_deposit_amount),
                    "product_snapshot": it.product_snapshot,
                }
                for it in items
            ]
        if obj.product_snapshot and isinstance(obj.product_snapshot, dict):
            snap_items = obj.product_snapshot.get("items")
            if isinstance(snap_items, list) and snap_items:
                return snap_items
        return []

    def get_product_image(self, obj):
        return serialize_media_url(
            self.context.get("request"),
            getattr(obj.product, "image", None),
        )

    def _get_emis(self, obj):
        prefetched = getattr(obj, "_prefetched_objects_cache", {})
        if "emis" in prefetched:
            return list(prefetched["emis"])
        return list(obj.emis.all())

    def _use_canonical_financial_summary(self) -> bool:
        return bool(self.context.get("use_canonical_financial_summary"))

    def _snapshot(self, obj):
        snapshot = getattr(obj, "_subscription_financial_snapshot", None)
        if snapshot is None:
            snapshot = attach_subscription_financial_snapshot(obj)
        return snapshot

    def _compute_financial_summary(self, obj):
        if self._use_canonical_financial_summary():
            snapshot = self._snapshot(obj)
            return {
                "emi_total": Decimal(snapshot["emi_total"]),
                "paid_amount": Decimal(snapshot["paid_amount"]),
                "waived_amount": Decimal(snapshot["waived_amount"]),
                "pending_amount": Decimal(snapshot["pending_amount"]),
                "remaining_amount": Decimal(snapshot["remaining_amount"]),
                "outstanding_amount": Decimal(snapshot["outstanding_amount"]),
            }

        emis = self._get_emis(obj)

        emi_total = Decimal("0.00")
        paid_total = Decimal("0.00")
        waived_total = Decimal("0.00")

        for emi in emis:
            amount = emi.amount or Decimal("0.00")
            emi_total += amount

            emi_paid = (
                emi.payments.aggregate(total=Sum("amount")).get("total")
                or Decimal("0.00")
            )
            paid_total += emi_paid

            if emi.status == "WAIVED":
                waived_total += amount

        if not emis:
            paid_total = (
                Payment.objects.filter(subscription=obj)
                .aggregate(total=Sum("amount"))
                .get("total")
                or Decimal("0.00")
            )
            waived_total = getattr(obj, "waived_amount", None) or Decimal("0.00")
            emi_total = obj.total_amount or Decimal("0.00")

        outstanding = emi_total - paid_total - waived_total
        if outstanding < 0:
            outstanding = Decimal("0.00")

        return {
            "emi_total": emi_total,
            "paid_amount": paid_total,
            "waived_amount": waived_total,
            "pending_amount": outstanding,
            "remaining_amount": outstanding,
            "outstanding_amount": outstanding,
        }

    def get_emi_count(self, obj):
        return len(self._get_emis(obj))

    def get_paid_emi_count(self, obj):
        if self._use_canonical_financial_summary():
            return int(self._snapshot(obj)["emi_count_paid"])
        return sum(1 for emi in self._get_emis(obj) if emi.status == "PAID")

    def get_pending_emi_count(self, obj):
        if self._use_canonical_financial_summary():
            return int(self._snapshot(obj)["emi_count_pending"])
        return sum(1 for emi in self._get_emis(obj) if emi.status == "PENDING")

    def get_waived_emi_count(self, obj):
        if self._use_canonical_financial_summary():
            return int(self._snapshot(obj)["emi_count_waived"])
        return sum(1 for emi in self._get_emis(obj) if emi.status == "WAIVED")

    def get_overdue_emi_count(self, obj):
        return sum(1 for emi in self._get_emis(obj) if emi.status == "PENDING" and getattr(emi, "is_overdue", lambda: False)())

    def get_total_paid_amount(self, obj):
        summary = self._compute_financial_summary(obj)
        return str(summary["paid_amount"])

    def get_outstanding_amount(self, obj):
        summary = self._compute_financial_summary(obj)
        return str(summary["outstanding_amount"])

    def get_financial_summary(self, obj):
        summary = self._compute_financial_summary(obj)
        return {
            "emi_total": str(summary["emi_total"]),
            "paid_amount": str(summary["paid_amount"]),
            "waived_amount": str(summary["waived_amount"]),
            "pending_amount": str(summary["pending_amount"]),
            "remaining_amount": str(summary["remaining_amount"]),
            "outstanding_amount": str(summary["outstanding_amount"]),
        }

    def get_last_payment_date(self, obj):
        payment = (
            Payment.objects.filter(subscription=obj)
            .order_by("-payment_date", "-id")
            .first()
        )
        return getattr(payment, "payment_date", None)

    def get_next_due_date(self, obj):
        emis = sorted(
            [emi for emi in self._get_emis(obj) if emi.status == "PENDING"],
            key=lambda emi: (
                emi.due_date or "",
                emi.month_no or 0,
                emi.id or 0,
            ),
        )
        return getattr(emis[0], "due_date", None) if emis else None

    def _get_customer_signature_doc(self, obj):
        prefetched = getattr(obj, "_prefetched_objects_cache", {})
        if "documents" in prefetched:
            for d in prefetched["documents"]:
                if getattr(d, "document_type", None) == "CUSTOMER_SIGNATURE" and getattr(d, "file", None):
                    return d
            return None
        return obj.documents.filter(document_type="CUSTOMER_SIGNATURE", file__isnull=False).order_by("-id").first()

    def get_has_customer_signature(self, obj) -> bool:
        return self._get_customer_signature_doc(obj) is not None

    def get_customer_signature_signed_at(self, obj):
        doc = self._get_customer_signature_doc(obj)
        return doc.created_at.isoformat() if doc and getattr(doc, "created_at", None) else None

    def get_customer_signature_url(self, obj):
        doc = self._get_customer_signature_doc(obj)
        if doc and getattr(doc, "file", None):
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(doc.file.url)
            return doc.file.url
        return None

    def get_signing_path(self, obj):
        try:
            from api.v1.views.public_contract_sign import generate_contract_signing_token
            token = generate_contract_signing_token(obj.id)
            return f"/sign-contract/{token}"
        except Exception:
            return None


class SubscriptionListSerializer(BaseSubscriptionSerializer):
    class Meta(BaseSubscriptionSerializer.Meta):
        fields = BaseSubscriptionSerializer.Meta.fields
        read_only_fields = fields


class CustomerDashboardSubscriptionSerializer(SubscriptionListSerializer):
    winner_status = serializers.SerializerMethodField()
    winner_summary = serializers.SerializerMethodField()

    class Meta(SubscriptionListSerializer.Meta):
        fields = SubscriptionListSerializer.Meta.fields + (
            "winner_status",
            "winner_summary",
        )
        read_only_fields = fields

    def get_winner_status(self, obj):
        return self._snapshot(obj)["winner_status"]

    def get_winner_summary(self, obj):
        return self._snapshot(obj)["winner_summary"]


class SubscriptionDetailSerializer(BaseSubscriptionSerializer):
    winner_status = serializers.SerializerMethodField()
    winner_summary = serializers.SerializerMethodField()
    emis = serializers.SerializerMethodField()
    rent_lease_demands = serializers.SerializerMethodField()
    delivery_summary = serializers.SerializerMethodField()
    deliveries = serializers.SerializerMethodField()
    amendments = serializers.SerializerMethodField()
    rent_lease_kpis = serializers.SerializerMethodField()

    class Meta(BaseSubscriptionSerializer.Meta):
        fields = BaseSubscriptionSerializer.Meta.fields + (
            "winner_status",
            "winner_summary",
            "delivery_summary",
            "deliveries",
            "emis",
            "amendments",
            "rent_lease_demands",
            "rent_lease_kpis",
        )
        read_only_fields = fields

    def _snapshot(self, obj):
        snapshot = getattr(obj, "_customer_subscription_detail_snapshot", None)
        if snapshot is None:
            snapshot = build_subscription_financial_snapshot(obj)
            attach_subscription_financial_snapshot(obj, snapshot)
        return snapshot

    def get_financial_summary(self, obj):
        snapshot = self._snapshot(obj)
        return {
            "emi_total": snapshot["emi_total"],
            "paid_amount": snapshot["paid_amount"],
            "waived_amount": snapshot["waived_amount"],
            "pending_amount": snapshot["pending_amount"],
            "remaining_amount": snapshot["remaining_amount"],
            "outstanding_amount": snapshot["outstanding_amount"],
        }

    def get_winner_status(self, obj):
        return self._snapshot(obj)["winner_status"]

    def get_winner_summary(self, obj):
        return self._snapshot(obj)["winner_summary"]

    def get_rent_lease_kpis(self, obj):
        if obj.plan_type not in (PlanType.RENT, PlanType.LEASE):
            return None
        from decimal import Decimal
        from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType
        from contracts.services.contract_activation_readiness_service import get_subscription_deposit_summary
        demands = list(RentLeaseBillingDemand.objects.filter(subscription=obj))
        deposit = [d for d in demands if d.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT]
        monthly = [d for d in demands if d.demand_type != RentLeaseDemandType.SECURITY_DEPOSIT]
        total = lambda rows, field: sum((getattr(row, field, Decimal("0.00")) or Decimal("0.00") for row in rows), Decimal("0.00"))
        deposit_summary = get_subscription_deposit_summary(obj)
        deposit_due = Decimal(str(deposit_summary.get("security_deposit_amount", "0.00")))
        deposit_paid = Decimal(str(deposit_summary.get("security_deposit_paid", "0.00")))
        rent_due = total(monthly, "amount")
        rent_paid = total(monthly, "collected_amount")
        return {
            "deposit_due": str(deposit_due),
            "deposit_paid": str(deposit_paid),
            "deposit_pending": str(max(deposit_due - deposit_paid, Decimal("0.00"))),
            "deposit_held": str(total(deposit, "held_amount") or deposit_paid),
            "deposit_deducted": str(total(deposit, "deducted_amount")),
            "deposit_refundable": str(deposit_summary.get("refundable_security_deposit", "0.00")),
            "rent_due": str(rent_due),
            "rent_paid": str(rent_paid),
            "rent_outstanding": str(max(rent_due - rent_paid, Decimal("0.00"))),
            "demand_count": len(monthly),
            "paid_demand_count": sum(1 for row in monthly if row.status == "PAID"),
            "pending_demand_count": sum(1 for row in monthly if row.status not in {"PAID", "CANCELLED"}),
            "deposit_status": deposit_summary.get("deposit_status", "PENDING"),
        }

    def get_emis(self, obj):
        emis = sorted(
            self._get_emis(obj),
            key=lambda emi: (
                emi.month_no or 0,
                emi.due_date or "",
                emi.id or 0,
            ),
        )
        if emis:
            return CustomerEmiSerializer(emis, many=True).data

        # For Rent/Lease contracts without EMI rows, synthesize schedule rows from monthly demands
        if obj.plan_type in (PlanType.RENT, PlanType.LEASE):
            try:
                from subscriptions.models import RentLeaseBillingDemand
                prefetched = getattr(obj, "_prefetched_objects_cache", {})
                if "rent_lease_demands" in prefetched:
                    demands = [d for d in prefetched["rent_lease_demands"] if getattr(d, "demand_type", "") != "SECURITY_DEPOSIT"]
                else:
                    demands = list(
                        RentLeaseBillingDemand.objects.filter(subscription=obj)
                        .exclude(demand_type="SECURITY_DEPOSIT")
                        .order_by("due_date", "id")
                    )
                if demands:
                    synthetic_rows = []
                    for idx, demand in enumerate(demands, start=1):
                        amt = demand.amount or Decimal("0.00")
                        collected = demand.collected_amount or Decimal("0.00")
                        status_val = demand.status or "PENDING"
                        if status_val not in ("PAID", "WAIVED", "CANCELLED", "OVERDUE"):
                            if collected >= amt and amt > Decimal("0.00"):
                                status_val = "PAID"
                            elif collected > Decimal("0.00"):
                                status_val = "PARTIAL"
                            else:
                                status_val = "PENDING"
                        synthetic_rows.append({
                            "id": demand.id,
                            "subscription": obj.id,
                            "month_no": idx,
                            "due_date": demand.due_date.isoformat() if demand.due_date else None,
                            "amount": str(amt),
                            "paid_amount": str(collected),
                            "waived_amount": "0.00",
                            "outstanding_amount": str(max(amt - collected, Decimal("0.00"))),
                            "status": status_val,
                        })
                    return synthetic_rows
            except Exception:
                pass

        return []

    def get_rent_lease_demands(self, obj):
        if obj.plan_type not in (PlanType.RENT, PlanType.LEASE):
            return []
        try:
            from subscriptions.models import RentLeaseBillingDemand, RentLeaseDemandType
            from django.db.models import Case, When, Value, IntegerField
            prefetched = getattr(obj, "_prefetched_objects_cache", {})
            if "rent_lease_demands" in prefetched:
                demands = sorted(
                    prefetched["rent_lease_demands"],
                    key=lambda d: (
                        d.due_date or timezone.localdate(),
                        0 if getattr(d, "demand_type", "") == RentLeaseDemandType.SECURITY_DEPOSIT else 1,
                        d.id or 0,
                    )
                )
            else:
                demands = RentLeaseBillingDemand.objects.filter(subscription=obj).annotate(
                    type_order=Case(
                        When(demand_type=RentLeaseDemandType.SECURITY_DEPOSIT, then=Value(0)),
                        default=Value(1),
                        output_field=IntegerField(),
                    )
                ).order_by("due_date", "type_order", "id")
            return [
                {
                    "id": demand.id,
                    "demand_type": demand.demand_type,
                    "due_date": demand.due_date.isoformat() if demand.due_date else None,
                    "amount": str(demand.amount),
                    "status": demand.status,
                    "paid_amount": str(demand.collected_amount),
                }
                for demand in demands
            ]
        except Exception:
            return []

    def get_delivery_summary(self, obj):
        current_delivery = get_current_subscription_delivery(obj)
        if current_delivery is None:
            return None
        return CustomerSubscriptionDeliveryReadSerializer(current_delivery).data

    def get_deliveries(self, obj):
        deliveries = getattr(obj, "_prefetched_objects_cache", {}).get("deliveries")
        if deliveries is None:
            deliveries = obj.deliveries.all().order_by("-created_at", "-id")
        return CustomerSubscriptionDeliveryReadSerializer(deliveries, many=True).data

    def get_amendments(self, obj):
        try:
            if not hasattr(obj, "amendments"):
                return []
            rows = obj.amendments.all().order_by("-created_at", "-id")[:15]
            return [
                {
                    "id": a.id,
                    "amendment_no": getattr(a, "amendment_no", "") or f"AMD-{a.id}",
                    "amendment_type": a.amendment_type,
                    "status": a.status,
                    "reason": a.reason or "",
                    "effective_date": str(a.effective_date) if a.effective_date else None,
                    "financial_impact_amount": str(getattr(a, "financial_impact_amount", None) or "0.00"),
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                    "applied_at": a.applied_at.isoformat() if a.applied_at else None,
                }
                for a in rows
            ]
        except Exception:
            return []


SubscriptionSerializer = SubscriptionListSerializer

class RentLeaseGenerateScheduleSerializer(serializers.Serializer):
    start_date = serializers.DateField(required=True)
    deposit_due_date = serializers.DateField(required=False, allow_null=True)
