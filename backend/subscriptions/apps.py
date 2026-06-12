from django.apps import AppConfig


class SubscriptionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "subscriptions"

    def import_models(self):
        super().import_models()
        import subscriptions.models_business_setup  # noqa
        import subscriptions.models_document_print_settings  # noqa
        import subscriptions.models_contract_amendment  # noqa
        import subscriptions.models_business_compliance_review  # noqa
        import subscriptions.models_policy_governance  # noqa
        import subscriptions.models_rent_lease_collection  # noqa

    def ready(self):
        import subscriptions.signals  # noqa
