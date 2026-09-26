import sys
import re

with open('backend/catalog/models.py', 'r') as f:
    content = f.read()

content = content.replace("from django.utils.text import slugify", "from django.utils.text import slugify\nfrom mptt.models import MPTTModel, TreeForeignKey")

content = content.replace("class CatalogCategory(CatalogTimeStampedModel):", "class CatalogCategory(MPTTModel, CatalogTimeStampedModel):")

content = content.replace("""    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="children",
    )""", """    parent = TreeForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="children",
    )""")

content = content.replace("""    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)""", """    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    google_taxonomy_id = models.CharField(max_length=50, blank=True, default="", help_text="Standardized taxonomy ID for external marketplaces")""")

# We need to remove the custom clean recursion and path logic if present.
# Wait, MPTT has its own parent cycle detection!
content = content.replace("""        if self.pk and self.parent_id:
            ancestor_ids = set()
            node = self.parent
            while node is not None:
                if node.pk in ancestor_ids or node.pk == self.pk:
                    errors["parent"] = "A category cannot be moved below one of its descendants."
                    break
                ancestor_ids.add(node.pk)
                node = node.parent""", "")

# For AttributeDefinition
content = content.replace("""    sort_order = models.PositiveIntegerField(default=0)
    min_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    max_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)""", """    sort_order = models.PositiveIntegerField(default=0)
    min_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    max_value = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    regex_validation = models.CharField(max_length=255, blank=True, default="", help_text="Regex pattern for text validation")""")

with open('backend/catalog/models.py', 'w') as f:
    f.write(content)

