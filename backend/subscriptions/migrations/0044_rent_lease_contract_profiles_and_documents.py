from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

import subscriptions.models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("subscriptions", "0043_publiclead_email"),
    ]

    operations = [
        migrations.CreateModel(
            name="RentSubscriptionProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("security_deposit_percent", models.DecimalField(decimal_places=2, max_digits=5)),
                ("security_deposit_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("refundable_security_deposit", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("return_condition_status", models.CharField(choices=[("NOT_ASSESSED", "Not Assessed"), ("GOOD", "Good"), ("FAIR", "Fair"), ("DAMAGED", "Damaged")], db_index=True, default="NOT_ASSESSED", max_length=30)),
                ("deduction_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("refund_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("refund_status", models.CharField(choices=[("PENDING", "Pending"), ("PARTIAL", "Partial"), ("REFUNDED", "Refunded"), ("WITHHELD", "Withheld")], db_index=True, default="PENDING", max_length=20)),
                ("return_inspection_notes", models.TextField(blank=True, default="")),
                ("handover_notes", models.TextField(blank=True, default="")),
                ("contract_terms_snapshot", models.TextField(blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("subscription", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="rent_profile", to="subscriptions.subscription")),
            ],
            options={
                "db_table": "rent_subscription_profiles",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="LeaseSubscriptionProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("security_deposit_percent", models.DecimalField(decimal_places=2, max_digits=5)),
                ("security_deposit_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("refundable_security_deposit", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("buyout_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("ownership_transfer_allowed", models.BooleanField(default=False)),
                ("return_condition_status", models.CharField(choices=[("NOT_ASSESSED", "Not Assessed"), ("GOOD", "Good"), ("FAIR", "Fair"), ("DAMAGED", "Damaged")], db_index=True, default="NOT_ASSESSED", max_length=30)),
                ("deduction_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("refund_amount", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("refund_status", models.CharField(choices=[("PENDING", "Pending"), ("PARTIAL", "Partial"), ("REFUNDED", "Refunded"), ("WITHHELD", "Withheld")], db_index=True, default="PENDING", max_length=20)),
                ("return_inspection_notes", models.TextField(blank=True, default="")),
                ("handover_notes", models.TextField(blank=True, default="")),
                ("contract_terms_snapshot", models.TextField(blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("subscription", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="lease_profile", to="subscriptions.subscription")),
            ],
            options={
                "db_table": "lease_subscription_profiles",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="SubscriptionDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("document_type", models.CharField(choices=[("CUSTOMER_KYC_ID", "Customer KYC ID"), ("CUSTOMER_SIGNATURE", "Customer Signature"), ("RENT_CONTRACT_PDF", "Rent Contract PDF"), ("LEASE_CONTRACT_PDF", "Lease Contract PDF")], db_index=True, max_length=40)),
                ("file", models.FileField(upload_to=subscriptions.models.subscription_document_upload_to)),
                ("verification_status", models.CharField(choices=[("PENDING", "Pending"), ("VERIFIED", "Verified"), ("REJECTED", "Rejected")], db_index=True, default="PENDING", max_length=20)),
                ("notes", models.TextField(blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("subscription", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="subscriptions.subscription")),
                ("uploaded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="uploaded_subscription_documents", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "subscription_documents",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="rentsubscriptionprofile",
            index=models.Index(fields=["refund_status"], name="rent_subscr_refund__c7fb72_idx"),
        ),
        migrations.AddIndex(
            model_name="rentsubscriptionprofile",
            index=models.Index(fields=["return_condition_status"], name="rent_subscr_return__5c6c3c_idx"),
        ),
        migrations.AddConstraint(
            model_name="rentsubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    security_deposit_percent__gte=Decimal("20.00"),
                    security_deposit_percent__lte=Decimal("30.00"),
                ),
                name="chk_rent_security_deposit_percent_range",
            ),
        ),
        migrations.AddConstraint(
            model_name="rentsubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(security_deposit_amount__gte=Decimal("0.00")),
                name="chk_rent_security_deposit_amount_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="rentsubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(deduction_amount__gte=Decimal("0.00")),
                name="chk_rent_deduction_amount_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="rentsubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(refund_amount__gte=Decimal("0.00")),
                name="chk_rent_refund_amount_non_negative",
            ),
        ),
        migrations.AddIndex(
            model_name="leasesubscriptionprofile",
            index=models.Index(fields=["refund_status"], name="lease_subsc_refund__0f0e9a_idx"),
        ),
        migrations.AddIndex(
            model_name="leasesubscriptionprofile",
            index=models.Index(fields=["return_condition_status"], name="lease_subsc_return__532f5f_idx"),
        ),
        migrations.AddConstraint(
            model_name="leasesubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    security_deposit_percent__gte=Decimal("20.00"),
                    security_deposit_percent__lte=Decimal("30.00"),
                ),
                name="chk_lease_security_deposit_percent_range",
            ),
        ),
        migrations.AddConstraint(
            model_name="leasesubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(security_deposit_amount__gte=Decimal("0.00")),
                name="chk_lease_security_deposit_amount_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="leasesubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(deduction_amount__gte=Decimal("0.00")),
                name="chk_lease_deduction_amount_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="leasesubscriptionprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(refund_amount__gte=Decimal("0.00")),
                name="chk_lease_refund_amount_non_negative",
            ),
        ),
        migrations.AddIndex(
            model_name="subscriptiondocument",
            index=models.Index(fields=["subscription", "document_type"], name="subscriptio_subscrip_c7f2d9_idx"),
        ),
        migrations.AddIndex(
            model_name="subscriptiondocument",
            index=models.Index(fields=["verification_status", "created_at"], name="subscriptio_verific_4ea3d4_idx"),
        ),
    ]
