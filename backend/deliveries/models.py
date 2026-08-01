from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator, MinLengthValidator
from django.utils import timezone
from django.db.models import Q, F
from decimal import Decimal
from django.conf import settings
from subscriptions.enums import *
from subscriptions.base_models import (
    TimeStampedModel, MONEY_ZERO, HUNDRED, q2, _default_branch,
    product_image_upload_to, subscription_document_upload_to,
    customer_photo_upload_to, customer_kyc_doc_upload_to,
    
)

class SubscriptionDelivery(TimeStampedModel):
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="deliveries",
    )
    status = models.CharField(
        max_length=30,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
        db_index=True,
    )
    delivery_reference = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
    )
    scheduled_date = models.DateField(null=True, blank=True, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True, db_index=True)
    out_for_delivery_at = models.DateTimeField(null=True, blank=True, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True, db_index=True)
    failed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    return_requested_at = models.DateTimeField(null=True, blank=True, db_index=True)
    returned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    receiver_name = models.CharField(max_length=100, blank=True, default="")
    receiver_phone = models.CharField(max_length=20, blank=True, default="")
    delivery_address_snapshot = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    failure_reason = models.TextField(blank=True, default="")
    # Phase 2: reason set when delivery is moved to BLOCKED_STOCK_UNAVAILABLE
    stock_blocked_reason = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_subscription_deliveries",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="updated_subscription_deliveries",
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "subscription_deliveries"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["delivered_at"]),
            models.Index(fields=["delivery_reference"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["subscription"],
                condition=Q(
                    status__in=[
                        DeliveryStatus.PENDING,
                        DeliveryStatus.SCHEDULED,
                        DeliveryStatus.DISPATCHED,
                        DeliveryStatus.OUT_FOR_DELIVERY,
                        DeliveryStatus.RETURN_REQUESTED,
                    ]
                ),
                name="uq_active_subscription_delivery_per_subscription",
            ),
        ]

    TERMINAL_STATUSES = {
        DeliveryStatus.DELIVERED,
        DeliveryStatus.FAILED,
        DeliveryStatus.CANCELLED,
        DeliveryStatus.RETURNED,
    }

    ACTIVE_STATUSES = {
        DeliveryStatus.PENDING,
        DeliveryStatus.SCHEDULED,
        DeliveryStatus.DISPATCHED,
        DeliveryStatus.OUT_FOR_DELIVERY,
        DeliveryStatus.RETURN_REQUESTED,
    }

    def clean(self):
        errors = {}

        if not self.delivery_reference or not self.delivery_reference.strip():
            errors["delivery_reference"] = "Delivery reference is required."

        if self.subscription_id and self.subscription.plan_type != PlanType.EMI:
            # Keep delivery future-safe for non-EMI plans, but require a contract.
            # No additional validation is needed today beyond the linked subscription.
            pass

        if (
            self.status == DeliveryStatus.SCHEDULED
            and self.scheduled_date is None
        ):
            errors["scheduled_date"] = "Scheduled date is required for scheduled deliveries."

        if self.status == DeliveryStatus.DISPATCHED and self.dispatched_at is None:
            errors["dispatched_at"] = "Dispatch timestamp is required for dispatched deliveries."

        if (
            self.status == DeliveryStatus.OUT_FOR_DELIVERY
            and self.out_for_delivery_at is None
        ):
            errors["out_for_delivery_at"] = (
                "Out-for-delivery timestamp is required for this status."
            )

        if self.status == DeliveryStatus.DELIVERED and self.delivered_at is None:
            errors["delivered_at"] = "Delivered timestamp is required for delivered records."

        if self.status == DeliveryStatus.FAILED and self.failed_at is None:
            errors["failed_at"] = "Failed timestamp is required for failed deliveries."

        if self.status == DeliveryStatus.CANCELLED and self.cancelled_at is None:
            errors["cancelled_at"] = "Cancelled timestamp is required for cancelled deliveries."

        if (
            self.status == DeliveryStatus.RETURN_REQUESTED
            and self.return_requested_at is None
        ):
            errors["return_requested_at"] = (
                "Return-requested timestamp is required for this status."
            )

        if self.status == DeliveryStatus.RETURNED and self.returned_at is None:
            errors["returned_at"] = "Returned timestamp is required for returned deliveries."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.delivery_reference = (self.delivery_reference or "").strip().upper()
        self.receiver_name = (self.receiver_name or "").strip()
        self.receiver_phone = (self.receiver_phone or "").strip()
        self.delivery_address_snapshot = (self.delivery_address_snapshot or "").strip()
        self.failure_reason = (self.failure_reason or "").strip()
        self.stock_blocked_reason = (self.stock_blocked_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL_STATUSES

    @property
    def is_active_delivery(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    def __str__(self):
        return f"{self.delivery_reference} - Subscription {self.subscription_id}"


# =====================================================
# EMI
# =====================================================


class ProductPossession(models.Model):
    created_at = models.DateTimeField(db_index=True, default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    subscription = models.OneToOneField('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="product_possession",
    )
    product = models.ForeignKey('products_core.Product',
        on_delete=models.PROTECT,
        related_name="possessions",
    )
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="product_possessions",
    )
    status = models.CharField(
        max_length=25,
        choices=PossessionStatus.choices,
        default=PossessionStatus.PENDING_HANDOVER,
        db_index=True,
    )
    handover_date = models.DateField(null=True, blank=True, db_index=True)
    expected_return_date = models.DateField(null=True, blank=True, db_index=True)
    actual_return_date = models.DateField(null=True, blank=True, db_index=True)
    handover_condition_notes = models.TextField(blank=True, default="")
    return_condition_notes = models.TextField(blank=True, default="")
    serial_number = models.CharField(max_length=80, blank=True, default="")
    handed_over_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="handed_over_possessions",
    )
    returned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="received_possession_returns",
    )

    class Meta:
        db_table = "product_possessions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "expected_return_date"], name="product_pos_status_d5b8a4_idx"),
            models.Index(fields=["customer", "status"], name="product_pos_custome_6f49c5_idx"),
            models.Index(fields=["product", "status"], name="product_pos_product_b48bed_idx"),
        ]

    def __str__(self):
        return f"Possession of {self.product_id} by Customer#{self.customer_id} [{self.status}]"



class RentLeaseReturnInspection(models.Model):
    created_at = models.DateTimeField(db_index=True, default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    subscription = models.OneToOneField('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="return_inspection",
    )
    status = models.CharField(
        max_length=20,
        choices=InspectionStatus.choices,
        default=InspectionStatus.PENDING,
        db_index=True,
    )
    outcome = models.CharField(
        max_length=25,
        choices=InspectionOutcome.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    inspection_date = models.DateField(null=True, blank=True, db_index=True)
    condition_recorded = models.CharField(
        max_length=30,
        choices=InspectionCondition.choices,
        default=InspectionCondition.NOT_ASSESSED,
        db_index=True,
    )
    damage_notes = models.TextField(blank=True, default="")
    damage_deduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    deposit_refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    deposit_refund_approved = models.BooleanField(default=False)
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    stock_routing_notes = models.TextField(blank=True, default="")
    inspected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="conducted_return_inspections",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_return_inspections",
    )

    class Meta:
        db_table = "rent_lease_return_inspections"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "outcome"], name="rent_lease__status_999cb0_idx"),
            models.Index(fields=["subscription", "status"], name="rent_lease__subscri_07d329_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(damage_deduction_amount__gte=Decimal("0.00")),
                name="chk_return_inspection_deduction_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(deposit_refund_amount__gte=Decimal("0.00")),
                name="chk_return_inspection_refund_non_negative",
            ),
        ]

    def __str__(self):
        return f"ReturnInspection for Sub#{self.subscription_id} [{self.status}]"



class AssetConditionSnapshot(TimeStampedModel):
    """
    Append-only record of an asset's assessed condition at a specific lifecycle stage.

    BEFORE_HANDOVER — satisfies the P0/P3A condition-proof requirement for lease/rent.
    AFTER_RETURN    — feeds into the damage-deduction / refund workflow.
    DAMAGE_REVIEW   — may be linked to a damage deduction later.
    MAINTENANCE_REVIEW — recorded during servicing.

    Snapshots are never mutated after creation; corrections are new snapshot rows.
    """

    asset = models.ForeignKey('products_core.RentalAsset',
        on_delete=models.PROTECT,
        related_name="condition_snapshots",
    )
    subscription = models.ForeignKey(
        "contracts.Subscription",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="asset_condition_snapshots",
    )
    stage = models.CharField(
        max_length=24,
        choices=AssetConditionSnapshotStage.choices,
        db_index=True,
    )
    condition_score = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    condition_grade = models.CharField(
        max_length=10,
        choices=AssetConditionGrade.choices,
        default=AssetConditionGrade.UNKNOWN,
    )
    notes = models.TextField(blank=True, default="")
    assessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="asset_condition_snapshots",
    )
    assessed_at = models.DateTimeField(default=timezone.now, db_index=True)
    document = models.ForeignKey('contracts.SubscriptionDocument',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="condition_snapshots",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "subscriptions_asset_condition_snapshots"
        ordering = ["-assessed_at", "-id"]
        indexes = [
            models.Index(fields=["asset", "stage", "assessed_at"]),
            models.Index(fields=["subscription", "stage"]),
        ]

    def clean(self):
        errors = {}
        if not self.stage:
            errors["stage"] = "Stage is required."
        score = self.condition_score
        if score is not None and not (1 <= score <= 10):
            errors["condition_score"] = "Condition score must be between 1 and 10."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.asset_id}:{self.stage}@{self.assessed_at:%Y-%m-%d}"


# ---------------------------------------------------------------------------
# P3C — Customer Risk Scoring
# ---------------------------------------------------------------------------


class Delivery(models.Model):
    """Delivery order linked to Subscription — tracks fulfillment."""
    subscription = models.OneToOneField('contracts.Subscription',
        on_delete=models.CASCADE,
        related_name="delivery",
    )
    status = models.CharField(
        max_length=20,
        choices=DeliveryOrderStatus.choices,
        default=DeliveryOrderStatus.PENDING,
        db_index=True,
    )
    scheduled_date = models.DateField(null=True, blank=True)
    delivered_date = models.DateField(null=True, blank=True, db_index=True)
    driver_name = models.CharField(max_length=100, blank=True, default="")
    driver_phone = models.CharField(max_length=20, blank=True, default="")
    delivery_address = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_delivery"
        ordering = ["-created_at"]

    def clean(self):
        # CTRL-RENT-2 — handover photo evidence mandatory before marking DELIVERED.
        if self.status == DeliveryOrderStatus.DELIVERED and self.pk:
            has_proof = ProofOfDelivery.objects.filter(delivery_id=self.pk).exists()
            if not has_proof:
                raise ValidationError(
                    {"status": "Delivery cannot be marked DELIVERED without a Proof of Delivery record (CTRL-RENT-2)."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Delivery for subscription {self.subscription_id} ({self.status})"



class ProofOfDelivery(models.Model):
    """Proof of Delivery — photos + signature + metadata captured at delivery."""
    delivery = models.OneToOneField(
        Delivery,
        on_delete=models.CASCADE,
        related_name="proof_of_delivery",
    )
    delivery_date = models.DateTimeField(db_index=True)

    # Proof media
    photo_1 = models.ImageField(upload_to="pod/photos/")
    photo_2 = models.ImageField(upload_to="pod/photos/", blank=True, null=True)
    signature_image = models.ImageField(upload_to="pod/signatures/")

    # Metadata
    driver_name = models.CharField(max_length=100)
    driver_phone = models.CharField(max_length=20, blank=True, default="")
    customer_signature_name = models.CharField(max_length=100)
    gps_latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    gps_longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    # Status
    status = models.CharField(
        max_length=20,
        choices=PODStatus.choices,
        default=PODStatus.CAPTURED,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_proof_of_delivery"
        ordering = ["-delivery_date"]

    def __str__(self):
        return f"POD for delivery {self.delivery_id} on {self.delivery_date.date()}"


# ─────────────────────────────────────────────────────────────────────────────
# Customer Dispute Workflow
# ─────────────────────────────────────────────────────────────────────────────


class Repossession(TimeStampedModel):
    subscription = models.OneToOneField('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="repossession",
    )
    status = models.CharField(
        max_length=20,
        choices=RepossessionStatus.choices,
        default=RepossessionStatus.NOTICE_ISSUED,
        db_index=True,
    )
    # Written notice is mandatory before any physical repossession step.
    notice_issued_at = models.DateTimeField(db_index=True)
    notice_issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="issued_repossession_notices",
    )
    notice_reference = models.CharField(max_length=100, blank=True, default="")
    notice_document = models.FileField(
        upload_to="repossession/notices/",
        null=True,
        blank=True,
    )
    # Response window — legal minimum before physical collection.
    response_deadline = models.DateField(db_index=True)
    initiated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="initiated_repossessions",
    )
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="completed_repossessions",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")
    asset_condition_on_return = models.CharField(
        max_length=20,
        choices=ContractReturnConditionStatus.choices,
        default=ContractReturnConditionStatus.NOT_ASSESSED,
    )
    recovery_notes = models.TextField(blank=True, default="")
    outstanding_balance_at_repossession = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "repossessions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["notice_issued_at"]),
            models.Index(fields=["response_deadline"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(outstanding_balance_at_repossession__gte=0)
                | Q(outstanding_balance_at_repossession__isnull=True),
                name="chk_repossession_balance_non_negative",
            ),
        ]

    def clean(self):
        errors = {}
        if not self.notice_issued_at:
            errors["notice_issued_at"] = "Notice issued timestamp is required — written notice must precede any repossession action."
        if not self.notice_issued_by_id:
            errors["notice_issued_by"] = "The officer who issued the notice is required."
        if not self.response_deadline:
            errors["response_deadline"] = "A response deadline is required before physical repossession can proceed."
        if self.status in {RepossessionStatus.IN_PROGRESS, RepossessionStatus.COMPLETED}:
            if not self.initiated_at:
                errors["initiated_at"] = "Initiation timestamp is required when repossession is in progress."
            if not self.initiated_by_id:
                errors["initiated_by"] = "Initiating officer is required when repossession is in progress."
        if self.status == RepossessionStatus.COMPLETED and not self.completed_at:
            errors["completed_at"] = "Completion timestamp is required when repossession is completed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Repossession sub={self.subscription_id} [{self.status}]"


# ---------------------------------------------------------------------------
# CTRL-CONS-1/2/3 — Consumer return window + defect classification + refund SLA
# CPA 2019 s.2(47) defect + Subidha's 7-day return window + refund SLA timer.
# ---------------------------------------------------------------------------


class DefectClaim(TimeStampedModel):
    """
    CPA 2019 s.2(47) defect classification. Tracks product defects reported
    within the return/exchange window with mandatory severity grading and SLA.
    """
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="defect_claims",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="filed_defect_claims",
    )
    severity = models.CharField(
        max_length=20,
        choices=DefectSeverity.choices,
        default=DefectSeverity.MINOR,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=DefectClaimStatus.choices,
        default=DefectClaimStatus.OPEN,
        db_index=True,
    )
    description = models.TextField()
    reported_at = models.DateTimeField(default=timezone.now, db_index=True)
    # CPA override: admin can flag a defect that mandates acceptance regardless
    # of the return window expiry (e.g. safety-critical issues).
    cpa_override = models.BooleanField(
        default=False,
        help_text="Set by admin to allow refund/exchange outside normal return window under CPA 2019.",
    )
    cpa_override_reason = models.TextField(blank=True, default="")
    cpa_override_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cpa_overridden_defect_claims",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="resolved_defect_claims",
    )
    resolution_notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "defect_claims"
        ordering = ["-reported_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["severity", "status"]),
            models.Index(fields=["reported_at"]),
        ]

    def clean(self):
        errors = {}
        if not self.description:
            errors["description"] = "Defect description is required."
        if self.cpa_override and not self.cpa_override_reason:
            errors["cpa_override_reason"] = "CPA override reason is required when override is set."
        if self.cpa_override and not self.cpa_override_by_id:
            errors["cpa_override_by"] = "CPA override must be authorised by an admin officer."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"DefectClaim sub={self.subscription_id} [{self.severity}/{self.status}]"



class ConsumerReturnRequest(TimeStampedModel):
    """
    CTRL-CONS-1 — enforces Subidha's 7-day return window and links to a
    DefectClaim so CPA 2019 defect override paths are fully audited.
    """

    RETURN_WINDOW_DAYS = 7

    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="return_requests",
    )
    defect_claim = models.ForeignKey(
        DefectClaim,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="return_requests",
    )
    status = models.CharField(
        max_length=20,
        choices=ReturnRequestStatus.choices,
        default=ReturnRequestStatus.OPEN,
        db_index=True,
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="filed_return_requests",
    )
    reason = models.TextField()
    requested_at = models.DateTimeField(default=timezone.now, db_index=True)
    delivery_date = models.DateField(
        help_text="Date the product was delivered — used to calculate the return window.",
    )
    # CTRL-CONS-3: refund_deadline is set on approval for SLA tracking.
    refund_deadline = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Latest date by which refund must be processed after return approval.",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_return_requests",
    )
    rejection_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "consumer_return_requests"
        ordering = ["-requested_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["refund_deadline"]),
            models.Index(fields=["delivery_date"]),
        ]

    @property
    def is_within_window(self) -> bool:
        from datetime import date
        return (date.today() - self.delivery_date).days <= self.RETURN_WINDOW_DAYS

    def clean(self):
        from datetime import date, timedelta
        errors = {}
        if not self.reason:
            errors["reason"] = "Return reason is required."
        if not self.delivery_date:
            errors["delivery_date"] = "Delivery date is required to evaluate the return window."
        if self.status == ReturnRequestStatus.APPROVED and not self.approved_by_id:
            errors["approved_by"] = "Approving officer is required when status is APPROVED."
        if self.status == ReturnRequestStatus.REJECTED and not self.rejection_reason:
            errors["rejection_reason"] = "Rejection reason is required when status is REJECTED."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        from datetime import date, timedelta
        if self.delivery_date and not self.pk:
            days_since = (date.today() - self.delivery_date).days
            has_cpa_override = (
                self.defect_claim_id
                and DefectClaim.objects.filter(pk=self.defect_claim_id, cpa_override=True).exists()
            )
            if days_since > self.RETURN_WINDOW_DAYS and not has_cpa_override:
                self.status = ReturnRequestStatus.OUTSIDE_WINDOW
            elif has_cpa_override:
                self.status = ReturnRequestStatus.CPA_OVERRIDE
            else:
                self.status = ReturnRequestStatus.WITHIN_WINDOW
        # Set refund SLA deadline (7 days from approval) — CTRL-CONS-3.
        if self.status == ReturnRequestStatus.APPROVED and not self.refund_deadline:
            from datetime import date, timedelta
            self.refund_deadline = date.today() + timedelta(days=7)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ReturnRequest sub={self.subscription_id} [{self.status}]"


# ---------------------------------------------------------------------------
# CTRL-RENT-5 — DepositForfeitureTaxInvoice
# When a security deposit is forfeited (tenant default / damage beyond wear),
# GST output tax must be raised on the forfeited amount.
# ---------------------------------------------------------------------------


