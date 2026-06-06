from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from subscriptions.models import PaymentMethod

MONEY_ZERO = Decimal("0.00")
SYSTEM_LEDGER_POSTING_PROFILE_NAME = "ledger posting profiles (system)"
DEFAULT_CASH_IN_HAND_SYSTEM_CODE = "DEFAULT_ASSET_CASH_IN_HAND"
DEFAULT_BANK_ACCOUNT_SYSTEM_CODE = "DEFAULT_ASSET_BANK_ACCOUNT"
DEFAULT_UPI_GATEWAY_SYSTEM_CODE = "DEFAULT_ASSET_UPI_GATEWAY"
CANONICAL_CASH_IN_HAND_SYSTEM_CODE = "CASH_COLLECTION"
CANONICAL_BANK_ACCOUNT_SYSTEM_CODE = "BANK_COLLECTION"
CANONICAL_UPI_GATEWAY_SYSTEM_CODE = "UPI_COLLECTION"


def _default_branch():
    try:
        from branch_control.services.branch_service import default_branch_for_model

        return default_branch_for_model()
    except Exception:
        return None


def _generate_reference(prefix: str) -> str:
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
    return f"{prefix}-{timestamp}"


def generate_chart_code() -> str:
    return _generate_reference("COA")


def generate_entry_no() -> str:
    return _generate_reference("JE")


def generate_journal_group_id() -> str:
    return _generate_reference("JG")


def generate_voucher_no() -> str:
    return _generate_reference("EXP")


def generate_movement_no() -> str:
    return _generate_reference("MOV")


def generate_employee_code() -> str:
    return _generate_reference("EMP")


def generate_asset_code() -> str:
    return _generate_reference("AST")


def generate_depreciation_run_code() -> str:
    return _generate_reference("DEPR")


def generate_vendor_settlement_no() -> str:
    return _generate_reference("VSET")


def generate_leave_request_no() -> str:
    return _generate_reference("LREQ")


def generate_expense_claim_no() -> str:
    return _generate_reference("ECL")


def _transition_allowed(previous_status: str | None, next_status: str | None, allowed: set[tuple[str, str]]) -> bool:
    return (previous_status or "", next_status or "") in allowed


def _document_type_for_series_code(series_code: str) -> str:
    cleaned = (series_code or "").strip().upper()
    return {
        "DIRSALE": "DIRECT_SALE",
        "DIRECT_SALE": "DIRECT_SALE",
        "BILL_INV": "TAX_INVOICE",
        "DIRECT_SALE_INVOICE": "TAX_INVOICE",
        "BILL_RCT": "DIRECT_SALE_RECEIPT",
        "EMI_RECEIPT": "EMI_RECEIPT",
        "BILL_CN": "CREDIT_NOTE",
        "GST_CN": "CREDIT_NOTE",
        "BILL_DN": "DEBIT_NOTE",
        "GST_DN": "DEBIT_NOTE",
        "JOURNAL": "JOURNAL_ENTRY",
    }.get(cleaned, cleaned[:40])


def _is_cash_in_hand_chart(chart: "ChartOfAccount" | None) -> bool:
    if chart is None:
        return False
    if (chart.system_code or "").strip().upper() in {
        DEFAULT_CASH_IN_HAND_SYSTEM_CODE,
        CANONICAL_CASH_IN_HAND_SYSTEM_CODE,
    }:
        return True
    return (chart.name or "").strip().lower() == "cash in hand"


def _chart_by_system_codes(*, system_codes: tuple[str, ...]) -> "ChartOfAccount | None":
    normalized = [code.strip().upper() for code in system_codes if (code or "").strip()]
    if not normalized:
        return None
    return ChartOfAccount.objects.filter(system_code__in=normalized, is_active=True).order_by("id").first()


def _immutable_status_guard(
    instance,
    *,
    immutable_statuses: set[str],
    allowed_transitions: set[tuple[str, str]] | None = None,
    status_field: str = "status",
    label: str = "record",
):
    if not instance.pk:
        return

    existing = instance.__class__.objects.filter(pk=instance.pk).only(status_field).first()
    if existing is None:
        return

    previous_status = getattr(existing, status_field, None)
    next_status = getattr(instance, status_field, None)
    if previous_status not in immutable_statuses:
        return

    allowed = allowed_transitions or set()
    if _transition_allowed(previous_status, next_status, allowed):
        return

    raise ValidationError(
        {status_field: f"{label.capitalize()} is immutable once it reaches {previous_status}."}
    )


def _posted_reference_guard(instance, *, label: str):
    if not instance.pk:
        return

    existing = instance.__class__.objects.filter(pk=instance.pk).only("posted_journal_entry_id").first()
    if existing is None or not getattr(existing, "posted_journal_entry_id", None):
        return

    raise ValidationError({"posted_journal_entry": f"{label.capitalize()} is immutable once posted."})


class AccountingTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ChartOfAccountType(models.TextChoices):
    ASSET = "ASSET", "Asset"
    LIABILITY = "LIABILITY", "Liability"
    EQUITY = "EQUITY", "Equity"
    INCOME = "INCOME", "Income"
    EXPENSE = "EXPENSE", "Expense"


class FinanceAccountKind(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI = "UPI", "UPI"


class FinanceAccountMappingPurpose(models.TextChoices):
    CASH_COLLECTION = "CASH_COLLECTION", "Cash Collection"
    UPI_COLLECTION = "UPI_COLLECTION", "UPI Collection"
    BANK_COLLECTION = "BANK_COLLECTION", "Bank Collection"
    PAYMENT_GATEWAY_COLLECTION = "PAYMENT_GATEWAY_COLLECTION", "Payment Gateway Settlement Collection"
    CUSTOMER_RECEIVABLE = "CUSTOMER_RECEIVABLE", "Customer Receivable"
    SECURITY_DEPOSIT_LIABILITY = "SECURITY_DEPOSIT_LIABILITY", "Security Deposit Liability"
    CUSTOMER_ADVANCE_UNEARNED_REVENUE = "CUSTOMER_ADVANCE_UNEARNED_REVENUE", "Customer Advance / Unearned Revenue"
    EMI_INCOME = "EMI_INCOME", "Advance EMI Income"
    RENT_INCOME = "RENT_INCOME", "Rent Income"
    LEASE_INCOME = "LEASE_INCOME", "Lease Income"
    DIRECT_SALE_INCOME = "DIRECT_SALE_INCOME", "Direct Sale Income"
    DELIVERY_CHARGES_INCOME = "DELIVERY_CHARGES_INCOME", "Delivery Charges Income"
    WAIVER_LOSS = "WAIVER_LOSS", "Waiver/Loss"
    COMMISSION_PAYABLE = "COMMISSION_PAYABLE", "Commission Payable"
    COMMISSION_EXPENSE = "COMMISSION_EXPENSE", "Commission Expense"
    DAMAGE_RECOVERY = "DAMAGE_RECOVERY", "Damage Recovery"
    DELIVERY_EXPENSE = "DELIVERY_EXPENSE", "Delivery Expense"
    SALARY_EXPENSE = "SALARY_EXPENSE", "Salary Expense"
    INVENTORY_ASSET = "INVENTORY_ASSET", "Inventory Asset"


class JournalEntryType(models.TextChoices):
    MANUAL = "MANUAL", "Manual"
    EXPENSE = "EXPENSE", "Expense"
    SALARY = "SALARY", "Salary"
    MONEY_MOVEMENT = "MONEY_MOVEMENT", "Money Movement"
    SYSTEM_BRIDGE = "SYSTEM_BRIDGE", "System Bridge"


class JournalEntryStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    VOID = "VOID", "Void"


class ExpenseVoucherStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class SalarySheetStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    PAID_PARTIAL = "PAID_PARTIAL", "Paid Partial"
    PAID = "PAID", "Paid"


class PayrollPeriodStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    CLOSED = "CLOSED", "Closed"


class AccountingPeriodStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    LOCKED = "LOCKED", "Locked"
    CLOSED = "CLOSED", "Closed"


class DocumentSequenceResetPolicy(models.TextChoices):
    NEVER = "NEVER", "Never"
    YEARLY = "YEARLY", "Yearly"
    MONTHLY = "MONTHLY", "Monthly"


class AttendanceStatus(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    HALF_DAY = "HALF_DAY", "Half Day"
    ABSENT = "ABSENT", "Absent"
    LEAVE = "LEAVE", "Leave"


class EmploymentType(models.TextChoices):
    PERMANENT_MONTHLY = "PERMANENT_MONTHLY", "Permanent Monthly Staff"
    TEMPORARY = "TEMPORARY", "Temporary Staff"
    DAILY_WAGE = "DAILY_WAGE", "Daily Wage Worker"
    HOURLY = "HOURLY", "Hourly Worker"
    PIECE_RATE = "PIECE_RATE", "Piece-rate Worker"
    MANUFACTURING = "MANUFACTURING", "Manufacturing Worker"
    SERVICE = "SERVICE", "Service Worker"


class EmployeeStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class StaffPaymentMode(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI = "UPI", "UPI"


class EmployeeDocumentType(models.TextChoices):
    ID_PROOF = "ID_PROOF", "ID Proof"
    ADDRESS_PROOF = "ADDRESS_PROOF", "Address Proof"
    SALARY_AGREEMENT = "SALARY_AGREEMENT", "Salary Agreement"
    APPOINTMENT_LETTER = "APPOINTMENT_LETTER", "Appointment Letter"
    OTHER = "OTHER", "Other"


class EmployeeDocumentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class CompensationComponentType(models.TextChoices):
    EARNING = "EARNING", "Earning"
    DEDUCTION = "DEDUCTION", "Deduction"


class LeaveRequestStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class ExpenseClaimStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    PAID_PARTIAL = "PAID_PARTIAL", "Paid Partial"
    PAID = "PAID", "Paid"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class SalaryLineSourceType(models.TextChoices):
    BASE_SALARY = "BASE_SALARY", "Base Salary"
    COMPONENT = "COMPONENT", "Component"
    OVERTIME = "OVERTIME", "Overtime"
    LEAVE_DEDUCTION = "LEAVE_DEDUCTION", "Leave Deduction"
    MANUAL = "MANUAL", "Manual"


class MoneyMovementStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class AssetDepreciationMethod(models.TextChoices):
    SLM = "SLM", "Straight Line"
    WDM = "WDM", "Written Down"


class AssetStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    DISPOSED = "DISPOSED", "Disposed"


class DepreciationRunStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    RUNNING = "RUNNING", "Running"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class VendorSettlementStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class TaxDocumentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class SupplyKind(models.TextChoices):
    INTRA = "INTRA", "Intra State"
    INTER = "INTER", "Inter State"


class ExportPackType(models.TextChoices):
    ITR_HANDOFF = "ITR_HANDOFF", "ITR Handoff"
    GST_HANDOFF = "GST_HANDOFF", "GST Handoff"


class ExportPackStatus(models.TextChoices):
    QUEUED = "QUEUED", "Queued"
    RUNNING = "RUNNING", "Running"
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"


class BusinessTaxRegistrationMode(models.TextChoices):
    GST_UNREGISTERED = "GST_UNREGISTERED", "GST Unregistered"
    GST_REGULAR = "GST_REGULAR", "GST Regular"
    GST_COMPOSITION = "GST_COMPOSITION", "GST Composition"


class TaxReadinessCategory(models.TextChoices):
    GOODS = "GOODS", "Goods"
    SERVICE = "SERVICE", "Service"
    MIXED = "MIXED", "Mixed"


class TaxPartyType(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    SUPPLIER = "SUPPLIER", "Supplier"
    PARTNER = "PARTNER", "Partner"
    VENDOR = "VENDOR", "Vendor"


class PartyTaxType(models.TextChoices):
    UNREGISTERED = "UNREGISTERED", "Unregistered"
    REGISTERED = "REGISTERED", "Registered"
    COMPOSITION = "COMPOSITION", "Composition"


class BusinessTaxProfile(AccountingTimeStampedModel):
    mode = models.CharField(
        max_length=32,
        choices=BusinessTaxRegistrationMode.choices,
        default=BusinessTaxRegistrationMode.GST_UNREGISTERED,
        db_index=True,
    )
    legal_name = models.CharField(max_length=180, blank=True, default="")
    gstin = models.CharField(max_length=20, blank=True, default="", db_index=True)
    pan = models.CharField(max_length=20, blank=True, default="")
    state_code = models.CharField(max_length=5, blank=True, default="")
    state_name = models.CharField(max_length=120, blank=True, default="")
    effective_from = models.DateField(default=timezone.localdate, db_index=True)
    effective_to = models.DateField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_business_tax_profiles"
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=Q(is_active=True),
                name="uq_single_active_business_tax_profile",
            ),
        ]
        indexes = [
            models.Index(fields=["mode", "is_active"]),
            models.Index(fields=["effective_from", "effective_to"]),
        ]

    def clean(self):
        errors = {}
        mode = (self.mode or "").strip().upper()
        gstin = (self.gstin or "").strip().upper()
        if mode in {
            BusinessTaxRegistrationMode.GST_REGULAR,
            BusinessTaxRegistrationMode.GST_COMPOSITION,
        } and not gstin:
            errors["gstin"] = "GSTIN is required for GST registered modes."
        if self.effective_to and self.effective_from and self.effective_to < self.effective_from:
            errors["effective_to"] = "effective_to cannot be before effective_from."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.mode = (self.mode or BusinessTaxRegistrationMode.GST_UNREGISTERED).strip().upper()
        self.legal_name = (self.legal_name or "").strip()
        self.gstin = (self.gstin or "").strip().upper()
        self.pan = (self.pan or "").strip().upper()
        self.state_code = (self.state_code or "").strip().upper()
        self.state_name = (self.state_name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ProductTaxProfile(AccountingTimeStampedModel):
    product = models.ForeignKey(
        "subscriptions.Product",
        on_delete=models.PROTECT,
        related_name="tax_profiles",
    )
    hsn_code = models.CharField(max_length=40, blank=True, default="")
    tax_category = models.CharField(
        max_length=20,
        choices=TaxReadinessCategory.choices,
        default=TaxReadinessCategory.GOODS,
        db_index=True,
    )
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=MONEY_ZERO)
    effective_from = models.DateField(default=timezone.localdate, db_index=True)
    effective_to = models.DateField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_product_tax_profiles"
        ordering = ["product_id", "-effective_from", "-id"]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["effective_from", "effective_to"]),
        ]

    def clean(self):
        errors = {}
        if self.effective_to and self.effective_from and self.effective_to < self.effective_from:
            errors["effective_to"] = "effective_to cannot be before effective_from."
        if self.gst_rate is not None and self.gst_rate < MONEY_ZERO:
            errors["gst_rate"] = "gst_rate cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.hsn_code = (self.hsn_code or "").strip().upper()
        self.tax_category = (self.tax_category or TaxReadinessCategory.GOODS).strip().upper()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class PartyTaxProfile(AccountingTimeStampedModel):
    party_type = models.CharField(
        max_length=20,
        choices=TaxPartyType.choices,
        db_index=True,
    )
    party_id = models.PositiveIntegerField(db_index=True)
    tax_type = models.CharField(
        max_length=20,
        choices=PartyTaxType.choices,
        default=PartyTaxType.UNREGISTERED,
        db_index=True,
    )
    legal_name = models.CharField(max_length=180, blank=True, default="")
    gstin = models.CharField(max_length=20, blank=True, default="", db_index=True)
    pan = models.CharField(max_length=20, blank=True, default="")
    state_code = models.CharField(max_length=5, blank=True, default="")
    state_name = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_party_tax_profiles"
        ordering = ["party_type", "party_id", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["party_type", "party_id"],
                condition=Q(is_active=True),
                name="uq_active_party_tax_profile",
            ),
        ]
        indexes = [
            models.Index(fields=["party_type", "party_id", "is_active"]),
            models.Index(fields=["tax_type", "is_active"]),
        ]

    def clean(self):
        errors = {}
        if self.party_id <= 0:
            errors["party_id"] = "party_id must be a positive integer."
        if self.tax_type in {PartyTaxType.REGISTERED, PartyTaxType.COMPOSITION} and not (self.gstin or "").strip():
            errors["gstin"] = "GSTIN is required for registered/composition parties."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.party_type = (self.party_type or "").strip().upper()
        self.tax_type = (self.tax_type or PartyTaxType.UNREGISTERED).strip().upper()
        self.legal_name = (self.legal_name or "").strip()
        self.gstin = (self.gstin or "").strip().upper()
        self.pan = (self.pan or "").strip().upper()
        self.state_code = (self.state_code or "").strip().upper()
        self.state_name = (self.state_name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ComplianceAlertThreshold(AccountingTimeStampedModel):
    key = models.CharField(max_length=60, unique=True, db_index=True)
    label = models.CharField(max_length=120)
    threshold_amount = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_compliance_alert_thresholds"
        ordering = ["key", "id"]
        indexes = [
            models.Index(fields=["is_active", "key"]),
        ]

    def save(self, *args, **kwargs):
        self.key = (self.key or "").strip().upper()
        self.label = (self.label or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class FinancialYear(AccountingTimeStampedModel):
    code = models.CharField(max_length=20, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=False, db_index=True)
    activated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="activated_financial_years",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_financial_years"
        ordering = ["-start_date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=Q(is_active=True),
                name="accounting_financial_year_single_active",
            ),
            models.CheckConstraint(
                condition=Q(end_date__gte=models.F("start_date")),
                name="accounting_financial_year_end_after_start",
            ),
        ]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Financial year code is required."
        if not (self.name or "").strip():
            errors["name"] = "Financial year name is required."
        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors["end_date"] = "End date cannot be earlier than start date."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} ({self.start_date} - {self.end_date})"


class AccountingPeriod(AccountingTimeStampedModel):
    code = models.CharField(max_length=30, unique=True, db_index=True)
    label = models.CharField(max_length=80)
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    financial_year = models.ForeignKey(
        FinancialYear,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="periods",
    )
    name = models.CharField(max_length=80, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=AccountingPeriodStatus.choices,
        default=AccountingPeriodStatus.OPEN,
        db_index=True,
    )
    is_locked = models.BooleanField(default=False, db_index=True)
    locked_at = models.DateTimeField(null=True, blank=True, db_index=True)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="locked_accounting_periods",
    )
    lock_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_periods"
        ordering = ["start_date", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["start_date", "end_date"],
                name="accounting_period_unique_date_range",
            ),
            models.CheckConstraint(
                condition=Q(end_date__gte=models.F("start_date")),
                name="accounting_period_end_after_start",
            ),
        ]
        indexes = [
            models.Index(fields=["is_locked", "start_date", "end_date"]),
        ]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Accounting period code is required."
        if not ((self.name or "").strip() or (self.label or "").strip()):
            errors["name"] = "Accounting period name or label is required."
        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors["end_date"] = "End date cannot be earlier than start date."
        if self.financial_year_id and self.start_date and self.end_date:
            if self.start_date < self.financial_year.start_date or self.end_date > self.financial_year.end_date:
                errors["financial_year"] = "Accounting period dates must be inside the linked financial year."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.label = (self.label or "").strip()
        if not self.name:
            self.name = self.label or self.code
        if not self.label:
            self.label = self.name or self.code
        self.status = (self.status or AccountingPeriodStatus.OPEN).strip().upper()
        if self.is_locked and self.status == AccountingPeriodStatus.OPEN:
            self.status = AccountingPeriodStatus.LOCKED
        if self.status in {AccountingPeriodStatus.LOCKED, AccountingPeriodStatus.CLOSED}:
            self.is_locked = True
        self.lock_reason = (self.lock_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} ({self.start_date} - {self.end_date})"


class PostingLock(AccountingTimeStampedModel):
    lock_date = models.DateField(unique=True, db_index=True)
    reason = models.TextField(blank=True, default="")
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="accounting_posting_locks",
    )
    locked_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "accounting_posting_locks"
        ordering = ["-lock_date", "-id"]

    def save(self, *args, **kwargs):
        self.reason = (self.reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Posting lock {self.lock_date}"


class DocumentSequence(AccountingTimeStampedModel):
    series_code = models.CharField(max_length=30, db_index=True)
    document_type = models.CharField(max_length=40, blank=True, default="", db_index=True)
    financial_year = models.CharField(max_length=9, db_index=True)
    financial_year_ref = models.ForeignKey(
        FinancialYear,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="document_sequences",
    )
    prefix = models.CharField(max_length=20, blank=True, default="")
    suffix = models.CharField(max_length=40, blank=True, default="")
    pattern = models.CharField(max_length=120, blank=True, default="")
    reset_policy = models.CharField(
        max_length=20,
        choices=DocumentSequenceResetPolicy.choices,
        default=DocumentSequenceResetPolicy.YEARLY,
        db_index=True,
    )
    next_number = models.PositiveIntegerField(default=1)
    padding = models.PositiveSmallIntegerField(default=5)
    last_issued_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    is_system_seeded = models.BooleanField(default=False)

    class Meta:
        db_table = "accounting_document_sequences"
        ordering = ["document_type", "series_code", "financial_year", "id"]
        indexes = [
            models.Index(fields=["financial_year", "is_active"]),
            models.Index(fields=["document_type", "financial_year", "is_active"]),
            models.Index(fields=["financial_year_ref", "is_active"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["document_type", "financial_year"],
                condition=Q(is_active=True) & ~Q(document_type=""),
                name="accounting_document_sequence_active_type_fy",
            ),
        ]

    def save(self, *args, **kwargs):
        self.series_code = (self.series_code or "").strip().upper()
        self.document_type = (self.document_type or "").strip().upper() or _document_type_for_series_code(self.series_code)
        self.financial_year = (self.financial_year or "").strip()
        self.prefix = (self.prefix or "").strip()
        self.suffix = (self.suffix or "").strip()
        self.pattern = (self.pattern or "").strip()
        self.reset_policy = (self.reset_policy or DocumentSequenceResetPolicy.YEARLY).strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.series_code} {self.financial_year}"


class ChartOfAccount(AccountingTimeStampedModel):
    code = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        default=generate_chart_code,
    )
    name = models.CharField(max_length=120)
    account_type = models.CharField(
        max_length=20,
        choices=ChartOfAccountType.choices,
        db_index=True,
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    allow_manual_posting = models.BooleanField(default=True)
    system_code = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    is_legacy = models.BooleanField(default=False, db_index=True)
    legacy_reason = models.CharField(max_length=255, blank=True, default="")
    superseded_by = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="legacy_accounts",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_chart_of_accounts"
        ordering = ["code", "id"]
        indexes = [
            models.Index(fields=["account_type", "is_active"]),
            models.Index(fields=["parent"]),
        ]

    def clean(self):
        errors = {}
        if self.parent_id and self.parent_id == self.id:
            errors["parent"] = "Account parent cannot reference itself."
        if self.superseded_by_id and self.superseded_by_id == self.id:
            errors["superseded_by"] = "An account cannot supersede itself."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.system_code = (
            (self.system_code or "").strip().upper() or None
        )
        self.legacy_reason = (self.legacy_reason or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class FinanceAccount(AccountingTimeStampedModel):
    name = models.CharField(max_length=120)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="finance_accounts",
    )
    kind = models.CharField(
        max_length=10,
        choices=FinanceAccountKind.choices,
        db_index=True,
    )
    chart_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="finance_accounts",
    )
    opening_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    # Settlement desks (cash/bank/UPI/gateway) use True; ledger-profile anchor rows use False.
    is_real_settlement_account = models.BooleanField(default=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    bank_last4 = models.CharField(max_length=4, blank=True, default="")
    upi_handle = models.CharField(max_length=255, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_finance_accounts"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["kind", "is_active"]),
            models.Index(fields=["branch", "kind", "is_active"]),
        ]

    def clean(self):
        errors = {}
        if self.chart_account_id and self.chart_account.account_type != ChartOfAccountType.ASSET:
            errors["chart_account"] = "Finance accounts must map to ASSET chart accounts."
        if self.chart_account_id:
            kind = (self.kind or "").strip().upper()
            bank_chart = _chart_by_system_codes(
                system_codes=(DEFAULT_BANK_ACCOUNT_SYSTEM_CODE, CANONICAL_BANK_ACCOUNT_SYSTEM_CODE)
            )
            upi_chart = _chart_by_system_codes(
                system_codes=(DEFAULT_UPI_GATEWAY_SYSTEM_CODE, CANONICAL_UPI_GATEWAY_SYSTEM_CODE)
            )
            if kind == FinanceAccountKind.BANK and _is_cash_in_hand_chart(self.chart_account):
                if bank_chart and self.chart_account_id != bank_chart.pk:
                    errors["chart_account"] = (
                        "Bank finance accounts cannot use Cash in Hand as primary chart account "
                        "when a Bank Account chart exists."
                    )
            if kind == FinanceAccountKind.UPI and _is_cash_in_hand_chart(self.chart_account):
                if upi_chart and self.chart_account_id != upi_chart.pk:
                    errors["chart_account"] = (
                        "UPI finance accounts cannot use Cash in Hand as primary chart account "
                        "when a UPI/Payment Gateway chart exists."
                    )
        if self.bank_last4 and len(self.bank_last4) != 4:
            errors["bank_last4"] = "bank_last4 must contain exactly 4 characters."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.bank_last4 = (self.bank_last4 or "").strip()
        self.upi_handle = (self.upi_handle or "").strip()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class FinanceAccountCoaMapping(AccountingTimeStampedModel):
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="coa_mappings",
    )
    chart_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="finance_account_mappings",
    )
    purpose = models.CharField(
        max_length=50,
        choices=FinanceAccountMappingPurpose.choices,
        db_index=True,
    )
    is_default = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_finance_coa_mappings",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="updated_finance_coa_mappings",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_finance_account_coa_mappings"
        ordering = ["purpose", "-is_default", "-is_active", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["finance_account", "purpose"],
                condition=Q(is_active=True),
                name="uq_active_finance_account_purpose_mapping",
            ),
            models.UniqueConstraint(
                fields=["purpose"],
                condition=Q(is_default=True, is_active=True),
                name="uq_default_mapping_per_purpose",
            ),
        ]
        indexes = [
            models.Index(fields=["purpose", "is_active"]),
            models.Index(fields=["is_default", "is_active"]),
        ]

    def clean(self):
        errors = {}
        account_type = self.chart_account.account_type if self.chart_account_id else None
        if self.purpose in {
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
            FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            FinanceAccountMappingPurpose.INVENTORY_ASSET,
        } and account_type != ChartOfAccountType.ASSET:
            errors["chart_account"] = "This purpose must map to an ASSET chart account."
        if self.purpose in {
            FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY,
            FinanceAccountMappingPurpose.COMMISSION_PAYABLE,
            FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,
        } and account_type != ChartOfAccountType.LIABILITY:
            errors["chart_account"] = "This purpose must map to a LIABILITY chart account."
        if self.purpose in {
            FinanceAccountMappingPurpose.EMI_INCOME,
            FinanceAccountMappingPurpose.RENT_INCOME,
            FinanceAccountMappingPurpose.LEASE_INCOME,
            FinanceAccountMappingPurpose.DIRECT_SALE_INCOME,
            FinanceAccountMappingPurpose.DAMAGE_RECOVERY,
            FinanceAccountMappingPurpose.DELIVERY_CHARGES_INCOME,
        } and account_type != ChartOfAccountType.INCOME:
            errors["chart_account"] = "This purpose must map to an INCOME chart account."
        if self.purpose in {
            FinanceAccountMappingPurpose.COMMISSION_EXPENSE,
            FinanceAccountMappingPurpose.DELIVERY_EXPENSE,
            FinanceAccountMappingPurpose.SALARY_EXPENSE,
        } and account_type != ChartOfAccountType.EXPENSE:
            errors["chart_account"] = "This purpose must map to an EXPENSE chart account."
        if self.purpose == FinanceAccountMappingPurpose.WAIVER_LOSS and account_type != ChartOfAccountType.EXPENSE:
            errors["chart_account"] = "Waiver/Loss must map to an EXPENSE chart account."
        if self.finance_account_id and self.chart_account_id:
            finance_kind = (self.finance_account.kind or "").strip().upper()
            if finance_kind == FinanceAccountKind.CASH and self.chart_account.account_type in {
                ChartOfAccountType.INCOME,
                ChartOfAccountType.LIABILITY,
                ChartOfAccountType.EXPENSE,
            }:
                errors["chart_account"] = (
                    "CASH finance accounts cannot map to INCOME/LIABILITY/EXPENSE chart accounts."
                )
            bank_chart = _chart_by_system_codes(
                system_codes=(DEFAULT_BANK_ACCOUNT_SYSTEM_CODE, CANONICAL_BANK_ACCOUNT_SYSTEM_CODE)
            )
            upi_chart = _chart_by_system_codes(
                system_codes=(DEFAULT_UPI_GATEWAY_SYSTEM_CODE, CANONICAL_UPI_GATEWAY_SYSTEM_CODE)
            )
            if (
                self.purpose == FinanceAccountMappingPurpose.BANK_COLLECTION
                and _is_cash_in_hand_chart(self.chart_account)
                and bank_chart
                and self.chart_account_id != bank_chart.pk
            ):
                errors["chart_account"] = "BANK_COLLECTION must map to Bank Account when Bank Account chart exists."
            if (
                self.purpose == FinanceAccountMappingPurpose.UPI_COLLECTION
                and _is_cash_in_hand_chart(self.chart_account)
                and upi_chart
                and self.chart_account_id != upi_chart.pk
            ):
                errors["chart_account"] = "UPI_COLLECTION must map to UPI/Payment Gateway when that chart exists."
            if self.purpose in {
                FinanceAccountMappingPurpose.CASH_COLLECTION,
                FinanceAccountMappingPurpose.BANK_COLLECTION,
                FinanceAccountMappingPurpose.UPI_COLLECTION,
            }:
                is_system_only = not bool(self.finance_account.is_real_settlement_account)
                if is_system_only or (self.finance_account.name or "").strip().lower() == SYSTEM_LEDGER_POSTING_PROFILE_NAME:
                    errors["finance_account"] = (
                        "System-only finance accounts cannot be used for manual collection mappings."
                    )
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class AccountingPostingProfile(AccountingTimeStampedModel):
    """
    System-only posting profiles (non-settlement) mapped to canonical chart accounts.

    This is intentionally separate from FinanceAccount:
    - FinanceAccount represents real settlement instruments (cash/bank/UPI desks).
    - Posting profiles represent system accounting roles like CUSTOMER_RECEIVABLE, EMI_INCOME, etc.
    """

    key = models.CharField(max_length=80, unique=True, db_index=True)
    label = models.CharField(max_length=160)
    chart_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="posting_profiles",
    )
    is_system_only = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_posting_profiles"
        ordering = ["key", "id"]
        indexes = [
            models.Index(fields=["is_active", "is_system_only"]),
        ]

    def save(self, *args, **kwargs):
        self.key = (self.key or "").strip().upper()
        self.label = (self.label or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class RentLeaseAccountingAccountMapping(AccountingTimeStampedModel):
    """Configurable account map for live rent/lease finance sync events."""

    monthly_income_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="rent_lease_monthly_income_mappings",
    )
    deposit_liability_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="rent_lease_deposit_liability_mappings",
    )
    deposit_refund_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="rent_lease_deposit_refund_mappings",
    )
    damage_recovery_income_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="rent_lease_damage_recovery_mappings",
    )
    settlement_finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="rent_lease_account_mappings",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_rent_lease_account_mappings"
        ordering = ["-is_active", "-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=Q(is_active=True),
                name="uq_single_active_rent_lease_account_mapping",
            ),
        ]

    def clean(self):
        errors = {}
        if self.monthly_income_account_id and self.monthly_income_account.account_type != ChartOfAccountType.INCOME:
            errors["monthly_income_account"] = "Monthly income account must be an INCOME chart account."
        if self.deposit_liability_account_id and self.deposit_liability_account.account_type != ChartOfAccountType.LIABILITY:
            errors["deposit_liability_account"] = "Deposit liability account must be a LIABILITY chart account."
        if self.deposit_refund_account_id and self.deposit_refund_account.account_type != ChartOfAccountType.ASSET:
            errors["deposit_refund_account"] = "Deposit refund account must be an ASSET chart account."
        if (
            self.damage_recovery_income_account_id
            and self.damage_recovery_income_account.account_type != ChartOfAccountType.INCOME
        ):
            errors["damage_recovery_income_account"] = "Damage recovery account must be an INCOME chart account."
        if self.settlement_finance_account_id:
            if not self.settlement_finance_account.is_active:
                errors["settlement_finance_account"] = "Settlement finance account must be active."
            elif (
                not self.settlement_finance_account.chart_account_id
                or not self.settlement_finance_account.chart_account.is_active
                or self.settlement_finance_account.chart_account.account_type != ChartOfAccountType.ASSET
            ):
                errors["settlement_finance_account"] = "Settlement finance account must map to an active ASSET chart account."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class RentLeasePostingBridgeConfig(AccountingTimeStampedModel):
    """Singleton approval switch for explicit rent/lease accounting bridge posting."""

    is_enabled = models.BooleanField(default=False, db_index=True)
    enabled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    enabled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="enabled_rent_lease_posting_bridge_configs",
    )
    disabled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    disabled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="disabled_rent_lease_posting_bridge_configs",
    )
    reason = models.TextField(blank=True, default="")
    last_readiness_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "accounting_rent_lease_posting_bridge_config"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(id=1),
                name="ck_singleton_rent_lease_posting_bridge_config",
            ),
        ]

    def save(self, *args, **kwargs):
        self.pk = 1
        self.reason = (self.reason or "").strip()
        super().save(*args, **kwargs)


class JournalEntry(AccountingTimeStampedModel):
    entry_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_entry_no,
    )
    entry_date = models.DateField(db_index=True)
    entry_type = models.CharField(
        max_length=20,
        choices=JournalEntryType.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=10,
        choices=JournalEntryStatus.choices,
        default=JournalEntryStatus.DRAFT,
        db_index=True,
    )
    memo = models.TextField(blank=True, default="")
    source_model = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    source_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    voucher_type = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    source_type = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    source_reference = models.CharField(max_length=120, null=True, blank=True, db_index=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_accounting_journals",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_accounting_journals",
    )
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    void_reason = models.TextField(blank=True, default="")
    journal_group = models.ForeignKey(
        "JournalEntryGroup",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="journal_entries",
        db_index=True,
    )

    class Meta:
        db_table = "accounting_journal_entries"
        ordering = ["-entry_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["entry_type", "status"]),
            models.Index(fields=["source_model", "source_id"]),
            models.Index(fields=["voucher_type", "source_type"]),
            models.Index(fields=["status", "entry_date"]),
        ]

    def clean(self):
        errors = {}
        if self.status == JournalEntryStatus.POSTED and not self.posted_at:
            errors["posted_at"] = "Posted journal entries must include posted_at."
        if self.status == JournalEntryStatus.VOID and not self.void_reason.strip():
            errors["void_reason"] = "Void reason is required when voiding a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={JournalEntryStatus.POSTED, JournalEntryStatus.VOID},
            allowed_transitions={(JournalEntryStatus.POSTED, JournalEntryStatus.VOID)},
            label="journal entry",
        )
        self.entry_no = (self.entry_no or generate_entry_no()).strip().upper()
        self.memo = (self.memo or "").strip()
        self.source_model = (self.source_model or "").strip() or None
        self.source_id = (self.source_id or "").strip() or None
        self.voucher_type = (self.voucher_type or "").strip().upper() or None
        self.source_type = (self.source_type or "").strip().upper() or None
        self.source_reference = (self.source_reference or "").strip() or None
        self.void_reason = (self.void_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.entry_no


class JournalEntryLine(AccountingTimeStampedModel):
    journal_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    chart_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="journal_entry_lines",
    )
    description = models.CharField(max_length=255, blank=True, default="")
    debit_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    credit_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )

    class Meta:
        db_table = "accounting_journal_entry_lines"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["chart_account", "id"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(debit_amount__gte=MONEY_ZERO),
                name="accounting_line_debit_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(credit_amount__gte=MONEY_ZERO),
                name="accounting_line_credit_non_negative",
            ),
            models.CheckConstraint(
                condition=(
                    (Q(debit_amount__gt=MONEY_ZERO) & Q(credit_amount=MONEY_ZERO))
                    | (Q(credit_amount__gt=MONEY_ZERO) & Q(debit_amount=MONEY_ZERO))
                ),
                name="accounting_line_exactly_one_side_positive",
            ),
        ]

    def clean(self):
        errors = {}
        debit_positive = (self.debit_amount or MONEY_ZERO) > MONEY_ZERO
        credit_positive = (self.credit_amount or MONEY_ZERO) > MONEY_ZERO

        if debit_positive == credit_positive:
            errors["debit_amount"] = "Exactly one of debit_amount or credit_amount must be greater than zero."
            errors["credit_amount"] = "Exactly one of debit_amount or credit_amount must be greater than zero."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.journal_entry.entry_no} - {self.chart_account.code}"


class JournalEntryGroup(AccountingTimeStampedModel):
    journal_group_id = models.CharField(
        max_length=48,
        unique=True,
        db_index=True,
        default=generate_journal_group_id,
    )
    source_module = models.CharField(max_length=160, db_index=True)
    source_object_id = models.CharField(max_length=120, db_index=True)
    transaction_date = models.DateField(db_index=True)
    narration = models.TextField(blank=True, default="")
    total_debit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    total_credit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    is_balanced = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_journal_groups",
    )
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversed_journal_groups",
    )
    reversal_of = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversal_groups",
    )

    class Meta:
        db_table = "accounting_journal_entry_groups"
        ordering = ["-transaction_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["source_module", "source_object_id"]),
            models.Index(fields=["transaction_date", "is_balanced"]),
        ]

    def clean(self):
        errors = {}
        if not (self.source_module or "").strip():
            errors["source_module"] = "source_module is required."
        if not (self.source_object_id or "").strip():
            errors["source_object_id"] = "source_object_id is required."
        if self.total_debit != self.total_credit and self.is_balanced:
            errors["is_balanced"] = "is_balanced cannot be true when totals differ."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.journal_group_id = (self.journal_group_id or generate_journal_group_id()).strip().upper()
        self.source_module = (self.source_module or "").strip()
        self.source_object_id = (self.source_object_id or "").strip()
        self.narration = (self.narration or "").strip()
        self.is_balanced = self.total_debit == self.total_credit
        self.full_clean()
        super().save(*args, **kwargs)


class Vendor(AccountingTimeStampedModel):
    name = models.CharField(max_length=120)
    vendor_code = models.CharField(max_length=40, blank=True, default="", db_index=True)
    display_name = models.CharField(max_length=160, blank=True, default="")
    legal_name = models.CharField(max_length=180, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    whatsapp = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    gstin = models.CharField(max_length=20, null=True, blank=True, db_index=True)
    pan = models.CharField(max_length=20, blank=True, default="")
    state_code = models.CharField(max_length=5, null=True, blank=True)
    state_name = models.CharField(max_length=100, null=True, blank=True)
    contact_person = models.CharField(max_length=120, blank=True, default="")
    payment_terms = models.CharField(max_length=120, blank=True, default="")
    credit_period_days = models.PositiveIntegerField(default=0)
    quality_score = models.DecimalField(max_digits=5, decimal_places=2, default=MONEY_ZERO)
    delivery_score = models.DecimalField(max_digits=5, decimal_places=2, default=MONEY_ZERO)
    warranty_score = models.DecimalField(max_digits=5, decimal_places=2, default=MONEY_ZERO)
    price_score = models.DecimalField(max_digits=5, decimal_places=2, default=MONEY_ZERO)
    rating = models.DecimalField(max_digits=5, decimal_places=2, default=MONEY_ZERO)
    notes = models.TextField(blank=True, default="")
    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="linked_vendors",
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("ACTIVE", "Active"),
            ("ON_HOLD", "On Hold"),
            ("BLOCKED", "Blocked"),
            ("ARCHIVED", "Archived"),
        ],
        default="ACTIVE",
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    categories = models.ManyToManyField("accounting.VendorCategory", blank=True, related_name="vendors")

    class Meta:
        db_table = "accounting_vendors"
        ordering = ["name", "id"]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.vendor_code = (self.vendor_code or "").strip().upper()
        self.display_name = (self.display_name or "").strip()
        self.legal_name = (self.legal_name or "").strip()
        self.phone = (self.phone or "").strip()
        self.whatsapp = (self.whatsapp or "").strip()
        self.address = (self.address or "").strip()
        self.gstin = (self.gstin or "").strip().upper() or None
        self.pan = (self.pan or "").strip().upper()
        self.state_code = (self.state_code or "").strip().upper() or None
        self.state_name = (self.state_name or "").strip() or None
        self.contact_person = (self.contact_person or "").strip()
        self.payment_terms = (self.payment_terms or "").strip()
        self.notes = (self.notes or "").strip()
        if not self.display_name:
            self.display_name = self.name
        if not self.vendor_code:
            base = f"VND-{timezone.now().strftime('%Y%m%d')}-{(self.pk or 0):06d}"
            self.vendor_code = base.upper()
        self.is_active = self.status in {"ACTIVE", "ON_HOLD"} and bool(self.is_active)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class VendorCategory(AccountingTimeStampedModel):
    name = models.CharField(max_length=120, unique=True, db_index=True)
    code = models.CharField(max_length=40, unique=True, db_index=True)
    description = models.TextField(blank=True, default="")
    parent = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="children")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "accounting_vendor_categories"
        ordering = ["name", "id"]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.code = (self.code or "").strip().upper()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class VendorAddress(AccountingTimeStampedModel):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name="addresses")
    address_type = models.CharField(
        max_length=30,
        choices=[
            ("OFFICE", "Office"),
            ("MANUFACTURING_UNIT", "Manufacturing Unit"),
            ("WAREHOUSE", "Warehouse"),
            ("SERVICE_CENTER", "Service Center"),
        ],
        default="OFFICE",
        db_index=True,
    )
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    district = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    pincode = models.CharField(max_length=20, blank=True, default="", db_index=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    is_primary = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = "accounting_vendor_addresses"
        ordering = ["vendor_id", "-is_primary", "id"]


class VendorServiceArea(AccountingTimeStampedModel):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name="service_areas")
    state = models.CharField(max_length=100, blank=True, default="", db_index=True)
    district = models.CharField(max_length=100, blank=True, default="", db_index=True)
    city = models.CharField(max_length=100, blank=True, default="", db_index=True)
    pincode = models.CharField(max_length=20, blank=True, default="", db_index=True)
    radius_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "accounting_vendor_service_areas"
        ordering = ["vendor_id", "state", "district", "city", "id"]


class VendorProduct(AccountingTimeStampedModel):
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name="products")
    internal_product = models.ForeignKey("subscriptions.Product", on_delete=models.SET_NULL, null=True, blank=True, related_name="vendor_products")
    vendor_sku = models.CharField(max_length=80, blank=True, default="", db_index=True)
    product_name = models.CharField(max_length=180)
    category_text = models.CharField(max_length=120, blank=True, default="", db_index=True)
    material = models.CharField(max_length=120, blank=True, default="")
    size_description = models.CharField(max_length=160, blank=True, default="")
    warranty_months = models.PositiveIntegerField(default=0)
    base_quote_price = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    min_order_qty = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    lead_time_days = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_vendor_products"
        ordering = ["vendor_id", "product_name", "id"]


class VendorLedgerEntry(AccountingTimeStampedModel):
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="ledger_entries")
    entry_type = models.CharField(
        max_length=30,
        choices=[
            ("OPENING_BALANCE", "Opening Balance"),
            ("PURCHASE_BILL", "Purchase Bill"),
            ("PAYMENT_TO_VENDOR", "Payment To Vendor"),
            ("PURCHASE_RETURN", "Purchase Return"),
            ("DEBIT_NOTE", "Debit Note"),
            ("CREDIT_ADJUSTMENT", "Credit Adjustment"),
            ("MANUAL_ADJUSTMENT", "Manual Adjustment"),
        ],
        db_index=True,
    )
    source_type = models.CharField(max_length=60, blank=True, default="", db_index=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    source_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    posted_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="created_vendor_ledger_entries")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_vendor_ledger_entries"
        ordering = ["vendor_id", "-posted_at", "-id"]


class VendorQuoteRequest(AccountingTimeStampedModel):
    request_no = models.CharField(max_length=60, unique=True, db_index=True)
    source_type = models.CharField(
        max_length=30,
        choices=[
            ("CUSTOMER_ENQUIRY", "Customer Enquiry"),
            ("DIRECT_SALE_ORDER", "Direct Sale Order"),
            ("ONLINE_ORDER", "Online Order"),
            ("MANUAL", "Manual"),
        ],
        default="MANUAL",
        db_index=True,
    )
    source_id = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    customer = models.ForeignKey("subscriptions.Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="vendor_quote_requests")
    customer_pincode = models.CharField(max_length=20, blank=True, default="", db_index=True)
    customer_city = models.CharField(max_length=100, blank=True, default="", db_index=True)
    customer_district = models.CharField(max_length=100, blank=True, default="", db_index=True)
    customer_state = models.CharField(max_length=100, blank=True, default="", db_index=True)
    product = models.ForeignKey("subscriptions.Product", on_delete=models.SET_NULL, null=True, blank=True, related_name="vendor_quote_requests")
    product_name = models.CharField(max_length=180, blank=True, default="")
    category_text = models.CharField(max_length=120, blank=True, default="")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    required_by = models.DateField(null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(
        max_length=24,
        choices=[
            ("DRAFT", "Draft"),
            ("SENT", "Sent"),
            ("QUOTING", "Quoting"),
            ("PARTIALLY_QUOTED", "Partially Quoted"),
            ("CLOSED", "Closed"),
            ("CANCELLED", "Cancelled"),
        ],
        default="DRAFT",
        db_index=True,
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="created_vendor_quote_requests")

    class Meta:
        db_table = "accounting_vendor_quote_requests"
        ordering = ["-created_at", "-id"]


class VendorQuote(AccountingTimeStampedModel):
    quote_request = models.ForeignKey(VendorQuoteRequest, on_delete=models.CASCADE, related_name="quotes")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="quotes")
    quoted_price = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    available_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0.000"))
    lead_time_days = models.PositiveIntegerField(default=0)
    warranty_months = models.PositiveIntegerField(default=0)
    delivery_available = models.BooleanField(default=False)
    delivery_charge = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    quality_note = models.TextField(blank=True, default="")
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ("REQUESTED", "Requested"),
            ("QUOTED", "Quoted"),
            ("ACCEPTED", "Accepted"),
            ("REJECTED", "Rejected"),
            ("EXPIRED", "Expired"),
        ],
        default="REQUESTED",
        db_index=True,
    )
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="submitted_vendor_quotes")
    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "accounting_vendor_quotes"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["quote_request", "vendor"], name="vendor_quote_unique_request_vendor"),
        ]


class CustomerPurchaseEnquiryStatus(models.TextChoices):
    NEW = "NEW", "New"
    SOURCING = "SOURCING", "Sourcing"
    QUOTE_REQUESTED = "QUOTE_REQUESTED", "Quote requested"
    VENDOR_SELECTED = "VENDOR_SELECTED", "Vendor selected"
    CONVERTED = "CONVERTED", "Converted"
    CANCELLED = "CANCELLED", "Cancelled"


class CustomerPurchaseEnquiry(AccountingTimeStampedModel):
    """
    Online / walk-in purchase intent for sourcing via Phase 4 vendor ranking + Phase 3 RFQs.
    Does not trigger EMI, payments, stock, purchase bills, or automatic PO placement.
    """

    enquiry_no = models.CharField(max_length=60, unique=True, db_index=True)
    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_purchase_enquiries",
    )
    customer_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(blank=True, default="")
    product = models.ForeignKey(
        "subscriptions.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_purchase_enquiries",
    )
    product_name = models.CharField(max_length=255, blank=True, default="")
    category_text = models.CharField(max_length=120, blank=True, default="", db_index=True)
    material = models.CharField(max_length=120, blank=True, default="")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"))
    budget_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    delivery_address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="", db_index=True)
    district = models.CharField(max_length=100, blank=True, default="", db_index=True)
    state = models.CharField(max_length=100, blank=True, default="", db_index=True)
    pincode = models.CharField(max_length=20, blank=True, default="", db_index=True)
    status = models.CharField(
        max_length=24,
        choices=CustomerPurchaseEnquiryStatus.choices,
        default=CustomerPurchaseEnquiryStatus.NEW,
        db_index=True,
    )
    public_lead = models.ForeignKey(
        "subscriptions.PublicLead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_purchase_enquiries",
    )
    selected_vendor_quote = models.ForeignKey(
        VendorQuote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="selected_for_customer_enquiries",
    )
    draft_purchase_order = models.ForeignKey(
        "inventory.PurchaseOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_purchase_enquiry_sources",
    )

    class Meta:
        db_table = "accounting_customer_purchase_enquiries"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "created_at"], name="acct_cpe_stat_crt_idx"),
            models.Index(fields=["pincode", "status"], name="acct_cpe_pc_stat_idx"),
        ]

    def save(self, *args, **kwargs):
        from accounting.services.customer_purchase_enquiry_numbering import allocate_customer_purchase_enquiry_number

        self.customer_name = (self.customer_name or "").strip()
        self.phone = (self.phone or "").strip()
        self.email = (self.email or "").strip().lower()
        self.product_name = (self.product_name or "").strip()
        self.category_text = (self.category_text or "").strip()
        self.material = (self.material or "").strip()
        self.delivery_address = (self.delivery_address or "").strip()
        self.city = (self.city or "").strip()
        self.district = (self.district or "").strip()
        self.state = (self.state or "").strip()
        self.pincode = (self.pincode or "").strip()
        if not (self.enquiry_no or "").strip():
            self.enquiry_no = allocate_customer_purchase_enquiry_number()
        super().save(*args, **kwargs)


class AssetCategory(AccountingTimeStampedModel):
    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    method = models.CharField(
        max_length=10,
        choices=AssetDepreciationMethod.choices,
        default=AssetDepreciationMethod.SLM,
        db_index=True,
    )
    useful_life_months = models.PositiveIntegerField(default=12)
    rate_annual = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    default_salvage = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "accounting_asset_categories"
        ordering = ["code", "id"]

    def clean(self):
        errors = {}
        if self.useful_life_months <= 0:
            errors["useful_life_months"] = "Useful life must be greater than zero."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class Asset(AccountingTimeStampedModel):
    asset_code = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_asset_code,
    )
    category = models.ForeignKey(
        AssetCategory,
        on_delete=models.PROTECT,
        related_name="assets",
    )
    description = models.CharField(max_length=255)
    acquisition_date = models.DateField(db_index=True)
    in_service_date = models.DateField(db_index=True)
    cost_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    salvage_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    accumulated_depreciation = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=12,
        choices=AssetStatus.choices,
        default=AssetStatus.ACTIVE,
        db_index=True,
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assets",
    )
    purchase_bill = models.ForeignKey(
        "inventory.PurchaseBill",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assets",
    )

    class Meta:
        db_table = "accounting_assets"
        ordering = ["asset_code", "id"]
        indexes = [
            models.Index(fields=["status", "in_service_date"]),
        ]

    def clean(self):
        errors = {}
        if self.in_service_date and self.acquisition_date and self.in_service_date < self.acquisition_date:
            errors["in_service_date"] = "In-service date cannot be earlier than acquisition date."
        if (self.salvage_value or MONEY_ZERO) > (self.cost_amount or MONEY_ZERO):
            errors["salvage_value"] = "Salvage value cannot exceed cost amount."
        if (self.accumulated_depreciation or MONEY_ZERO) > (self.cost_amount or MONEY_ZERO):
            errors["accumulated_depreciation"] = "Accumulated depreciation cannot exceed cost amount."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.asset_code = (self.asset_code or generate_asset_code()).strip().upper()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.asset_code


class DepreciationRun(AccountingTimeStampedModel):
    run_code = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_depreciation_run_code,
    )
    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    status = models.CharField(
        max_length=12,
        choices=DepreciationRunStatus.choices,
        default=DepreciationRunStatus.DRAFT,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_depreciation_runs",
    )
    executed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "accounting_depreciation_runs"
        ordering = ["-period_end", "-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(period_end__gte=models.F("period_start")),
                name="accounting_depr_run_end_after_start",
            ),
        ]

    def clean(self):
        errors = {}
        if self.period_end and self.period_start and self.period_end < self.period_start:
            errors["period_end"] = "Period end cannot be earlier than period start."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={DepreciationRunStatus.POSTED, DepreciationRunStatus.CANCELLED},
            label="depreciation run",
        )
        self.run_code = (self.run_code or generate_depreciation_run_code()).strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.run_code


class DepreciationLine(AccountingTimeStampedModel):
    run = models.ForeignKey(
        DepreciationRun,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    asset = models.ForeignKey(
        Asset,
        on_delete=models.PROTECT,
        related_name="depreciation_lines",
    )
    depreciation_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="depreciation_line",
    )

    class Meta:
        db_table = "accounting_depreciation_lines"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["run", "asset"],
                name="accounting_depreciation_line_unique_run_asset",
            ),
        ]

    def clean(self):
        if (self.depreciation_amount or MONEY_ZERO) <= MONEY_ZERO:
            raise ValidationError({"depreciation_amount": "Depreciation amount must be greater than zero."})

    def save(self, *args, **kwargs):
        _posted_reference_guard(self, label="depreciation line")
        self.full_clean()
        super().save(*args, **kwargs)


class ExpenseVoucher(AccountingTimeStampedModel):
    voucher_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_voucher_no,
    )
    expense_date = models.DateField(db_index=True)
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="expense_vouchers",
    )
    expense_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="expense_vouchers",
    )
    gross_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    net_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="expense_vouchers",
    )
    payment_mode = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        db_index=True,
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="expense_vouchers",
    )
    status = models.CharField(
        max_length=10,
        choices=ExpenseVoucherStatus.choices,
        default=ExpenseVoucherStatus.DRAFT,
        db_index=True,
    )
    bill_no = models.CharField(max_length=100, blank=True, default="", db_index=True)
    bill_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_expense_voucher",
    )

    class Meta:
        db_table = "accounting_expense_vouchers"
        ordering = ["-expense_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "expense_date"]),
            models.Index(fields=["branch", "expense_date"]),
        ]

    def clean(self):
        errors = {}
        if self.expense_account_id and self.expense_account.account_type != ChartOfAccountType.EXPENSE:
            errors["expense_account"] = "Expense vouchers must use an EXPENSE chart account."
        if self.finance_account_id and not self.finance_account.is_active:
            errors["finance_account"] = "Finance account must be active."
        if (self.gross_amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["gross_amount"] = "Gross amount must be greater than zero."
        if (self.net_amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["net_amount"] = "Net amount must be greater than zero."
        if self.status == ExpenseVoucherStatus.POSTED and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted expense vouchers must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={ExpenseVoucherStatus.APPROVED, ExpenseVoucherStatus.POSTED, ExpenseVoucherStatus.CANCELLED},
            allowed_transitions={
                (ExpenseVoucherStatus.APPROVED, ExpenseVoucherStatus.POSTED),
                (ExpenseVoucherStatus.APPROVED, ExpenseVoucherStatus.CANCELLED),
            },
            label="expense voucher",
        )
        self.voucher_no = (self.voucher_no or generate_voucher_no()).strip().upper()
        self.bill_no = (self.bill_no or "").strip()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = getattr(self.finance_account, "branch", None) or _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.voucher_no


class EmployeeProfile(AccountingTimeStampedModel):
    employee_code = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_employee_code,
    )
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True, default="")
    designation = models.CharField(max_length=80, blank=True, default="")
    department = models.CharField(max_length=80, blank=True, default="")
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="employee_profiles",
    )
    joining_date = models.DateField(db_index=True)
    base_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    standard_daily_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("8.00"),
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    overtime_rate_per_hour = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    is_active = models.BooleanField(default=True, db_index=True)
    employment_status = models.CharField(
        max_length=20,
        choices=EmployeeStatus.choices,
        default=EmployeeStatus.ACTIVE,
        db_index=True,
    )
    employment_type = models.CharField(
        max_length=30,
        choices=EmploymentType.choices,
        default=EmploymentType.PERMANENT_MONTHLY,
        db_index=True,
    )
    reporting_manager = models.CharField(max_length=120, blank=True, default="")
    work_location = models.CharField(max_length=120, blank=True, default="")
    probation_end_date = models.DateField(null=True, blank=True)
    attendance_policy = models.CharField(max_length=120, blank=True, default="")
    shift_name = models.CharField(max_length=120, blank=True, default="")
    salary_effective_from = models.DateField(null=True, blank=True)
    temporary_contract_end_date = models.DateField(null=True, blank=True)
    daily_wage_rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    hourly_wage_rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    piece_rate_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    piece_rate_unit_label = models.CharField(max_length=60, blank=True, default="")
    payroll_eligible = models.BooleanField(default=False, db_index=True)
    payment_mode = models.CharField(
        max_length=20,
        choices=StaffPaymentMode.choices,
        default=StaffPaymentMode.CASH,
        db_index=True,
    )
    bank_account_name = models.CharField(max_length=120, blank=True, default="")
    bank_account_number = models.CharField(max_length=80, blank=True, default="")
    bank_ifsc = models.CharField(max_length=40, blank=True, default="")
    upi_id = models.CharField(max_length=80, blank=True, default="")
    kyc_id_type = models.CharField(max_length=40, blank=True, default="")
    kyc_id_number = models.CharField(max_length=80, blank=True, default="")
    kyc_verified = models.BooleanField(default=False, db_index=True)
    address = models.TextField(blank=True, default="")
    emergency_contact_name = models.CharField(max_length=120, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=20, blank=True, default="")
    cost_center_code = models.CharField(max_length=60, blank=True, default="")
    payroll_expense_account = models.ForeignKey(
        "ChartOfAccount",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="employee_profiles_payroll_expense",
    )
    deactivation_reason = models.TextField(blank=True, default="")
    deactivated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deactivated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="deactivated_employee_profiles",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_employee_profiles"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["is_active", "department"]),
            models.Index(fields=["branch", "is_active"]),
        ]

    def save(self, *args, **kwargs):
        self.employee_code = (
            self.employee_code or generate_employee_code()
        ).strip().upper()
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.designation = (self.designation or "").strip()
        self.department = (self.department or "").strip()
        self.reporting_manager = (self.reporting_manager or "").strip()
        self.work_location = (self.work_location or "").strip()
        self.attendance_policy = (self.attendance_policy or "").strip()
        self.shift_name = (self.shift_name or "").strip()
        self.piece_rate_unit_label = (self.piece_rate_unit_label or "").strip()
        self.bank_account_name = (self.bank_account_name or "").strip()
        self.bank_account_number = (self.bank_account_number or "").strip()
        self.bank_ifsc = (self.bank_ifsc or "").strip().upper()
        self.upi_id = (self.upi_id or "").strip()
        self.kyc_id_type = (self.kyc_id_type or "").strip().upper()
        self.kyc_id_number = (self.kyc_id_number or "").strip()
        self.address = (self.address or "").strip()
        self.emergency_contact_name = (self.emergency_contact_name or "").strip()
        self.emergency_contact_phone = (self.emergency_contact_phone or "").strip()
        self.cost_center_code = (self.cost_center_code or "").strip().upper()
        self.deactivation_reason = (self.deactivation_reason or "").strip()
        self.notes = (self.notes or "").strip()
        if self.employment_status == EmployeeStatus.INACTIVE:
            self.is_active = False
        elif self.is_active:
            self.employment_status = EmployeeStatus.ACTIVE
        if self.branch_id is None:
            self.branch = _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee_code} - {self.name}"


def employee_document_upload_to(instance: "EmployeeDocument", filename: str) -> str:
    ext = (filename or "").split(".")[-1].lower() if "." in (filename or "") else "bin"
    return f"employee-documents/emp-{instance.employee_id}/{timezone.now().strftime('%Y%m%d%H%M%S%f')}.{ext}"


class EmployeeDocument(AccountingTimeStampedModel):
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
        related_name="documents",
    )
    document_type = models.CharField(
        max_length=30,
        choices=EmployeeDocumentType.choices,
        default=EmployeeDocumentType.OTHER,
        db_index=True,
    )
    title = models.CharField(max_length=160)
    document_no = models.CharField(max_length=80, blank=True, default="")
    file = models.FileField(upload_to=employee_document_upload_to)
    status = models.CharField(
        max_length=12,
        choices=EmployeeDocumentStatus.choices,
        default=EmployeeDocumentStatus.ACTIVE,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="uploaded_employee_documents",
    )

    class Meta:
        db_table = "accounting_employee_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["employee", "status", "document_type"]),
        ]

    def save(self, *args, **kwargs):
        self.title = (self.title or "").strip()
        self.document_no = (self.document_no or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_code} - {self.title}"


class PayrollPeriod(AccountingTimeStampedModel):
    code = models.CharField(max_length=20, unique=True, db_index=True)
    year = models.PositiveIntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(9999)],
        db_index=True,
    )
    month = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        db_index=True,
    )
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=10,
        choices=PayrollPeriodStatus.choices,
        default=PayrollPeriodStatus.OPEN,
        db_index=True,
    )
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="closed_payroll_periods",
    )
    close_reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_payroll_periods"
        ordering = ["-year", "-month", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["year", "month"],
                name="accounting_payroll_period_unique_year_month",
            ),
            models.CheckConstraint(
                condition=Q(end_date__gte=models.F("start_date")),
                name="accounting_payroll_period_end_after_start",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "start_date", "end_date"]),
        ]

    def clean(self):
        errors = {}
        if self.end_date and self.start_date and self.end_date < self.start_date:
            errors["end_date"] = "End date cannot be earlier than start date."
        if self.start_date and self.start_date.year != self.year:
            errors["start_date"] = "Payroll period start date must fall inside the configured year."
        if self.start_date and self.start_date.month != self.month:
            errors["start_date"] = "Payroll period start date must fall inside the configured month."
        if self.end_date and self.end_date.year != self.year:
            errors["end_date"] = "Payroll period end date must fall inside the configured year."
        if self.end_date and self.end_date.month != self.month:
            errors["end_date"] = "Payroll period end date must fall inside the configured month."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={PayrollPeriodStatus.CLOSED},
            label="payroll period",
        )
        self.code = (self.code or f"PAY-{self.year}-{self.month:02d}").strip().upper()
        self.close_reason = (self.close_reason or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class EmployeeCompensationComponent(AccountingTimeStampedModel):
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
        related_name="compensation_components",
    )
    component_name = models.CharField(max_length=120)
    component_type = models.CharField(
        max_length=12,
        choices=CompensationComponentType.choices,
        db_index=True,
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    sort_order = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_employee_compensation_components"
        ordering = ["employee_id", "sort_order", "id"]
        indexes = [
            models.Index(fields=["employee", "is_active", "component_type"]),
        ]

    def clean(self):
        if (self.amount or MONEY_ZERO) < MONEY_ZERO:
            raise ValidationError({"amount": "Component amount cannot be negative."})

    def save(self, *args, **kwargs):
        self.component_name = (self.component_name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_code} - {self.component_name}"


class LeaveType(AccountingTimeStampedModel):
    code = models.CharField(max_length=20, unique=True, db_index=True)
    name = models.CharField(max_length=80)
    is_paid = models.BooleanField(default=True, db_index=True)
    annual_allowance_days = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_leave_types"
        ordering = ["code", "id"]
        indexes = [
            models.Index(fields=["is_active", "is_paid"]),
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class LeaveRequest(AccountingTimeStampedModel):
    request_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_leave_request_no,
    )
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
        related_name="leave_requests",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.PROTECT,
        related_name="leave_requests",
    )
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    day_count = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        validators=[MinValueValidator(Decimal("0.5"))],
    )
    status = models.CharField(
        max_length=12,
        choices=LeaveRequestStatus.choices,
        default=LeaveRequestStatus.DRAFT,
        db_index=True,
    )
    reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_leave_requests",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="rejected_leave_requests",
    )
    rejected_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejection_reason = models.TextField(blank=True, default="")
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_leave_requests",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancel_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_leave_requests"
        ordering = ["-start_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["employee", "status", "start_date", "end_date"]),
            models.Index(fields=["leave_type", "status"]),
        ]

    def clean(self):
        errors = {}
        if self.end_date and self.start_date and self.end_date < self.start_date:
            errors["end_date"] = "Leave end date cannot be earlier than start date."
        span_days = None
        if self.start_date and self.end_date:
            span_days = Decimal((self.end_date - self.start_date).days + 1)
        if self.day_count and self.day_count <= MONEY_ZERO:
            errors["day_count"] = "Leave days must be greater than zero."
        if span_days is not None and self.day_count and self.day_count > span_days:
            errors["day_count"] = "Leave days cannot exceed the inclusive date span."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                LeaveRequestStatus.APPROVED,
                LeaveRequestStatus.REJECTED,
                LeaveRequestStatus.CANCELLED,
            },
            label="leave request",
        )
        self.request_no = (self.request_no or generate_leave_request_no()).strip().upper()
        self.reason = (self.reason or "").strip()
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.cancel_reason = (self.cancel_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.request_no


class EmployeeAttendance(AccountingTimeStampedModel):
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
        related_name="attendance_entries",
    )
    attendance_date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=12,
        choices=AttendanceStatus.choices,
        default=AttendanceStatus.PRESENT,
        db_index=True,
    )
    worked_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    overtime_hours = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    leave_request = models.ForeignKey(
        LeaveRequest,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="attendance_entries",
    )
    notes = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="recorded_employee_attendance",
    )

    class Meta:
        db_table = "accounting_employee_attendance"
        ordering = ["-attendance_date", "-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "attendance_date"],
                name="accounting_employee_attendance_unique_employee_date",
            ),
        ]
        indexes = [
            models.Index(fields=["attendance_date", "status"]),
        ]

    def clean(self):
        errors = {}
        if self.status in {AttendanceStatus.ABSENT, AttendanceStatus.LEAVE}:
            if (self.worked_hours or MONEY_ZERO) > MONEY_ZERO:
                errors["worked_hours"] = "Absent or leave attendance cannot carry worked hours."
            if (self.overtime_hours or MONEY_ZERO) > MONEY_ZERO:
                errors["overtime_hours"] = "Absent or leave attendance cannot carry overtime hours."
        if (self.overtime_hours or MONEY_ZERO) > MONEY_ZERO and self.status in {
            AttendanceStatus.ABSENT,
            AttendanceStatus.LEAVE,
        }:
            errors["overtime_hours"] = "Overtime is not allowed for absent or leave attendance."
        if self.leave_request_id and self.status != AttendanceStatus.LEAVE:
            errors["leave_request"] = "Leave-linked attendance rows must use LEAVE status."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_code} {self.attendance_date}"


class SalarySheet(AccountingTimeStampedModel):
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
        related_name="salary_sheets",
    )
    payroll_period = models.ForeignKey(
        PayrollPeriod,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="salary_sheets",
    )
    year = models.PositiveIntegerField(
        validators=[MinValueValidator(2000), MaxValueValidator(9999)],
        db_index=True,
    )
    month = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        db_index=True,
    )
    gross_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    deductions_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    net_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=15,
        choices=SalarySheetStatus.choices,
        default=SalarySheetStatus.DRAFT,
        db_index=True,
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_salary_sheet",
    )

    class Meta:
        db_table = "accounting_salary_sheets"
        ordering = ["-year", "-month", "-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "year", "month"],
                name="accounting_salary_sheet_unique_employee_period",
            ),
        ]
        indexes = [
            models.Index(fields=["payroll_period", "status"]),
        ]

    def clean(self):
        errors = {}
        expected_net = (self.gross_amount or MONEY_ZERO) - (
            self.deductions_amount or MONEY_ZERO
        )
        if expected_net < MONEY_ZERO:
            errors["deductions_amount"] = "Deductions cannot exceed gross amount."
        elif self.net_amount != expected_net:
            errors["net_amount"] = "Net amount must equal gross amount minus deductions."
        if self.status in {SalarySheetStatus.POSTED, SalarySheetStatus.PAID, SalarySheetStatus.PAID_PARTIAL} and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted salary sheets must reference a journal entry."
        if self.payroll_period_id:
            if self.payroll_period.year != self.year or self.payroll_period.month != self.month:
                errors["payroll_period"] = "Payroll period year and month must match the salary sheet period."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                SalarySheetStatus.APPROVED,
                SalarySheetStatus.POSTED,
                SalarySheetStatus.PAID_PARTIAL,
                SalarySheetStatus.PAID,
            },
            allowed_transitions={
                (SalarySheetStatus.APPROVED, SalarySheetStatus.POSTED),
                (SalarySheetStatus.POSTED, SalarySheetStatus.PAID_PARTIAL),
                (SalarySheetStatus.POSTED, SalarySheetStatus.PAID),
                (SalarySheetStatus.PAID_PARTIAL, SalarySheetStatus.PAID),
            },
            label="salary sheet",
        )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_code} - {self.year}-{self.month:02d}"


class SalarySheetLine(AccountingTimeStampedModel):
    salary_sheet = models.ForeignKey(
        SalarySheet,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    component_name = models.CharField(max_length=120)
    component_type = models.CharField(
        max_length=12,
        choices=CompensationComponentType.choices,
        db_index=True,
    )
    source_type = models.CharField(
        max_length=20,
        choices=SalaryLineSourceType.choices,
        default=SalaryLineSourceType.MANUAL,
        db_index=True,
    )
    source_reference = models.CharField(max_length=120, blank=True, default="")
    quantity = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    rate = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    sort_order = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_salary_sheet_lines"
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["salary_sheet", "component_type", "source_type"]),
        ]

    def clean(self):
        if (self.amount or MONEY_ZERO) <= MONEY_ZERO:
            raise ValidationError({"amount": "Salary line amount must be greater than zero."})

    def save(self, *args, **kwargs):
        self.component_name = (self.component_name or "").strip()
        self.source_reference = (self.source_reference or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.salary_sheet_id} - {self.component_name}"


class SalaryPayment(AccountingTimeStampedModel):
    salary_sheet = models.ForeignKey(
        SalarySheet,
        on_delete=models.PROTECT,
        related_name="salary_payments",
    )
    payment_date = models.DateField(db_index=True)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="salary_payments",
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="salary_payments",
    )
    reference_no = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_salary_payment",
    )

    class Meta:
        db_table = "accounting_salary_payments"
        ordering = ["-payment_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["branch", "payment_date"]),
        ]

    def clean(self):
        errors = {}
        if (self.amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["amount"] = "Salary payment amount must be greater than zero."
        if self.finance_account_id and not self.finance_account.is_active:
            errors["finance_account"] = "Finance account must be active."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _posted_reference_guard(self, label="salary payment")
        self.reference_no = (self.reference_no or "").strip() or None
        if self.branch_id is None:
            self.branch = (
                getattr(self.finance_account, "branch", None)
                or getattr(self.salary_sheet.employee, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Salary Payment {self.id or 'new'}"


class EmployeeExpenseClaim(AccountingTimeStampedModel):
    claim_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_expense_claim_no,
    )
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
        related_name="expense_claims",
    )
    claim_date = models.DateField(db_index=True)
    expense_date = models.DateField(db_index=True)
    category = models.CharField(max_length=80, blank=True, default="")
    expense_account = models.ForeignKey(
        ChartOfAccount,
        on_delete=models.PROTECT,
        related_name="employee_expense_claims",
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="employee_expense_claims",
    )
    claimed_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    approved_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=15,
        choices=ExpenseClaimStatus.choices,
        default=ExpenseClaimStatus.DRAFT,
        db_index=True,
    )
    bill_no = models.CharField(max_length=100, blank=True, default="", db_index=True)
    notes = models.TextField(blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_employee_expense_claims",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="rejected_employee_expense_claims",
    )
    rejected_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejection_reason = models.TextField(blank=True, default="")
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_employee_expense_claim",
    )

    class Meta:
        db_table = "accounting_employee_expense_claims"
        ordering = ["-expense_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["employee", "status", "expense_date"]),
            models.Index(fields=["claim_date", "status"]),
            models.Index(fields=["branch", "expense_date"]),
        ]

    def clean(self):
        errors = {}
        if self.expense_account_id and self.expense_account.account_type != ChartOfAccountType.EXPENSE:
            errors["expense_account"] = "Employee expense claims must use an EXPENSE chart account."
        if (self.claimed_amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["claimed_amount"] = "Claimed amount must be greater than zero."
        if (self.approved_amount or MONEY_ZERO) < MONEY_ZERO:
            errors["approved_amount"] = "Approved amount cannot be negative."
        if (self.approved_amount or MONEY_ZERO) > (self.claimed_amount or MONEY_ZERO):
            errors["approved_amount"] = "Approved amount cannot exceed claimed amount."
        if self.status in {
            ExpenseClaimStatus.POSTED,
            ExpenseClaimStatus.PAID_PARTIAL,
            ExpenseClaimStatus.PAID,
        } and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted claims must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={
                ExpenseClaimStatus.APPROVED,
                ExpenseClaimStatus.POSTED,
                ExpenseClaimStatus.PAID_PARTIAL,
                ExpenseClaimStatus.PAID,
                ExpenseClaimStatus.REJECTED,
                ExpenseClaimStatus.CANCELLED,
            },
            allowed_transitions={
                (ExpenseClaimStatus.APPROVED, ExpenseClaimStatus.POSTED),
                (ExpenseClaimStatus.POSTED, ExpenseClaimStatus.PAID_PARTIAL),
                (ExpenseClaimStatus.POSTED, ExpenseClaimStatus.PAID),
                (ExpenseClaimStatus.PAID_PARTIAL, ExpenseClaimStatus.PAID),
            },
            label="employee expense claim",
        )
        self.claim_no = (self.claim_no or generate_expense_claim_no()).strip().upper()
        self.category = (self.category or "").strip()
        self.bill_no = (self.bill_no or "").strip()
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        if self.branch_id is None:
            self.branch = getattr(self.employee, "branch", None) or _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.claim_no


class EmployeeExpenseClaimPayment(AccountingTimeStampedModel):
    expense_claim = models.ForeignKey(
        EmployeeExpenseClaim,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    payment_date = models.DateField(db_index=True)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="employee_expense_claim_payments",
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="employee_expense_claim_payments",
    )
    reference_no = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_employee_expense_claim_payment",
    )

    class Meta:
        db_table = "accounting_employee_expense_claim_payments"
        ordering = ["-payment_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["expense_claim", "payment_date"]),
            models.Index(fields=["branch", "payment_date"]),
        ]

    def clean(self):
        errors = {}
        if (self.amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["amount"] = "Claim payment amount must be greater than zero."
        if self.finance_account_id and not self.finance_account.is_active:
            errors["finance_account"] = "Finance account must be active."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _posted_reference_guard(self, label="employee expense claim payment")
        self.reference_no = (self.reference_no or "").strip() or None
        if self.branch_id is None:
            self.branch = (
                getattr(self.finance_account, "branch", None)
                or getattr(self.expense_claim, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Claim Payment {self.id or 'new'}"


class MoneyMovement(AccountingTimeStampedModel):
    movement_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_movement_no,
    )
    movement_date = models.DateField(db_index=True)
    from_finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="outgoing_money_movements",
    )
    to_finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="incoming_money_movements",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    reference_no = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=10,
        choices=MoneyMovementStatus.choices,
        default=MoneyMovementStatus.DRAFT,
        db_index=True,
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_money_movement",
    )

    class Meta:
        db_table = "accounting_money_movements"
        ordering = ["-movement_date", "-created_at", "-id"]

    def clean(self):
        errors = {}
        if self.from_finance_account_id and self.to_finance_account_id:
            if self.from_finance_account_id == self.to_finance_account_id:
                errors["to_finance_account"] = "Source and destination finance accounts must be different."
        if (self.amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["amount"] = "Movement amount must be greater than zero."
        if self.status == MoneyMovementStatus.POSTED and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted money movements must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={MoneyMovementStatus.POSTED, MoneyMovementStatus.CANCELLED},
            label="money movement",
        )
        self.movement_no = (
            self.movement_no or generate_movement_no()
        ).strip().upper()
        self.reference_no = (self.reference_no or "").strip() or None
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.movement_no


class VendorSettlement(AccountingTimeStampedModel):
    settlement_no = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        default=generate_vendor_settlement_no,
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        related_name="vendor_settlements",
    )
    settlement_date = models.DateField(db_index=True)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="vendor_settlements",
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        related_name="vendor_settlements",
    )
    reference_no = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    purchase_bill = models.ForeignKey(
        "inventory.PurchaseBill",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="vendor_settlements",
    )
    status = models.CharField(
        max_length=12,
        choices=VendorSettlementStatus.choices,
        default=VendorSettlementStatus.DRAFT,
        db_index=True,
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="vendor_settlement",
    )

    class Meta:
        db_table = "accounting_vendor_settlements"
        ordering = ["-settlement_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["vendor", "settlement_date"]),
            models.Index(fields=["status", "settlement_date"]),
            models.Index(fields=["branch", "settlement_date"]),
        ]

    def clean(self):
        errors = {}
        if (self.amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["amount"] = "Settlement amount must be greater than zero."
        if self.status == VendorSettlementStatus.POSTED and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted vendor settlements must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={VendorSettlementStatus.POSTED, VendorSettlementStatus.CANCELLED},
            label="vendor settlement",
        )
        self.settlement_no = (
            self.settlement_no or generate_vendor_settlement_no()
        ).strip().upper()
        self.reference_no = (self.reference_no or "").strip() or None
        if self.branch_id is None:
            self.branch = (
                getattr(self.finance_account, "branch", None)
                or getattr(self.purchase_bill, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.settlement_no


class AccountingBridgePosting(AccountingTimeStampedModel):
    source_model = models.CharField(max_length=100, db_index=True)
    source_id = models.CharField(max_length=100, db_index=True)
    purpose = models.CharField(max_length=100, db_index=True)
    voucher_type = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    source_type = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    source_reference = models.CharField(max_length=120, blank=True, default="", db_index=True)
    source_document_no = models.CharField(max_length=80, blank=True, default="")
    source_event_date = models.DateField(null=True, blank=True, db_index=True)
    trace_metadata = models.JSONField(default=dict, blank=True)
    journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        related_name="bridge_posting",
    )

    class Meta:
        db_table = "accounting_bridge_postings"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source_model", "source_id", "purpose"],
                name="accounting_bridge_unique_source_purpose",
            ),
        ]
        indexes = [
            models.Index(fields=["purpose", "source_type", "source_event_date"]),
            models.Index(fields=["voucher_type", "source_event_date"]),
        ]

    def save(self, *args, **kwargs):
        self.source_model = (self.source_model or "").strip()
        self.source_id = (self.source_id or "").strip()
        self.purpose = (self.purpose or "").strip().upper()
        self.voucher_type = (self.voucher_type or "").strip().upper() or None
        self.source_type = (self.source_type or "").strip().upper() or None
        self.source_reference = (self.source_reference or "").strip()
        self.source_document_no = (self.source_document_no or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.source_model}#{self.source_id}::{self.purpose}"


class TaxInvoice(AccountingTimeStampedModel):
    invoice_no = models.CharField(
        max_length=40,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    invoice_date = models.DateField(db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="tax_invoices",
    )
    supplier_name = models.CharField(max_length=160)
    supplier_gstin = models.CharField(max_length=20, blank=True, default="")
    supplier_address = models.TextField(blank=True, default="")
    supplier_state_code = models.CharField(max_length=5, blank=True, default="")
    recipient_name = models.CharField(max_length=160)
    recipient_address = models.TextField(blank=True, default="")
    recipient_gstin = models.CharField(max_length=20, blank=True, default="")
    place_of_supply_state_code = models.CharField(max_length=5, blank=True, default="")
    supply_kind = models.CharField(
        max_length=10,
        choices=SupplyKind.choices,
        default=SupplyKind.INTRA,
        db_index=True,
    )
    subtotal_taxable = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    cgst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    sgst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    igst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=10,
        choices=TaxDocumentStatus.choices,
        default=TaxDocumentStatus.DRAFT,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_tax_invoices",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancel_reason = models.TextField(blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_tax_invoices",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_tax_invoice",
    )
    reversal_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversed_tax_invoice",
    )

    class Meta:
        db_table = "accounting_tax_invoices"
        ordering = ["-invoice_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "invoice_date"]),
            models.Index(fields=["supply_kind", "invoice_date"]),
        ]

    def clean(self):
        errors = {}
        tax_total = (self.cgst_amount or MONEY_ZERO) + (self.sgst_amount or MONEY_ZERO) + (
            self.igst_amount or MONEY_ZERO
        )
        expected_total = (self.subtotal_taxable or MONEY_ZERO) + tax_total
        if self.total_amount != expected_total:
            errors["total_amount"] = "Total amount must equal taxable subtotal plus GST."
        if self.status == TaxDocumentStatus.POSTED and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted tax invoices must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED, TaxDocumentStatus.CANCELLED},
            allowed_transitions={
                (TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED),
                (TaxDocumentStatus.APPROVED, TaxDocumentStatus.CANCELLED),
                (TaxDocumentStatus.POSTED, TaxDocumentStatus.CANCELLED),
            },
            label="tax invoice",
        )
        self.invoice_no = (self.invoice_no or "").strip().upper() or None
        self.supplier_name = (self.supplier_name or "").strip()
        self.supplier_gstin = (self.supplier_gstin or "").strip().upper()
        self.supplier_address = (self.supplier_address or "").strip()
        self.supplier_state_code = (self.supplier_state_code or "").strip().upper()
        self.recipient_name = (self.recipient_name or "").strip()
        self.recipient_address = (self.recipient_address or "").strip()
        self.recipient_gstin = (self.recipient_gstin or "").strip().upper()
        self.place_of_supply_state_code = (
            (self.place_of_supply_state_code or "").strip().upper()
        )
        self.notes = (self.notes or "").strip()
        self.cancel_reason = (self.cancel_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.invoice_no or f"Tax Invoice {self.id}"


class TaxInvoiceLine(AccountingTimeStampedModel):
    tax_invoice = models.ForeignKey(
        TaxInvoice,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    description = models.CharField(max_length=255)
    hsn_sac = models.CharField(max_length=20, blank=True, default="")
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    taxable_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    gst_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    cgst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    sgst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    igst_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )

    class Meta:
        db_table = "accounting_tax_invoice_lines"
        ordering = ["id"]

    def clean(self):
        errors = {}
        expected_total = (
            (self.taxable_value or MONEY_ZERO)
            + (self.cgst_amount or MONEY_ZERO)
            + (self.sgst_amount or MONEY_ZERO)
            + (self.igst_amount or MONEY_ZERO)
        )
        if self.line_total != expected_total:
            errors["line_total"] = "Line total must equal taxable value plus GST."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.hsn_sac = (self.hsn_sac or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)


class CreditNote(AccountingTimeStampedModel):
    note_no = models.CharField(
        max_length=40,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    note_date = models.DateField(db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="credit_notes",
    )
    original_invoice = models.ForeignKey(
        TaxInvoice,
        on_delete=models.PROTECT,
        related_name="credit_notes",
    )
    reason = models.TextField(blank=True, default="")
    taxable_adjustment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    tax_adjustment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    total_adjustment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=10,
        choices=TaxDocumentStatus.choices,
        default=TaxDocumentStatus.DRAFT,
        db_index=True,
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_credit_notes",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancel_reason = models.TextField(blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_credit_notes",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_credit_note",
    )
    reversal_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversed_credit_note",
    )

    class Meta:
        db_table = "accounting_credit_notes"
        ordering = ["-note_date", "-created_at", "-id"]

    def clean(self):
        errors = {}
        expected_total = (self.taxable_adjustment or MONEY_ZERO) + (
            self.tax_adjustment or MONEY_ZERO
        )
        if self.total_adjustment != expected_total:
            errors["total_adjustment"] = "Total adjustment must equal taxable and tax adjustments."
        if self.status == TaxDocumentStatus.POSTED and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted credit notes must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED, TaxDocumentStatus.CANCELLED},
            allowed_transitions={
                (TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED),
                (TaxDocumentStatus.APPROVED, TaxDocumentStatus.CANCELLED),
                (TaxDocumentStatus.POSTED, TaxDocumentStatus.CANCELLED),
            },
            label="credit note",
        )
        self.note_no = (self.note_no or "").strip().upper() or None
        self.reason = (self.reason or "").strip()
        self.cancel_reason = (self.cancel_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class DebitNote(AccountingTimeStampedModel):
    note_no = models.CharField(
        max_length=40,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    note_date = models.DateField(db_index=True)
    doc_series = models.ForeignKey(
        DocumentSequence,
        on_delete=models.PROTECT,
        related_name="debit_notes",
    )
    original_invoice = models.ForeignKey(
        TaxInvoice,
        on_delete=models.PROTECT,
        related_name="debit_notes",
    )
    reason = models.TextField(blank=True, default="")
    taxable_adjustment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    tax_adjustment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    total_adjustment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    status = models.CharField(
        max_length=10,
        choices=TaxDocumentStatus.choices,
        default=TaxDocumentStatus.DRAFT,
        db_index=True,
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_debit_notes",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancel_reason = models.TextField(blank=True, default="")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_debit_notes",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_debit_note",
    )
    reversal_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversed_debit_note",
    )

    class Meta:
        db_table = "accounting_debit_notes"
        ordering = ["-note_date", "-created_at", "-id"]

    def clean(self):
        errors = {}
        expected_total = (self.taxable_adjustment or MONEY_ZERO) + (
            self.tax_adjustment or MONEY_ZERO
        )
        if self.total_adjustment != expected_total:
            errors["total_adjustment"] = "Total adjustment must equal taxable and tax adjustments."
        if self.status == TaxDocumentStatus.POSTED and not self.posted_journal_entry_id:
            errors["posted_journal_entry"] = "Posted debit notes must reference a journal entry."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _immutable_status_guard(
            self,
            immutable_statuses={TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED, TaxDocumentStatus.CANCELLED},
            allowed_transitions={
                (TaxDocumentStatus.APPROVED, TaxDocumentStatus.POSTED),
                (TaxDocumentStatus.APPROVED, TaxDocumentStatus.CANCELLED),
                (TaxDocumentStatus.POSTED, TaxDocumentStatus.CANCELLED),
            },
            label="debit note",
        )
        self.note_no = (self.note_no or "").strip().upper() or None
        self.reason = (self.reason or "").strip()
        self.cancel_reason = (self.cancel_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ExportPackJob(AccountingTimeStampedModel):
    pack_type = models.CharField(
        max_length=30,
        choices=ExportPackType.choices,
        default=ExportPackType.ITR_HANDOFF,
        db_index=True,
    )
    financial_year = models.CharField(max_length=9, blank=True, default="")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=10,
        choices=ExportPackStatus.choices,
        default=ExportPackStatus.QUEUED,
        db_index=True,
    )
    file_path = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_export_pack_jobs",
    )
    error_message = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounting_export_pack_jobs"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["pack_type", "status"]),
            models.Index(fields=["financial_year", "status"]),
        ]

    def save(self, *args, **kwargs):
        self.financial_year = (self.financial_year or "").strip()
        self.file_path = (self.file_path or "").strip()
        self.error_message = (self.error_message or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)
