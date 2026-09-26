import sys

def modify_core_models(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # 1. Modify BusinessProfile
    # Add id=1 singleton enforcement in clean/save
    bp_clean_target = """
    def clean(self):
        errors = {}
        if not (self.legal_name or "").strip():
            errors["legal_name"] = "Legal name is required."
        if self.is_active and BusinessProfile.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active business profile is allowed."
        if errors:
            raise ValidationError(errors)
"""
    bp_clean_replacement = """
    def clean(self):
        errors = {}
        if not (self.legal_name or "").strip():
            errors["legal_name"] = "Legal name is required."
        if self.pk != 1 and BusinessProfile.objects.exists():
            errors["id"] = "Only one BusinessProfile can exist (id must be 1)."
        if errors:
            raise ValidationError(errors)

    @classmethod
    def get_current(cls):
        from django.core.cache import cache
        bp = cache.get("business_profile_singleton")
        if bp is None:
            bp = cls.objects.order_by("id").first()
            if bp:
                cache.set("business_profile_singleton", bp, timeout=86400)
        return bp
"""
    content = content.replace(bp_clean_target, bp_clean_replacement)
    
    bp_save_target = """
    def save(self, *args, **kwargs):
        self.legal_name = (self.legal_name or "").strip()
"""
    bp_save_replacement = """
    def save(self, *args, **kwargs):
        if not self.pk and BusinessProfile.objects.exists():
            self.pk = 1
        self.legal_name = (self.legal_name or "").strip()
"""
    content = content.replace(bp_save_target, bp_save_replacement)
    
    bp_save_end_target = """
        self.default_currency_code = (self.default_currency_code or "").strip().upper() or "INR"
        self.timezone_name = (self.timezone_name or "").strip() or "Asia/Kolkata"
        self.full_clean()
        super().save(*args, **kwargs)
"""
    bp_save_end_replacement = """
        self.default_currency_code = (self.default_currency_code or "").strip().upper() or "INR"
        self.timezone_name = (self.timezone_name or "").strip() or "Asia/Kolkata"
        self.full_clean()
        super().save(*args, **kwargs)
        from django.core.cache import cache
        cache.delete("business_profile_singleton")

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        from django.core.cache import cache
        cache.delete("business_profile_singleton")
"""
    content = content.replace(bp_save_end_target, bp_save_end_replacement)
    
    # 2. Modify BusinessRulePolicy
    brp_target = """
    name = models.CharField(max_length=120, default="Default legal controls")
    is_active = models.BooleanField(default=True, db_index=True)
"""
    brp_replacement = """
    name = models.CharField(max_length=120, default="Default legal controls")
    is_active = models.BooleanField(default=True, db_index=True)
    effective_from = models.DateTimeField(default=timezone.now, db_index=True)
    effective_to = models.DateTimeField(null=True, blank=True, db_index=True)
"""
    content = content.replace(brp_target, brp_replacement)

    brp_methods = """
    def clean(self):
        errors = {}
        if self.is_active and BusinessRulePolicy.objects.filter(is_active=True).exclude(pk=self.pk).exists():
            errors["is_active"] = "Only one active business rule policy is allowed at a time."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        from django.core.cache import cache
        if self.is_active:
            cache.delete("active_business_rule_policy")

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        from django.core.cache import cache
        if self.is_active:
            cache.delete("active_business_rule_policy")

    @classmethod
    def get_current(cls):
        from django.core.cache import cache
        policy = cache.get("active_business_rule_policy")
        if policy is None:
            policy = cls.objects.filter(is_active=True).order_by("-effective_from", "-id").first()
            if policy:
                cache.set("active_business_rule_policy", policy, timeout=86400)
        return policy
"""
    # Find the end of BusinessRulePolicy
    brp_end_target = """    non_gst_document_labels = models.JSONField(default=default_non_gst_document_labels, blank=True)
"""
    content = content.replace(brp_end_target, brp_end_target + brp_methods)

    with open(filepath, 'w') as f:
        f.write(content)

modify_core_models('backend/business_setup/models/core.py')
