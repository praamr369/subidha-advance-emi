from django.apps import AppConfig


class ProductsPimConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products_pim"
    verbose_name = "Product Information Management (PIM)"

    def ready(self):
        from products_pim import signals  # noqa: F401  (register post_save signal)
