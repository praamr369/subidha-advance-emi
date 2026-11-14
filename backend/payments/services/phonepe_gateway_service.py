from __future__ import annotations

import base64
import hashlib
import json
import logging
from decimal import Decimal
from typing import Any
from urllib.parse import urljoin

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from business_setup.models.payment_gateway import (
    PaymentGatewayEnvironment,
    PaymentGatewaySettings,
)
from payments.models_online_gateway import (
    OnlineGatewayPaymentType,
    OnlineGatewayStatus,
    OnlineGatewayTransaction,
)

logger = logging.getLogger("payments.gateway")

PHONEPE_UAT_HOST = "https://api-preprod.phonepe.com/apis/pg-sandbox"
PHONEPE_PROD_HOST = "https://api.phonepe.com/apis/hermes"

DEFAULT_UAT_MID = "PGTESTPAYUAT"
DEFAULT_UAT_SALT_KEY = "96434309-7796-489d-8924-ab56988a6076"
DEFAULT_UAT_SALT_INDEX = 1


def get_active_payment_gateway_settings() -> PaymentGatewaySettings:
    """Fetch active gateway settings or return an unpersisted default."""
    pg = PaymentGatewaySettings.objects.filter(is_active=True).first()
    if not pg:
        pg = PaymentGatewaySettings(
            merchant_id=getattr(settings, "PHONEPE_MERCHANT_ID", DEFAULT_UAT_MID),
            salt_index=getattr(settings, "PHONEPE_SALT_INDEX", DEFAULT_UAT_SALT_INDEX),
            environment=getattr(settings, "PHONEPE_ENV", PaymentGatewayEnvironment.UAT),
            is_enabled=False,
        )
        default_key = getattr(settings, "PHONEPE_SALT_KEY", DEFAULT_UAT_SALT_KEY)
        if default_key:
            pg.set_salt_key(default_key)
    return pg


def _get_credentials() -> dict[str, Any]:
    pg = get_active_payment_gateway_settings()
    merchant_id = (pg.merchant_id or "").strip() or DEFAULT_UAT_MID
    salt_key = pg.get_salt_key() or DEFAULT_UAT_SALT_KEY
    salt_index = pg.salt_index or 1
    is_prod = pg.environment == PaymentGatewayEnvironment.PROD
    host = PHONEPE_PROD_HOST if is_prod else PHONEPE_UAT_HOST
    return {
        "merchant_id": merchant_id,
        "salt_key": salt_key,
        "salt_index": salt_index,
        "host": host,
        "is_prod": is_prod,
        "is_enabled": pg.is_enabled,
        "autopay_enabled": pg.autopay_enabled,
    }


def compute_sha256_checksum(payload_str: str, endpoint_path: str, salt_key: str, salt_index: int) -> str:
    """Compute PhonePe X-VERIFY header: SHA256(payload + endpoint + salt_key) + '###' + salt_index."""
    data = f"{payload_str}{endpoint_path}{salt_key}".encode("utf-8")
    digest = hashlib.sha256(data).hexdigest()
    return f"{digest}###{salt_index}"


def verify_phonepe_checksum(payload_str: str, endpoint_path: str, x_verify: str, salt_key: str, salt_index: int) -> bool:
    expected = compute_sha256_checksum(payload_str, endpoint_path, salt_key, salt_index)
    return expected.strip() == (x_verify or "").strip()


def resolve_online_collection_finance_account():
    """Resolve an active finance account for online payment collections."""
    from accounting.models import FinanceAccount, FinanceAccountKind
    account = FinanceAccount.objects.filter(
        kind__in=[FinanceAccountKind.UPI_COLLECTION, FinanceAccountKind.BANK],
        is_active=True,
    ).first()
    if not account:
        account = FinanceAccount.objects.filter(is_active=True).first()
    return account


class PhonePeGatewayService:
    """
    Standard & Autopay interface for PhonePe Payment Gateway.
    Adheres strictly to append-only financial accounting rules.
    """

    @staticmethod
    def initiate_payment(
        *,
        amount: Decimal | str | float,
        customer,
        source_type: str,
        source_id: int | None = None,
        redirect_url: str = "",
        payment_type: str = OnlineGatewayPaymentType.STANDARD,
    ) -> dict[str, Any]:
        creds = _get_credentials()
        if not creds.get("is_enabled"):
            raise ValidationError("Online payment gateway is currently disabled. Please pay using Direct UPI.")

        num_amount = Decimal(str(amount))
        amount_paise = int(round(num_amount * 100))

        if amount_paise <= 0:
            raise ValidationError("Payment amount must be greater than zero.")

        now_str = timezone.now().strftime("%Y%m%d%H%M%S%f")
        tid = f"SUB-{now_str[:17]}-{source_type[:3]}-{source_id or 0}"

        tx = OnlineGatewayTransaction.objects.create(
            merchant_transaction_id=tid,
            gateway_type="PHONEPE",
            payment_type=payment_type,
            source_type=source_type,
            source_id=source_id,
            customer=customer,
            amount=num_amount,
            status=OnlineGatewayStatus.PENDING,
        )

        customer_id_str = str(getattr(customer, "id", "GUEST"))
        customer_phone = str(getattr(customer, "phone", "")).strip()
        if len(customer_phone) > 10:
            customer_phone = customer_phone[-10:]

        endpoint = "/pg/v1/pay"
        api_base = (
            getattr(settings, "API_BASE_URL", None)
            or getattr(settings, "BACKEND_BASE_URL", None)
            or "http://127.0.0.1:8000"
        )
        callback_url = f"{api_base.rstrip('/')}/api/v1/payments/phonepe/webhook/"

        request_body = {
            "merchantId": creds["merchant_id"],
            "merchantTransactionId": tid,
            "merchantUserId": f"CUST-{customer_id_str}",
            "amount": amount_paise,
            "redirectUrl": redirect_url or callback_url,
            "redirectMode": "POST",
            "callbackUrl": callback_url,
            "mobileNumber": customer_phone or "9999999999",
            "paymentInstrument": {
                "type": "PAY_PAGE",
            },
        }

        if payment_type == OnlineGatewayPaymentType.AUTOPAY_MANDATE:
            request_body["paymentInstrument"] = {
                "type": "UPI_INTENT",
            }

        payload_json = json.dumps(request_body)
        base64_payload = base64.b64encode(payload_json.encode("utf-8")).decode("utf-8")
        checksum = compute_sha256_checksum(base64_payload, endpoint, creds["salt_key"], creds["salt_index"])

        tx.payload_snapshot = request_body
        tx.save(update_fields=["payload_snapshot"])

        url = urljoin(creds["host"], endpoint)
        headers = {
            "Content-Type": "application/json",
            "X-VERIFY": checksum,
            "Accept": "application/json",
        }

        try:
            resp = requests.post(url, json={"request": base64_payload}, headers=headers, timeout=15)
            data = resp.json()
            tx.callback_snapshot = data
            tx.save(update_fields=["callback_snapshot"])

            if data.get("success"):
                instrument_res = data.get("data", {}).get("instrumentResponse", {})
                redirect_info = instrument_res.get("redirectInfo", {})
                checkout_url = redirect_info.get("url") or instrument_res.get("intentUrl") or ""
                tx.checkout_url = checkout_url
                tx.provider_reference_id = data.get("data", {}).get("transactionId", "")
                tx.save(update_fields=["checkout_url", "provider_reference_id"])
                return {
                    "success": True,
                    "merchant_transaction_id": tid,
                    "checkout_url": checkout_url,
                    "provider_reference_id": tx.provider_reference_id,
                }
            else:
                msg = data.get("message", "Payment initiation failed at gateway.")
                tx.status = OnlineGatewayStatus.FAILED
                tx.settlement_error = msg
                tx.save(update_fields=["status", "settlement_error"])
                return {"success": False, "error": msg, "merchant_transaction_id": tid}

        except Exception as exc:
            logger.exception("PhonePe payment initiation exception: %s", exc)
            tx.status = OnlineGatewayStatus.FAILED
            tx.settlement_error = str(exc)
            tx.save(update_fields=["status", "settlement_error"])
            return {"success": False, "error": str(exc), "merchant_transaction_id": tid}

    @staticmethod
    def process_webhook(payload: dict[str, Any], x_verify: str) -> dict[str, Any]:
        """Process and verify PhonePe webhook or server-to-server callback."""
        creds = _get_credentials()
        raw_b64 = payload.get("response", "")
        if not raw_b64:
            raise ValidationError("Missing base64 response in webhook payload.")

        # In UAT testing mode, if salt key verification passes, decode
        is_verified = verify_phonepe_checksum(raw_b64, "", x_verify, creds["salt_key"], creds["salt_index"])
        if not is_verified and creds["is_prod"]:
            logger.warning("PhonePe webhook checksum verification failed.")
            raise ValidationError("Invalid PhonePe webhook signature.")

        try:
            decoded_json = base64.b64decode(raw_b64).decode("utf-8")
            data = json.loads(decoded_json)
        except Exception as exc:
            raise ValidationError(f"Failed to decode response payload: {exc}")

        data_obj = data.get("data", {})
        tid = data_obj.get("merchantTransactionId")
        if not tid:
            raise ValidationError("Missing merchantTransactionId in decoded payload.")

        with transaction.atomic():
            tx = OnlineGatewayTransaction.objects.select_for_update(of=("self",)).filter(
                merchant_transaction_id=tid
            ).first()
            if not tx:
                raise ValidationError(f"Transaction {tid} not found.")

            if tx.status == OnlineGatewayStatus.SUCCESS:
                return {"success": True, "already_settled": True, "transaction_id": tid}

            tx.callback_snapshot = data
            code = data.get("code")

            if code == "PAYMENT_SUCCESS":
                tx.status = OnlineGatewayStatus.SUCCESS
                tx.provider_reference_id = data_obj.get("transactionId", "")
                tx.settled_at = timezone.now()

                # Delegate to canonical accounting collection
                from payments.services.smart_collection_service import record_emi_payment
                from subscriptions.models import Emi

                if tx.source_type == "EMI" and tx.source_id:
                    emi = Emi.objects.filter(id=tx.source_id).first()
                    if emi:
                        finance_acc = resolve_online_collection_finance_account()
                        User = get_user_model()
                        system_user = User.objects.filter(is_superuser=True).first()
                        res = record_emi_payment(
                            emi=emi,
                            amount=tx.amount,
                            method="UPI",
                            note=f"PhonePe Online Payment Ref: {tx.provider_reference_id or tid}",
                            finance_account=finance_acc,
                            collected_by=system_user,
                        )
                        if isinstance(res, dict) and res.get("payment"):
                            tx.settled_payment = res["payment"]

                tx.save()
                return {"success": True, "transaction_id": tid, "settled": True}

            else:
                tx.status = OnlineGatewayStatus.FAILED
                tx.settlement_error = data.get("message", f"Payment ended with code {code}")
                tx.save()
                return {"success": False, "transaction_id": tid, "error": tx.settlement_error}

    @staticmethod
    def check_and_sync_status(merchant_transaction_id: str) -> dict[str, Any]:
        """Poll and verify status directly from PhonePe API."""
        creds = _get_credentials()
        tx = OnlineGatewayTransaction.objects.filter(merchant_transaction_id=merchant_transaction_id).first()
        if not tx:
            raise ValidationError(f"Transaction {merchant_transaction_id} not found.")

        if tx.status == OnlineGatewayStatus.SUCCESS:
            return {"success": True, "status": tx.status, "already_settled": True}

        endpoint = f"/pg/v1/status/{creds['merchant_id']}/{merchant_transaction_id}"
        checksum = compute_sha256_checksum("", endpoint, creds["salt_key"], creds["salt_index"])
        url = urljoin(creds["host"], endpoint)

        headers = {
            "Content-Type": "application/json",
            "X-VERIFY": checksum,
            "X-MERCHANT-ID": creds["merchant_id"],
        }

        try:
            resp = requests.get(url, headers=headers, timeout=12)
            data = resp.json()
            if data.get("code") == "PAYMENT_SUCCESS":
                b64_dummy = base64.b64encode(json.dumps(data).encode("utf-8")).decode("utf-8")
                dummy_checksum = compute_sha256_checksum(b64_dummy, "", creds["salt_key"], creds["salt_index"])
                return PhonePeGatewayService.process_webhook({"response": b64_dummy}, dummy_checksum)
            else:
                tx.callback_snapshot = data
                if data.get("code") in ["PAYMENT_ERROR", "PAYMENT_DECLINED"]:
                    tx.status = OnlineGatewayStatus.FAILED
                    tx.settlement_error = data.get("message", "Payment declined.")
                    tx.save(update_fields=["status", "settlement_error", "callback_snapshot"])
                return {"success": False, "status": tx.status, "data": data}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    @staticmethod
    def test_connection(settings_obj: PaymentGatewaySettings | None = None) -> dict[str, Any]:
        """Test API connectivity and credentials against PhonePe servers."""
        pg = settings_obj or get_active_payment_gateway_settings()
        merchant_id = (pg.merchant_id or "").strip()
        salt_key = pg.get_salt_key()
        salt_index = pg.salt_index or 1

        if not merchant_id or not salt_key:
            return {"success": False, "message": "Merchant ID and Salt Key must be provided to test connection."}

        host = PHONEPE_PROD_HOST if pg.environment == PaymentGatewayEnvironment.PROD else PHONEPE_UAT_HOST
        test_tid = f"TEST-PING-{timezone.now():%Y%m%d%H%M%S}"
        endpoint = f"/pg/v1/status/{merchant_id}/{test_tid}"
        checksum = compute_sha256_checksum("", endpoint, salt_key, salt_index)
        url = urljoin(host, endpoint)

        headers = {
            "Content-Type": "application/json",
            "X-VERIFY": checksum,
            "X-MERCHANT-ID": merchant_id,
        }

        now = timezone.now()
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            data = resp.json()
            # If credentials are valid, PhonePe returns 200 or TRANSACTION_NOT_FOUND (since test_tid is synthetic)
            # Both confirm that authentication succeeded!
            code = data.get("code", "")
            if resp.status_code == 200 or code in ["TRANSACTION_NOT_FOUND", "PAYMENT_SUCCESS", "SUCCESS"]:
                pg.last_test_at = now
                pg.last_test_success = True
                pg.last_test_message = f"Connected successfully to PhonePe ({pg.get_environment_display()}). Credentials verified."
                pg.save()
                return {"success": True, "message": pg.last_test_message}
            elif code in ["KEY_NOT_FOUND", "AUTHORIZATION_FAILED", "BAD_REQUEST"]:
                msg = f"PhonePe rejected credentials: {data.get('message', code)}"
                pg.last_test_at = now
                pg.last_test_success = False
                pg.last_test_message = msg
                pg.save()
                return {"success": False, "message": msg}
            else:
                msg = data.get("message") or f"PhonePe HTTP {resp.status_code}: {resp.text[:100]}"
                pg.last_test_at = now
                pg.last_test_success = False
                pg.last_test_message = msg
                pg.save()
                return {"success": False, "message": msg}
        except Exception as exc:
            msg = f"Connection failed: {str(exc)}"
            pg.last_test_at = now
            pg.last_test_success = False
            pg.last_test_message = msg
            pg.save()
            return {"success": False, "message": msg}
