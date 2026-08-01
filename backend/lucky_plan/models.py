from django.db import models, transaction
from django.core.exceptions import ValidationError
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

class Batch(TimeStampedModel):
    batch_code = models.CharField(max_length=50, unique=True)
    total_slots = models.PositiveIntegerField()
    duration_months = models.PositiveIntegerField()
    draw_day = models.PositiveIntegerField()
    start_date = models.DateField()
    status = models.CharField(
        max_length=30,
        choices=BatchStatus.choices,
        default=BatchStatus.DRAFT,
        db_index=True,
    )
    locked_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Set when batch draw eligibility is frozen (LOCKED or beyond).",
    )

    class Meta:
        db_table = "batches"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["start_date"]),
            models.Index(fields=["batch_code"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_slots__gt=0),
                name="chk_batch_total_slots_positive",
            ),
            models.CheckConstraint(
                condition=Q(duration_months__gt=0),
                name="chk_batch_duration_positive",
            ),
            models.CheckConstraint(
                condition=Q(draw_day__gte=1) & Q(draw_day__lte=28),
                name="chk_batch_draw_day_range",
            ),
        ]

    def clean(self):
        if not self.batch_code or not self.batch_code.strip():
            raise ValidationError({"batch_code": "Batch code is required."})

        if self.total_slots <= 0:
            raise ValidationError({"total_slots": "Total slots must be greater than zero."})

        if self.duration_months <= 0:
            raise ValidationError({"duration_months": "Duration must be greater than zero."})

        if not (1 <= self.draw_day <= 28):
            raise ValidationError({"draw_day": "Draw day must be between 1 and 28."})

        if self.status == BatchStatus.OPEN and self.total_slots != 100:
            raise ValidationError({"total_slots": "Open batch must have exactly 100 slots."})

    def save(self, *args, **kwargs):
        self.batch_code = (self.batch_code or "").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def available_slots(self) -> int:
        return self.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).count()

    def assigned_slots(self) -> int:
        return self.lucky_ids.filter(status=LuckyIdStatus.ASSIGNED).count()

    def won_slots(self) -> int:
        return self.lucky_ids.filter(status=LuckyIdStatus.WON).count()

    def sold_slots(self) -> int:
        return self.lucky_ids.exclude(status=LuckyIdStatus.AVAILABLE).count()

    def is_full(self) -> bool:
        return self.available_slots() <= 0

    def __str__(self):
        return self.batch_code


# =====================================================
# LUCKY ID
# =====================================================


class LuckyId(TimeStampedModel):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="lucky_ids",
    )
    lucky_number = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20,
        choices=LuckyIdStatus.choices,
        default=LuckyIdStatus.AVAILABLE,
        db_index=True,
    )

    class Meta:
        db_table = "lucky_ids"
        ordering = ["batch_id", "lucky_number"]
        indexes = [
            models.Index(fields=["batch", "status"]),
            models.Index(fields=["batch", "lucky_number"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "lucky_number"],
                name="uq_lucky_id_per_batch",
            ),
            models.CheckConstraint(
                condition=Q(lucky_number__gte=0) & Q(lucky_number__lte=99),
                name="chk_lucky_number_range",
            ),
        ]

    def clean(self):
        if not (0 <= self.lucky_number <= 99):
            raise ValidationError({"lucky_number": "Lucky number must be between 00 and 99."})

        if self.pk:
            old = LuckyId.objects.only("batch_id", "lucky_number").get(pk=self.pk)
            if self.batch_id != old.batch_id:
                raise ValidationError({"batch": "Lucky ID batch cannot be changed."})
            if self.lucky_number != old.lucky_number:
                raise ValidationError({"lucky_number": "Lucky number cannot be changed."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def display_number(self) -> str:
        return f"{self.lucky_number:02d}"

    def __str__(self):
        return f"{self.batch.batch_code}-{self.display_number}"


# =====================================================
# SUBSCRIPTION
# =====================================================


class DrawEligibilitySnapshot(TimeStampedModel):
    """
    Immutable rows frozen at batch lock. Draw winner selection must use these rows,
    not live subscription queries, when snapshots exist for the batch.
    """

    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="draw_eligibility_snapshots",
    )
    snapshot_version = models.PositiveIntegerField(db_index=True)
    sort_order = models.PositiveIntegerField()
    subscription = models.ForeignKey("contracts.Subscription",
        on_delete=models.CASCADE,
        related_name="draw_eligibility_snapshots",
    )
    customer = models.ForeignKey('customers.Customer',
        on_delete=models.CASCADE,
        related_name="draw_eligibility_snapshots",
    )
    lucky_id = models.ForeignKey(
        LuckyId,
        on_delete=models.CASCADE,
        related_name="draw_eligibility_snapshots",
    )
    product = models.ForeignKey('products_core.Product',
        on_delete=models.CASCADE,
        related_name="draw_eligibility_snapshots",
    )
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="draw_eligibility_snapshots",
    )
    contract_reference = models.CharField(max_length=64, blank=True, default="")
    emi_schedule_summary = models.JSONField(default=dict)
    row_hash = models.CharField(max_length=128)

    class Meta:
        db_table = "draw_eligibility_snapshots"
        ordering = ["snapshot_version", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["batch", "snapshot_version", "subscription"],
                name="uq_draw_eligibility_batch_version_subscription",
            ),
        ]
        indexes = [
            models.Index(fields=["batch", "snapshot_version"]),
        ]

    def __str__(self):
        return f"DrawEligibilitySnapshot batch={self.batch_id} v={self.snapshot_version} sub={self.subscription_id}"



class DrawCommit(TimeStampedModel):
    """One published commit per batch for verifiable draw execution."""

    class DrawCommitStatus(models.TextChoices):
        COMMITTED = "COMMITTED", "Committed"

    batch = models.OneToOneField(
        Batch,
        on_delete=models.CASCADE,
        related_name="draw_commit",
    )
    snapshot_version = models.PositiveIntegerField()
    snapshot_hash = models.CharField(max_length=64)
    public_commit_hash = models.CharField(max_length=64)
    seed_commitment = models.CharField(max_length=64)
    committed_at = models.DateTimeField(db_index=True)
    committed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batch_draw_commits",
    )
    algorithm_version = models.CharField(max_length=32, default="pass7-v1")
    status = models.CharField(
        max_length=20,
        choices=DrawCommitStatus.choices,
        default=DrawCommitStatus.COMMITTED,
    )

    class Meta:
        db_table = "draw_commits"

    def __str__(self):
        return f"DrawCommit batch={self.batch_id} hash={self.public_commit_hash[:12]}…"


# =====================================================
# LUCKY DRAW
# =====================================================


class LuckyDraw(TimeStampedModel):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.CASCADE,
        related_name="lucky_draws",
    )
    draw_commit = models.ForeignKey(
        DrawCommit,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="lucky_draws",
    )
    committed_hash = models.CharField(max_length=64)
    revealed_seed = models.CharField(
        max_length=128,
        null=True,
        blank=True,
    )
    winner_lucky_id = models.ForeignKey(
        LuckyId,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wins",
    )
    winner_subscription = models.ForeignKey(
        "contracts.Subscription",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="winning_draws",
    )
    draw_date = models.DateTimeField(default=timezone.now)
    draw_month = models.PositiveIntegerField()
    is_revealed = models.BooleanField(default=False, db_index=True)
    revealed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    waived_emi_count = models.PositiveIntegerField(default=0)
    waived_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
    )
    waiver_scope = models.CharField(
        max_length=40,
        default="FUTURE_EMI_ONLY",
    )

    class WinnerStatus(models.TextChoices):
        PENDING = "PENDING", "Pending Verification"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    class SettlementStatus(models.TextChoices):
        UNSETTLED = "UNSETTLED", "Unsettled"
        SETTLED = "SETTLED", "Settled"

    winner_status = models.CharField(
        max_length=20,
        choices=WinnerStatus.choices,
        default=WinnerStatus.PENDING,
        db_index=True,
    )
    winner_verified_at = models.DateTimeField(null=True, blank=True)
    winner_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="verified_lucky_draws",
    )
    winner_rejected_reason = models.TextField(blank=True, default="")
    settlement_status = models.CharField(
        max_length=20,
        choices=SettlementStatus.choices,
        default=SettlementStatus.UNSETTLED,
        db_index=True,
    )

    class Meta:
        db_table = "lucky_draws"
        ordering = ["-draw_date", "-id"]
        unique_together = ("batch", "draw_month")
        indexes = [
            models.Index(fields=["batch", "draw_month"]),
            models.Index(fields=["is_revealed"]),
            models.Index(fields=["revealed_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(draw_month__gt=0),
                name="chk_draw_month_positive",
            ),
            models.CheckConstraint(
                condition=Q(waived_emi_count__gte=0),
                name="chk_lucky_draw_waived_emi_count_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(waived_amount__gte=0),
                name="chk_lucky_draw_waived_amount_non_negative",
            ),
        ]

    def verify_commitment(self) -> bool:
        if not self.revealed_seed:
            return False
        recalculated = hashlib.sha256(self.revealed_seed.encode()).hexdigest()
        return recalculated == self.committed_hash

    def clean(self):
        errors = {}

        if not self.committed_hash or len(self.committed_hash) != 64:
            errors["committed_hash"] = "Committed hash must be a valid SHA-256 hex string."

        if self.draw_month <= 0:
            errors["draw_month"] = "Draw month must be greater than zero."

        if self.batch_id and self.draw_month and self.batch.duration_months:
            if self.draw_month > self.batch.duration_months:
                errors["draw_month"] = "Draw month cannot exceed batch duration."

        if self.winner_lucky_id and self.winner_lucky_id.batch_id != self.batch_id:
            errors["winner_lucky_id"] = "Winner Lucky ID must belong to the same batch."

        if self.winner_subscription and self.winner_subscription.batch_id != self.batch_id:
            errors["winner_subscription"] = "Winner subscription must belong to the same batch."

        if self.winner_subscription and self.winner_lucky_id:
            if self.winner_subscription.lucky_id_id != self.winner_lucky_id_id:
                errors["winner_subscription"] = "Winner subscription must match winner Lucky ID."

        if self.is_revealed:
            if not self.revealed_seed:
                errors["revealed_seed"] = "Revealed seed is required when draw is revealed."
            if not self.winner_lucky_id:
                errors["winner_lucky_id"] = "Winner Lucky ID is required when draw is revealed."
            if not self.winner_subscription:
                errors["winner_subscription"] = "Winner subscription is required when draw is revealed."
            if not self.revealed_at:
                errors["revealed_at"] = "Reveal timestamp is required when draw is revealed."

        if self.waived_amount is not None and self.waived_amount < MONEY_ZERO:
            errors["waived_amount"] = "Waived amount cannot be negative."

        if errors:
            raise ValidationError(errors)

    @transaction.atomic
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.batch.batch_code} - Draw {self.draw_month}"


# =====================================================
# AUDIT LOG
# =====================================================


class DrawAuthorisation(TimeStampedModel):
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        related_name="draw_authorisations",
    )
    draw_month = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20,
        choices=DrawAuthorisationStatus.choices,
        default=DrawAuthorisationStatus.PENDING,
        db_index=True,
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="requested_draw_authorisations",
    )
    authorised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="authorised_draws",
    )
    authorised_at = models.DateTimeField(null=True, blank=True, db_index=True)
    rejection_reason = models.TextField(blank=True, default="")
    revocation_reason = models.TextField(blank=True, default="")
    snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text="Eligible-pool snapshot at time of authorisation request.",
    )

    class Meta:
        db_table = "draw_authorisations"
        unique_together = ("batch", "draw_month")
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["batch", "status"]),
            models.Index(fields=["authorised_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(draw_month__gt=0),
                name="chk_draw_auth_month_positive",
            ),
        ]

    def clean(self):
        errors = {}
        if self.draw_month <= 0:
            errors["draw_month"] = "Draw month must be a positive integer."
        if self.status == DrawAuthorisationStatus.AUTHORISED:
            if not self.authorised_by_id:
                errors["authorised_by"] = "Authorised-by officer is required when status is AUTHORISED."
            if not self.authorised_at:
                errors["authorised_at"] = "Authorisation timestamp is required when status is AUTHORISED."
        if self.status == DrawAuthorisationStatus.REJECTED and not self.rejection_reason:
            errors["rejection_reason"] = "Rejection reason is required when status is REJECTED."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"DrawAuth batch={self.batch_id} month={self.draw_month} [{self.status}]"


# ---------------------------------------------------------------------------
# CTRL-LP-4 — EmiWaiverSettlement
# An immutable record created before any EMI waiver is applied as a Lucky Plan
# win benefit. Provides a double-entry evidence trail separate from FinancialLedger.
# ---------------------------------------------------------------------------


class LuckyDrawBatch(models.Model):
    """Represents a batch of 100 Lucky IDs eligible for a single draw event."""

    STATUS_CHOICES = [
        ("OPEN", "Open — taking enrollments"),
        ("CLOSED", "Closed — no new enrollments"),
        ("DRAWN", "Drawn — result published (seed pending)"),
        ("VERIFIED", "Verified — seed published, customer-verifiable"),
    ]

    batch_number = models.CharField(
        max_length=50, unique=True, db_index=True,
        help_text="Format: LUCKY-BATCH-YYYY-NNNNN (auto-generated)"
    )
    start_date = models.DateField(help_text="Batch enrollment start date")
    end_date = models.DateField(help_text="Batch enrollment end date or expected close")
    expected_draw_date = models.DateField(help_text="Scheduled draw date")
    actual_draw_date = models.DateTimeField(null=True, blank=True, db_index=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="OPEN", db_index=True)

    # Cryptographic fairness proof
    commitment_hash = models.CharField(
        max_length=256, blank=True,
        help_text="SHA256(seed) — published 14 days before draw for commitment"
    )
    seed_hex = models.CharField(
        max_length=512, blank=True, null=True,
        help_text="256-bit seed (hex) — kept secret until draw_date, then published"
    )
    algorithm_code_hash = models.CharField(
        max_length=256, blank=True,
        help_text="SHA256(algorithm source code) — immutable proof of randomness logic"
    )

    # Eligible IDs list (published 14 days before draw)
    eligible_ids_json = models.JSONField(
        default=dict,
        help_text='{"count": 100, "ids": [...], "published_at": "ISO-8601"}'
    )

    # Draw result (published after draw date)
    draw_result_json = models.JSONField(
        null=True, blank=True,
        help_text='{"winner_id": "...", "drawn_at": "ISO-8601", "signature": "..."}'
    )

    # Audit trail
    draw_performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
        related_name="performed_draws"
    )
    draw_verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
        related_name="verified_draws"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_luckydrawbatch"

        ordering = ["-actual_draw_date", "-batch_number"]
        indexes = [
            models.Index(fields=["status", "-actual_draw_date"]),
            models.Index(fields=["batch_number"]),
        ]
        verbose_name = "Lucky Draw Batch"
        verbose_name_plural = "Lucky Draw Batches"

    def __str__(self):
        return f"{self.batch_number} ({self.status})"



class LuckyIDDraw(models.Model):
    """Tracks one Lucky ID within a batch and its draw eligibility/outcome."""

    batch = models.ForeignKey(
        LuckyDrawBatch, on_delete=models.PROTECT, related_name="ids"
    )
    lucky_id = models.CharField(max_length=50, db_index=True)
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="lucky_draws"
    )

    # Eligibility tracking
    is_eligible = models.BooleanField(default=True, db_index=True)
    ineligibility_reason = models.CharField(
        max_length=200, blank=True,
        help_text="If ineligible, why? (Default, EarlyReturn, LeaseTerminated, etc.)"
    )

    # Draw outcome
    is_winner = models.BooleanField(default=False, db_index=True)
    waiver_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "subscriptions_luckyiddraw"

        ordering = ["batch", "lucky_id"]
        unique_together = [["batch", "lucky_id"]]
        indexes = [
            models.Index(fields=["batch", "is_eligible"]),
            models.Index(fields=["customer", "is_winner"]),
        ]

    def __str__(self):
        return f"{self.lucky_id} (Batch {self.batch.batch_number})"

