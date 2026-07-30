import sys
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Checks solopreneur system health constraints and exits with non-zero if broken."

    def handle(self, *args, **options):
        # Local import to avoid setup issues when django loads commands
        from accounting.services.trial_balance_check_service import build_trial_balance_check
        from django.utils import timezone
        
        today = timezone.localdate()
        tb = build_trial_balance_check(
            as_of=today,
            period={"year": today.year, "month": today.month},
        )
        
        is_balanced = tb.get("is_balanced", False)
        
        if not is_balanced:
            self.stdout.write(self.style.ERROR("CRITICAL: Ledger is NOT balanced. Immediate attention required."))
            sys.exit(1)
            
        unposted_bridges = 0
        for check in tb.get("checks", []):
            if check.get("key") == "bridge.unposted":
                unposted_bridges = check.get("count", 0)
                
        if unposted_bridges > 0:
            self.stdout.write(self.style.WARNING(f"WARNING: {unposted_bridges} unposted bridge record(s) exist. Daily close should be run."))
            sys.exit(2)
            
        self.stdout.write(self.style.SUCCESS("OK: Ledger is balanced and no unposted bridge records found."))
        sys.exit(0)
