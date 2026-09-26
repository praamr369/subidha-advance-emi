import sys

def modify_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    target = """    def clean(self):"""
    
    replacement = """    @classmethod
    def get_current(cls):
        from django.core.cache import cache
        bp = cache.get("public_business_profile_singleton")
        if bp is None:
            bp = cls.objects.filter(is_active=True).first()
            if bp:
                cache.set("public_business_profile_singleton", bp, timeout=86400)
        return bp

    def clean(self):"""
    
    content = content.replace(target, replacement)
    
    with open(filepath, 'w') as f:
        f.write(content)

modify_file('backend/business_setup/models/core.py')
