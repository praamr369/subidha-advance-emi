import sys
import re

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "r", encoding="utf-8") as f:
    text = f.read()
    
# Remove the extra div tag I injected by accident.
# Wait, let's just append an extra } to the end of the file.
text += "\n}"

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "w", encoding="utf-8") as f:
    f.write(text)

