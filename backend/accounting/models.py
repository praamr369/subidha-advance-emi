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


def _generate_reference(prefix: str) -> str:
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
    return f"{prefix}-{timestamp}"


def generate_chart_code() -> str:
    return _generate_reference("COA")


def generate_entry_no() -> str:
    return _generate_reference("JE")


def generate_voucher_no() -> str:
    return _generate_reference("EXP")


def generate_movement_no() -> str:
    return _generate_reference("MOV")


def generate_employee_code() -> str:
    return _generate_reference("EMP")


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


class MoneyMovementStatus(models.TextChoices):
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


class ExportPackStatus(models.TextChoices):
    QUEUED = "QUEUED", "Queued"
    RUNNING = "RUNNING", "Running"
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"


class DocumentSequence(AccountingTimeStampedModel):
    series_code = models.CharField(max_length=30, unique=True, db_index=True)
    financial_year = models.CharField(max_length=9, db_index=True)
    prefix = models.CharField(max_length=20, blank=True, default="")
    next_number = models.PositiveIntegerField(default=1)
    padding = models.PositiveSmallIntegerField(default=5)
    last_issued_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "accounting_document_sequences"
        ordering = ["series_code", "financial_year", "id"]
        indexes = [
            models.Index(fields=["financial_year", "is_active"]),
        ]

    def save(self, *args, **kwargs):
        self.series_code = (self.series_code or "").strip().upper()
        self.financial_year = (self.financial_year or "").strip()
        self.prefix = (self.prefix or "").strip()
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
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.system_code = (
            (self.system_code or "").strip().upper() or None
        )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class FinanceAccount(AccountingTimeStampedModel):
    name = models.CharField(max_length=120)
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
    is_active = models.BooleanField(default=True, db_index=True)
    bank_last4 = models.CharField(max_length=4, blank=True, default="")
    upi_handle = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "accounting_finance_accounts"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["kind", "is_active"]),
        ]

    def clean(self):
        errors = {}
        if self.chart_account_id and self.chart_account.account_type != ChartOfAccountType.ASSET:
            errors["chart_account"] = "Finance accounts must map to ASSET chart accounts."
        if self.bank_last4 and len(self.bank_last4) != 4:
            errors["bank_last4"] = "bank_last4 must contain exactly 4 characters."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.bank_last4 = (self.bank_last4 or "").strip()
        self.upi_handle = (self.upi_handle or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


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

    class Meta:
        db_table = "accounting_journal_entries"
        ordering = ["-entry_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["entry_type", "status"]),
            models.Index(fields=["source_model", "source_id"]),
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
        self.entry_no = (self.entry_no or generate_entry_no()).strip().upper()
        self.memo = (self.memo or "").strip()
        self.source_model = (self.source_model or "").strip() or None
        self.source_id = (self.source_id or "").strip() or None
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


class Vendor(AccountingTimeStampedModel):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    gstin = models.CharField(max_length=20, null=True, blank=True, db_index=True)
    state_code = models.CharField(max_length=5, null=True, blank=True)
    state_name = models.CharField(max_length=100, null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "accounting_vendors"
        ordering = ["name", "id"]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.address = (self.address or "").strip()
        self.gstin = (self.gstin or "").strip().upper() or None
        self.state_code = (self.state_code or "").strip().upper() or None
        self.state_name = (self.state_name or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


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
        self.voucher_no = (self.voucher_no or generate_voucher_no()).strip().upper()
        self.bill_no = (self.bill_no or "").strip()
        self.notes = (self.notes or "").strip()
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
    joining_date = models.DateField(db_index=True)
    base_salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "accounting_employee_profiles"
        ordering = ["name", "id"]

    def save(self, *args, **kwargs):
        self.employee_code = (
            self.employee_code or generate_employee_code()
        ).strip().upper()
        self.name = (self.name or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee_code} - {self.name}"


class SalarySheet(AccountingTimeStampedModel):
    employee = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.PROTECT,
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
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.employee_code} - {self.year}-{self.month:02d}"


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

    def clean(self):
        errors = {}
        if (self.amount or MONEY_ZERO) <= MONEY_ZERO:
            errors["amount"] = "Salary payment amount must be greater than zero."
        if self.finance_account_id and not self.finance_account.is_active:
            errors["finance_account"] = "Finance account must be active."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_no = (self.reference_no or "").strip() or None
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Salary Payment {self.id or 'new'}"


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
        self.movement_no = (
            self.movement_no or generate_movement_no()
        ).strip().upper()
        self.reference_no = (self.reference_no or "").strip() or None
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.movement_no


class AccountingBridgePosting(AccountingTimeStampedModel):
    source_model = models.CharField(max_length=100, db_index=True)
    source_id = models.CharField(max_length=100, db_index=True)
    purpose = models.CharField(max_length=100, db_index=True)
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

    def save(self, *args, **kwargs):
        self.source_model = (self.source_model or "").strip()
        self.source_id = (self.source_id or "").strip()
        self.purpose = (self.purpose or "").strip().upper()
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
        self.note_no = (self.note_no or "").strip().upper() or None
        self.reason = (self.reason or "").strip()
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
        self.note_no = (self.note_no or "").strip().upper() or None
        self.reason = (self.reason or "").strip()
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
