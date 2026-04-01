from subscriptions.services.reconciliation_service import reconcile_emi_ledger


def check_emi_integrity(*, emi):
    """Validate EMI-level ledger and payment consistency."""
    return reconcile_emi_ledger(emi)
