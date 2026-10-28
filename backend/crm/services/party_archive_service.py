"""Read-only ZIP export of a CRM party and its canonical linked records."""
from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime
from pathlib import Path

from django.core.files.storage import default_storage

from crm.models import PartyMaster
from crm.services.timeline_service import build_party_detail_payload


def _csv_bytes(rows: list[dict]) -> bytes:
    output = io.StringIO()
    if not rows:
        output.write("no_records\n")
        return output.getvalue().encode("utf-8-sig")
    fields = sorted({key for row in rows for key in row})
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: json.dumps(value, default=str, ensure_ascii=False) if isinstance(value, (dict, list)) else value for key, value in row.items()})
    return output.getvalue().encode("utf-8-sig")


def _safe_name(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in value)[:180]


def _documents_for_party(party: PartyMaster):
    from accounting.models import StaffKycDocument, VendorKycDocument
    from customers.models import CustomerKycDocument, PartnerKycDocument
    for link in party.links.all():
        model = link.source_model.lower()
        if link.role_type == "CUSTOMER" and model == "customer":
            yield "customer", CustomerKycDocument.objects.filter(customer_id=link.source_pk)
        elif link.role_type == "PARTNER":
            yield "partner", PartnerKycDocument.objects.filter(partner_user_id=link.source_pk)
        elif link.role_type == "VENDOR" and model == "vendor":
            yield "vendor", VendorKycDocument.objects.filter(vendor_id=link.source_pk)
        elif link.role_type == "STAFF" and model in {"employeeprofile", "employee_profile"}:
            yield "staff", StaffKycDocument.objects.filter(employee_id=link.source_pk)


def build_party_archive(party: PartyMaster) -> tuple[bytes, str]:
    payload = build_party_detail_payload(party)
    generated_at = datetime.now().astimezone().isoformat()
    filename = f"party-{_safe_name(party.party_no)}-archive.zip"
    archive = io.BytesIO()
    manifest = []
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr("README.txt", f"SUBIDHA CORE Party Archive\nGenerated: {generated_at}\nSource: live canonical records\n")
        bundle.writestr("party/party.json", json.dumps(payload["party"], default=str, ensure_ascii=False, indent=2))
        bundle.writestr("party/links.csv", _csv_bytes(payload.get("links", [])))
        bundle.writestr("party/summary.json", json.dumps(payload.get("summary", {}), default=str, ensure_ascii=False, indent=2))
        for name, rows in payload.get("related", {}).items():
            if isinstance(rows, list):
                bundle.writestr(f"records/{_safe_name(name)}.csv", _csv_bytes(rows))
        for owner_type, documents in _documents_for_party(party):
            for document in documents.order_by("-created_at", "-id"):
                if not document.file:
                    continue
                try:
                    with document.file.open("rb") as source:
                        data = source.read()
                except (OSError, FileNotFoundError):
                    continue
                original = _safe_name(document.original_filename or Path(document.file.name).name or f"document-{document.pk}")
                path = f"documents/{owner_type}/{document.pk}-{original}"
                bundle.writestr(path, data)
                manifest.append({"owner_type": owner_type, "document_id": document.pk, "path": path, "status": document.status, "document_type": document.document_type})
        bundle.writestr("documents/manifest.csv", _csv_bytes(manifest))
    archive.seek(0)
    default_storage.save(f"party_archives/{party.party_no}/{filename}", archive)
    archive.seek(0)
    return archive.read(), filename
