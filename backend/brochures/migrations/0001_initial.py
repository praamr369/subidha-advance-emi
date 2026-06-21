import decimal

from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("subscriptions", "0098_growth_requests_p5b"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductBrochureSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("visible_on_public_catalog", models.BooleanField(default=True)),
                ("visible_on_rent_catalog", models.BooleanField(default=True)),
                ("visible_on_lease_catalog", models.BooleanField(default=True)),
                ("visible_on_lucky_emi_catalog", models.BooleanField(default=True)),
                ("visible_on_sale_catalog", models.BooleanField(default=True)),
                (
                    "monthly_rent",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        max_digits=12,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.00")
                            )
                        ],
                    ),
                ),
                (
                    "lease_monthly_amount",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        max_digits=12,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.00")
                            )
                        ],
                    ),
                ),
                (
                    "security_deposit",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        max_digits=12,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.00")
                            )
                        ],
                    ),
                ),
                ("brochure_sort_order", models.PositiveIntegerField(default=100)),
                ("brochure_featured", models.BooleanField(default=False)),
                ("short_description", models.CharField(blank=True, max_length=180)),
                ("public_badge", models.CharField(blank=True, max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "product",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="brochure_settings",
                        to="subscriptions.product",
                    ),
                ),
            ],
            options={
                "verbose_name": "Product brochure settings",
                "verbose_name_plural": "Product brochure settings",
                "ordering": [
                    "-brochure_featured",
                    "brochure_sort_order",
                    "product__name",
                    "product_id",
                ],
            },
        ),
        migrations.CreateModel(
            name="BrochureDocument",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("brochure_no", models.CharField(max_length=40, unique=True)),
                (
                    "brochure_type",
                    models.CharField(
                        choices=[
                            ("RENT", "Rent"),
                            ("LEASE", "Lease"),
                            ("LUCKY_EMI", "Lucky EMI"),
                            ("DIRECT_SALE", "Direct Sale"),
                            ("CUSTOM", "Custom"),
                        ],
                        max_length=20,
                    ),
                ),
                ("title", models.CharField(max_length=160)),
                (
                    "public_token",
                    models.CharField(db_index=True, max_length=80, unique=True),
                ),
                ("pdf_file", models.FileField(upload_to="brochures/")),
                ("filter_payload", models.JSONField(blank=True, default=dict)),
                ("product_snapshot", models.JSONField(blank=True, default=list)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("GENERATED", "Generated"),
                            ("EXPIRED", "Expired"),
                        ],
                        db_index=True,
                        default="GENERATED",
                        max_length=20,
                    ),
                ),
                (
                    "expires_at",
                    models.DateTimeField(blank=True, db_index=True, null=True),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="created_brochures",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="brochuredocument",
            index=models.Index(
                fields=["brochure_type", "status", "created_at"],
                name="brochures_b_brochur_8c7339_idx",
            ),
        ),
    ]
