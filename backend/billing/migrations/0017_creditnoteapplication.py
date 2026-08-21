import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0016_alter_billinginvoiceline_product_and_more"),
        ("accounting", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CreditNoteApplication",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("applied_date", models.DateField(db_index=True, default=django.utils.timezone.localdate)),
                ("notes", models.TextField(blank=True, default="")),
                ("applied_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="applied_credit_notes", to=settings.AUTH_USER_MODEL)),
                ("credit_note", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="applications", to="billing.billingcreditnote")),
                ("invoice", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="credit_note_applications", to="billing.billinginvoice")),
                ("posted_journal_entry", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="credit_note_application", to="accounting.journalentry")),
            ],
            options={
                "db_table": "billing_credit_note_application",
                "ordering": ["-applied_date", "-id"],
                "indexes": [
                    models.Index(fields=["credit_note", "invoice"], name="billing_cre_credit__a1b2c3_idx"),
                ],
            },
        ),
    ]
