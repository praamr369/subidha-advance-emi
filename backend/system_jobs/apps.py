from django.apps import AppConfig


class SystemJobsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "system_jobs"
    verbose_name = "System jobs and notifications"
