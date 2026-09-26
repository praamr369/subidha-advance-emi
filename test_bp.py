import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from business_setup.models import BusinessProfile, BusinessRulePolicy

bp = BusinessProfile.get_current()
print("BusinessProfile cached:", bp)

brp = BusinessRulePolicy.get_current()
print("BusinessRulePolicy cached:", brp)

