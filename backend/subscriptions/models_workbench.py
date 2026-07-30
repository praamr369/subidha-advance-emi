from django.db import models
from django.utils import timezone
from accounts.models import User
from subscriptions.models import Customer, Product, Batch

class WorkbenchItemStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    ASSIGNED = "ASSIGNED", "Assigned"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class WorkbenchModule(models.TextChoices):
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
    ONLINE_REQUEST = "ONLINE_REQUEST", "Online Request"
    SUBSCRIPTION = "SUBSCRIPTION", "Subscription"
    VENDOR = "VENDOR", "Vendor Dashboard"


class WorkbenchItem(models.Model):
    module = models.CharField(max_length=50, choices=WorkbenchModule.choices)
    status = models.CharField(max_length=20, choices=WorkbenchItemStatus.choices, default=WorkbenchItemStatus.OPEN)

    # Entity references
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="workbench_items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="workbench_items")
    batch = models.ForeignKey(Batch, on_delete=models.SET_NULL, null=True, blank=True, related_name="workbench_items")

    # Context
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    request_data = models.JSONField(default=dict, blank=True)

    # Assignment
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_workbench_items")
    assigned_at = models.DateTimeField(null=True, blank=True)

    # Tracking
    priority = models.IntegerField(default=0)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "workbench_item"
        ordering = ["-priority", "-created_at"]
        indexes = [
            models.Index(fields=["customer", "module"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["assigned_to", "status"]),
        ]

    def __str__(self):
        return f"{self.get_module_display()} - {self.title} ({self.get_status_display()})"


class WorkbenchAction(models.Model):
    ACTION_TYPES = (
        ("APPROVE", "Approve"),
        ("REJECT", "Reject"),
        ("SCHEDULE", "Schedule"),
        ("QUOTE", "Send Quote"),
        ("COMPLETE", "Complete"),
        ("NOTE", "Add Note"),
    )

    workbench_item = models.ForeignKey(WorkbenchItem, on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="workbench_actions")
    notes = models.TextField(blank=True)
    result_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "workbench_action"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workbench_item", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.action_type} by {self.performed_by} on {self.created_at.date()}"
