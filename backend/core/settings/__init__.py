import os

if os.getenv("DJANGO_ENV") == "production":
    from .production import *  # noqa
else:
    from .development import *  # noqa
