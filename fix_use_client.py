import sys

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

# Find where the import is and remove it
import_idx = -1
for i, line in enumerate(lines):
    if "import { OperationalCalendar }" in line:
        import_idx = i
        break

if import_idx != -1:
    import_line = lines.pop(import_idx)
    
    # Find "use client" and insert after it
    use_client_idx = -1
    for i, line in enumerate(lines):
        if '"use client"' in line or "'use client'" in line:
            use_client_idx = i
            break
            
    if use_client_idx != -1:
        lines.insert(use_client_idx + 1, import_line)
    else:
        lines.insert(0, import_line)
        
with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "w", encoding="utf-8") as f:
    f.write('\n'.join(lines))
