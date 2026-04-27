from __future__ import annotations


SOURCE_MAP = [
    {
        "kpi_key": "overdue_emi",
        "label": "Overdue EMI",
        "authoritative_source": "Emi(status=PENDING, due_date<today)",
        "calculation_summary": "Count pending EMI rows with due date before reference day.",
        "exclusions": ["Emi(status=PAID)", "Emi(status=WAIVED)"],
        "related_detail_url": "/admin/reports/overdue",
    },
    {
        "kpi_key": "waiver_loss_exposure",
        "label": "Waiver/Loss Exposure",
        "authoritative_source": "Emi(status=WAIVED)",
        "calculation_summary": "Sum waived EMI amounts only.",
        "exclusions": ["Emi(status=PAID)", "Emi(status=PENDING)"],
        "related_detail_url": "/admin/reports/waiver-loss",
    },
    {
        "kpi_key": "rent_lease_deposit_liability",
        "label": "Deposit Liability",
        "authoritative_source": "RentLeaseBillingDemand(type=SECURITY_DEPOSIT)",
        "calculation_summary": "Use held/refundable deposit amount from deposit demand register.",
        "exclusions": ["Rent/lease monthly demand income"],
        "related_detail_url": "/admin/finance/deposits",
    },
    {
        "kpi_key": "direct_sale_revenue",
        "label": "Direct Sale Revenue",
        "authoritative_source": "billing.DirectSale(non-cancelled)",
        "calculation_summary": "Aggregate direct sale grand total trend; do not add payment rows again.",
        "exclusions": ["Cancelled direct sale", "Duplicate payment-join totals"],
        "related_detail_url": "/admin/reports/direct-sales",
    },
]


def get_phase5_source_map() -> dict[str, object]:
    return {
        "count": len(SOURCE_MAP),
        "results": SOURCE_MAP,
    }

