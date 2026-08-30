import sys
import re

with open("backend/api/v1/urls.py", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Insert import
import_str = 'from api.v1.views.dashboard_calendar import DashboardCalendarEventsView, DashboardMemoView\n'
text = import_str + text

# 2. Add path
url_str = '    path("dashboard/calendar-events", DashboardCalendarEventsView.as_view()),\n    path("dashboard/calendar-memos", DashboardMemoView.as_view()),\n'
target = '    path("dashboards/", include("api.v1.routes.dashboard_surfaces")),\n'
if target in text:
    text = text.replace(target, target + url_str)
else:
    print("Could not find insertion point!")

with open("backend/api/v1/urls.py", "w", encoding="utf-8") as f:
    f.write(text)
print("SUCCESS")
