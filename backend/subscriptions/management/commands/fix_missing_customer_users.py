from django.core.management.base import BaseCommand
from django.utils.crypto import get_random_string
from accounts.models import User, UserRole
from subscriptions.models import Customer

class Command(BaseCommand):
    help = "Create missing users for customers without a linked user"

    def handle(self, *args, **options):
        missing = Customer.objects.filter(user__isnull=True)
        self.stdout.write(f"Found {missing.count()} customers without a user.")

        for customer in missing:
            base_username = customer.name.lower().replace(" ", "")[:20]
            username = base_username
            counter = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}{counter}"
                counter += 1

            password = get_random_string(12)
            user = User.objects.create_user(
                username=username,
                password=password,
                role=UserRole.CUSTOMER,
                phone=customer.phone,
                first_name=customer.name,
                email=customer.email if hasattr(customer, 'email') else "",
            )
            customer.user = user
            customer.save()
            self.stdout.write(f"Created user '{username}' for customer #{customer.id}")

        self.stdout.write(self.style.SUCCESS("Done."))