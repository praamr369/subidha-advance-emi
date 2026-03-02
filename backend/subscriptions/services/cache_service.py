from django.core.cache import cache

PUBLIC_STATS_KEY = "public_stats"
ADMIN_DASHBOARD_KEY = "admin_dashboard"


def invalidate_public_stats():
    cache.delete(PUBLIC_STATS_KEY)


def invalidate_admin_dashboard():
    cache.delete(ADMIN_DASHBOARD_KEY)


def invalidate_all_dashboards():
    invalidate_public_stats()
    invalidate_admin_dashboard()