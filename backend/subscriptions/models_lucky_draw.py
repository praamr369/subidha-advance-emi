"""Lucky Plan Draw Framework — Models for cryptographic draw tracking."""

from django.db import models
from django.utils import timezone
from django.conf import settings


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
        "subscriptions.Customer", on_delete=models.PROTECT, related_name="lucky_draws"
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
        ordering = ["batch", "lucky_id"]
        unique_together = [["batch", "lucky_id"]]
        indexes = [
            models.Index(fields=["batch", "is_eligible"]),
            models.Index(fields=["customer", "is_winner"]),
        ]

    def __str__(self):
        return f"{self.lucky_id} (Batch {self.batch.batch_number})"
