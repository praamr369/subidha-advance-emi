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
