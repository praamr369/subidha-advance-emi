import sys
import re

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Insert import at the top
import_str = 'import { OperationalCalendar } from "@/components/dashboard/calendar/OperationalCalendar";\n'
if "import { OperationalCalendar" not in text:
    text = import_str + text

# 2. Find the start of the layout wrapper
target_start = '    >\n      <div className="space-y-6">\n        <div className="flex flex-col gap-6 md:flex-row">'
replace_start = '    >\n      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">\n        <div className="lg:col-span-3 space-y-6">\n        <div className="flex flex-col gap-6 md:flex-row">'

if target_start in text:
    text = text.replace(target_start, replace_start)
else:
    print("WARNING: Could not find target_start")

# 3. Find the end of the layout wrapper
target_end = '        ) : null}\n      </div>\n    </ERPPageShell>'
replace_end = '        ) : null}\n        </div>\n        <div className="lg:col-span-1 space-y-6">\n          <OperationalCalendar />\n        </div>\n      </div>\n    </ERPPageShell>'

if target_end in text:
    text = text.replace(target_end, replace_end)
else:
    print("WARNING: Could not find target_end")

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
