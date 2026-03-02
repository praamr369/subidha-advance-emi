from django.contrib.auth.models import AbstractUser
from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    PARTNER = "PARTNER", "Partner"
    CUSTOMER = "CUSTOMER", "Customer"


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=UserRole.choices)
    phone = models.CharField(max_length=15, blank=True)

    class Meta:
        db_table = "users"