import sys

with open('backend/catalog/models.py', 'r') as f:
    content = f.read()

target = """    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.slug = slugify(self.slug or self.name)[:140]
        self.full_clean()
        super().save(*args, **kwargs)"""

replacement = """    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.slug = slugify(self.slug or self.name)[:140]
        self.full_clean()
        try:
            super().save(*args, **kwargs)
        except Exception as e:
            from mptt.exceptions import InvalidMove
            from django.core.exceptions import ValidationError
            if isinstance(e, InvalidMove):
                raise ValidationError({"parent": str(e)})
            raise"""

content = content.replace(target, replacement)

with open('backend/catalog/models.py', 'w') as f:
    f.write(content)
