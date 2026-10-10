import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

# Delete if exists just in case
User.objects.filter(username="pradip").delete()

# Create superuser
user = User.objects.create_superuser(
    username="pradip",
    email="pradip@example.com",
    password="Adrika1004@",
    phone="9999999999"
)
print("Superuser pradip created successfully with specified password!")
