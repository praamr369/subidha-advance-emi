"""AML screening (Phase G). Split out of subscriptions; table name preserved (state-only move)."""
from django.conf import settings
from django.db import models
from django.utils import timezone


class AMLScreeningResult(models.TextChoices):
    CLEAR = "CLEAR", "Clear — no match found"
    WATCHLIST_HIT = "WATCHLIST_HIT", "Watchlist hit — requires review"
    PEP_CONFIRMED = "PEP_CONFIRMED", "PEP confirmed"
    SANCTIONED = "SANCTIONED", "Sanctioned — blocked"
    PENDING = "PENDING", "Pending screening"


class AMLScreeningRecord(models.Model):
    """Manual AML/PEP/sanction screening record for a customer."""
    created_at = models.DateTimeField(db_index=True, default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.CASCADE,
        related_name="aml_screenings",
    )
    screening_date = models.DateField(db_index=True)
    result = models.CharField(
        max_length=20,
        choices=AMLScreeningResult.choices,
        default=AMLScreeningResult.PENDING,
        db_index=True,
    )
    screened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="aml_screenings_performed",
    )
    # Screening sources checked
    checked_rbi_defaulter_list = models.BooleanField(default=False)
    checked_interpol = models.BooleanField(default=False)
    checked_ofac = models.BooleanField(default=False)
    checked_un_sanctions = models.BooleanField(default=False)
    checked_pep_list = models.BooleanField(default=False)
    # Evidence / notes
    notes = models.TextField(blank=True, default="")
    watchlist_reference = models.CharField(max_length=200, blank=True, default="")
    next_review_date = models.DateField(null=True, blank=True, db_index=True)
    is_latest = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "customer_aml_screenings"
        ordering = ["-screening_date", "-id"]

    def __str__(self):
        return f"AML {self.result} for customer {self.customer_id} on {self.screening_date}"

    def save(self, *args, **kwargs):
        if not self.pk:
            AMLScreeningRecord.objects.filter(customer=self.customer, is_latest=True).update(is_latest=False)
        super().save(*args, **kwargs)

