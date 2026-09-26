import sys

def modify_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    target = """    def save(self, *args, **kwargs):
        self.display_name = (self.display_name or "").strip()"""
    
    replacement = """    def save(self, *args, **kwargs):
        self.display_name = (self.display_name or "").strip()"""
        
    replacement_full = """    def save(self, *args, **kwargs):
        self.display_name = (self.display_name or "").strip()
        self.tagline = (self.tagline or "").strip()
        self.hero_title = (self.hero_title or "").strip()
        self.hero_subtitle = (self.hero_subtitle or "").strip()
        self.support_phone = (self.support_phone or "").strip()
        self.support_email = (self.support_email or "").strip()
        self.whatsapp_phone = (self.whatsapp_phone or "").strip()
        self.whatsapp_link = (self.whatsapp_link or "").strip()
        self.facebook_url = (self.facebook_url or "").strip()
        self.instagram_url = (self.instagram_url or "").strip()
        self.youtube_url = (self.youtube_url or "").strip()
        self.address_text = (self.address_text or "").strip()
        self.map_url = (self.map_url or "").strip()
        self.business_hours = (self.business_hours or "").strip()
        self.public_logo_url = (self.public_logo_url or "").strip()

        self.full_clean()
        super().save(*args, **kwargs)
        from django.core.cache import cache
        if self.is_active:
            cache.delete("public_business_profile_singleton")

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        from django.core.cache import cache
        if self.is_active:
            cache.delete("public_business_profile_singleton")"""
            
    target_full = """    def save(self, *args, **kwargs):
        self.display_name = (self.display_name or "").strip()
        self.tagline = (self.tagline or "").strip()
        self.hero_title = (self.hero_title or "").strip()
        self.hero_subtitle = (self.hero_subtitle or "").strip()
        self.support_phone = (self.support_phone or "").strip()
        self.support_email = (self.support_email or "").strip()
        self.whatsapp_phone = (self.whatsapp_phone or "").strip()
        self.whatsapp_link = (self.whatsapp_link or "").strip()
        self.facebook_url = (self.facebook_url or "").strip()
        self.instagram_url = (self.instagram_url or "").strip()
        self.youtube_url = (self.youtube_url or "").strip()
        self.address_text = (self.address_text or "").strip()
        self.map_url = (self.map_url or "").strip()
        self.business_hours = (self.business_hours or "").strip()
        self.public_logo_url = (self.public_logo_url or "").strip()

        self.full_clean()
        super().save(*args, **kwargs)"""
    
    content = content.replace(target_full, replacement_full)
    
    with open(filepath, 'w') as f:
        f.write(content)

modify_file('backend/business_setup/models/core.py')
