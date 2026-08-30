from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


class ProductReview(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    product = models.ForeignKey(
        "products_core.Product",
        on_delete=models.CASCADE,
        related_name="reviews",
        db_index=True,
    )
    # optional — linked if reviewer is a registered customer
    customer = models.ForeignKey(
        "crm.PartyMaster",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="product_reviews",
    )
    # optional — linked if order/subscription verified
    subscription = models.ForeignKey(
        "contracts.Subscription",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="product_reviews",
    )

    reviewer_name = models.CharField(max_length=120)
    reviewer_email = models.EmailField(blank=True)
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)

    is_verified_purchase = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)

    # social sync
    synced_google = models.BooleanField(default=False)
    synced_facebook = models.BooleanField(default=False)
    synced_whatsapp = models.BooleanField(default=False)
    synced_instagram = models.BooleanField(default=False)

    # admin
    admin_note = models.TextField(blank=True)
    moderated_at = models.DateTimeField(null=True, blank=True)
    moderated_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="moderated_reviews",
    )

    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_review"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product", "status"]),
            models.Index(fields=["rating"]),
        ]

    def __str__(self):
        return f"{self.reviewer_name} – {self.rating}★ ({self.product_id})"

    @property
    def is_approved(self):
        return self.status == self.STATUS_APPROVED

    def approve(self, user=None):
        self.status = self.STATUS_APPROVED
        self.moderated_at = timezone.now()
        self.moderated_by = user
        self.save(update_fields=["status", "moderated_at", "moderated_by", "updated_at"])

    def reject(self, user=None, note=""):
        self.status = self.STATUS_REJECTED
        self.admin_note = note
        self.moderated_at = timezone.now()
        self.moderated_by = user
        self.save(update_fields=["status", "admin_note", "moderated_at", "moderated_by", "updated_at"])


class ReviewPhoto(models.Model):
    review = models.ForeignKey(ProductReview, on_delete=models.CASCADE, related_name="photos")
    file = models.ImageField(upload_to="reviews/photos/")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "review_photo"
        ordering = ["created_at"]
