from typing import TypedDict
from subscriptions.models import Subscription, SubscriptionStatus
from crm.models import Lead

class SolopreneurUniversalDashboardDTO(TypedDict):
    total_liquid_balance: float
    active_subscriptions: int
    pending_production_jobs: int
    unposted_labor_accruals: float
    open_leads: int

def get_solopreneur_dashboard_kpis() -> SolopreneurUniversalDashboardDTO:
    try:
        active_subscriptions = Subscription.objects.filter(status=SubscriptionStatus.ACTIVE).count()
    except Exception:
        active_subscriptions = 0
        
    try:
        open_leads = Lead.objects.filter(status='NEW').count()
    except Exception:
        open_leads = 0
        
    return {
        "total_liquid_balance": 0.0,
        "active_subscriptions": active_subscriptions,
        "pending_production_jobs": 0,
        "unposted_labor_accruals": 0.0,
        "open_leads": open_leads,
    }
