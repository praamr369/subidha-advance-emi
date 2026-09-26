import os

def replace_in_file(filepath, targets, replacement):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return
    
    modified = content
    for t in targets:
        modified = modified.replace(t, replacement)
        
    if modified != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(modified)
        print(f"Updated {filepath}")

bp_targets = [
    'BusinessProfile.objects.filter(is_active=True).order_by("-created_at", "-id").first()',
    'BusinessProfile.objects.filter(is_active=True).order_by("id").first()',
    'BusinessProfile.objects.order_by("pk").first()',
    'BusinessProfile.objects.filter(is_active=True).first()'
]

brp_targets = [
    'BusinessRulePolicy.objects.filter(is_active=True).order_by("-created_at", "-id").first()'
]

for root, _, files in os.walk('backend'):
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            replace_in_file(filepath, bp_targets, 'BusinessProfile.get_current()')
            replace_in_file(filepath, brp_targets, 'BusinessRulePolicy.get_current()')

