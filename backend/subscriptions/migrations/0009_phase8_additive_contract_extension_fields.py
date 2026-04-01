from django.db import migrations, models


def _backfill_phase8_extension_fields(apps, schema_editor):
    Subscription = apps.get_model("subscriptions", "Subscription")
    Payment = apps.get_model("subscriptions", "Payment")
    FinancialLedger = apps.get_model("subscriptions", "FinancialLedger")

    # Subscription snapshots/reference defaults for historical EMI contracts.
    for sub in Subscription.objects.select_related("product").iterator(chunk_size=500):
        updates = {}

        if not sub.product_snapshot and sub.product_id:
            updates["product_snapshot"] = {
                "product_id": sub.product_id,
                "product_code": sub.product.product_code,
                "name": sub.product.name,
                "base_price": str(sub.product.base_price),
            }

        if not sub.pricing_snapshot:
            updates["pricing_snapshot"] = {
                "plan_type": sub.plan_type,
                "tenure_months": sub.tenure_months,
                "monthly_amount": str(sub.monthly_amount),
                "total_amount": str(sub.total_amount),
            }

        if updates:
            Subscription.objects.filter(pk=sub.pk).update(**updates)

    # Plan hints for existing payment and ledger rows.
    for payment in Payment.objects.select_related("subscription").filter(plan_type_hint__isnull=True).iterator(chunk_size=500):
        if payment.subscription_id:
            Payment.objects.filter(pk=payment.pk).update(plan_type_hint=payment.subscription.plan_type)

    for ledger in FinancialLedger.objects.select_related("emi__subscription").filter(plan_type_hint__isnull=True).iterator(chunk_size=500):
        if ledger.emi_id:
            FinancialLedger.objects.filter(pk=ledger.pk).update(plan_type_hint=ledger.emi.subscription.plan_type)


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0008_alter_batch_options_alter_commission_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="is_lease_ready",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="product",
            name="is_rent_ready",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="product",
            name="plan_type_default",
            field=models.CharField(
                choices=[("EMI", "EMI"), ("RENT", "Rent"), ("LEASE", "Lease")],
                db_index=True,
                default="EMI",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="subscription",
            name="contract_reference",
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="subscription",
            name="fulfillment_status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("DELIVERED", "Delivered"),
                    ("RETURN_REQUESTED", "Return Requested"),
                    ("RETURNED", "Returned"),
                ],
                db_index=True,
                default="PENDING",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="subscription",
            name="pricing_snapshot",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="subscription",
            name="product_snapshot",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="allocation_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="payment",
            name="plan_type_hint",
            field=models.CharField(
                blank=True,
                choices=[("EMI", "EMI"), ("RENT", "Rent"), ("LEASE", "Lease")],
                db_index=True,
                max_length=10,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="financialledger",
            name="allocation_context",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="financialledger",
            name="plan_type_hint",
            field=models.CharField(
                blank=True,
                choices=[("EMI", "EMI"), ("RENT", "Rent"), ("LEASE", "Lease")],
                db_index=True,
                max_length=10,
                null=True,
            ),
        ),
        migrations.RunPython(_backfill_phase8_extension_fields, migrations.RunPython.noop),
    ]
