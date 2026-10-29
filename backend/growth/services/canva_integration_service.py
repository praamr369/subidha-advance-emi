"""
Canva Connect API Integration Service for Subidha Furniture.

Enables automated banner creation, dynamic template autofill, brand asset uploads,
and high-resolution export via Canva's official Connect REST API v1.

Brand & Legal Guardrails:
- Strictly adheres to SFEMI terminology (no forbidden legacy phrases).
- Official Web App: www.subidhafurnitureasansol.com
- Contact: +91 94764 90946
- Location: South Dhadka Sukantapally, Asansol, West Bengal
"""

import os
import time
import json
import logging
from typing import Dict, Any, Optional
import requests

logger = logging.getLogger(__name__)

CANVA_API_BASE_URL = "https://api.canva.com/rest/v1"
CANVA_OAUTH_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"

BRAND_CONFIG = {
    "company_name": "Subidha Furniture",
    "program_name": "SFEMI (Advance EMI)",
    "website_url": "www.subidhafurnitureasansol.com",
    "phone": "+91 94764 90946",
    "email": "subidhafurnitureofficial@gmail.com",
    "address": "South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Asansol, West Bengal 713302",
    "primary_colors": {
        "navy_dark": "#070B12",
        "slate_card": "#0F172A",
        "gold_accent": "#F59E0B",
        "emerald_badge": "#10B981",
        "blue_accent": "#2563EB",
    },
}


class CanvaIntegrationService:
    """Service client for Canva Connect API (v1)."""

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        access_token: Optional[str] = None,
    ):
        self.client_id = client_id or os.getenv("CANVA_CLIENT_ID", "")
        self.client_secret = client_secret or os.getenv("CANVA_CLIENT_SECRET", "")
        self._access_token = access_token or os.getenv("CANVA_ACCESS_TOKEN", "")

    def _get_headers(self) -> Dict[str, str]:
        if not self._access_token:
            raise ValueError(
                "Canva Access Token is missing. Provide CANVA_ACCESS_TOKEN in backend/.env "
                "or authenticate via Canva OAuth2."
            )
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    def get_canva_direct_design_url(self, design_type: str = "facebook_banner") -> str:
        """
        Returns direct Canva design creation deep-links with preset dimensions.
        Useful for instant 1-click browser design without API keys.
        """
        urls = {
            # 1200x630 Facebook Shared Image / Banner
            "facebook_banner": "https://www.canva.com/design/create?width=1200&height=630&unit=px",
            # 1080x1080 Square Post (Instagram & Facebook)
            "square_post": "https://www.canva.com/design/create?width=1080&height=1080&unit=px",
            # 1080x1920 Fullscreen Vertical (WhatsApp Status & IG Story)
            "story_status": "https://www.canva.com/design/create?width=1080&height=1920&unit=px",
            # General Facebook Ad template gallery
            "templates_ad": "https://www.canva.com/templates/?query=furniture+facebook+ad",
        }
        return urls.get(design_type, urls["facebook_banner"])

    def build_autofill_payload(
        self,
        product_name: str,
        sale_price: float,
        mrp: float,
        monthly_sfemi: float,
        monthly_rent: Optional[float] = None,
        category: str = "Living Room",
    ) -> Dict[str, Any]:
        """
        Prepares a standardized data dictionary to inject into Canva Brand Templates.
        Enforces strict SFEMI naming and accurate Subidha contact data.
        """
        return {
            "brand_title": BRAND_CONFIG["company_name"],
            "product_name": product_name,
            "product_category": category,
            "sale_price_text": f"₹{int(sale_price):,}",
            "mrp_price_text": f"MRP ₹{int(mrp):,}",
            "sfemi_installment_text": f"SFEMI: ₹{int(monthly_sfemi):,}/month",
            "rent_text": f"Rent: ₹{int(monthly_rent):,}/month" if monthly_rent else "Flexible Rent Available",
            "scheme_badge": "SFEMI · Rent · Lease · Direct Buy",
            "benefit_waiver_tagline": "SFEMI Monthly Promotional Benefit — Remaining EMIs Waived as per Terms",
            "website_url": BRAND_CONFIG["website_url"],
            "contact_phone": BRAND_CONFIG["phone"],
            "office_address": BRAND_CONFIG["address"],
        }

    def inspect_template_dataset(self, brand_template_id: str) -> Dict[str, Any]:
        """Inspects which variables and fields are autofillable in a Canva Brand Template."""
        url = f"{CANVA_API_BASE_URL}/brand-templates/{brand_template_id}/dataset"
        resp = requests.get(url, headers=self._get_headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()

    def create_autofill_job(
        self,
        brand_template_id: str,
        dataset: Dict[str, Any],
        title: Optional[str] = None,
    ) -> str:
        """
        Triggers an asynchronous Canva Autofill job.
        Returns the job_id to poll.
        """
        url = f"{CANVA_API_BASE_URL}/autofills"
        payload = {
            "brand_template_id": brand_template_id,
            "title": title or f"Subidha SFEMI Promo Banner - {int(time.time())}",
            "data": dataset,
        }
        resp = requests.post(url, headers=self._get_headers(), json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        job = data.get("job", {})
        return job.get("id")

    def poll_autofill_job(self, job_id: str, timeout_seconds: int = 60) -> str:
        """
        Polls the autofill job until it succeeds and returns the generated design_id.
        """
        url = f"{CANVA_API_BASE_URL}/autofills/{job_id}"
        start_time = time.time()

        while time.time() - start_time < timeout_seconds:
            resp = requests.get(url, headers=self._get_headers(), timeout=20)
            resp.raise_for_status()
            result = resp.json().get("job", {})
            status = result.get("status")

            if status == "success":
                design = result.get("result", {}).get("design", {})
                return design.get("id")
            elif status == "failed":
                error_msg = result.get("error", "Unknown Canva Autofill Failure")
                raise RuntimeError(f"Canva Autofill job failed: {error_msg}")

            time.sleep(2)

        raise TimeoutError(f"Canva Autofill job {job_id} timed out after {timeout_seconds} seconds.")

    def export_design_to_image(
        self,
        design_id: str,
        export_format: str = "png",
        timeout_seconds: int = 60,
    ) -> str:
        """
        Triggers an export job for a design and polls until completion.
        Returns the temporary download URL for the rendered image.
        """
        url = f"{CANVA_API_BASE_URL}/exports"
        payload = {
            "design_id": design_id,
            "format": {"type": export_format.lower()},
        }
        resp = requests.post(url, headers=self._get_headers(), json=payload, timeout=30)
        resp.raise_for_status()
        job_id = resp.json().get("job", {}).get("id")

        poll_url = f"{CANVA_API_BASE_URL}/exports/{job_id}"
        start_time = time.time()

        while time.time() - start_time < timeout_seconds:
            poll_resp = requests.get(poll_url, headers=self._get_headers(), timeout=20)
            poll_resp.raise_for_status()
            res_data = poll_resp.json().get("job", {})
            status = res_data.get("status")

            if status == "success":
                urls = res_data.get("result", {}).get("urls", [])
                if urls:
                    return urls[0]
                raise RuntimeError("Canva export completed but no download URL was returned.")
            elif status == "failed":
                raise RuntimeError(f"Canva export job failed: {res_data.get('error')}")

            time.sleep(2)

        raise TimeoutError(f"Canva Export job {job_id} timed out after {timeout_seconds} seconds.")

    def download_and_save_banner(self, download_url: str, save_path: str) -> str:
        """Downloads the exported file from Canva and saves it locally in the project."""
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        r = requests.get(download_url, stream=True, timeout=60)
        r.raise_for_status()
        with open(save_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.info(f"Successfully downloaded Canva banner to {save_path}")
        return save_path

