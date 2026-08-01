import sys

with open('backend/core/settings/base.py', 'r') as f:
    content = f.read()

if '"customers",' not in content and "'customers'," not in content:
    content = content.replace('"subscriptions",', '"customers",\n    "subscriptions",')

with open('backend/core/settings/base.py', 'w') as f:
    f.write(content)
