import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0072_alter_auditlog_action_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ContractRecontractEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("old_contract_total", models.DecimalField(decimal_places=2, max_digits=12)),
                ("new_contract_total", models.DecimalField(decimal_places=2, max_digits=12)),
                ("price_difference", models.DecimalField(decimal_places=2, max_digits=12)),
                ("amount_already_paid", models.DecimalField(decimal_places=2, max_digits=12)),
                ("old_remaining_balance", models.DecimalField(decimal_places=2, max_digits=12)),
                ("new_remaining_balance", models.DecimalField(decimal_places=2, max_digits=12)),
                ("current_tenure_months", models.PositiveIntegerField()),
                ("preview_tenure_months", models.PositiveIntegerField()),
                ("current_monthly_amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("proposed_monthly_amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("pending_emi_count", models.PositiveIntegerField(default=0)),
                (
                    "impact_type",
                    models.CharField(
                        choices=[
                            ("UPGRADE_EXTRA_PAYABLE", "Upgrade Extra Payable"),
                            ("DOWNGRADE_CREDIT_REQUIRED", "Downgrade Credit Required"),
                            ("SAME_PRICE_REFERENCE_CORRECTION", "Same Price Reference Correction"),
                        ],
                        db_index=True,
                        max_length=40,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PREVIEWED", "Previewed"),
                            ("SUPERSEDED", "Superseded"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        db_index=True,
                        default="PREVIEWED",
                        max_length=20,
                    ),
                ),
                ("effective_date_preview", models.DateField(blank=True, null=True)),
                ("preview_snapshot", models.JSONField(blank=True, default=dict)),
                ("warnings", models.JSONField(blank=True, default=list)),
                ("blocked_reason", models.TextField(blank=True, null=True)),
                ("source_record_mutation", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "amendment",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="recontract_events", to="subscriptions.contractamendment"),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_recontract_preview_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "new_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="recontract_events_as_new_product",
                        to="subscriptions.product",
                    ),
                ),
                (
                    "old_product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="recontract_events_as_old_product",
                        to="subscriptions.product",
                    ),
                ),
                (
                    "subscription",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="recontract_events", to="subscriptions.subscription"),
                ),
            ],
            options={
                "db_table": "contract_recontract_events",
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(fields=["amendment", "status"], name="recontract_am_status_idx"),
                    models.Index(fields=["subscription", "created_at"], name="recontract_sub_created_idx"),
                    models.Index(fields=["impact_type", "status"], name="recontract_impact_status_idx"),
                ],
                "constraints": [
                    models.CheckConstraint(condition=models.Q(old_contract_total__gte=0), name="chk_recontract_old_total_gte0"),
                    models.CheckConstraint(condition=models.Q(new_contract_total__gte=0), name="chk_recontract_new_total_gte0"),
                    models.CheckConstraint(condition=models.Q(amount_already_paid__gte=0), name="chk_recontract_paid_gte0"),
                    models.CheckConstraint(condition=models.Q(old_remaining_balance__gte=0), name="chk_recontract_old_bal_gte0"),
                    models.CheckConstraint(condition=models.Q(new_remaining_balance__gte=0), name="chk_recontract_new_bal_gte0"),
                    models.CheckConstraint(condition=models.Q(current_monthly_amount__gte=0), name="chk_recontract_cur_emi_gte0"),
                    models.CheckConstraint(condition=models.Q(proposed_monthly_amount__gte=0), name="chk_recontract_new_emi_gte0"),
                    models.CheckConstraint(condition=models.Q(current_tenure_months__gt=0), name="chk_recontract_cur_ten_gt0"),
                    models.CheckConstraint(condition=models.Q(preview_tenure_months__gt=0), name="chk_recontract_prev_ten_gt0"),
                    models.CheckConstraint(condition=models.Q(source_record_mutation=False), name="chk_recontract_no_src_mut"),
                ],
            },
        ),
    ]
