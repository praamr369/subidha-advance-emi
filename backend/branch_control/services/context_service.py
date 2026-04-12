from __future__ import annotations


def serialize_branch(branch) -> dict[str, object]:
    if branch is None:
        return {
            "branch_id": None,
            "branch_code": None,
            "branch_name": None,
        }
    return {
        "branch_id": branch.id,
        "branch_code": branch.code,
        "branch_name": branch.name,
    }


def resolve_support_request_branch(support_request):
    if support_request is None:
        return None
    payment = getattr(support_request, "payment", None)
    subscription = getattr(support_request, "subscription", None)
    return getattr(payment, "branch", None) or getattr(subscription, "branch", None)


def resolve_service_case_branch(service_case):
    if service_case is None:
        return None
    return (
        getattr(getattr(service_case, "direct_sale", None), "branch", None)
        or getattr(getattr(service_case, "subscription", None), "branch", None)
        or getattr(getattr(getattr(service_case, "delivery", None), "subscription", None), "branch", None)
        or getattr(getattr(service_case, "billing_invoice", None), "branch", None)
        or resolve_support_request_branch(getattr(service_case, "support_request", None))
        or getattr(getattr(service_case, "replacement_direct_sale", None), "branch", None)
    )


def resolve_delivery_branch(delivery):
    if delivery is None:
        return None
    return getattr(getattr(delivery, "subscription", None), "branch", None)


def resolve_invoice_branch(invoice):
    if invoice is None:
        return None
    return (
        getattr(invoice, "branch", None)
        or getattr(getattr(invoice, "direct_sale", None), "branch", None)
        or getattr(getattr(invoice, "subscription", None), "branch", None)
    )


def resolve_receipt_branch(receipt):
    if receipt is None:
        return None
    return (
        getattr(receipt, "branch", None)
        or getattr(getattr(receipt, "payment", None), "branch", None)
        or getattr(getattr(receipt, "billing_invoice", None), "branch", None)
        or getattr(getattr(receipt, "direct_sale", None), "branch", None)
        or getattr(getattr(receipt, "subscription", None), "branch", None)
    )


def resolve_direct_sale_branch(sale):
    if sale is None:
        return None
    return getattr(sale, "branch", None)


def resolve_subscription_branch(subscription):
    if subscription is None:
        return None
    return getattr(subscription, "branch", None)
