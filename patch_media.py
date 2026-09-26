import sys

with open('backend/products_pim/models.py', 'r') as f:
    content = f.read()

content = content.replace(
    '    file = models.FileField(upload_to="pim/gallery/")',
    '    file = models.URLField(max_length=500, help_text="CDN URL to the asset", default="", blank=True)'
)
content = content.replace(
    '    ios_file = models.FileField(upload_to="pim/models/ios/", null=True, blank=True)',
    '    ios_file = models.URLField(max_length=500, null=True, blank=True, help_text="CDN URL to iOS specific asset")'
)

content = content.replace(
    '    image = models.ImageField(upload_to="pim/variants/", null=True, blank=True)',
    '    image = models.URLField(max_length=500, null=True, blank=True, help_text="CDN URL to image")'
)

content = content.replace(
    '    video = models.FileField(upload_to="pim/variants/videos/", null=True, blank=True)',
    '    video = models.URLField(max_length=500, null=True, blank=True, help_text="CDN URL to video")'
)

with open('backend/products_pim/models.py', 'w') as f:
    f.write(content)
