import sys

def modify_service(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    target = """def update_active_business_rule_policy(*, payload: dict[str, Any], performed_by=None) -> BusinessRulePolicy:
    policy = BusinessRulePolicy.objects.select_for_update().filter(is_active=True).order_by("-created_at", "-id").first()
    if policy is None:
        policy = BusinessRulePolicy(name="Default legal controls", is_active=True)

    editable_fields = {
        "name",
        "plan_type",
        "benefit_type",
        "selection_method",
        "funding_source",
        "risk_status",
        "refund_sla_working_days",
        "late_payment_charge_enabled",
        "late_payment_charge_configured",
        "late_payment_charge_label",
        "partner_receipt_admin_approval_required",
        "kyc_masking_required",
        "deposit_refund_requires_inspection",
        "gst_documents_require_hsn_sac",
        "non_gst_document_labels",
        "notes",
    }
    for field in editable_fields:
        if field in payload:
            setattr(policy, field, payload[field])
    policy.updated_by = performed_by
    policy.is_active = True
    policy.save()
    return policy"""

    replacement = """def update_active_business_rule_policy(*, payload: dict[str, Any], performed_by=None) -> BusinessRulePolicy:
    now = timezone.now()
    old_policy = BusinessRulePolicy.objects.select_for_update().filter(is_active=True).order_by("-effective_from", "-id").first()
    
    if old_policy:
        old_policy.is_active = False
        old_policy.effective_to = now
        old_policy.save()

    new_policy = BusinessRulePolicy(name="Default legal controls", is_active=True, effective_from=now)
    if old_policy:
        # copy fields
        for field in [f.name for f in BusinessRulePolicy._meta.get_fields() if f.concrete and not f.auto_created and f.name not in ["id", "is_active", "effective_from", "effective_to", "created_at", "updated_at", "created_by", "updated_by"]]:
            setattr(new_policy, field, getattr(old_policy, field))

    editable_fields = {
        "name",
        "plan_type",
        "benefit_type",
        "selection_method",
        "funding_source",
        "risk_status",
        "refund_sla_working_days",
        "late_payment_charge_enabled",
        "late_payment_charge_configured",
        "late_payment_charge_label",
        "partner_receipt_admin_approval_required",
        "kyc_masking_required",
        "deposit_refund_requires_inspection",
        "gst_documents_require_hsn_sac",
        "non_gst_document_labels",
        "notes",
    }
    for field in editable_fields:
        if field in payload:
            setattr(new_policy, field, payload[field])
            
    new_policy.updated_by = performed_by
    new_policy.created_by = performed_by
    new_policy.save()
    return new_policy"""

    content = content.replace(target, replacement)
    
    # Also we should update get_or_create_active_business_rule_policy and other places that fetch the active policy to use BusinessRulePolicy.get_current() to benefit from caching!
    
    with open(filepath, 'w') as f:
        f.write(content)

modify_service('backend/subscriptions/services/business_rule_policy_service.py')
