import os
import sys
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django
django.setup()

from accounting.models import EmployeeExpenseClaim, ExpenseClaimStatus, SalarySheet, SalarySheetStatus, PayrollPeriod, PayrollPeriodStatus, EmployeeProfile, ChartOfAccount
from django.utils import timezone

employee = EmployeeProfile.objects.first()
if not employee:
    print("No employee profile found. Creating one...")
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.filter(role__in=["STAFF", "ADMIN"]).first()
    if not u:
        print("No user found")
        sys.exit()
    employee = EmployeeProfile.objects.create(
        user=u,
        employee_code="TEST-EMP-1",
        base_salary=Decimal("15000.00")
    )

expense_account = ChartOfAccount.objects.filter(is_active=True, account_type="EXPENSE").first()
if not expense_account:
    print("No chart of account found!")
    sys.exit()

# Seed Expense
claim = EmployeeExpenseClaim.objects.create(
    employee=employee,
    claimed_amount=Decimal("1250.00"),
    approved_amount=Decimal("1250.00"),
    claim_date=timezone.now().date(),
    expense_date=timezone.now().date(),
    status=ExpenseClaimStatus.APPROVED,
    category="TRAVEL",
    expense_account=expense_account,
    notes="Test Travel Expense"
)
print(f"Created pending Expense Claim {claim.id} for {employee.employee_code}")

# Seed Salary
period = PayrollPeriod.objects.first()
if not period:
    period = PayrollPeriod.objects.create(
        name="Test Period",
        start_date=timezone.now().date().replace(day=1),
        end_date=timezone.now().date(),
        status=PayrollPeriodStatus.PROCESSING
    )

sheet = SalarySheet.objects.create(
    employee=employee,
    payroll_period=period,
    year=period.start_date.year,
    month=period.start_date.month,
    base_salary=Decimal("15000.00"),
    net_payable=Decimal("15000.00"),
    status=SalarySheetStatus.APPROVED,
    notes="Test Salary"
)
print(f"Created pending Salary Sheet {sheet.id} for {employee.employee_code}")
