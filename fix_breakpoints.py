import sys

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

for i, line in enumerate(lines):
    if "grid-cols-1 xl:grid-cols-4" in line:
        lines[i] = line.replace("xl:grid-cols-4", "lg:grid-cols-4")
    elif "xl:col-span-3" in line:
        lines[i] = line.replace("xl:col-span-3", "lg:col-span-3")
    elif "xl:col-span-1" in line:
        lines[i] = line.replace("xl:col-span-1", "lg:col-span-1")

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "w", encoding="utf-8") as f:
    f.write('\n'.join(lines))
