from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("subscriptions", "0056_pass7_draw_coordination"),
    ]

    operations = [
        migrations.CreateModel(
            name="BusinessEventLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_type", models.CharField(choices=[("CUSTOMER_CREATED", "Customer Created"), ("CONTRACT_CREATED", "Contract Created"), ("EMI_CREATED", "EMI Created"), ("PAYMENT_PREVIEWED", "Payment Previewed"), ("PAYMENT_RECEIVED", "Payment Received"), ("EMI_PAID", "EMI Paid"), ("RENT_PAYMENT_RECEIVED", "Rent Payment Received"), ("DIRECT_SALE_PAYMENT_RECEIVED", "Direct Sale Payment Received"), ("DRAW_SNAPSHOT_FROZEN", "Draw Snapshot Frozen"), ("DRAW_COMMITTED", "Draw Committed"), ("WINNER_SELECTED", "Winner Selected"), ("WAIVER_APPLIED", "Waiver Applied"), ("DELIVERY_CREATED", "Delivery Created"), ("DELIVERY_COMPLETED", "Delivery Completed"), ("LEDGER_POSTED", "Ledger Posted"), ("REVERSAL_CREATED", "Reversal Created")], db_index=True, max_length=64)),
                ("ledger_reference", models.CharField(blank=True, default="", max_length=128)),
                ("source_module", models.CharField(db_index=True, max_length=160)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("occurred_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("request_id", models.CharField(blank=True, db_index=True, max_length=128, null=True)),
                ("idempotency_key", models.CharField(blank=True, db_index=True, max_length=160, null=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=512, null=True)),
                ("actor_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to=settings.AUTH_USER_MODEL)),
                ("batch", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to="subscriptions.batch")),
                ("contract_reference", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to="subscriptions.contractreference")),
                ("customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to="subscriptions.customer")),
                ("lucky_id", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to="subscriptions.luckyid")),
                ("payment", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to="subscriptions.payment")),
                ("subscription", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="business_events", to="subscriptions.subscription")),
            ],
            options={
                "db_table": "business_event_logs",
                "ordering": ["-occurred_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["event_type", "occurred_at"], name="business_eve_event_t_d43f6b_idx"),
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["customer", "occurred_at"], name="business_eve_custome_95bdf8_idx"),
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["subscription", "occurred_at"], name="business_eve_subscri_f4ea7f_idx"),
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["payment", "occurred_at"], name="business_eve_payment_8466f8_idx"),
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["contract_reference", "occurred_at"], name="business_eve_contrac_f7f695_idx"),
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["batch", "occurred_at"], name="business_eve_batch_i_d012f2_idx"),
        ),
        migrations.AddIndex(
            model_name="businesseventlog",
            index=models.Index(fields=["lucky_id", "occurred_at"], name="business_eve_lucky_i_30b153_idx"),
        ),
    ]

