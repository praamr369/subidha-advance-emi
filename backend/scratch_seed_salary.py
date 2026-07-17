import os
import sys
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django
django.setup()

from accounting.models import SalarySheet, SalarySheetStatus, PayrollPeriod, PayrollPeriodStatus, EmployeeProfile
from django.utils import timezone
from datetime import timedelta

employee = EmployeeProfile.objects.first()

now = timezone.now()
next_month_date = now + timedelta(days=30)

period = PayrollPeriod.objects.create(
    start_date=next_month_date.date().replace(day=1),
    end_date=next_month_date.date(),
    year=next_month_date.year,
    month=next_month_date.month,
    status=PayrollPeriodStatus.OPEN
)

sheet = SalarySheet.objects.create(
    employee=employee,
    payroll_period=period,
    year=period.start_date.year,
    month=period.start_date.month,
    gross_amount=Decimal("15000.00"),
    deductions_amount=Decimal("0.00"),
    net_amount=Decimal("15000.00"),
    status=SalarySheetStatus.APPROVED
)
print(f"Created pending Salary Sheet {sheet.id} for {employee.employee_code}")
