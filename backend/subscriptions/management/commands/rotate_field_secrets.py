"""Re-encrypt at-rest secrets under the current primary FIELD_ENCRYPTION_KEYS key.

Part of the zero-downtime key-rotation runbook (docs/DATA_ENCRYPTION_AND_HARDENING.md):

    1. Generate a new Fernet key and PREPEND it to FIELD_ENCRYPTION_KEYS (keep the
       old key too), deploy.
    2. Run: manage.py rotate_field_secrets      (re-encrypts every stored secret
       under the new primary; old ciphertexts still decrypted via the old key).
    3. Verify, then remove the old key from FIELD_ENCRYPTION_KEYS and deploy.

Idempotent and safe: a value that cannot be decrypted is left untouched (never
destroyed), and the write only replaces the ciphertext field with an equivalent
re-encryption of the same plaintext.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from business_setup.models.email_smtp import EmailSMTPSettings
from subscriptions.services.secret_crypto import rotate_secret


class Command(BaseCommand):
    help = "Re-encrypt stored at-rest secrets under the current primary encryption key."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many secrets would be re-encrypted without writing.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        rows = EmailSMTPSettings.objects.exclude(app_password_encrypted="")
        changed = 0

        with transaction.atomic():
            for row in rows:
                old = row.app_password_encrypted
                new = rotate_secret(old)
                if new and new != old:
                    changed += 1
                    if not dry_run:
                        # Update the ciphertext field directly: this bypasses
                        # save()/full_clean() (which would re-run the single-active
                        # -record validation) and needs no plaintext.
                        EmailSMTPSettings.objects.filter(pk=row.pk).update(
                            app_password_encrypted=new
                        )
            if dry_run:
                transaction.set_rollback(True)

        verb = "Would re-encrypt" if dry_run else "Re-encrypted"
        self.stdout.write(self.style.SUCCESS(f"{verb} {changed} at-rest secret(s)."))
