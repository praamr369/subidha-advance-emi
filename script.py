import sys

with open("frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx", "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

for i in range(10):
    print(f"{i}: {lines[i]}")
