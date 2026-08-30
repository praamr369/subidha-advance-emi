from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator, MinLengthValidator
from django.utils import timezone
from django.utils.text import slugify
from django.db.models import Q, F
from decimal import Decimal
from django.conf import settings
from subscriptions.enums import *
from subscriptions.base_models import (
    TimeStampedModel, MONEY_ZERO, HUNDRED, q2, _default_branch,
    product_image_upload_to, product_video_upload_to, subscription_document_upload_to,
    customer_photo_upload_to, customer_kyc_doc_upload_to,
    
)

class ProductCategoryMaster(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    # --- Additive public SEO fields (SEO-3). All optional / default-safe.
    # None of these change financial, inventory, or visibility logic for the
    # existing catalogue; they only supply canonical public metadata.
    slug = models.SlugField(max_length=140, blank=True, default="", db_index=True)
    is_public = models.BooleanField(default=True, db_index=True)
    public_title = models.CharField(max_length=160, blank=True, default="")
    seo_title = models.CharField(max_length=200, blank=True, default="")
    seo_description = models.CharField(max_length=320, blank=True, default="")
    public_image = models.ImageField(upload_to="public/category/", null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        db_table = "product_category_master"
        ordering = ["sort_order", "name", "id"]
        indexes = [
            models.Index(fields=["is_active", "name"]),
            models.Index(fields=["is_public", "is_active", "sort_order"]),
        ]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        if not (self.slug or "").strip():
            self.slug = slugify(self.name)[:140]
        else:
            self.slug = slugify(self.slug)[:140]
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name



class ProductSubcategoryMaster(TimeStampedModel):
    category = models.ForeignKey(
        ProductCategoryMaster,
        on_delete=models.PROTECT,
        related_name="subcategories",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "product_subcategory_master"
        ordering = ["category__name", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "name"],
                name="uq_product_subcategory_per_category",
            ),
        ]
        indexes = [
            models.Index(fields=["category", "is_active", "name"]),
        ]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category.name} / {self.name}"



class ProductUnitOfMeasureMaster(TimeStampedModel):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=80, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "product_unit_of_measure_master"
        ordering = ["code", "id"]
        indexes = [
            models.Index(fields=["is_active", "code"]),
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"



class Product(TimeStampedModel):
    product_code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=150, blank=True, default="")
    base_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )

    category_master = models.ForeignKey(
        ProductCategoryMaster,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    subcategory_master = models.ForeignKey(
        ProductSubcategoryMaster,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    category = models.CharField(max_length=120, blank=True, default="", db_index=True)
    subcategory = models.CharField(max_length=120, blank=True, default="", db_index=True)
    # PIM bridge is additive: legacy category fields remain authoritative for
    # existing subscriptions until a later explicit migration/variant phase.
    catalog_category = models.ForeignKey(
        "catalog.CatalogCategory",
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    base_specs = models.JSONField(default=dict, blank=True)
    sku = models.CharField(max_length=60, unique=True, null=True, blank=True, db_index=True)
    unit_of_measure_master = models.ForeignKey(
        ProductUnitOfMeasureMaster,
        on_delete=models.PROTECT,
        related_name="products",
        null=True,
        blank=True,
    )
    unit_of_measure = models.CharField(max_length=30, blank=True, default="PCS")
    description = models.TextField(blank=True, default="")
    # Tax classification — master HSN/SAC value flows into billing/invoice lines.
    hsn_sac_code = models.CharField(max_length=20, blank=True, default="", db_index=True)
    gst_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    image = models.ImageField(upload_to=product_image_upload_to, null=True, blank=True)
    video = models.FileField(upload_to=product_video_upload_to, null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    plan_type_default = models.CharField(
        max_length=10,
        choices=PlanType.choices,
        default=PlanType.EMI,
        db_index=True,
    )
    is_emi_enabled = models.BooleanField(default=True, db_index=True)
    is_rent_enabled = models.BooleanField(default=False, db_index=True)
    is_lease_enabled = models.BooleanField(default=False, db_index=True)
    is_rent_ready = models.BooleanField(default=False, db_index=True)
    is_lease_ready = models.BooleanField(default=False, db_index=True)
    # Phase 2: direct sale eligibility flag (additive, defaults to true for existing products)
    is_direct_sale_enabled = models.BooleanField(default=True, db_index=True)
    # Product classification — what kind of item this is
    item_type = models.CharField(
        max_length=20,
        choices=ProductItemType.choices,
        default=ProductItemType.FINISHED_GOOD,
        db_index=True,
    )
    # Stock type — stocked in warehouse or made-to-order
    stock_type = models.CharField(
        max_length=20,
        choices=ProductStockType.choices,
        default=ProductStockType.STOCK_ITEM,
        db_index=True,
    )
    # Phase 2: product lifecycle / PLM status
    lifecycle_status = models.CharField(
        max_length=20,
        choices=[
            ("ACTIVE", "Active"),
            ("UPCOMING", "Upcoming"),
            ("DISCONTINUED", "Discontinued"),
            ("MAINTENANCE", "Maintenance"),
        ],
        default="ACTIVE",
        db_index=True,
    )

    # WARRANTY COVERAGE (Additive - v2.0)
    warranty_enabled = models.BooleanField(
        default=True,
        help_text="Enable warranty coverage for this product",
        db_index=True,
    )
    warranty_months_manufacturing = models.PositiveIntegerField(
        default=12,
        help_text="Manufacturing defect warranty (months)",
    )
    warranty_months_structural = models.PositiveIntegerField(
        default=36,
        help_text="Structural warranty for furniture (months, 0 = none)",
    )
    warranty_months_extended_max = models.PositiveIntegerField(
        default=12,
        help_text="Max months for extended warranty plan",
    )
    extended_warranty_cost_percentage = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('7.5'),
        help_text="Extended warranty cost as % of product price",
    )

    class Meta:
        db_table = "products"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["product_code"]),
            models.Index(fields=["name"]),
            models.Index(fields=["category"]),
            models.Index(fields=["subcategory"]),
            models.Index(fields=["sku"]),
            models.Index(fields=["unit_of_measure"]),
            models.Index(fields=["is_active"]),
        ]
        constraints = []

    def clean(self):
        errors = {}

        if not self.product_code or not self.product_code.strip():
            errors["product_code"] = "Product code is required."
        if not self.name or not self.name.strip():
            errors["name"] = "Product name is required."
        if self.base_price is None or self.base_price < MONEY_ZERO:
            errors["base_price"] = "Base price cannot be negative."
        if self.subcategory_master_id and self.category_master_id:
            if self.subcategory_master.category_id != self.category_master_id:
                errors["subcategory_master"] = "Subcategory must belong to the selected category."
        # Legacy catalog spec validation retired: the catalog.CatalogCategory spec
        # system is unused, and structured product attributes now live in
        # products_pim (the linked PIM record + attribute editor). base_specs is a
        # free-form JSON field; it just needs to be a dict.
        if not isinstance(self.base_specs, dict):
            errors["base_specs"] = "Base specifications must be a JSON object."
        if self.plan_type_default not in PlanType.values:
            errors["plan_type_default"] = "Unsupported default plan type."
        # Products with no modes are allowed when:
        # - it's a new product (pk is None) being created before inventory profile is attached, OR
        # - the attached inventory profile is RAW_MATERIAL or ACCESSORY (no subscription modes needed).
        _inv_type = None
        try:
            _inv_type = self.inventory_profile.stock_item_type
        except Exception:
            pass
        _is_inventory_only = _inv_type in {"RAW_MATERIAL", "ACCESSORY"}
        _is_new_product = self.pk is None
        if not _is_new_product and not _is_inventory_only and not any(
            [
                self.is_emi_enabled,
                self.is_rent_enabled,
                self.is_lease_enabled,
                self.is_direct_sale_enabled,
            ]
        ):
            errors["is_emi_enabled"] = "At least one product mode must be enabled (EMI, Rent, Lease, or Direct Sale)."
        has_subscription = self.is_emi_enabled or self.is_rent_enabled or self.is_lease_enabled
        if has_subscription:
            if self.plan_type_default == PlanType.EMI and not self.is_emi_enabled:
                errors["plan_type_default"] = "Default plan type EMI requires EMI to be enabled."
            if self.plan_type_default == PlanType.RENT and not self.is_rent_enabled:
                errors["plan_type_default"] = "Default plan type RENT requires rent to be enabled."
            if self.plan_type_default == PlanType.LEASE and not self.is_lease_enabled:
                errors["plan_type_default"] = "Default plan type LEASE requires lease to be enabled."

        valid_lifecycle = {"ACTIVE", "UPCOMING", "DISCONTINUED", "MAINTENANCE"}
        if self.lifecycle_status and self.lifecycle_status not in valid_lifecycle:
            errors["lifecycle_status"] = f"Invalid lifecycle status. Must be one of: {', '.join(sorted(valid_lifecycle))}."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        update_field_set = set(update_fields) if update_fields is not None else None

        self.product_code = (self.product_code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.description = (self.description or "").strip()
        from products.services.catalog_master_service import (
            sync_inventory_product_master_fields,
            sync_product_catalog_fields,
        )

        synced_fields = sync_product_catalog_fields(self)
        self.is_rent_ready = bool(self.is_rent_enabled)
        self.is_lease_ready = bool(self.is_lease_enabled)
        if update_field_set is not None:
            update_field_set.update(synced_fields)
            update_field_set.update({"is_rent_ready", "is_lease_ready"})
            kwargs["update_fields"] = sorted(update_field_set)
        self.full_clean()
        super().save(*args, **kwargs)
        sync_inventory_product_master_fields(self)

    def __str__(self):
        return f"{self.product_code} - {self.name}"


class ProductVariant(TimeStampedModel):
    """Product variants represent different configurations (size, color, etc.) of a base product."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="variants",
        help_text="Parent product"
    )
    variant_code = models.CharField(
        max_length=50,
        help_text="e.g., BLU, RED, L, M, S",
    )
    variant_name = models.CharField(
        max_length=255,
        help_text="e.g., Blue, Red, Large"
    )
    sku = models.CharField(
        max_length=60,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Auto-generated: SKU-{PRODUCTCODE}-{SEQUENCE}-{VARIANT}"
    )
    barcode = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Auto-generated: BC-{PRODUCTCODE}-{CHECKSUM}"
    )
    variant_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="If null, inherits base_price from product"
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        unique_together = [["product", "variant_code"]]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["sku", "is_active"]),
            models.Index(fields=["barcode", "is_active"]),
        ]

    def __str__(self):
        return f"{self.product.product_code} - {self.variant_name} ({self.sku})"

    @property
    def effective_price(self):
        """Return variant price if set, otherwise product base_price"""
        return self.variant_price if self.variant_price is not None else self.product.base_price


class ProductRelationship(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="related_products")
    parent_variant = models.ForeignKey(
        "ProductVariant", 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name="variant_related_products",
        help_text="If set, this relationship only applies to this specific variant of the parent product."
    )
    related_product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="parent_products")
    related_variant = models.ForeignKey(
        "ProductVariant", 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name="variant_parent_products",
        help_text="If set, attaches a specific variant of the related accessory/raw material."
    )
    parent_variant_sku = models.CharField(max_length=150, blank=True, null=True, help_text="SKU of the parent PIM variant")
    related_variant_sku = models.CharField(max_length=150, blank=True, null=True, help_text="SKU of the related PIM variant")
    relationship_type = models.CharField(max_length=20, choices=ProductRelationshipType.choices)
    quantity = models.DecimalField(max_digits=8, decimal_places=2, default=1)
    is_price_included_in_parent = models.BooleanField(
        default=True,
        help_text="If true, the cost is included in the parent's base price. If false, it acts as an extra add-on cost."
    )
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(db_index=True, default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "subscriptions_productrelationship"

        unique_together = ("product", "related_product", "relationship_type", "parent_variant", "related_variant")
        indexes = [
            models.Index(fields=["product", "relationship_type"]),
            models.Index(fields=["related_product"]),
            models.Index(fields=["parent_variant"]),
        ]

    def __str__(self):
        return f"{self.product.name} → {self.related_product.name} ({self.relationship_type})"



class RentalAsset(TimeStampedModel):
    """
    A specific physical furniture unit registered for reuse across RENT/LEASE contracts.

    This is distinct from InventoryItem (which tracks quantity / stock-ledger).
    RentalAsset tracks the lifecycle of one identifiable unit (by serial number /
    asset code) through handover → return → repair → re-handover cycles.

    Physical stock quantities in InventoryItem are NOT mutated by the asset
    lifecycle service — stock movements remain the sole domain of the inventory app.
    """

    inventory_item = models.ForeignKey(
        "inventory.InventoryItem",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="rental_assets",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="rental_assets",
    )
    asset_code = models.CharField(max_length=40, unique=True, db_index=True)
    serial_no = models.CharField(max_length=80, blank=True, default="")
    purchase_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    current_location = models.ForeignKey(
        "inventory.StockLocation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="rental_assets",
    )
    current_customer = models.ForeignKey('customers.Customer',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="rented_assets",
    )
    current_subscription = models.ForeignKey(
        "contracts.Subscription",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="rental_assets",
    )
    status = models.CharField(
        max_length=16,
        choices=RentalAssetStatus.choices,
        default=RentalAssetStatus.AVAILABLE,
        db_index=True,
    )
    condition_grade = models.CharField(
        max_length=10,
        choices=AssetConditionGrade.choices,
        default=AssetConditionGrade.UNKNOWN,
        db_index=True,
    )
    last_inspection_date = models.DateField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_rental_assets",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="updated_rental_assets",
    )

    class Meta:
        db_table = "subscriptions_rental_assets"
        ordering = ["asset_code", "id"]
        indexes = [
            models.Index(fields=["status", "condition_grade"]),
            models.Index(fields=["product", "status"]),
            models.Index(fields=["current_customer", "status"]),
            models.Index(fields=["current_subscription", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(status="HANDED_OVER", current_subscription__isnull=False)
                    | ~Q(status="HANDED_OVER")
                ),
                name="rental_asset_handedover_requires_subscription",
            ),
        ]

    def clean(self):
        errors = {}
        asset_code = (self.asset_code or "").strip().upper()
        if not asset_code:
            errors["asset_code"] = "Asset code is required."
        if self.status == RentalAssetStatus.HANDED_OVER and not self.current_subscription_id:
            errors["current_subscription"] = "HANDED_OVER assets must have a current subscription."
        if self.status == RentalAssetStatus.RETIRED and self.current_subscription_id:
            errors["status"] = "RETIRED assets cannot have an active subscription."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.asset_code = (self.asset_code or "").strip().upper()
        self.serial_no = (self.serial_no or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.asset_code} ({self.get_status_display()})"



