from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

import subscriptions.models_business_setup


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0108_luckydraw_settlement_status_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BusinessRulePolicy",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(default="Default legal controls", max_length=120)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                (
                    "plan_type",
                    models.CharField(
                        choices=[
                            ("PRODUCT_INSTALLMENT", "Product Instalment"),
                            ("DIRECT_SALE", "Direct Sale"),
                            ("RENTAL", "Rental"),
                            ("LEASE", "Lease"),
                        ],
                        db_index=True,
                        default="PRODUCT_INSTALLMENT",
                        max_length=40,
                    ),
                ),
                (
                    "benefit_type",
                    models.CharField(
                        choices=[
                            ("NONE", "None"),
                            ("CONTRACTUAL_WAIVER", "Contractual Waiver"),
                            ("TRADE_DISCOUNT", "Trade Discount"),
                            ("PROMOTIONAL_CREDIT", "Promotional Credit"),
                        ],
                        default="CONTRACTUAL_WAIVER",
                        max_length=40,
                    ),
                ),
                (
                    "selection_method",
                    models.CharField(
                        choices=[
                            ("NONE", "None"),
                            ("HASH_FAIRNESS", "Hash Fairness"),
                            ("ADMIN_APPROVED", "Admin Approved"),
                            ("PERFORMANCE_BASED", "Performance Based"),
                        ],
                        default="HASH_FAIRNESS",
                        max_length=40,
                    ),
                ),
                (
                    "funding_source",
                    models.CharField(
                        choices=[
                            ("COMPANY_MARGIN", "Company Margin"),
                            ("CUSTOMER_POOL_BLOCKED", "Customer Pool Blocked"),
                        ],
                        default="COMPANY_MARGIN",
                        max_length=40,
                    ),
                ),
                (
                    "risk_status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("CA_REVIEW_REQUIRED", "CA Review Required"),
                            ("ADVOCATE_REVIEW_REQUIRED", "Advocate Review Required"),
                            ("APPROVED_FOR_INTERNAL_TEST", "Approved For Internal Test"),
                            ("APPROVED_FOR_PUBLIC_LAUNCH", "Approved For Public Launch"),
                            ("BLOCKED", "Blocked"),
                        ],
                        db_index=True,
                        default="ADVOCATE_REVIEW_REQUIRED",
                        max_length=40,
                    ),
                ),
                ("refund_sla_working_days", models.PositiveSmallIntegerField(default=7)),
                ("late_payment_charge_enabled", models.BooleanField(default=False)),
                ("late_payment_charge_configured", models.BooleanField(default=False)),
                ("late_payment_charge_label", models.CharField(default="Late Payment Charge", max_length=80)),
                ("partner_receipt_admin_approval_required", models.BooleanField(default=True)),
                ("kyc_masking_required", models.BooleanField(default=True)),
                ("deposit_refund_requires_inspection", models.BooleanField(default=True)),
                ("gst_documents_require_hsn_sac", models.BooleanField(default=True)),
                ("non_gst_document_labels", models.JSONField(blank=True, default=subscriptions.models_business_setup.default_non_gst_document_labels)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="updated_business_rule_policies",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "business_rule_policies",
                "ordering": ["-is_active", "-created_at", "-id"],
                "indexes": [
                    models.Index(fields=["risk_status", "is_active"], name="business_ru_risk_st_440138_idx"),
                    models.Index(fields=["plan_type", "risk_status"], name="business_ru_plan_ty_1b933e_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(("is_active", True)),
                        fields=("is_active",),
                        name="unique_active_business_rule_policy",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("refund_sla_working_days__gte", 1)),
                        name="chk_business_rule_refund_sla_positive",
                    ),
                ],
            },
        ),
    ]
