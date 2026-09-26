import sys

def modify_service(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # replace get_or_create_active_business_rule_policy usages
    # Actually let's just make get_or_create_active_business_rule_policy use get_current()
    target1 = """def get_or_create_active_business_rule_policy() -> BusinessRulePolicy:
    policy = BusinessRulePolicy.objects.filter(is_active=True).order_by("-created_at", "-id").first()
    if policy is None:
        policy = BusinessRulePolicy.objects.create(name="Default legal controls", is_active=True)
    return policy"""
    
    rep1 = """def get_or_create_active_business_rule_policy() -> BusinessRulePolicy:
    policy = BusinessRulePolicy.get_current()
    if policy is None:
        policy = BusinessRulePolicy.objects.create(name="Default legal controls", is_active=True)
    return policy"""

    content = content.replace(target1, rep1)
    
    target2 = """    policy = BusinessRulePolicy.objects.filter(is_active=True).order_by("-created_at", "-id").first()"""
    rep2 = """    policy = BusinessRulePolicy.get_current()"""
    
    content = content.replace(target2, rep2)
    
    with open(filepath, 'w') as f:
        f.write(content)

modify_service('backend/subscriptions/services/business_rule_policy_service.py')
