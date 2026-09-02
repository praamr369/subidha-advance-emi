"""
Bulk-import product photography from a folder.

The catalogue is large and almost entirely unphotographed, and the admin PIM
screen uploads one product at a time. This maps a directory of image files onto
products by code so a photo shoot can be loaded in one pass.

Supported layouts (both may be mixed in the same folder):

    AHUJABTA660-0001.jpg          -> hero image for that product
    AHUJABTA660-0001_2.jpg        -> additional image, ordered by the suffix
    AHUJABTA660-0001-3.jpg        -> same, hyphen form
    AHUJABTA660-0001/front.jpg    -> folder per product, all files attached
    BAHU-A.jpg                    -> a variant SKU also matches

Codes are matched case-insensitively against PimProduct.code first, then
ProductVariant.sku. Nothing is written unless --commit is passed.

Examples:
    manage.py import_product_images /srv/photos
    manage.py import_product_images /srv/photos --commit
    manage.py import_product_images /srv/photos --commit --set-hero
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".webm", ".m4v"}

# "CODE_2" / "CODE-3" -> (code, order). The code itself may contain hyphens, so
# only a trailing _<digits> or -<digits> counts as an ordering suffix.
ORDER_SUFFIX = re.compile(r"^(?P<code>.+?)[_-](?P<order>\d{1,3})$")

MAX_BYTES = 15 * 1024 * 1024


class Command(BaseCommand):
    help = "Bulk-import product images from a folder, matching files to products by code or variant SKU."

    def add_arguments(self, parser):
        parser.add_argument("source", help="Folder containing the image files.")
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually write. Without this the command only reports what it would do.",
        )
        parser.add_argument(
            "--set-hero",
            action="store_true",
            help="Mark the first image of each product as the hero when it has none.",
        )
        parser.add_argument(
            "--include-video",
            action="store_true",
            help="Also import video files (mp4/mov/webm/m4v).",
        )
        parser.add_argument(
            "--move-imported",
            metavar="DIR",
            help="After a successful commit, move imported files into DIR.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Stop after this many files (0 = no limit). Useful for a trial run.",
        )

    # ── discovery ────────────────────────────────────────────────────────────

    def _collect(self, root: Path, include_video: bool) -> list[tuple[str | None, str, Path]]:
        """
        Return (folder_code, stem, path) for every importable file.

        Deliberately does not decide the product code here. Codes in this
        catalogue routinely end in digits (AHUJABTA660-0001, BED-001), so a
        trailing "-001" is indistinguishable from an ordering suffix by pattern
        alone — it has to be resolved against the real codes in the database.
        """
        allowed = set(IMAGE_SUFFIXES)
        if include_video:
            allowed |= VIDEO_SUFFIXES

        found: list[tuple[str | None, str, Path]] = []
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in allowed:
                continue
            folder_code = path.parent.name if path.parent != root else None
            found.append((folder_code, path.stem, path))
        return found

    def _resolve(self, candidates: set[str]):
        """Map lowercased code -> (PimProduct, ProductVariant|None)."""
        from products_pim.models import PimProduct, ProductVariant

        wanted = {c.lower() for c in candidates if c}
        resolved: dict[str, tuple[object, object | None]] = {}
        if not wanted:
            return resolved

        for p in PimProduct.objects.all().only("id", "code"):
            key = (p.code or "").lower()
            if key in wanted:
                resolved[key] = (p, None)

        missing = wanted - set(resolved)
        if missing:
            for v in ProductVariant.objects.select_related("product").all().only(
                "id", "sku", "product__id", "product__code"
            ):
                key = (v.sku or "").lower()
                if key in missing and key not in resolved:
                    resolved[key] = (v.product, v)

        return resolved

    def _match(self, folder_code, stem, resolved):
        """
        Resolve one file to (target, order).

        Tries the most specific reading first: a folder name, then the whole
        stem as a code, and only then the stem with a trailing _N / -N stripped.
        That ordering is what keeps BED-001 a product rather than image 1 of BED.
        """
        if folder_code:
            target = resolved.get(folder_code.lower())
            if target:
                m = ORDER_SUFFIX.match(stem)
                return target, (int(m.group("order")) if m else 0)
            return None, 0

        target = resolved.get(stem.lower())
        if target:
            return target, 0

        m = ORDER_SUFFIX.match(stem)
        if m:
            target = resolved.get(m.group("code").lower())
            if target:
                return target, int(m.group("order"))

        return None, 0

    # ── main ─────────────────────────────────────────────────────────────────

    def handle(self, *args, **opts):
        from products_pim.models import MediaKind, MediaScope, ProductMediaItem

        root = Path(opts["source"]).expanduser()
        if not root.is_dir():
            raise CommandError(f"Source folder not found: {root}")

        commit = opts["commit"]
        files = self._collect(root, opts["include_video"])
        if opts["limit"]:
            files = files[: opts["limit"]]

        if not files:
            self.stdout.write(self.style.WARNING(f"No importable files found under {root}"))
            return

        # Every string a file could plausibly be naming: the folder, the whole
        # stem, and the stem minus a trailing _N / -N.
        candidates: set[str] = set()
        for folder_code, stem, _path in files:
            if folder_code:
                candidates.add(folder_code)
            candidates.add(stem)
            m = ORDER_SUFFIX.match(stem)
            if m:
                candidates.add(m.group("code"))
        resolved = self._resolve(candidates)

        planned: list[tuple[object, object | None, Path, str]] = []
        unmatched: list[Path] = []
        skipped: list[tuple[Path, str]] = []

        # Filenames already attached to a product, so re-running is a no-op.
        existing = {
            (pid, Path(name).name.lower())
            for pid, name in ProductMediaItem.objects.values_list("product_id", "file")
        }

        matched: list[tuple[object, object | None, int, Path]] = []
        for folder_code, stem, path in files:
            target, order = self._match(folder_code, stem, resolved)
            if not target:
                unmatched.append(path)
                continue
            matched.append((target[0], target[1], order, path))

        # Hero candidates (order 0) first, then by explicit order, so gallery
        # ordering is predictable regardless of directory listing order.
        matched.sort(key=lambda t: (t[0].code.lower(), t[2], t[3].name))

        for pim, variant, _order, path in matched:
            size = path.stat().st_size
            if size == 0:
                skipped.append((path, "empty file"))
                continue
            if size > MAX_BYTES:
                skipped.append((path, f"larger than {MAX_BYTES // (1024 * 1024)}MB"))
                continue
            if (pim.id, path.name.lower()) in existing:
                skipped.append((path, "already imported"))
                continue

            kind = MediaKind.VIDEO if path.suffix.lower() in VIDEO_SUFFIXES else MediaKind.IMAGE
            planned.append((pim, variant, path, kind))
            existing.add((pim.id, path.name.lower()))

        self._report(planned, unmatched, skipped, commit)
        if not planned or not commit:
            if planned and not commit:
                self.stdout.write(self.style.WARNING("\nDry run. Re-run with --commit to write these."))
            return

        written = self._write(planned, set_hero=opts["set_hero"])
        self.stdout.write(self.style.SUCCESS(f"\nImported {written} file(s)."))

        if opts["move_imported"]:
            dest = Path(opts["move_imported"]).expanduser()
            dest.mkdir(parents=True, exist_ok=True)
            for _pim, _v, path, _k in planned:
                try:
                    shutil.move(str(path), str(dest / path.name))
                except OSError as exc:
                    self.stdout.write(self.style.WARNING(f"  could not move {path.name}: {exc}"))
            self.stdout.write(f"Moved imported files to {dest}")

    @transaction.atomic
    def _write(self, planned, *, set_hero: bool) -> int:
        from products_pim.models import MediaKind, MediaScope, ProductMediaItem

        written = 0
        hero_seen: set[int] = set()
        # Continue each product's ordering from what it already has, then count
        # up as we add to it.
        next_order: dict[int, int] = {}
        for pim, variant, path, kind in planned:
            if pim.id not in next_order:
                next_order[pim.id] = ProductMediaItem.objects.filter(product=pim).count()
            order = next_order[pim.id]
            next_order[pim.id] = order + 1

            make_hero = False
            if set_hero and kind == MediaKind.IMAGE and pim.id not in hero_seen:
                if not ProductMediaItem.objects.filter(product=pim, is_hero=True).exists():
                    make_hero = True
                    hero_seen.add(pim.id)

            item = ProductMediaItem(
                product=pim,
                variant=variant,
                kind=kind,
                scope=MediaScope.VARIANT if variant else MediaScope.ALL_VARIANTS,
                title=path.stem[:200],
                is_hero=make_hero,
                display_order=order,
            )
            with path.open("rb") as fh:
                item.file.save(path.name, File(fh), save=False)
            item.save()
            written += 1

        return written

    # ── reporting ────────────────────────────────────────────────────────────

    def _report(self, planned, unmatched, skipped, commit: bool):
        verb = "Importing" if commit else "Would import"
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{verb} {len(planned)} file(s):"))

        by_product: dict[str, list[str]] = {}
        for pim, variant, path, kind in planned:
            label = f"{pim.code}" + (f" / {variant.sku}" if variant else "")
            by_product.setdefault(label, []).append(f"{path.name} [{kind}]")

        for label in sorted(by_product):
            names = by_product[label]
            self.stdout.write(f"  {label}: {', '.join(names[:4])}" + (f" (+{len(names) - 4} more)" if len(names) > 4 else ""))

        if skipped:
            self.stdout.write(self.style.WARNING(f"\nSkipped {len(skipped)} file(s):"))
            for path, reason in skipped[:20]:
                self.stdout.write(f"  {path.name}: {reason}")
            if len(skipped) > 20:
                self.stdout.write(f"  ... and {len(skipped) - 20} more")

        if unmatched:
            self.stdout.write(self.style.ERROR(f"\nNo product matched {len(unmatched)} file(s):"))
            for path in unmatched[:20]:
                self.stdout.write(f"  {path.name}")
            if len(unmatched) > 20:
                self.stdout.write(f"  ... and {len(unmatched) - 20} more")
            self.stdout.write(
                "  Name each file after the product code or variant SKU, "
                "or put it in a folder named after the code."
            )
