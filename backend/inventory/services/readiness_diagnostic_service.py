"""
Inventory Readiness Diagnostic Service - Enhanced

Runs full system diagnostics and applies dismissal filters.
"""

from __future__ import annotations

from django.contrib.auth.models import User

from inventory.models import InventoryReadinessDismissal
from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot


def get_readiness_with_dismissals(user: User | None = None) -> dict:
    """
    Get inventory readiness snapshot with dismissals filtered out.

    Args:
        user: User object (for audit purposes, not filtering)

    Returns:
        Enhanced payload with:
        - All existing readiness data
        - dismissed_warnings: List of dismissed warning keys
        - active_warnings: Filtered list with dismissed items removed
        - summary: Counts by category (BLOCKER, WARNING) after dismissals
    """
    # Get base diagnostic snapshot
    snapshot = get_inventory_readiness_snapshot()

    # Get all dismissed warnings
    dismissed_records = InventoryReadinessDismissal.objects.all().values_list(
        "warning_key", flat=True
    )
    dismissed_set = set(dismissed_records)

    # Extract warnings from snapshot (assuming it has a "warnings" or "issues" key)
    all_warnings = snapshot.get("warnings", [])

    # Filter out dismissed warnings
    active_warnings = [
        warning for warning in all_warnings
        if warning.get("id") not in dismissed_set
    ]

    # Build enhanced response
    return {
        **snapshot,
        "all_warnings": all_warnings,  # Include all for reference
        "active_warnings": active_warnings,  # Filtered list
        "dismissed_count": len(dismissed_set),
        "warning_count": len(active_warnings),  # Count after dismissals
        "is_ready": len(active_warnings) == 0,  # Ready only if no active warnings
        "dismissed_warnings": list(dismissed_set),
    }


def dismiss_warning(
    warning_key: str,
    category: str,
    user: User | None = None,
    reason: str = "",
) -> InventoryReadinessDismissal:
    """
    Dismiss a warning from the readiness diagnostic.

    Args:
        warning_key: Unique identifier for the warning
        category: Category (PRODUCT, STOCK, LOCATION, CONFIGURATION)
        user: User dismissing the warning
        reason: Optional note on dismissal

    Returns:
        Created or updated dismissal record
    """
    dismissal, created = InventoryReadinessDismissal.objects.update_or_create(
        warning_key=warning_key,
        defaults={
            "category": category,
            "dismissed_by": user,
            "reason": reason,
        },
    )
    return dismissal


def restore_warning(warning_key: str) -> bool:
    """
    Restore a previously dismissed warning (undo dismissal).

    Args:
        warning_key: Unique identifier for the warning

    Returns:
        True if a dismissal was deleted, False if none existed
    """
    result = InventoryReadinessDismissal.objects.filter(
        warning_key=warning_key
    ).delete()
    return result[0] > 0


def get_dismissals_by_category(category: str) -> list[dict]:
    """
    Get all dismissed warnings for a specific category.

    Args:
        category: Category filter (PRODUCT, STOCK, LOCATION, CONFIGURATION)

    Returns:
        List of dismissal records
    """
    records = InventoryReadinessDismissal.objects.filter(category=category).values(
        "warning_key", "category", "reason", "dismissed_by__username", "dismissed_at"
    )
    return list(records)
