#!/usr/bin/env python
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

User = get_user_model()

# Get or create admin user
admin = User.objects.filter(username='admin').first()
if admin:
    token, created = Token.objects.get_or_create(user=admin)
    print(f"Admin token: {token.key}")
else:
    print("Admin user not found")
