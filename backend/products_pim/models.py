from django.db import models
from django.core.validators import MinValueValidator
from django.utils.text import slugify
import uuid


class AttributeDataType(models.TextChoices):
    TEXT = "TEXT", "Text"
    NUMBER = "NUMBER", "Number (Integer)"
    DECIMAL = "DECIMAL", "Decimal"
    CHOICE = "CHOICE", "Single Choice"
    MULTI_CHOICE = "MULTI_CHOICE", "Multiple Choice"
    BOOLEAN = "BOOLEAN", "Yes/No"
    DATE = "DATE", "Date"


class ProductCategory(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=10, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name = "Product Category"
        verbose_name_plural = "Product Categories"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:100] or "category"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ProductSubcategory(models.Model):
    category = models.ForeignKey(ProductCategory, on_delete=models.CASCADE, related_name="subcategories")
    name = models.CharField(max_length=100)
    slug = models.SlugField()
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = ("category", "slug")
        verbose_name = "Product Subcategory"
        verbose_name_plural = "Product Subcategories"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:100] or "subcategory"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category.name} / {self.name}"


class CategoryAttribute(models.Model):
    category = models.ForeignKey(ProductCategory, on_delete=models.CASCADE, related_name="attributes")
    subcategory = models.ForeignKey(
        ProductSubcategory, on_delete=models.CASCADE, related_name="attributes", null=True, blank=True
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField()
    data_type = models.CharField(max_length=20, choices=AttributeDataType.choices, default=AttributeDataType.TEXT)
    is_required = models.BooleanField(default=False)
    is_variant_defining = models.BooleanField(default=False, help_text="Creates separate SKUs per value")
    min_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    max_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = ("category", "subcategory", "slug")
        verbose_name = "Category Attribute"
        verbose_name_plural = "Category Attributes"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:100] or "attribute"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.category.name} / {self.name}"


class AttributeOption(models.Model):
    attribute = models.ForeignKey(CategoryAttribute, on_delete=models.CASCADE, related_name="options")
    value = models.CharField(max_length=200)
    display_name = models.CharField(max_length=200, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # Extra cost added to the base price when this option is selected (for add-ons: polish, hydraulic lift, etc.)
    extra_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ["display_order", "value"]
        unique_together = ("attribute", "value")

    def __str__(self):
        return f"{self.attribute.name}: {self.value}"

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.value
        super().save(*args, **kwargs)


class PimProduct(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    code = models.CharField(max_length=100, unique=True)
    brand = models.CharField(max_length=150, blank=True)
    # Link to the operational product master (subscriptions.Product). This makes the
    # PIM record the rich-editing layer of a single operational product, so editing
    # attributes/variants here reflects on the product used for inventory,
    # subscription, EMI, rent, lease, and direct sale. Nullable so the FK can be
    # added additively and backfilled by matching code == product_code.
    source_product = models.ForeignKey(
        "products_core.Product",
        on_delete=models.PROTECT,
        related_name="pim",
        null=True,
        blank=True,
        db_index=True,
    )
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    category = models.ForeignKey(ProductCategory, on_delete=models.PROTECT, related_name="products")
    subcategory = models.ForeignKey(
        ProductSubcategory, on_delete=models.PROTECT, related_name="products", null=True, blank=True
    )
    base_price = models.DecimalField(max_digits=14, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    image = models.ImageField(upload_to="pim/products/", null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_published = models.BooleanField(default=False)
    variant_generating_attributes = models.ManyToManyField(
        CategoryAttribute, blank=True, related_name="used_for_variants"
    )
    locked_attributes = models.JSONField(
        default=list,
        blank=True,
        help_text="Attribute IDs manually locked by operator",
    )
    # Self-referential FK: set when this PIM product is a variant SKU generated
    # under a base product (its code matches a ProductVariant.sku).
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="child_pim_products",
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "PIM Product"
        verbose_name_plural = "PIM Products"

    def __str__(self):
        return f"[{self.code}] {self.name}"


class ProductAttribute(models.Model):
    product = models.ForeignKey(PimProduct, on_delete=models.CASCADE, related_name="attributes")
    attribute = models.ForeignKey(CategoryAttribute, on_delete=models.PROTECT)
    value_text = models.TextField(blank=True)
    value_number = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    value_date = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ("product", "attribute")
        verbose_name = "Product Attribute Value"

    def __str__(self):
        return f"{self.product.code} / {self.attribute.name}"

    @property
    def display_value(self):
        dtype = self.attribute.data_type
        if dtype in (AttributeDataType.TEXT, AttributeDataType.CHOICE, AttributeDataType.MULTI_CHOICE):
            return self.value_text
        if dtype in (AttributeDataType.NUMBER, AttributeDataType.DECIMAL):
            return str(self.value_number) if self.value_number is not None else ""
        if dtype == AttributeDataType.BOOLEAN:
            return "Yes" if self.value_boolean else "No"
        if dtype == AttributeDataType.DATE:
            return str(self.value_date) if self.value_date else ""
        return self.value_text


class ProductVariant(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    product = models.ForeignKey(PimProduct, on_delete=models.CASCADE, related_name="variants")
    operational_product = models.OneToOneField(
        "products_core.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pim_variant"
    )
    sku = models.CharField(max_length=150, unique=True)
    barcode = models.CharField(max_length=100, unique=True, null=True, blank=True)
    price = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    image = models.ImageField(upload_to="pim/variants/", null=True, blank=True)
    quantity_on_hand = models.IntegerField(default=0)
    reorder_level = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sku"]
        verbose_name = "Product Variant"
        verbose_name_plural = "Product Variants"

    def __str__(self):
        return self.sku

    @property
    def is_low_stock(self):
        return self.quantity_on_hand <= self.reorder_level


class VariantAttributeValue(models.Model):
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name="attribute_values")
    attribute = models.ForeignKey(CategoryAttribute, on_delete=models.PROTECT)
    value_text = models.TextField(blank=True)
    value_number = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)

    class Meta:
        unique_together = ("variant", "attribute")
        verbose_name = "Variant Attribute Value"

    def __str__(self):
        return f"{self.variant.sku} / {self.attribute.name}"


class ProductAsset(models.Model):
    product = models.ForeignKey(PimProduct, on_delete=models.CASCADE, related_name="assets")
    image = models.ImageField(upload_to="pim/assets/")
    is_hero = models.BooleanField(default=False)
    mapped_attribute_option = models.ForeignKey(
        AttributeOption, on_delete=models.SET_NULL, null=True, blank=True, related_name="mapped_assets"
    )
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "-created_at"]
        verbose_name = "Product Asset"
        verbose_name_plural = "Product Assets"

    def __str__(self):
        return f"{self.product.code} - Asset {self.id}"

