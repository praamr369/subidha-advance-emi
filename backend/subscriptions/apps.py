from django.apps import AppConfig


class SubscriptionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "subscriptions"

    def import_models(self):
        super().import_models()
        import subscriptions.models_contract_amendment  # noqa
        import subscriptions.models_rent_lease_collection  # noqa
        import subscriptions.models_customer_advance_refund  # noqa
        import subscriptions.models_kyc_workflow  # noqa
        import subscriptions.models_online_request  # noqa
        import subscriptions.models_crm_pipeline  # noqa

    def ready(self):
        import subscriptions.signals  # noqa
