from django.apps import AppConfig


class ProductsCoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products_core"
    verbose_name = "Products Core"

    def ready(self):
        import products_core.signals  # noqa
