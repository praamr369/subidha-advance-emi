import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.development')
django.setup()
import backend.inventory.management.commands.fix_unassigned_locations as fix_script
print(dir(fix_script))
