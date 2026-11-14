from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from accounts.models import TOTPDevice, UserSession

User = get_user_model()


class Command(BaseCommand):
    help = "Emergency CLI recovery: Reset or remove Two-Factor Authentication (MFA) for an admin account."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            help="Username of the user whose MFA device should be reset.",
        )
        parser.add_argument(
            "--phone",
            type=str,
            help="Phone number of the user whose MFA device should be reset.",
        )
        parser.add_argument(
            "--all-admins",
            action="store_true",
            help="Reset MFA devices for all ADMIN accounts.",
        )

    def handle(self, *args, **options):
        username = options.get("username")
        phone = options.get("phone")
        all_admins = options.get("all_admins")

        if not (username or phone or all_admins):
            raise CommandError("Specify --username, --phone, or --all-admins.")

        if all_admins:
            users = User.objects.filter(role="ADMIN")
            if not users.exists():
                self.stdout.write(self.style.WARNING("No ADMIN users found."))
                return
            count = 0
            for u in users:
                deleted, _ = TOTPDevice.objects.filter(user=u).delete()
                if deleted:
                    UserSession.objects.filter(user=u).update(is_active=False)
                    count += 1
                    self.stdout.write(self.style.SUCCESS(f"Reset MFA & revoked sessions for admin: {u.username}"))
            self.stdout.write(self.style.SUCCESS(f"Finished. Reset MFA on {count} admin account(s)."))
            return

        user = None
        if username:
            user = User.objects.filter(username__iexact=username.strip()).first()
            if not user:
                raise CommandError(f"User with username '{username}' not found.")
        elif phone:
            user = User.objects.filter(phone=phone.strip()).first()
            if not user:
                raise CommandError(f"User with phone '{phone}' not found.")

        deleted, _ = TOTPDevice.objects.filter(user=user).delete()
        if deleted:
            UserSession.objects.filter(user=user).update(is_active=False)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully reset Two-Factor Authentication and revoked active sessions for {user.username} ({user.role}). "
                    "They can now log in with password and re-pair their authenticator app at /admin/settings/mfa."
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(f"User {user.username} did not have an active MFA device.")
            )
