from django.db import models


class InternalReview(models.Model):
    """Reviews submitted through the webapp by customers."""

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    reviewer_name = models.CharField(max_length=150)
    reviewer_phone = models.CharField(max_length=15, blank=True)
    rating = models.PositiveSmallIntegerField()  # 1–5
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    is_featured = models.BooleanField(default=False)
    # Link to authenticated customer if logged in
    customer = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="reviews"
    )
    admin_reply = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reviewer_name} ({self.rating}★) — {self.get_status_display()}"


class ReviewPlatformConfig(models.Model):
    """Singleton store for external review platform credentials.

    Managed from the admin Brand Data Center UI. Values here take priority
    over environment variables; blank fields fall back to the .env values.
    """

    google_places_api_key = models.CharField(max_length=255, blank=True)
    google_place_id = models.CharField(max_length=255, blank=True)
    facebook_page_id = models.CharField(max_length=255, blank=True)
    facebook_page_access_token = models.TextField(blank=True)
    youtube_api_key = models.CharField(max_length=255, blank=True)
    youtube_channel_id = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Review platform configuration"

    def save(self, *args, **kwargs):
        self.pk = 1  # enforce singleton
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Review platform configuration"
