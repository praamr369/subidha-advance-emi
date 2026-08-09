from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"

    def ready(self):
        """Register signals when the app is ready."""
        from . import signals  # noqa
        # Note: signals_reservations disabled due to model migration changes
        # Use 'python manage.py sync_reservations' management command instead
