import sys

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

# Revert my bad replace_file_content if it messed things up
# Oh wait, let's just find the `export default function LegacyDashboard()` and remove the one I injected, and add the import to the top of the file

for i, line in enumerate(lines):
    if "import { OperationalCalendar }" in line:
        del lines[i]
        break

# Add import at the top
for i, line in enumerate(lines):
    if line.startswith("import"):
        lines.insert(i, 'import { OperationalCalendar } from "@/components/dashboard/calendar/OperationalCalendar";')
        break

# Wrap layout
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if '<div className="space-y-6">' in line and lines[i+1].strip() == '<div className="flex flex-col gap-6 md:flex-row">':
        start_idx = i
        break

for i in range(len(lines)-1, -1, -1):
    if '        ) : null}' in lines[i] and '      </div>' in lines[i+1] and '    </ERPPageShell>' in lines[i+2]:
        end_idx = i + 1
        break

if start_idx != -1 and end_idx != -1:
    lines[start_idx] = '      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">\n        <div className="xl:col-span-3 space-y-6">'
    
    lines[end_idx] = '        </div>\n        <div className="xl:col-span-1 space-y-6">\n          <OperationalCalendar />\n        </div>\n      </div>'
    
    with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "w", encoding="utf-8") as f:
        f.write('\n'.join(lines))
    print("SUCCESS")
else:
    print(f"FAILED: start_idx={start_idx}, end_idx={end_idx}")

