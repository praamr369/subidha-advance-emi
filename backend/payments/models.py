from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator, MinLengthValidator
from django.utils import timezone
from django.db.models import Q, F, Sum
from decimal import Decimal
from django.conf import settings
from subscriptions.enums import *
from lucky_plan.models import Batch
from subscriptions.base_models import (
    TimeStampedModel, MONEY_ZERO, HUNDRED, q2, _default_branch,
    product_image_upload_to, subscription_document_upload_to,
    customer_photo_upload_to, customer_kyc_doc_upload_to,
    
)

from uuid import uuid4

def generate_rent_lease_deposit_transaction_number() -> str:
    return f"RLD-{timezone.now():%Y%m%d%H%M%S%f}-{uuid4().hex[:8].upper()}"

def generate_rent_lease_collection_number() -> str:
    return f"RLC-{timezone.now():%Y%m%d%H%M%S%f}-{uuid4().hex[:8].upper()}"

class UnifiedCollectionIdempotency(TimeStampedModel):
    """
    Binds an optional client idempotency key to at most one successful unified collection
    response per user (Phase 9B).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="unified_collection_idempotency_keys",
    )
    key = models.CharField(max_length=160)
    fingerprint = models.CharField(max_length=64)
    status = models.CharField(
        max_length=16,
        choices=UnifiedCollectionIdempotencyStatus.choices,
        default=UnifiedCollectionIdempotencyStatus.PENDING,
        db_index=True,
    )
    response_body = models.JSONField(default=dict, blank=True)
    response_status = models.PositiveSmallIntegerField(default=200)

    class Meta:
        db_table = "unified_collection_idempotency"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "key"],
                name="uniq_unified_collection_idem_user_key",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.key[:24]}"



class RentLeaseBillingDemand(TimeStampedModel):
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="rent_lease_demands",
    )
    demand_type = models.CharField(
        max_length=24,
        choices=RentLeaseDemandType.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=16,
        choices=RentLeaseDemandStatus.choices,
        default=RentLeaseDemandStatus.PENDING,
        db_index=True,
    )
    billing_period_start = models.DateField(null=True, blank=True, db_index=True)
    billing_period_end = models.DateField(null=True, blank=True, db_index=True)
    due_date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    collected_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    held_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    refundable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    deducted_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    reference_key = models.CharField(max_length=80, unique=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    tax_profile_snapshot = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "rent_lease_billing_demands"
        ordering = ["-due_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "demand_type"]),
            models.Index(fields=["status", "due_date"]),
            models.Index(fields=["billing_period_start", "billing_period_end"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=MONEY_ZERO),
                name="chk_rent_lease_demand_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(collected_amount__gte=MONEY_ZERO),
                name="chk_rent_lease_demand_collected_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(deducted_amount__gte=MONEY_ZERO),
                name="chk_rent_lease_demand_deducted_non_negative",
            ),
        ]

    def clean(self):
        errors = {}
        if self.subscription_id and self.subscription.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            errors["subscription"] = "Rent/lease billing demands can only be linked to RENT or LEASE subscriptions."
        if self.amount < MONEY_ZERO:
            errors["amount"] = "Demand amount cannot be negative."
        if self.collected_amount < MONEY_ZERO:
            errors["collected_amount"] = "Collected amount cannot be negative."
        if self.collected_amount > self.amount:
            errors["collected_amount"] = "Collected amount cannot exceed demand amount."
        if self.deducted_amount < MONEY_ZERO:
            errors["deducted_amount"] = "Deducted amount cannot be negative."
        if self.refundable_amount < MONEY_ZERO:
            errors["refundable_amount"] = "Refundable amount cannot be negative."
        if self.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
            if self.billing_period_start or self.billing_period_end:
                errors["billing_period_start"] = "Security deposit demand must not set monthly billing period."
        else:
            if not self.billing_period_start or not self.billing_period_end:
                errors["billing_period_start"] = "Monthly demands require billing period start/end."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_key = (self.reference_key or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def outstanding_amount(self) -> Decimal:
        return q2(max(q2(self.amount) - q2(self.collected_amount), MONEY_ZERO))



class RentLeaseDepositTransaction(TimeStampedModel):
    transaction_number = models.CharField(
        max_length=64,
        db_index=True,
        default=generate_rent_lease_deposit_transaction_number,
    )
    external_reference_no = models.CharField(max_length=120, blank=True, default="", db_index=True)
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="deposit_transactions",
    )
    demand = models.ForeignKey(
        RentLeaseBillingDemand,
        on_delete=models.PROTECT,
        related_name="deposit_transactions",
        null=True,
        blank=True,
    )
    inspection = models.ForeignKey("deliveries.RentLeaseReturnInspection",
        on_delete=models.PROTECT,
        related_name="deposit_transactions",
        null=True,
        blank=True,
    )
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="rent_lease_deposit_transactions",
        null=True,
        blank=True,
    )
    plan_type = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        blank=True,
        default="",
        db_index=True,
    )
    transaction_type = models.CharField(
        max_length=24,
        choices=RentLeaseDepositTransactionType.choices,
        db_index=True,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    transaction_date = models.DateField(null=True, blank=True, db_index=True)
    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        blank=True,
        default="",
        db_index=True,
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="rent_lease_deposit_transactions",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=16,
        choices=RentLeaseDepositTransactionStatus.choices,
        default=RentLeaseDepositTransactionStatus.ACTIVE,
        db_index=True,
    )
    idempotency_key = models.CharField(max_length=160, blank=True, default="", db_index=True)
    reason = models.TextField(blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_deposit_transactions",
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="performed_deposit_transactions",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_deposit_source_transactions",
    )
    metadata = models.JSONField(default=dict, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True, db_index=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="voided_deposit_source_transactions",
    )
    void_reason = models.TextField(blank=True, default="")
    reversal_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    SOURCE_TRANSACTION_TYPES = (
        RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
        RentLeaseDepositTransactionType.DEPOSIT_REFUND,
        RentLeaseDepositTransactionType.DEPOSIT_ADJUSTMENT,
    )

    IMMUTABLE_FIELDS = (
        "transaction_number",
        "external_reference_no",
        "subscription_id",
        "demand_id",
        "inspection_id",
        "customer_id",
        "plan_type",
        "transaction_type",
        "amount",
        "transaction_date",
        "payment_method",
        "finance_account_id",
        "idempotency_key",
        "created_by_id",
    )

    class Meta:
        db_table = "rent_lease_deposit_transactions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "transaction_type"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["customer", "transaction_date"]),
            models.Index(fields=["plan_type", "status", "transaction_date"]),
            models.Index(fields=["finance_account", "transaction_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=MONEY_ZERO),
                name="chk_deposit_transaction_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(plan_type="") | Q(plan_type=PlanType.RENT) | Q(plan_type=PlanType.LEASE),
                name="chk_deposit_transaction_plan_type",
            ),
            models.UniqueConstraint(
                fields=["transaction_number"],
                condition=~Q(transaction_number=""),
                name="uq_deposit_transaction_number",
            ),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uq_deposit_transaction_idempotency_key",
            ),
            models.UniqueConstraint(
                fields=["external_reference_no"],
                condition=~Q(external_reference_no=""),
                name="uq_deposit_transaction_external_ref",
            ),
        ]

    def clean(self):
        errors = {}
        if self.subscription_id and self.subscription.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            errors["subscription"] = "Deposit transactions are supported only for RENT/LEASE subscriptions."
        if self.subscription_id:
            if self.plan_type and self.subscription.plan_type != self.plan_type:
                errors["subscription"] = "Subscription plan type mismatch."
            if self.customer_id and self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer mismatch."
        if self.demand_id:
            if self.subscription_id and self.demand.subscription_id != self.subscription_id:
                errors["demand"] = "Demand subscription mismatch."
            if self.demand.demand_type != RentLeaseDemandType.SECURITY_DEPOSIT:
                errors["demand"] = "Deposit transaction must link to a security deposit demand."
        if self.amount < MONEY_ZERO:
            errors["amount"] = "Amount cannot be negative."
        if self.transaction_type in {
            RentLeaseDepositTransactionType.DEDUCTION,
            RentLeaseDepositTransactionType.DEPOSIT_ADJUSTMENT,
        } and not (self.reason or "").strip():
            errors["reason"] = "Deduction requires a reason."
        if self.transaction_type in self.SOURCE_TRANSACTION_TYPES:
            if self.amount <= MONEY_ZERO:
                errors["amount"] = "Source transaction amount must be greater than zero."
            if not self.transaction_date:
                errors["transaction_date"] = "Source transaction date is required."
            if not self.customer_id:
                errors["customer"] = "Customer is required for deposit source evidence."
            if not self.plan_type:
                errors["plan_type"] = "Plan type is required for deposit source evidence."
            if self.transaction_type in {
                RentLeaseDepositTransactionType.DEPOSIT_RECEIPT,
                RentLeaseDepositTransactionType.DEPOSIT_REFUND,
            }:
                if not self.finance_account_id:
                    errors["finance_account"] = "Finance account is required for deposit source evidence."
                if not self.payment_method:
                    errors["payment_method"] = "Payment method is required for deposit source evidence."
        if self.status in {
            RentLeaseDepositTransactionStatus.VOIDED,
            RentLeaseDepositTransactionStatus.REVERSED,
        }:
            if not self.voided_at:
                errors["voided_at"] = "Timestamp is required."
            if not (self.void_reason or "").strip():
                errors["void_reason"] = "Reason is required."
        if self.pk:
            existing = self.__class__.objects.filter(pk=self.pk).first()
            if existing and existing.transaction_type in self.SOURCE_TRANSACTION_TYPES:
                for field in self.IMMUTABLE_FIELDS:
                    old_value = getattr(existing, field)
                    new_value = getattr(self, field)
                    if field == "amount":
                        old_value = q2(Decimal(str(old_value or MONEY_ZERO)))
                        new_value = q2(Decimal(str(new_value or MONEY_ZERO)))
                    if old_value != new_value:
                        errors[field.removesuffix("_id")] = "Deposit source evidence is immutable once created."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.transaction_number = (self.transaction_number or generate_rent_lease_deposit_transaction_number()).strip().upper()
        self.external_reference_no = (self.external_reference_no or "").strip().upper()
        self.plan_type = (self.plan_type or "").strip().upper()
        self.transaction_type = (self.transaction_type or "").strip().upper()
        self.payment_method = (self.payment_method or "").strip().upper()
        self.status = (self.status or RentLeaseDepositTransactionStatus.ACTIVE).strip().upper()
        self.idempotency_key = (self.idempotency_key or "").strip()
        self.reason = (self.reason or "").strip()
        self.void_reason = (self.void_reason or "").strip()
        self.reversal_reference = (self.reversal_reference or "").strip().upper()
        self.amount = q2(Decimal(str(self.amount or MONEY_ZERO)))
        if self.subscription_id:
            if not self.customer_id:
                self.customer_id = self.subscription.customer_id
            if not self.plan_type:
                self.plan_type = self.subscription.plan_type
        if self.transaction_type in self.SOURCE_TRANSACTION_TYPES and not self.transaction_date:
            self.transaction_date = timezone.localdate()
        self.full_clean()
        super().save(*args, **kwargs)



class Emi(TimeStampedModel):
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="emis",
    )
    month_no = models.PositiveIntegerField()
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=EmiStatus.choices,
        default=EmiStatus.PENDING,
        db_index=True,
    )

    class Meta:
        db_table = "emis"
        ordering = ["subscription_id", "month_no"]
        unique_together = ("subscription", "month_no")
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["subscription", "month_no"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_emi_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(month_no__gt=0),
                name="chk_emi_month_positive",
            ),
        ]

    def clean(self):
        if self.amount is None or self.amount <= MONEY_ZERO:
            raise ValidationError({"amount": "EMI amount must be greater than zero."})

        if self.month_no <= 0:
            raise ValidationError({"month_no": "Month number must be greater than zero."})

        if self.subscription_id:
            if self.month_no > self.subscription.tenure_months:
                raise ValidationError(
                    {"month_no": "Month number cannot exceed subscription tenure."}
                )

    def save(self, *args, **kwargs):
        # PAID and WAIVED EMIs are immutable — status can only be changed through
        # an explicit reversal/correction via the service layer to preserve the
        # payment audit trail. Direct reversion to PENDING would orphan receipts.
        if self.pk:
            existing = Emi.objects.filter(pk=self.pk).only("status").first()
            if existing is not None and existing.status in {EmiStatus.PAID, EmiStatus.WAIVED}:
                if getattr(self, "status", None) != existing.status:
                    raise ValidationError(
                        {"status": f"EMI is immutable once it reaches {existing.status}. Use a service-layer correction."}
                    )
        self.full_clean()
        super().save(*args, **kwargs)

    def net_paid_amount(self) -> Decimal:
        # Fast path: when ledger_entries are prefetched (list views / bulk loops)
        # self.ledger_entries.all() returns the cached queryset — zero extra queries.
        if "ledger_entries" in getattr(self, "_prefetched_objects_cache", {}):
            paid = MONEY_ZERO
            reversed_ = MONEY_ZERO
            for entry in self.ledger_entries.all():
                if entry.entry_type == LedgerEntryType.EMI_PAYMENT:
                    paid += Decimal(str(entry.amount or MONEY_ZERO))
                elif entry.entry_type == LedgerEntryType.PAYMENT_REVERSAL:
                    reversed_ += Decimal(str(entry.amount or MONEY_ZERO))
            return q2(max(q2(paid) - q2(reversed_), MONEY_ZERO))

        # Slow path: aggregate queries for single-object detail (no prefetch).
        effective_paid = (
            FinancialLedger.objects.filter(
                emi=self,
                entry_type=LedgerEntryType.EMI_PAYMENT,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        reversal_total = (
            FinancialLedger.objects.filter(
                emi=self,
                entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            ).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

        net_paid = q2(Decimal(str(effective_paid)) - Decimal(str(reversal_total)))
        return q2(max(net_paid, MONEY_ZERO))

    def total_paid(self) -> Decimal:
        return self.net_paid_amount()

    def balance_amount(self) -> Decimal:
        balance = q2(self.amount) - q2(self.net_paid_amount())
        return q2(max(balance, MONEY_ZERO))

    def is_fully_paid(self) -> bool:
        return self.balance_amount() <= MONEY_ZERO

    def is_overdue(self) -> bool:
        return self.status == EmiStatus.PENDING and self.due_date < timezone.localdate()

    def __str__(self):
        return f"EMI #{self.month_no} - Subscription {self.subscription_id}"


# =====================================================
# PAYMENT
# =====================================================


class Payment(TimeStampedModel):
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="payments",
    )
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="payments",
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subscription_payments",
    )
    method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    reference_no = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    payment_date = models.DateField(db_index=True)
    plan_type_hint = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    allocation_metadata = models.JSONField(default=dict, blank=True)
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="collected_payments",
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="verified_payments",
    )
    # CTRL-PAY-1 — idempotency key prevents duplicate submissions.
    idempotency_key = models.CharField(
        max_length=160,
        blank=True,
        default="",
        db_index=True,
        help_text="Caller-supplied idempotency key; duplicate submissions with the same key are rejected.",
    )

    class Meta:
        db_table = "payments"
        ordering = ["-payment_date", "-id"]
        indexes = [
            models.Index(fields=["payment_date"]),
            models.Index(fields=["method"]),
            models.Index(fields=["subscription"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["emi"]),
            models.Index(fields=["branch", "payment_date"]),
            models.Index(fields=["cash_counter", "payment_date"]),
            models.Index(fields=["finance_account", "payment_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference_no"],
                condition=Q(reference_no__isnull=False),
                name="uq_payment_reference_no",
            ),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uq_payment_idempotency_key",
            ),
            # CTRL-LP-8 note: the former uq_payment_per_emi constraint was removed to
            # support partial and split-tender collections (e.g. part CASH + part UPI
            # against the same EMI month). The payment → EMI → Subscription → LuckyId
            # audit trail is preserved per payment row; over-collection is guarded in
            # record_emi_payment via the EMI outstanding-balance check.
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_payment_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}

        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Payment amount must be greater than zero."

        if not self.payment_date:
            errors["payment_date"] = "Payment date is required."

        if self.subscription_id and self.customer_id:
            if self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer does not match the selected subscription."

        if self.emi_id:
            if self.subscription_id and self.emi.subscription_id != self.subscription_id:
                errors["emi"] = "Selected EMI does not belong to the selected subscription."
            if self.customer_id and self.emi.subscription.customer_id != self.customer_id:
                errors["emi"] = "Selected EMI does not belong to the selected customer."
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected counter must belong to the payment branch."
        if self.finance_account_id:
            if not self.finance_account.is_active:
                errors["finance_account"] = "Selected finance account must be active."
            finance_branch_id = getattr(self.finance_account, "branch_id", None)
            if self.branch_id and finance_branch_id and self.branch_id != finance_branch_id:
                errors["finance_account"] = "Selected finance account must belong to the payment branch."

        if self.reference_no is not None:
            self.reference_no = self.reference_no.strip() or None

        # Income Tax Act 1961, s.269ST — cash receipts ≥ ₹2,00,000 are prohibited.
        if self.method == PaymentMethod.CASH and self.amount and self.amount >= Decimal("200000.00"):
            errors["amount"] = (
                "Cash payment of ₹2,00,000 or more is prohibited under Income Tax Act s.269ST. "
                "Use UPI, bank transfer, or card."
            )

        if errors:
            raise ValidationError(errors)

    def delete(self, *args, **kwargs):
        raise ValidationError(
            "Payment records are permanent financial evidence and cannot be deleted. "
            "Use a reversal entry to correct errors."
        )

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        if not self.plan_type_hint and self.subscription_id:
            self.plan_type_hint = self.subscription.plan_type
        if self.branch_id is None:
            self.branch = (
                getattr(self.cash_counter, "branch", None)
                or getattr(self.subscription, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment #{self.pk} - {self.amount}"



class CustomerAdvance(TimeStampedModel):
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="customer_advances",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="customer_advances",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advances",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advances",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    unapplied_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    reference_no = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    payment_date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=CustomerAdvanceStatus.choices,
        default=CustomerAdvanceStatus.UNAPPLIED,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    allocation_metadata = models.JSONField(default=dict, blank=True)
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advances_collected",
    )

    class Meta:
        db_table = "customer_advances"
        ordering = ["-payment_date", "-id"]
        indexes = [
            models.Index(fields=["customer", "payment_date"]),
            models.Index(fields=["finance_account", "payment_date"]),
            models.Index(fields=["status", "payment_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["reference_no"],
                condition=Q(reference_no__isnull=False),
                name="uq_customer_advance_reference_no",
            ),
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_customer_advance_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(unapplied_amount__gte=0),
                name="chk_customer_advance_unapplied_non_negative",
            ),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Advance amount must be greater than zero."
        if self.unapplied_amount is None or self.unapplied_amount < MONEY_ZERO:
            errors["unapplied_amount"] = "Unapplied amount cannot be negative."
        if (
            self.amount is not None
            and self.unapplied_amount is not None
            and self.unapplied_amount > self.amount
        ):
            errors["unapplied_amount"] = "Unapplied amount cannot exceed advance amount."
        if not self.payment_date:
            errors["payment_date"] = "Payment date is required."
        if self.cash_counter_id:
            counter_branch_id = getattr(self.cash_counter, "branch_id", None)
            if self.branch_id and counter_branch_id and self.branch_id != counter_branch_id:
                errors["cash_counter"] = "Selected counter must belong to the advance branch."
        if self.finance_account_id:
            if not self.finance_account.is_active:
                errors["finance_account"] = "Selected finance account must be active."
            finance_branch_id = getattr(self.finance_account, "branch_id", None)
            if self.branch_id and finance_branch_id and self.branch_id != finance_branch_id:
                errors["finance_account"] = "Selected finance account must belong to the advance branch."
        if self.reference_no is not None:
            self.reference_no = self.reference_no.strip() or None
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.notes = (self.notes or "").strip()
        if self.pk is None and self.unapplied_amount is None:
            self.unapplied_amount = self.amount
        if self.branch_id is None:
            self.branch = (
                getattr(self.cash_counter, "branch", None)
                or getattr(self.finance_account, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Advance #{self.pk} - {self.amount}"



class CustomerAdvanceAllocation(TimeStampedModel):
    advance = models.ForeignKey(
        CustomerAdvance,
        on_delete=models.PROTECT,
        related_name="allocations",
    )
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="advance_allocations",
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="advance_allocations",
    )
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advance_allocation",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    allocated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_advance_allocations",
    )
    allocation_date = models.DateField(db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "customer_advance_allocations"
        ordering = ["-allocation_date", "-id"]
        indexes = [
            models.Index(fields=["advance", "allocation_date"]),
            models.Index(fields=["subscription", "allocation_date"]),
            models.Index(fields=["emi", "allocation_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_customer_advance_allocation_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Allocation amount must be greater than zero."
        if not self.allocation_date:
            errors["allocation_date"] = "Allocation date is required."
        if self.emi_id and self.subscription_id and self.emi.subscription_id != self.subscription_id:
            errors["emi"] = "Selected EMI must belong to the selected subscription."
        if self.subscription_id and self.advance_id:
            if self.subscription.customer_id != self.advance.customer_id:
                errors["subscription"] = "Advance can be allocated only within the same customer."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Advance Allocation #{self.pk} - {self.amount}"
# =====================================================
# PAYMENT RECONCILIATION
# =====================================================


class PaymentReconciliation(models.Model):
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        related_name="reconciliation",
    )

    matched_emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reconciliations",
    )

    status = models.CharField(
        max_length=20,
        choices=ReconciliationStatus.choices,
        default=ReconciliationStatus.PENDING,
        db_index=True,
    )

    expected_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )

    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )

    variance_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )

    is_flagged = models.BooleanField(default=False, db_index=True)
    is_locked = models.BooleanField(default=False, db_index=True)

    notes = models.TextField(blank=True, default="")

    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reconciliations_done",
    )

    reconciled_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_reconciliations"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["is_flagged"]),
            models.Index(fields=["is_locked"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["payment"]),
            models.Index(fields=["matched_emi"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(expected_amount__gte=0),
                name="chk_reconciliation_expected_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(paid_amount__gte=0),
                name="chk_reconciliation_paid_non_negative",
            ),
        ]

    def clean(self):
        errors = {}

        if self.payment_id:
            if self.paid_amount != self.payment.amount:
                errors["paid_amount"] = "Paid amount must match payment amount."

            if self.matched_emi_id and self.payment.subscription_id != self.matched_emi.subscription_id:
                errors["matched_emi"] = "Matched EMI must belong to the payment subscription."

        if self.expected_amount is not None and self.expected_amount < MONEY_ZERO:
            errors["expected_amount"] = "Expected amount cannot be negative."

        if self.paid_amount is not None and self.paid_amount < MONEY_ZERO:
            errors["paid_amount"] = "Paid amount cannot be negative."

        if self.is_locked and not self.reconciled_at:
            errors["reconciled_at"] = "Locked reconciliation must have reconciled timestamp."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.payment_id and self.paid_amount in (None, MONEY_ZERO):
            self.paid_amount = self.payment.amount

        if self.expected_amount is None:
            self.expected_amount = MONEY_ZERO

        if self.variance_amount is None:
            self.variance_amount = MONEY_ZERO

        self.full_clean()
        super().save(*args, **kwargs)

    def recompute_variance(self):
        self.variance_amount = q2(self.paid_amount - self.expected_amount)
        return self.variance_amount

    def __str__(self):
        return f"Payment {self.payment_id} - {self.status}"



class PaymentReconciliationEvent(models.Model):
    reconciliation = models.ForeignKey(
        PaymentReconciliation,
        on_delete=models.CASCADE,
        related_name="events",
    )

    event_type = models.CharField(
        max_length=30,
        choices=ReconciliationEventType.choices,
        db_index=True,
    )

    old_status = models.CharField(max_length=20, blank=True, default="")
    new_status = models.CharField(max_length=20, blank=True, default="")

    message = models.TextField(blank=True, default="")

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payment_reconciliation_events",
    )

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "payment_reconciliation_events"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["event_type"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["reconciliation"]),
        ]

    def __str__(self):
        return f"Reconciliation {self.reconciliation_id} - {self.event_type}"   


class PartnerCollectionRequest(models.Model):
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="partner_collection_requests",
    )

    subscription = models.ForeignKey(
        "contracts.Subscription",
        on_delete=models.PROTECT,
        related_name="partner_collection_requests",
    )

    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="partner_collection_requests",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        db_index=True,
    )

    payment_date = models.DateField(db_index=True)

    reference_no = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_index=True,
    )

    notes = models.TextField(blank=True, default="")

    status = models.CharField(
        max_length=20,
        choices=PartnerCollectionRequestStatus.choices,
        default=PartnerCollectionRequestStatus.SUBMITTED,
        db_index=True,
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_partner_collection_requests",
    )

    reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    review_note = models.TextField(blank=True, default="")

    approved_payment = models.OneToOneField(
        "payments.Payment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="partner_collection_request",
    )

    approved_emi = models.ForeignKey(
        "payments.Emi",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="partner_collection_requests_approved",
    )

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "partner_collection_requests"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="chk_partner_collection_request_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}

        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Amount must be greater than zero."

        if not self.payment_date:
            errors["payment_date"] = "Payment date is required."

        if self.partner_id and getattr(self.partner, "role", None) != "PARTNER":
            errors["partner"] = "Only partner users can create partner collection requests."

        if self.subscription_id and self.customer_id:
            if self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer must match subscription."

        if self.subscription_id and self.partner_id:
            if self.subscription.partner_id != self.partner_id:
                errors["subscription"] = "Subscription must belong to the requesting partner."

        if self.approved_payment_id and self.status != PartnerCollectionRequestStatus.APPROVED:
            errors["status"] = "Approved payment can only exist for approved requests."

        if self.approved_emi_id and self.approved_payment_id:
            if self.approved_payment.emi_id and self.approved_payment.emi_id != self.approved_emi_id:
                errors["approved_emi"] = "Approved EMI must match approved payment EMI."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.notes = (self.notes or "").strip()
        self.review_note = (self.review_note or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PartnerCollectionRequest #{self.pk} - Subscription {self.subscription_id}"



# =====================================================
# DRAW COORDINATION (Pass 7 — immutable eligibility + commit)
# =====================================================



class FinancialLedger(TimeStampedModel):
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        related_name="ledger_entry",
        null=True,
        blank=True,
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        related_name="ledger_entries",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    entry_type = models.CharField(
        max_length=20,
        choices=LedgerEntryType.choices,
        default=LedgerEntryType.EMI_PAYMENT,
        db_index=True,
    )
    entry_direction = models.CharField(
        max_length=10,
        choices=LedgerDirection.choices,
        db_index=True,
    )
    plan_type_hint = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    allocation_context = models.JSONField(default=dict, blank=True)
    journal_group = models.ForeignKey(
        "accounting.JournalEntryGroup",
        on_delete=models.PROTECT,
        related_name="financial_ledger_entries",
        null=True,
        blank=True,
    )
    posting_side = models.CharField(max_length=6, blank=True, default="")
    posting_status = models.CharField(max_length=16, default="POSTED", db_index=True)
    posted_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "financial_ledger"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["emi"]),
            models.Index(fields=["entry_type"]),
            models.Index(fields=["entry_direction"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="ledger_amount_non_negative",
            )
        ]

    def clean(self):
        errors = {}

        if self.amount is None or self.amount < MONEY_ZERO:
            errors["amount"] = "Ledger amount cannot be negative."

        if self.payment_id and self.emi_id and self.payment.emi_id:
            if self.payment.emi_id != self.emi_id:
                errors["emi"] = "Ledger EMI must match payment EMI."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.pk:
            existing = FinancialLedger.objects.filter(pk=self.pk).only("posted_at").first()
            if existing and existing.posted_at != self.posted_at:
                raise ValidationError({"posted_at": "posted_at is immutable once set."})
        if not self.posting_side:
            self.posting_side = (self.entry_direction or "").upper()
        self.posting_status = (self.posting_status or "POSTED").strip().upper()
        if not self.plan_type_hint and self.emi_id:
            self.plan_type_hint = self.emi.subscription.plan_type
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.entry_type} - {self.amount}"




    

# ================================
# COMMISSION SYSTEM (ADDITIVE)
# ================================





class RecoveryCase(TimeStampedModel):
    subscription = models.OneToOneField('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="recovery_case",
    )
    stage = models.CharField(
        max_length=20,
        choices=RecoveryStage.choices,
        default=RecoveryStage.IDENTIFIED,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_recovery_cases",
    )
    overdue_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    overdue_emis = models.PositiveIntegerField(default=0)
    first_overdue_date = models.DateField(null=True, blank=True, db_index=True)
    notice_sent_at = models.DateTimeField(null=True, blank=True)
    field_visit_at = models.DateTimeField(null=True, blank=True)
    legal_at = models.DateTimeField(null=True, blank=True)
    settled_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    settlement_type = models.CharField(
        max_length=10,
        choices=[("FULL", "Full Settlement"), ("PARTIAL", "Partial Settlement")],
        blank=True,
        default="",
    )
    settled_at = models.DateTimeField(null=True, blank=True)

    # Settlement approval workflow
    settlement_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_settlements",
    )
    settlement_requested_at = models.DateTimeField(null=True, blank=True)
    settlement_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_settlements",
    )
    settlement_approved_at = models.DateTimeField(null=True, blank=True)
    settlement_notes = models.TextField(blank=True, default="")
    settlement_approval_notes = models.TextField(blank=True, default="")

    notes = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    last_contact_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "subscriptions_recovery_cases"
        ordering = ["-first_overdue_date", "-id"]
        indexes = [
            models.Index(fields=["stage", "first_overdue_date"]),
            models.Index(fields=["assigned_to", "stage"]),
        ]

    def __str__(self):
        return f"RecoveryCase#{self.pk} Sub#{self.subscription_id} [{self.stage}]"

    @property
    def aging_days(self) -> int:
        if not self.first_overdue_date:
            return 0
        return (timezone.localdate() - self.first_overdue_date).days

    @property
    def aging_bucket(self) -> str:
        days = self.aging_days
        if days <= 30:
            return "0-30"
        if days <= 60:
            return "31-60"
        if days <= 90:
            return "61-90"
        if days <= 120:
            return "91-120"
        return "120+"

    def is_settlement_requested(self) -> bool:
        return self.settlement_requested_at is not None

    def is_settlement_approved(self) -> bool:
        return self.settlement_approved_at is not None

    def can_request_settlement(self) -> bool:
        return self.stage in [RecoveryStage.IDENTIFIED, RecoveryStage.NOTICE_SENT]


# ---------------------------------------------------------------------------
# EMIScheme — festival / promotional scheme engine
# ---------------------------------------------------------------------------


class EMIScheme(TimeStampedModel):
    name = models.CharField(max_length=200, db_index=True)
    code = models.CharField(max_length=40, unique=True, db_index=True)
    plan_type = models.CharField(
        max_length=12,
        choices=PlanType.choices,
        blank=True,
        default="",
        help_text="Leave blank to apply to all plan types.",
    )
    discount_type = models.CharField(
        max_length=24,
        choices=SchemeDiscountType.choices,
        default=SchemeDiscountType.PERCENT,
    )
    value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Percent value, flat rupee amount, or number of installments to waive.",
    )
    valid_from = models.DateField(db_index=True)
    valid_to = models.DateField(db_index=True)
    applicable_products = models.ManyToManyField('products_core.Product',
        blank=True,
        related_name="emi_schemes",
        help_text="Leave empty to apply to all products.",
    )
    max_uses = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of subscriptions this scheme can be applied to. Null = unlimited.",
    )
    used_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    description = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_emi_schemes",
    )

    class Meta:
        db_table = "subscriptions_emi_schemes"
        ordering = ["-valid_from", "-id"]
        indexes = [
            models.Index(fields=["is_active", "valid_from", "valid_to"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def clean(self):
        self.name = (self.name or "").strip()
        self.code = (self.code or "").strip().upper()
        if self.valid_to and self.valid_from and self.valid_to < self.valid_from:
            raise ValidationError({"valid_to": "End date must be on or after start date."})
        if not self.name:
            raise ValidationError({"name": "Scheme name is required."})
        if not self.code:
            raise ValidationError({"code": "Scheme code is required."})

    @property
    def is_currently_active(self) -> bool:
        today = timezone.localdate()
        if not self.is_active:
            return False
        if self.valid_from and today < self.valid_from:
            return False
        if self.valid_to and today > self.valid_to:
            return False
        if self.max_uses is not None and self.used_count >= self.max_uses:
            return False
        return True


# ─────────────────────────────────────────────────────────────────────────────
# AML Screening Records
# ─────────────────────────────────────────────────────────────────────────────


class EmiWaiverSettlement(TimeStampedModel):
    lucky_draw = models.ForeignKey('lucky_plan.LuckyDraw',
        on_delete=models.PROTECT,
        related_name="waiver_settlements",
    )
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="waiver_settlements",
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        related_name="waiver_settlements",
    )
    waived_amount = models.DecimalField(max_digits=12, decimal_places=2)
    settlement_date = models.DateField(db_index=True)
    settled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="emi_waiver_settlements",
    )
    notes = models.TextField(blank=True, default="")

    IMMUTABLE_FIELDS = (
        "lucky_draw_id",
        "subscription_id",
        "emi_id",
        "waived_amount",
        "settlement_date",
        "settled_by_id",
    )

    class Meta:
        db_table = "emi_waiver_settlements"
        unique_together = ("lucky_draw", "emi")
        ordering = ["-settlement_date", "-id"]
        indexes = [
            models.Index(fields=["subscription", "settlement_date"]),
            models.Index(fields=["lucky_draw"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(waived_amount__gt=0),
                name="chk_emi_waiver_settlement_amount_positive",
            ),
        ]

    def clean(self):
        errors = {}
        if self.waived_amount is not None and self.waived_amount <= MONEY_ZERO:
            errors["waived_amount"] = "Waived amount must be greater than zero."
        if self.emi_id and self.subscription_id:
            if self.emi.subscription_id != self.subscription_id:
                errors["emi"] = "EMI must belong to the given subscription."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.pk:
            existing = EmiWaiverSettlement.objects.filter(pk=self.pk).values(*self.IMMUTABLE_FIELDS).first()
            if existing:
                for field in self.IMMUTABLE_FIELDS:
                    if getattr(self, field) != existing[field]:
                        raise ValidationError(
                            {field: f"EmiWaiverSettlement.{field} is immutable once created."}
                        )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"WaiverSettlement draw={self.lucky_draw_id} emi={self.emi_id} ₹{self.waived_amount}"


# ---------------------------------------------------------------------------
# CTRL-LP-7 — grace_days on Batch
# Grace period (days after due_date before EMI flips to OVERDUE) is defined per
# batch so it is set at product inception, not silently defaulted.
# ---------------------------------------------------------------------------
# NOTE: grace_days is added to the Batch model via migration (field added below
# as a mixin approach is not available); patched onto the class here.

Batch.add_to_class(
    "grace_days",
    models.PositiveSmallIntegerField(
        default=7,
        help_text="Days after EMI due_date before status flips to OVERDUE (CTRL-LP-7).",
    ),
)


# ---------------------------------------------------------------------------
# CTRL-RENT-8 — Repossession
# Written-notice-first repossession workflow for rent/lease contracts.
# ---------------------------------------------------------------------------


class DepositForfeitureTaxInvoice(TimeStampedModel):
    """
    CTRL-RENT-5: Tax invoice raised when a rental/lease security deposit
    is forfeited, capturing output GST liability on the forfeited amount.
    """
    subscription = models.ForeignKey('contracts.Subscription',
        on_delete=models.PROTECT,
        related_name="deposit_forfeiture_invoices",
    )
    invoice_number = models.CharField(max_length=40, unique=True, db_index=True)
    invoice_date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=DepositForfeitureStatus.choices,
        default=DepositForfeitureStatus.DRAFT,
        db_index=True,
    )
    forfeited_amount = models.DecimalField(max_digits=12, decimal_places=2)
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("18.00"),
        help_text="GST rate applicable on the forfeited deposit (%).",
    )
    cgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    sgst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    igst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_invoice_amount = models.DecimalField(max_digits=12, decimal_places=2)
    forfeiture_reason = models.TextField()
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="issued_forfeiture_invoices",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_forfeiture_invoices",
    )
    cancel_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "deposit_forfeiture_tax_invoices"
        ordering = ["-invoice_date", "-id"]
        indexes = [
            models.Index(fields=["subscription", "status"]),
            models.Index(fields=["invoice_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(forfeited_amount__gt=0),
                name="chk_forfeiture_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(total_invoice_amount__gt=0),
                name="chk_forfeiture_total_positive",
            ),
        ]

    def clean(self):
        errors = {}
        if not self.forfeiture_reason:
            errors["forfeiture_reason"] = "Forfeiture reason is required."
        if self.subscription_id and self.subscription.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            errors["subscription"] = "Deposit forfeiture invoices apply only to RENT or LEASE contracts."
        if self.status == DepositForfeitureStatus.CANCELLED and not self.cancel_reason:
            errors["cancel_reason"] = "Cancellation reason is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # Auto-compute GST split on draft creation.
        if self.forfeited_amount and self.gst_rate:
            tax = (self.forfeited_amount * self.gst_rate / Decimal("100")).quantize(Decimal("0.01"))
            half = (tax / 2).quantize(Decimal("0.01"))
            # Intra-state: CGST + SGST; inter-state: IGST only.
            if self.igst_amount and self.igst_amount > MONEY_ZERO:
                self.igst_amount = tax
                self.cgst_amount = MONEY_ZERO
                self.sgst_amount = MONEY_ZERO
            else:
                self.cgst_amount = half
                self.sgst_amount = tax - half
                self.igst_amount = MONEY_ZERO
            self.total_tax_amount = tax
            self.total_invoice_amount = self.forfeited_amount + tax
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ForfeitureInv {self.invoice_number} sub={self.subscription_id} [{self.status}]"


# ============================================================
# Partner → Customer KYC / Login Request
# ============================================================


class CashDeskTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_cashdesktimestampedmodel"

        abstract = True


# ─────────────────────────────────────────────
# CashCounterSession
# ─────────────────────────────────────────────


class CashCounterSession(CashDeskTimeStampedModel):
    """One cashier's shift on one cash counter for one date."""

    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        related_name="cash_counter_sessions",
    )
    cash_counter = models.ForeignKey(
        "branch_control.CashCounter",
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_counter_sessions",
    )

    session_date = models.DateField(db_index=True)
    opened_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)

    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    declared_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    variance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(
        max_length=28,
        choices=CashCounterSessionStatus.choices,
        default=CashCounterSessionStatus.OPEN,
        db_index=True,
    )

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_sessions_opened",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_sessions_closed",
        null=True,
        blank=True,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_sessions_approved",
        null=True,
        blank=True,
    )

    # FK to the P2A approval request if variance required one
    variance_approval_request_id = models.IntegerField(null=True, blank=True)

    notes = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_cash_counter_sessions"
        ordering = ["-session_date", "-opened_at", "-id"]
        indexes = [
            models.Index(fields=["session_date", "status"], name="ctrl_ccs_date_status_idx"),
            models.Index(fields=["cash_counter", "session_date"], name="ctrl_ccs_counter_date_idx"),
            models.Index(fields=["cashier", "session_date"], name="ctrl_ccs_cashier_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["cash_counter", "cashier", "session_date"],
                condition=models.Q(status="OPEN"),
                name="ctrl_ccs_unique_open_per_counter_cashier_date",
            ),
        ]

    def __str__(self):
        return (
            f"CashCounterSession[{self.cash_counter_id}] {self.session_date} "
            f"cashier={self.cashier_id} status={self.status}"
        )


# ─────────────────────────────────────────────
# DailyCloseRun
# ─────────────────────────────────────────────


class DailyCloseRun(TimeStampedModel):
    """One daily close readiness check or execution run."""

    run_date = models.DateField(db_index=True)
    run_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="daily_close_runs",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="daily_close_runs",
    )

    is_dry_run = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20,
        choices=DailyCloseStatus.choices,
        default=DailyCloseStatus.DRY_RUN,
        db_index=True,
    )

    blocking_check_count = models.IntegerField(default=0)
    executed_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "control_daily_close_runs"
        ordering = ["-run_date", "-created_at"]
        indexes = [
            models.Index(fields=["run_date", "status"], name="ctrl_dcr_date_status_idx"),
        ]

    def __str__(self):
        return f"DailyCloseRun[{self.run_date}] is_dry_run={self.is_dry_run} status={self.status}"


# ─────────────────────────────────────────────
# DailyCloseCheckResult
# ─────────────────────────────────────────────


class CustomerAdvanceRefund(TimeStampedModel):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        related_name="customer_advance_refunds",
    )
    advance = models.ForeignKey(
        CustomerAdvance,
        on_delete=models.PROTECT,
        related_name="refunds",
    )
    finance_account = models.ForeignKey(
        "accounting.FinanceAccount",
        on_delete=models.PROTECT,
        related_name="customer_advance_refunds",
    )
    refund_reference_no = models.CharField(max_length=100, db_index=True)
    idempotency_key = models.CharField(max_length=160, blank=True, default="", db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    refund_date = models.DateField(db_index=True)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=CustomerAdvanceRefundStatus.choices,
        default=CustomerAdvanceRefundStatus.ACTIVE,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_customer_advance_refunds",
    )
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="voided_customer_advance_refunds",
    )
    voided_at = models.DateTimeField(null=True, blank=True, db_index=True)
    void_reason = models.TextField(blank=True, default="")
    reversal_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    notes = models.TextField(blank=True, default="")
    metadata_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "customer_advance_refunds"
        ordering = ["-refund_date", "-id"]
        indexes = [
            models.Index(fields=["customer", "refund_date"], name="customer_ad_custome_f70be8_idx"),
            models.Index(fields=["advance", "refund_date"], name="customer_ad_advance_6d4199_idx"),
            models.Index(fields=["finance_account", "refund_date"], name="customer_ad_finance_8fb87b_idx"),
            models.Index(fields=["status", "refund_date"], name="customer_ad_status_9f6b9b_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["refund_reference_no"], name="uq_customer_advance_refund_ref"),
            models.UniqueConstraint(
                fields=["idempotency_key"],
                condition=~Q(idempotency_key=""),
                name="uq_customer_advance_refund_idempotency",
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="chk_customer_advance_refund_amount_positive"),
        ]

    def clean(self):
        errors = {}
        if self.amount is None or self.amount <= MONEY_ZERO:
            errors["amount"] = "Refund amount must be greater than zero."
        if not self.refund_date:
            errors["refund_date"] = "Refund date is required."
        if not self.refund_reference_no:
            errors["refund_reference_no"] = "Refund reference number is required."
        if self.advance_id and self.customer_id and self.advance.customer_id != self.customer_id:
            errors["customer"] = "Refund customer must match the source customer advance."
        if self.finance_account_id:
            if not self.finance_account.is_active:
                errors["finance_account"] = "Selected refund finance account must be active."
            if not self.finance_account.chart_account_id:
                errors["finance_account"] = "Selected refund finance account must be mapped to a chart account."
        if self.status in {CustomerAdvanceRefundStatus.VOIDED, CustomerAdvanceRefundStatus.REVERSED} and not self.voided_at:
            errors["voided_at"] = "Voided/reversed refund evidence must include voided_at."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.refund_reference_no = (self.refund_reference_no or "").strip()
        self.idempotency_key = (self.idempotency_key or "").strip()
        self.reversal_reference = (self.reversal_reference or "").strip()
        self.notes = (self.notes or "").strip()
        self.void_reason = (self.void_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Customer advance refund {self.refund_reference_no} - {self.amount}"

class RentLeaseCollection(TimeStampedModel):
    collection_number = models.CharField(max_length=64, unique=True, db_index=True, default=generate_rent_lease_collection_number)
    external_reference_no = models.CharField(max_length=120, blank=True, default="", db_index=True)
    demand = models.ForeignKey(RentLeaseBillingDemand, on_delete=models.PROTECT, related_name="rent_lease_collections")
    subscription = models.ForeignKey('contracts.Subscription', on_delete=models.PROTECT, related_name="rent_lease_collections")
    contract_reference = models.ForeignKey("contracts.ContractReference", on_delete=models.PROTECT, related_name="rent_lease_collections", null=True, blank=True)
    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name="rent_lease_collections")
    plan_type = models.CharField(max_length=10, choices=PlanType.choices, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField(db_index=True)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, db_index=True)
    finance_account = models.ForeignKey("accounting.FinanceAccount", on_delete=models.PROTECT, related_name="rent_lease_collections")
    status = models.CharField(max_length=16, choices=RentLeaseCollectionStatus.choices, default=RentLeaseCollectionStatus.ACTIVE, db_index=True)
    idempotency_key = models.CharField(max_length=160, blank=True, default="", db_index=True)
    note = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_rent_lease_collections", null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True, db_index=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="voided_rent_lease_collections", null=True, blank=True)
    void_reason = models.TextField(blank=True, default="")
    reversal_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    IMMUTABLE_FIELDS = (
        "collection_number",
        "external_reference_no",
        "demand_id",
        "subscription_id",
        "contract_reference_id",
        "customer_id",
        "plan_type",
        "amount",
        "payment_date",
        "payment_method",
        "finance_account_id",
        "idempotency_key",
        "created_by_id",
    )

    class Meta:
        db_table = "rent_lease_collections"
        ordering = ["-payment_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["subscription", "payment_date"]),
            models.Index(fields=["demand", "status"]),
            models.Index(fields=["customer", "payment_date"]),
            models.Index(fields=["plan_type", "status", "payment_date"]),
            models.Index(fields=["finance_account", "payment_date"]),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=MONEY_ZERO), name="chk_rent_lease_collection_amount_positive"),
            models.CheckConstraint(condition=Q(plan_type=PlanType.RENT) | Q(plan_type=PlanType.LEASE), name="chk_rent_lease_collection_plan_type"),
            models.UniqueConstraint(fields=["idempotency_key"], condition=~Q(idempotency_key=""), name="uq_rent_lease_collection_idempotency_key"),
            models.UniqueConstraint(fields=["external_reference_no"], condition=~Q(external_reference_no=""), name="uq_rent_lease_collection_external_ref"),
        ]

    def clean(self):
        errors = {}
        amount = q2(Decimal(str(self.amount or MONEY_ZERO)))
        if amount <= MONEY_ZERO:
            errors["amount"] = "Amount must be greater than zero."
        if self.plan_type not in {PlanType.RENT, PlanType.LEASE}:
            errors["plan_type"] = "Plan type must be RENT or LEASE."
        if self.subscription_id:
            if self.subscription.plan_type != self.plan_type:
                errors["subscription"] = "Subscription plan type mismatch."
            if self.customer_id and self.subscription.customer_id != self.customer_id:
                errors["customer"] = "Customer mismatch."
        if self.demand_id:
            if self.subscription_id and self.demand.subscription_id != self.subscription_id:
                errors["demand"] = "Demand subscription mismatch."
            if self.demand.demand_type == RentLeaseDemandType.SECURITY_DEPOSIT:
                errors["demand"] = "Deposit demand is not monthly rent/lease collection evidence."
            expected = RentLeaseDemandType.RENT_MONTHLY if self.plan_type == PlanType.RENT else RentLeaseDemandType.LEASE_MONTHLY
            if self.plan_type in {PlanType.RENT, PlanType.LEASE} and self.demand.demand_type != expected:
                errors["demand_type"] = "Demand type mismatch."
        if self.contract_reference_id and self.subscription_id and self.contract_reference.subscription_id != self.subscription_id:
            errors["contract_reference"] = "Contract reference mismatch."
        if self.pk:
            existing = self.__class__.objects.filter(pk=self.pk).first()
            if existing:
                for field in self.IMMUTABLE_FIELDS:
                    old_value = getattr(existing, field)
                    new_value = getattr(self, field)
                    if field == "amount":
                        old_value = q2(Decimal(str(old_value or MONEY_ZERO)))
                        new_value = q2(Decimal(str(new_value or MONEY_ZERO)))
                    if old_value != new_value:
                        errors[field.removesuffix("_id")] = "Source evidence is immutable once created."
        if self.status in {RentLeaseCollectionStatus.VOIDED, RentLeaseCollectionStatus.REVERSED}:
            if not self.voided_at:
                errors["voided_at"] = "Timestamp is required."
            if not (self.void_reason or "").strip():
                errors["void_reason"] = "Reason is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.collection_number = (self.collection_number or generate_rent_lease_collection_number()).strip().upper()
        self.external_reference_no = (self.external_reference_no or "").strip().upper()
        self.idempotency_key = (self.idempotency_key or "").strip()
        self.payment_method = (self.payment_method or PaymentMethod.CASH).strip().upper()
        self.plan_type = (self.plan_type or "").strip().upper()
        self.status = (self.status or RentLeaseCollectionStatus.ACTIVE).strip().upper()
        self.note = (self.note or "").strip()
        self.void_reason = (self.void_reason or "").strip()
        self.reversal_reference = (self.reversal_reference or "").strip().upper()
        if not self.payment_date:
            self.payment_date = timezone.localdate()
        self.amount = q2(Decimal(str(self.amount or MONEY_ZERO)))
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.collection_number

