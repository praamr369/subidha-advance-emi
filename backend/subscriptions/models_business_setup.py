from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class BusinessSetupTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BranchType(models.TextChoices):
    HEAD_OFFICE = "HEAD_OFFICE", "Head Office"
    BRANCH = "BRANCH", "Branch"
    WAREHOUSE = "WAREHOUSE", "Warehouse"
    COLLECTION_POINT = "COLLECTION_POINT", "Collection Point"


class FinanceAccountType(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI = "UPI", "UPI"
    OTHER = "OTHER", "Other"


class CashDeskType(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI = "UPI", "UPI"
    MIXED = "MIXED", "Mixed"


class StaffOperationalRoleScope(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    CASHIER = "CASHIER", "Cashier"
    PARTNER = "PARTNER", "Partner"
    MANAGER = "MANAGER", "Manager"
    FINANCE_REVIEWER = "FINANCE_REVIEWER", "Finance Reviewer"


class ChartAccountCategory(models.TextChoices):
    ASSET = "ASSET", "Asset"
    LIABILITY = "LIABILITY", "Liability"
    INCOME = "INCOME", "Income"
    EXPENSE = "EXPENSE", "Expense"
    EQUITY = "EQUITY", "Equity"


class ChartAccountGroup(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    RECEIVABLE = "RECEIVABLE", "Receivable"
    PAYABLE = "PAYABLE", "Payable"
    REVENUE = "REVENUE", "Revenue"
    COMMISSION = "COMMISSION", "Commission"
    WAIVER = "WAIVER", "Waiver"
    TAX = "TAX", "Tax"
    EXPENSE = "EXPENSE", "Expense"
    SUSPENSE = "SUSPENSE", "Suspense"
    EQUITY = "EQUITY", "Equity"


class BusinessProfile(BusinessSetupTimeStampedModel):
    legal_name = models.CharField(max_length=255)
    trade_name = models.CharField(max_length=255, blank=True, default="")
    business_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    primary_email = models.EmailField(blank=True, default="")
    primary_phone = models.CharField(max_length=20, blank=True, default="")
    alternate_phone = models.CharField(max_length=20, blank=True, default="")
    website_url = models.URLField(blank=True, default="")
    address_line_1 = models.CharField(max_length=255, blank=True, default="")
    address_line_2 = models.CharField(max_length=255, blank=True, default="")
    landmark = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    district = models.CharField(max_length=120, blank=True, default="")
    state = models.CharField(max_length=120, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    country = models.CharField(max_length=80, default="India")
    gstin = models.CharField(max_length=32, blank=True, default="")
    pan_number = models.CharField(max_length=32, blank=True, default="")
    invoice_prefix = models.CharField(max_length=20, blank=True, default="")
    receipt_prefix = models.CharField(max_length=20, blank=True, default="")
    default_currency_code = models.CharField(max_length=10, default="INR")
    timezone_name = models.CharField(max_length=64, default="Asia/Kolkata")
    logo_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "business_profiles"
        ordering = ["-created_at", "-id"]

    def clean(self):
        errors = {}
        if not (self.legal_name or "").strip():
            errors["legal_name"] = "Legal name is required."
        if self.is_active and BusinessProfile.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active business profile is allowed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.legal_name = (self.legal_name or "").strip()
        self.trade_name = (self.trade_name or "").strip()
        self.business_code = (self.business_code or "").strip().upper()
        self.primary_phone = (self.primary_phone or "").strip()
        self.alternate_phone = (self.alternate_phone or "").strip()
        self.address_line_1 = (self.address_line_1 or "").strip()
        self.address_line_2 = (self.address_line_2 or "").strip()
        self.landmark = (self.landmark or "").strip()
        self.city = (self.city or "").strip()
        self.district = (self.district or "").strip()
        self.state = (self.state or "").strip()
        self.postal_code = (self.postal_code or "").strip()
        self.country = (self.country or "").strip() or "India"
        self.gstin = (self.gstin or "").strip().upper()
        self.pan_number = (self.pan_number or "").strip().upper()
        self.invoice_prefix = (self.invoice_prefix or "").strip().upper()
        self.receipt_prefix = (self.receipt_prefix or "").strip().upper()
        self.default_currency_code = (self.default_currency_code or "").strip().upper() or "INR"
        self.timezone_name = (self.timezone_name or "").strip() or "Asia/Kolkata"
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.trade_name or self.legal_name


class PublicBusinessProfile(BusinessSetupTimeStampedModel):
    """
    Public-facing business identity and contact settings.

    Intentionally separated from BusinessProfile so public pages never need to
    depend on internal-only fields (GSTIN, PAN, document prefixes, etc).
    """

    display_name = models.CharField(max_length=255, blank=True, default="")
    tagline = models.CharField(max_length=255, blank=True, default="")
    hero_title = models.CharField(max_length=255, blank=True, default="")
    hero_subtitle = models.TextField(blank=True, default="")

    support_phone = models.CharField(max_length=20, blank=True, default="")
    support_email = models.EmailField(blank=True, default="")

    whatsapp_phone = models.CharField(max_length=20, blank=True, default="")
    whatsapp_link = models.URLField(blank=True, default="")

    facebook_url = models.URLField(blank=True, default="")
    instagram_url = models.URLField(blank=True, default="")
    youtube_url = models.URLField(blank=True, default="")

    address_text = models.TextField(blank=True, default="")
    map_url = models.URLField(blank=True, default="")
    business_hours = models.TextField(blank=True, default="")

    public_logo_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "public_business_profiles"
        ordering = ["-created_at", "-id"]

    def clean(self):
        errors = {}

        if self.is_active and PublicBusinessProfile.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active public business profile is allowed."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.display_name = (self.display_name or "").strip()
        self.tagline = (self.tagline or "").strip()
        self.hero_title = (self.hero_title or "").strip()
        self.hero_subtitle = (self.hero_subtitle or "").strip()
        self.support_phone = (self.support_phone or "").strip()
        self.support_email = (self.support_email or "").strip()
        self.whatsapp_phone = (self.whatsapp_phone or "").strip()
        self.whatsapp_link = (self.whatsapp_link or "").strip()
        self.facebook_url = (self.facebook_url or "").strip()
        self.instagram_url = (self.instagram_url or "").strip()
        self.youtube_url = (self.youtube_url or "").strip()
        self.address_text = (self.address_text or "").strip()
        self.map_url = (self.map_url or "").strip()
        self.business_hours = (self.business_hours or "").strip()
        self.public_logo_url = (self.public_logo_url or "").strip()

        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name or "Public Business Profile"


class Branch(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    branch_type = models.CharField(max_length=30, choices=BranchType.choices, default=BranchType.BRANCH, db_index=True)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    manager_name = models.CharField(max_length=120, blank=True, default="")
    address_line_1 = models.CharField(max_length=255, blank=True, default="")
    address_line_2 = models.CharField(max_length=255, blank=True, default="")
    landmark = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    district = models.CharField(max_length=120, blank=True, default="")
    state = models.CharField(max_length=120, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    country = models.CharField(max_length=80, default="India")
    is_head_office = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    opened_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "branches"
        ordering = ["name", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Branch code is required."
        if not (self.name or "").strip():
            errors["name"] = "Branch name is required."
        if self.is_active and self.is_head_office:
            if Branch.objects.filter(is_active=True, is_head_office=True).exclude(pk=self.pk).exists():
                errors["is_head_office"] = "Only one active head office branch is allowed."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.manager_name = (self.manager_name or "").strip()
        self.address_line_1 = (self.address_line_1 or "").strip()
        self.address_line_2 = (self.address_line_2 or "").strip()
        self.landmark = (self.landmark or "").strip()
        self.city = (self.city or "").strip()
        self.district = (self.district or "").strip()
        self.state = (self.state or "").strip()
        self.postal_code = (self.postal_code or "").strip()
        self.country = (self.country or "").strip() or "India"
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class FinanceAccount(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    account_type = models.CharField(max_length=10, choices=FinanceAccountType.choices, default=FinanceAccountType.CASH, db_index=True)
    account_holder_name = models.CharField(max_length=255, blank=True, default="")
    provider_name = models.CharField(max_length=255, blank=True, default="")
    bank_name = models.CharField(max_length=255, blank=True, default="")
    branch_name = models.CharField(max_length=255, blank=True, default="")
    masked_account_number = models.CharField(max_length=64, blank=True, default="")
    ifsc_code = models.CharField(max_length=32, blank=True, default="")
    upi_handle = models.CharField(max_length=128, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "finance_accounts"
        ordering = ["name", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Finance account code is required."
        if not (self.name or "").strip():
            errors["name"] = "Finance account name is required."
        if self.account_type == FinanceAccountType.UPI and not (self.upi_handle or "").strip():
            errors["upi_handle"] = "UPI handle is required for UPI finance accounts."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.account_holder_name = (self.account_holder_name or "").strip()
        self.provider_name = (self.provider_name or "").strip()
        self.bank_name = (self.bank_name or "").strip()
        self.branch_name = (self.branch_name or "").strip()
        self.masked_account_number = (self.masked_account_number or "").strip()
        self.ifsc_code = (self.ifsc_code or "").strip().upper()
        self.upi_handle = (self.upi_handle or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class CashDesk(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="cash_desks")
    desk_type = models.CharField(max_length=10, choices=CashDeskType.choices, default=CashDeskType.CASH, db_index=True)
    default_finance_account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, related_name="cash_desks")
    allow_cash_collection = models.BooleanField(default=True)
    allow_bank_collection = models.BooleanField(default=False)
    allow_upi_collection = models.BooleanField(default=False)
    receipt_printer_name = models.CharField(max_length=255, blank=True, default="")
    device_label = models.CharField(max_length=255, blank=True, default="")
    is_default_for_branch = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "cash_desks"
        ordering = ["branch_id", "name", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Cash desk code is required."
        if not (self.name or "").strip():
            errors["name"] = "Cash desk name is required."
        if self.default_finance_account_id and not self.default_finance_account.is_active:
            errors["default_finance_account"] = "Default finance account must be active."
        if self.desk_type == CashDeskType.CASH and not self.allow_cash_collection:
            errors["desk_type"] = "Cash desk must allow cash collection."
        if self.desk_type == CashDeskType.BANK and not self.allow_bank_collection:
            errors["desk_type"] = "Bank desk must allow bank collection."
        if self.desk_type == CashDeskType.UPI and not self.allow_upi_collection:
            errors["desk_type"] = "UPI desk must allow UPI collection."
        if self.desk_type == CashDeskType.MIXED and not any([self.allow_cash_collection, self.allow_bank_collection, self.allow_upi_collection]):
            errors["desk_type"] = "Mixed desk must allow at least one collection method."
        if self.is_active and self.is_default_for_branch:
            if CashDesk.objects.filter(branch=self.branch, is_active=True, is_default_for_branch=True).exclude(pk=self.pk).exists():
                errors["is_default_for_branch"] = "Only one active default cash desk is allowed per branch."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.receipt_printer_name = (self.receipt_printer_name or "").strip()
        self.device_label = (self.device_label or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.branch.code} - {self.name}"


class StaffOperationalAssignment(BusinessSetupTimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="operational_assignments")
    role_scope = models.CharField(max_length=30, choices=StaffOperationalRoleScope.choices, default=StaffOperationalRoleScope.CASHIER, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="staff_operational_assignments")
    default_cash_desk = models.ForeignKey(CashDesk, on_delete=models.PROTECT, related_name="staff_operational_assignments", null=True, blank=True)
    can_collect_payments = models.BooleanField(default=False)
    can_verify_payments = models.BooleanField(default=False)
    can_manage_branches = models.BooleanField(default=False)
    can_manage_cash_desks = models.BooleanField(default=False)
    can_manage_finance_accounts = models.BooleanField(default=False)
    can_manage_chart_accounts = models.BooleanField(default=False)
    can_run_go_live_reset = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    effective_from = models.DateField(default=timezone.localdate)
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "staff_operational_assignments"
        ordering = ["-created_at", "-id"]

    def clean(self):
        errors = {}
        if self.default_cash_desk_id and self.default_cash_desk.branch_id != self.branch_id:
            errors["default_cash_desk"] = "Default cash desk must belong to the same branch."
        if self.is_active and self.is_primary:
            if StaffOperationalAssignment.objects.filter(user=self.user, is_active=True, is_primary=True).exclude(pk=self.pk).exists():
                errors["is_primary"] = "Only one active primary assignment is allowed per user."
        if self.effective_to and self.effective_to < self.effective_from:
            errors["effective_to"] = "Effective to date cannot be earlier than effective from date."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user_id} - {self.branch.code} - {self.role_scope}"


class ChartAccount(BusinessSetupTimeStampedModel):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    account_category = models.CharField(max_length=20, choices=ChartAccountCategory.choices, db_index=True)
    account_group = models.CharField(max_length=20, choices=ChartAccountGroup.choices, db_index=True)
    parent = models.ForeignKey("self", on_delete=models.PROTECT, related_name="children", null=True, blank=True)
    description = models.TextField(blank=True, default="")
    is_system = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    allow_manual_posting = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        db_table = "chart_accounts"
        ordering = ["display_order", "code", "id"]

    def clean(self):
        errors = {}
        if not (self.code or "").strip():
            errors["code"] = "Chart account code is required."
        if not (self.name or "").strip():
            errors["name"] = "Chart account name is required."
        if self.parent_id and self.parent_id == self.pk:
            errors["parent"] = "Chart account cannot be its own parent."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"
