from __future__ import annotations

from decimal import Decimal

from django.db import migrations
from django.utils import timezone


def seed_default_profile(apps, schema_editor):
    BusinessTaxProfile = apps.get_model("accounting", "BusinessTaxProfile")
    ComplianceAlertThreshold = apps.get_model("accounting", "ComplianceAlertThreshold")

    if not BusinessTaxProfile.objects.filter(is_active=True).exists():
        BusinessTaxProfile.objects.create(
            mode="GST_UNREGISTERED",
            legal_name="Subidha Furniture",
            effective_from=timezone.localdate(),
            is_active=True,
            notes="Seeded default non-GST profile.",
        )

    thresholds = [
        ("AGGREGATE_TURNOVER", "Aggregate turnover alert threshold", Decimal("4000000.00")),
        ("DIRECT_SALE_TURNOVER", "Direct-sale turnover alert threshold", Decimal("2000000.00")),
        ("RENT_TURNOVER", "Rent turnover alert threshold", Decimal("1000000.00")),
        ("LEASE_TURNOVER", "Lease turnover alert threshold", Decimal("1000000.00")),
        ("SERVICE_TURNOVER", "Delivery/service turnover alert threshold", Decimal("500000.00")),
        ("SUPPLIER_GST_COST", "Supplier GST cost alert threshold", Decimal("250000.00")),
    ]
    for key, label, threshold in thresholds:
        ComplianceAlertThreshold.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "threshold_amount": threshold,
                "is_active": True,
            },
        )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0026_businesstaxprofile_compliancealertthreshold_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_default_profile, noop_reverse),
    ]
