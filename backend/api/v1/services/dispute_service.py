"""Customer dispute management services."""
from django.utils import timezone
from django.contrib.auth.models import User
from subscriptions.models import CustomerDispute, DisputeStage


def create_dispute(
    customer_id: int,
    dispute_type: str,
    subject: str,
    description: str,
    subscription_id: int = None,
    priority: str = "MEDIUM",
    created_by: User = None,
) -> CustomerDispute:
    """Create a new customer dispute with SLA deadlines."""
    dispute = CustomerDispute(
        customer_id=customer_id,
        dispute_type=dispute_type,
        subject=subject,
        description=description,
        subscription_id=subscription_id,
        priority=priority,
        created_by=created_by,
        stage=DisputeStage.OPEN,
    )
    dispute.save()
    return dispute


def move_to_review(dispute: CustomerDispute, assigned_to: User = None) -> CustomerDispute:
    """Move dispute from OPEN to UNDER_REVIEW."""
    dispute.stage = DisputeStage.UNDER_REVIEW
    dispute.review_started_at = timezone.now()
    dispute.assigned_to = assigned_to
    dispute.save(update_fields=['stage', 'review_started_at', 'assigned_to'])
    return dispute


def resolve_dispute(
    dispute: CustomerDispute,
    resolution_stage: str,
    resolution_decision: str,
    resolution_notes: str = "",
) -> CustomerDispute:
    """Resolve or reject dispute."""
    if resolution_stage not in [DisputeStage.RESOLVED, DisputeStage.REJECTED]:
        raise ValueError(f"Invalid resolution stage: {resolution_stage}")

    dispute.stage = resolution_stage
    dispute.resolved_at = timezone.now()
    dispute.resolution_decision = resolution_decision
    dispute.resolution_notes = resolution_notes
    dispute.save(update_fields=[
        'stage',
        'resolved_at',
        'resolution_decision',
        'resolution_notes',
    ])
    return dispute


def escalate_dispute(dispute: CustomerDispute) -> CustomerDispute:
    """Escalate dispute when SLA is about to breach."""
    dispute.stage = DisputeStage.ESCALATED
    dispute.save(update_fields=['stage'])
    return dispute


def get_sla_status_for_dispute(dispute: CustomerDispute) -> dict:
    """Get SLA compliance status for a dispute."""
    return {
        'is_sla_compliant': dispute.is_sla_compliant,
        'is_sla_breached': dispute.is_sla_breached,
        'days_since_creation': dispute.days_since_creation,
        'current_stage': dispute.stage,
        'open_due_at': dispute.open_due_at,
        'review_due_at': dispute.review_due_at,
        'resolve_due_at': dispute.resolve_due_at,
    }
