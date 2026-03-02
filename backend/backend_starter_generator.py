#!/usr/bin/env python3
"""Generate a production-oriented Django backend starter project.

This script creates a complete Django + DRF + SimpleJWT + PostgreSQL backend
that can be generated from a single file.
"""

from __future__ import annotations

import argparse
import textwrap
from pathlib import Path


TEMPLATES = {
    "requirements.txt": """
Django>=5.0,<6.0
psycopg[binary]>=3.1,<4
djangorestframework>=3.15,<4
djangorestframework-simplejwt>=5.3,<6
python-dotenv>=1.0,<2
django-cors-headers>=4.4,<5
gunicorn>=22,<23
""",
    ".env.example": """
DEBUG=1
DJANGO_SECRET_KEY=change-me
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
POSTGRES_DB=subidha
POSTGRES_USER=subidha
POSTGRES_PASSWORD=subidha
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
""",
    "manage.py": """
#!/usr/bin/env python
import os
import sys


def main() -> None:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
""",
    "config/__init__.py": "",
    "config/asgi.py": """
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_asgi_application()
""",
    "config/wsgi.py": """
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_wsgi_application()
""",
    "config/urls.py": """
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/', include('finance.urls')),
]
""",
    "config/settings.py": """
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'unsafe-dev-key')
DEBUG = os.getenv('DEBUG', '0') == '1'
ALLOWED_HOSTS = [host.strip() for host in os.getenv('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost').split(',') if host.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'finance',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {'context_processors': [
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ]},
    }
]
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'subidha'),
        'USER': os.getenv('POSTGRES_USER', 'subidha'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'subidha'),
        'HOST': os.getenv('POSTGRES_HOST', '127.0.0.1'),
        'PORT': os.getenv('POSTGRES_PORT', '5432'),
        'CONN_MAX_AGE': 60,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('ACCESS_TOKEN_MINUTES', '15'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('REFRESH_TOKEN_DAYS', '7'))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
CORS_ALLOW_ALL_ORIGINS = DEBUG
""",
    "finance/__init__.py": "",
    "finance/apps.py": """
from django.apps import AppConfig


class FinanceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'finance'
""",
    "finance/models.py": """
from __future__ import annotations

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Customer(TimestampedModel):
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, unique=True)

    def __str__(self) -> str:
        return f"{self.full_name}<{self.email}>"


class Account(TimestampedModel):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        SUSPENDED = 'SUSPENDED', 'Suspended'
        CLOSED = 'CLOSED', 'Closed'

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='accounts')
    account_no = models.CharField(max_length=40, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))

    def __str__(self) -> str:
        return self.account_no


class LedgerEntry(TimestampedModel):
    class EntryType(models.TextChoices):
        DEBIT = 'DEBIT', 'Debit'
        CREDIT = 'CREDIT', 'Credit'

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='entries')
    entry_type = models.CharField(max_length=6, choices=EntryType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    description = models.CharField(max_length=255)
    reference_id = models.CharField(max_length=64, unique=True)
    posted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ('-posted_at', '-id')
""",
    "finance/serializers.py": """
from __future__ import annotations

from django.db import transaction
from rest_framework import serializers

from .models import Account, Customer, LedgerEntry
from .services import post_ledger_entry


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ('id', 'full_name', 'email', 'phone', 'created_at')
        read_only_fields = ('id', 'created_at')


class AccountSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), source='customer', write_only=True)

    class Meta:
        model = Account
        fields = ('id', 'account_no', 'status', 'balance', 'customer', 'customer_id', 'created_at', 'updated_at')
        read_only_fields = ('id', 'balance', 'created_at', 'updated_at')


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = ('id', 'account', 'entry_type', 'amount', 'description', 'reference_id', 'posted_at', 'created_at')
        read_only_fields = ('id', 'created_at')

    def create(self, validated_data):
        with transaction.atomic():
            return post_ledger_entry(**validated_data)
""",
    "finance/services.py": """
from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from .models import Account, LedgerEntry


@transaction.atomic
def post_ledger_entry(*, account: Account, entry_type: str, amount: Decimal, description: str, reference_id: str, posted_at):
    account = Account.objects.select_for_update().get(pk=account.pk)
    if account.status != Account.Status.ACTIVE:
        raise ValueError('Account is not active.')

    if entry_type == LedgerEntry.EntryType.DEBIT and account.balance < amount:
        raise ValueError('Insufficient funds.')

    delta = amount if entry_type == LedgerEntry.EntryType.CREDIT else -amount
    account.balance += delta
    account.save(update_fields=['balance', 'updated_at'])

    return LedgerEntry.objects.create(
        account=account,
        entry_type=entry_type,
        amount=amount,
        description=description,
        reference_id=reference_id,
        posted_at=posted_at,
    )
""",
    "finance/views.py": """
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Account, Customer, LedgerEntry
from .serializers import AccountSerializer, CustomerSerializer, LedgerEntrySerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.order_by('-id')
    serializer_class = CustomerSerializer
    permission_classes = (IsAuthenticated,)


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.select_related('customer').order_by('-id')
    serializer_class = AccountSerializer
    permission_classes = (IsAuthenticated,)


class LedgerEntryViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = LedgerEntry.objects.select_related('account').order_by('-posted_at', '-id')
    serializer_class = LedgerEntrySerializer
    permission_classes = (IsAuthenticated,)
""",
    "finance/urls.py": """
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AccountViewSet, CustomerViewSet, LedgerEntryViewSet

router = DefaultRouter()
router.register('customers', CustomerViewSet, basename='customers')
router.register('accounts', AccountViewSet, basename='accounts')
router.register('ledger-entries', LedgerEntryViewSet, basename='ledger-entries')

urlpatterns = [
    path('', include(router.urls)),
]
""",
    "finance/admin.py": """
from django.contrib import admin

from .models import Account, Customer, LedgerEntry

admin.site.register(Customer)
admin.site.register(Account)
admin.site.register(LedgerEntry)
""",
    "finance/migrations/__init__.py": "",
    "README.md": """
# Backend starter (Django + DRF + JWT + PostgreSQL)

## Quick start

1. Copy `.env.example` to `.env` and update values.
2. Create and activate a virtual environment.
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run migrations and create an admin user:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   python manage.py createsuperuser
   ```
5. Start the server:
   ```bash
   python manage.py runserver
   ```

## API routes
- `POST /api/v1/auth/token/`
- `POST /api/v1/auth/token/refresh/`
- CRUD on `/api/v1/customers/`
- CRUD on `/api/v1/accounts/`
- Create/list `/api/v1/ledger-entries/`

## Security & integrity defaults
- JWT auth with rotation + blacklist.
- Account balance updates are guarded by database transactions and row-level locking.
- Basic secure cookie and browser hardening settings enabled when `DEBUG=0`.
""",
}


def write_template(base: Path, relative_path: str, content: str) -> None:
    target = base / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    normalized = textwrap.dedent(content).lstrip("\n")
    if normalized and not normalized.endswith("\n"):
        normalized += "\n"
    target.write_text(normalized, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Django backend starter project")
    parser.add_argument("--output", default="backend_starter", help="Output directory")
    parser.add_argument("--force", action="store_true", help="Overwrite existing directory")
    args = parser.parse_args()

    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()) and not args.force:
        raise SystemExit(f"Output directory '{output}' is not empty. Use --force to overwrite.")

    output.mkdir(parents=True, exist_ok=True)
    for relative_path, content in TEMPLATES.items():
        write_template(output, relative_path, content)

    print(f"✅ Generated backend starter in: {output}")


if __name__ == "__main__":
    main()
