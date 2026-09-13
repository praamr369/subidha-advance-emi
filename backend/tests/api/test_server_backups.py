import io
import shutil
import tarfile
import tempfile
from pathlib import Path

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from business_setup.services.server_backup_service import MANUAL_KEEP
from tests.helpers import create_admin_user, create_customer_user

BASE = "/api/v1/admin/business-setup/server-backups/"


class ServerBackupApiTests(APITestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.media = self.tmp / "media"
        (self.media / "products").mkdir(parents=True)
        (self.media / "products" / "chair.jpg").write_bytes(b"\xff\xd8fake-jpeg")
        self.root = self.tmp / "backups"
        override = override_settings(BACKUP_ROOT=str(self.root), MEDIA_ROOT=str(self.media))
        override.enable()
        self.addCleanup(override.disable)
        self.admin = create_admin_user(username="backup_admin", phone="919000002221")
        self.customer = create_customer_user(username="backup_cust", phone="919000002222")

    def _download(self, name, filename):
        response = self.client.get(f"{BASE}{name}/download/{filename}/")
        body = b"".join(response.streaming_content) if response.status_code == 200 else b""
        response.close()
        return response, body

    def test_images_backup_can_be_downloaded_and_holds_product_images(self):
        self.client.force_authenticate(self.admin)

        created = self.client.post(BASE, {"include_database": False}, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        backup = created.json()["backup"]
        self.assertTrue(backup["has_media"])
        self.assertFalse(backup["has_database"])
        self.assertEqual(backup["label"], "manual")

        listing = self.client.get(BASE).json()
        self.assertEqual([b["name"] for b in listing["backups"]], [backup["name"]])
        self.assertEqual(listing["media_file_count"], 1)

        response, body = self._download(backup["name"], "media.tar.gz")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(f"subidha-{backup['name']}-media.tar.gz", response["Content-Disposition"])
        with tarfile.open(fileobj=io.BytesIO(body), mode="r:gz") as tar:
            self.assertIn("./products/chair.jpg", tar.getnames())

        response, checksums = self._download(backup["name"], "checksums.txt")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"  media.tar.gz", checksums)

    def test_database_backup_fails_cleanly_when_database_is_not_postgres(self):
        # The test DB is SQLite: the full backup must refuse with a readable
        # reason and leave no half-written backup folder behind.
        self.client.force_authenticate(self.admin)
        response = self.client.post(BASE, {"include_database": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("PostgreSQL", response.json()["detail"])
        self.assertEqual(self.client.get(BASE).json()["backups"], [])
        self.assertFalse(self.client.get(BASE).json()["database_backup_available"])

    def test_download_only_serves_listed_files_inside_the_backup_root(self):
        self.client.force_authenticate(self.admin)
        name = self.client.post(BASE, {"include_database": False}, format="json").json()["backup"]["name"]
        (self.tmp / "secret.txt").write_text("not a backup")

        for backup_name, filename in [
            (name, "deployed-commit.txt"),
            (name, "db.dump"),  # not in this images-only backup
            ("not-a-backup", "media.tar.gz"),
            ("..", "media.tar.gz"),
            (name, "..%2F..%2Fsecret.txt"),
        ]:
            response, _ = self._download(backup_name, filename)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, (backup_name, filename))

    def test_old_web_app_backups_are_pruned_but_nightly_ones_are_kept(self):
        self.client.force_authenticate(self.admin)
        for i in range(MANUAL_KEEP + 2):
            (self.root / f"manual-20260101-00000{i}").mkdir(parents=True)
        (self.root / "scheduled-20260101-023001").mkdir()

        response = self.client.post(BASE, {"include_database": False}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        manual = sorted(p.name for p in self.root.iterdir() if p.name.startswith("manual-"))
        self.assertEqual(len(manual), MANUAL_KEEP)
        self.assertIn(response.json()["backup"]["name"], manual)
        self.assertTrue((self.root / "scheduled-20260101-023001").is_dir())

    def test_non_admin_cannot_list_create_or_download(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(BASE).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(BASE, {}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        response, _ = self._download("manual-20260101-000000", "media.tar.gz")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
