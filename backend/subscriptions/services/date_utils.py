import calendar
from datetime import date


def safe_monthly_date(start_date: date, month_offset: int) -> date:
    """Return a month-shifted date while clamping day to month end."""
    month_index = (start_date.month - 1) + month_offset
    year = start_date.year + (month_index // 12)
    month = (month_index % 12) + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(start_date.day, last_day)
    return date(year, month, day)