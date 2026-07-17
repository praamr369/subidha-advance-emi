from .base import *  # noqa

DEBUG = False

# Prevent accidental business reset in production.
# Set to True explicitly only when running a controlled migration/teardown.
ALLOW_BUSINESS_RESET = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
