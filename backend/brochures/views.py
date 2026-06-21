from __future__ import annotations

import secrets

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from api.v1.permissions import HasRole
from api.v1.pagination import build_paginated_payload
from brochures.models import (
    BrochureDocument,
    BrochureEnquiry,
    BrochureEnquiryProduct,
    BrochureQuotation,
    ProductBrochureSettings,
)
from brochures.serializers import (
    BrochureEnquiryAdminSerializer,
    BrochureEnquiryAssignSerializer,
    BrochureEnquiryCloseSerializer,
    BrochureEnquiryUpdateSerializer,
    BrochureDocumentSerializer,
    BrochureProductQuerySerializer,
    BrochureQuotationAdminSerializer,
    BrochureQuotationCreateSerializer,
    BrochureQuotationStatusActionSerializer,
    BrochureQuotationUpdateSerializer,
    BrochureRequestSerializer,
    ProductBrochureSettingsBulkSerializer,
    ProductBrochureSettingsUpdateSerializer,
    PublicBrochureEnquirySerializer,
    PublicBrochureQuotationSerializer,
    PublicBrochureSerializer,
    SAFE_SNAPSHOT_FIELDS,
    brochure_pdf_url,
    brochure_settings_warnings,
    quotation_public_url,
    serialize_product_brochure_settings,
)
from brochures.services.brochure_crm_link_service import link_brochure_enquiry_to_crm
from brochures.services.brochure_enquiry_duplicate_service import (
    mark_possible_duplicate,
    normalize_phone_for_comparison,
)
from brochures.services.brochure_enquiry_lifecycle_service import (
    mark_enquiry_contacted,
    record_initial_enquiry_history,
    update_enquiry_follow_up,
)
from brochures.services.brochure_pdf_service import build_brochure_pdf
from brochures.services.brochure_product_query_service import get_brochure_products
from brochures.services.brochure_quotation_service import (
    create_quotation,
    create_quotation_from_enquiry,
    recalculate_quotation,
    regenerate_quotation_pdf,
    transition_quotation_status,
    update_quotation,
)
from subscriptions.models import Product


class CanManageBrochures(HasRole):
    allowed_roles = ("ADMIN", "CASHIER", "STAFF")


class BrochureEnquiryAnonThrottle(AnonRateThrottle):
    def get_rate(self):
        return "30/hour"


DEFAULT_TITLES = {
    BrochureDocument.BrochureType.RENT: "Subidha Furniture Rent Catalog",
    BrochureDocument.BrochureType.LEASE: "Subidha Furniture Lease Catalog",
    BrochureDocument.BrochureType.LUCKY_EMI: "Subidha Furniture Lucky EMI Catalog",
    BrochureDocument.BrochureType.DIRECT_SALE: "Subidha Furniture Direct Sale Price List",
    BrochureDocument.BrochureType.CUSTOM: "Subidha Furniture Selected Product Catalog",
}

SETTINGS_CREATE_DEFAULTS = {
    "visible_on_public_catalog": False,
    "visible_on_rent_catalog": False,
    "visible_on_lease_catalog": False,
    "visible_on_lucky_emi_catalog": False,
    "visible_on_sale_catalog": False,
}


def _brochure_no() -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    for _ in range(10):
        candidate = f"BRO-{date_part}-{secrets.token_hex(3).upper()}"
        if not BrochureDocument.objects.filter(brochure_no=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique brochure number.")


def _public_token() -> str:
    for _ in range(10):
        candidate = secrets.token_urlsafe(36)
        if not BrochureDocument.objects.filter(public_token=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique public brochure token.")


def _enquiry_no() -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    for _ in range(10):
        candidate = f"ENQ-BR-{date_part}-{secrets.token_hex(3).upper()}"
        if not BrochureEnquiry.objects.filter(enquiry_no=candidate).exists():
            return candidate
    raise RuntimeError("Unable to allocate a unique brochure enquiry number.")


def _active_public_brochure(public_token):
    document = get_object_or_404(
        BrochureDocument,
        public_token=public_token,
        status=BrochureDocument.Status.GENERATED,
    )
    if document.expires_at and document.expires_at <= timezone.now():
        return None
    return document


def _client_ip(request):
    forwarded = str(request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    return forwarded or request.META.get("REMOTE_ADDR") or None


def _safe_products(validated_data: dict) -> tuple[str, list[dict]]:
    requested_type = validated_data["brochure_type"]
    product_ids = validated_data.get("product_ids") or []
    document_type = (
        BrochureDocument.BrochureType.CUSTOM if product_ids else requested_type
    )
    products = get_brochure_products(
        brochure_type=requested_type,
        category=validated_data.get("category"),
        product_ids=product_ids,
    )
    if not products:
        raise ValidationError(
            {"products": "No brochure-safe products matched the selected filters."}
        )
    return document_type, products


def _bool_query(value) -> bool | None:
    normalized = str(value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _settings_queryset(request):
    queryset = Product.objects.select_related(
        "category_master",
        "brochure_settings",
    ).all()
    q = str(request.query_params.get("q") or "").strip()
    category = str(request.query_params.get("category") or "").strip()
    brochure_type = str(request.query_params.get("brochure_type") or "").strip().upper()

    if q:
        queryset = queryset.filter(
            Q(name__icontains=q)
            | Q(product_code__icontains=q)
            | Q(category__icontains=q)
            | Q(category_master__name__icontains=q)
        )
    if category:
        category_query = Q(category__iexact=category) | Q(
            category_master__name__iexact=category
        )
        if category.isdigit():
            category_query |= Q(category_master_id=int(category))
        queryset = queryset.filter(category_query)

    if brochure_type == BrochureDocument.BrochureType.RENT:
        queryset = queryset.filter(is_rent_enabled=True)
    elif brochure_type == BrochureDocument.BrochureType.LEASE:
        queryset = queryset.filter(is_lease_enabled=True)
    elif brochure_type == BrochureDocument.BrochureType.LUCKY_EMI:
        queryset = queryset.filter(is_emi_enabled=True)
    elif brochure_type == BrochureDocument.BrochureType.DIRECT_SALE:
        queryset = queryset.filter(is_direct_sale_enabled=True)

    missing_settings = _bool_query(request.query_params.get("missing_settings"))
    if missing_settings is True:
        queryset = queryset.filter(brochure_settings__isnull=True)
    elif missing_settings is False:
        queryset = queryset.filter(brochure_settings__isnull=False)

    visible_only = _bool_query(request.query_params.get("visible_only"))
    if visible_only is True:
        visibility = Q(
            brochure_settings__visible_on_public_catalog=True,
        )
        if brochure_type == BrochureDocument.BrochureType.RENT:
            visibility &= Q(brochure_settings__visible_on_rent_catalog=True)
        elif brochure_type == BrochureDocument.BrochureType.LEASE:
            visibility &= Q(brochure_settings__visible_on_lease_catalog=True)
        elif brochure_type == BrochureDocument.BrochureType.LUCKY_EMI:
            visibility &= Q(brochure_settings__visible_on_lucky_emi_catalog=True)
        elif brochure_type == BrochureDocument.BrochureType.DIRECT_SALE:
            visibility &= Q(brochure_settings__visible_on_sale_catalog=True)
        queryset = queryset.filter(visibility)

    has_rent_price = _bool_query(request.query_params.get("has_rent_price"))
    if has_rent_price is True:
        queryset = queryset.filter(brochure_settings__monthly_rent__isnull=False)
    elif has_rent_price is False:
        queryset = queryset.filter(
            Q(brochure_settings__isnull=True)
            | Q(brochure_settings__monthly_rent__isnull=True)
        )

    has_lease_price = _bool_query(request.query_params.get("has_lease_price"))
    if has_lease_price is True:
        queryset = queryset.filter(
            brochure_settings__lease_monthly_amount__isnull=False
        )
    elif has_lease_price is False:
        queryset = queryset.filter(
            Q(brochure_settings__isnull=True)
            | Q(brochure_settings__lease_monthly_amount__isnull=True)
        )

    has_sale_price = _bool_query(request.query_params.get("has_sale_price"))
    if has_sale_price is True:
        queryset = queryset.filter(base_price__gt=0)
    elif has_sale_price is False:
        queryset = queryset.filter(Q(base_price__isnull=True) | Q(base_price__lte=0))

    featured = _bool_query(request.query_params.get("featured"))
    if featured is True:
        queryset = queryset.filter(brochure_settings__brochure_featured=True)
    elif featured is False:
        queryset = queryset.filter(
            Q(brochure_settings__isnull=True)
            | Q(brochure_settings__brochure_featured=False)
        )

    return queryset.order_by("name", "product_code", "id").distinct()


def _get_or_create_safe_settings(product):
    return ProductBrochureSettings.objects.get_or_create(
        product=product,
        defaults=SETTINGS_CREATE_DEFAULTS,
    )


def _apply_settings_updates(settings_row, updates):
    for field, value in updates.items():
        setattr(settings_row, field, value)
    settings_row.save()
    return settings_row


class AdminProductBrochureSettingsListView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        queryset = _settings_queryset(request)
        payload = build_paginated_payload(
            request,
            queryset,
            lambda rows: [
                serialize_product_brochure_settings(row, request) for row in rows
            ],
            default_page_size=25,
        )
        return Response(payload)


class AdminProductBrochureSettingsDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get_product(self, product_id):
        return get_object_or_404(
            Product.objects.select_related(
                "category_master",
                "brochure_settings",
            ),
            pk=product_id,
        )

    def get(self, request, product_id):
        product = self.get_product(product_id)
        return Response(serialize_product_brochure_settings(product, request))

    def patch(self, request, product_id):
        product = self.get_product(product_id)
        serializer = ProductBrochureSettingsUpdateSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data:
            raise ValidationError({"detail": "Provide at least one setting to update."})

        with transaction.atomic():
            settings_row, _ = _get_or_create_safe_settings(product)
            settings_row = _apply_settings_updates(
                settings_row,
                serializer.validated_data,
            )

        product = self.get_product(product_id)
        return Response(
            {
                "row": serialize_product_brochure_settings(product, request),
                "warnings": brochure_settings_warnings(product, settings_row),
            }
        )


class AdminProductBrochureSettingsBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request):
        serializer = ProductBrochureSettingsBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_ids = serializer.validated_data["product_ids"]
        updates = serializer.validated_data["updates"]
        products = {
            product.id: product
            for product in Product.objects.select_related(
                "category_master",
                "brochure_settings",
            ).filter(id__in=product_ids)
        }

        rows = []
        warnings = []
        with transaction.atomic():
            for product_id in product_ids:
                product = products.get(product_id)
                if product is None:
                    continue
                settings_row, _ = _get_or_create_safe_settings(product)
                settings_row = _apply_settings_updates(settings_row, updates)
                product.brochure_settings = settings_row
                row_warnings = brochure_settings_warnings(product, settings_row)
                rows.append(serialize_product_brochure_settings(product, request))
                warnings.extend(
                    {"product_id": product.id, "message": message}
                    for message in row_warnings
                )

        return Response(
            {
                "updated_count": len(rows),
                "skipped_count": len(product_ids) - len(rows),
                "rows": rows,
                "warnings": warnings,
            }
        )


class AdminBrochureProductsView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        serializer = BrochureProductQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        rows = get_brochure_products(**serializer.validated_data)
        return Response({"count": len(rows), "results": rows})


class AdminBrochurePreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request):
        serializer = BrochureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document_type, products = _safe_products(serializer.validated_data)
        return Response(
            {
                "brochure_type": document_type,
                "requested_brochure_type": serializer.validated_data["brochure_type"],
                "title": serializer.validated_data.get("title")
                or DEFAULT_TITLES[document_type],
                "product_count": len(products),
                "products": products,
                "terms": [
                    "Prices are indicative until final quotation/contract.",
                    "Security deposit and delivery charges may apply.",
                    "Stock availability can change.",
                    "Brochure does not reserve stock.",
                    "Final billing follows approved invoice/contract.",
                ],
            }
        )


class AdminBrochureGenerateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request):
        serializer = BrochureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        document_type, products = _safe_products(validated)
        title = (validated.get("title") or DEFAULT_TITLES[document_type]).strip()
        brochure_no = _brochure_no()
        generated_at = timezone.now()
        pdf_bytes = build_brochure_pdf(
            brochure_no=brochure_no,
            brochure_type=document_type,
            title=title,
            products=products,
            generated_at=generated_at,
        )

        document = BrochureDocument(
            brochure_no=brochure_no,
            brochure_type=document_type,
            title=title,
            public_token=_public_token(),
            filter_payload={
                "requested_brochure_type": validated["brochure_type"],
                "category": validated.get("category") or None,
                "product_ids": validated.get("product_ids") or [],
            },
            product_snapshot=products,
            expires_at=validated.get("expires_at"),
            created_by=request.user,
            status=BrochureDocument.Status.GENERATED,
        )
        document.pdf_file.save(
            f"{brochure_no.lower()}.pdf",
            ContentFile(pdf_bytes),
            save=False,
        )
        saved_name = document.pdf_file.name
        try:
            with transaction.atomic():
                document.save()
        except Exception:
            if saved_name:
                document.pdf_file.storage.delete(saved_name)
            raise

        output = BrochureDocumentSerializer(document, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)


class AdminBrochureListView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        queryset = BrochureDocument.objects.select_related("created_by").all()[:100]
        serializer = BrochureDocumentSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response({"count": len(serializer.data), "results": serializer.data})


class AdminBrochureDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request, pk):
        document = get_object_or_404(
            BrochureDocument.objects.select_related("created_by"),
            pk=pk,
        )
        return Response(
            BrochureDocumentSerializer(document, context={"request": request}).data
        )


class PublicBrochureDetailView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_token):
        document = get_object_or_404(
            BrochureDocument,
            public_token=public_token,
            status=BrochureDocument.Status.GENERATED,
        )
        if document.expires_at and document.expires_at <= timezone.now():
            return Response(
                {"detail": "This brochure link has expired."},
                status=status.HTTP_410_GONE,
            )
        return Response(
            PublicBrochureSerializer(document, context={"request": request}).data
        )


class PublicBrochureProductsView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_token):
        document = _active_public_brochure(public_token)
        if document is None:
            return Response(
                {"detail": "This brochure link has expired."},
                status=status.HTTP_410_GONE,
            )
        return Response(
            {
                "brochure_no": document.brochure_no,
                "title": document.title,
                "brochure_type": document.brochure_type,
                "pdf_url": brochure_pdf_url(document, request),
                "products": [
                    {
                        key: value
                        for key, value in row.items()
                        if key in SAFE_SNAPSHOT_FIELDS
                    }
                    for row in (document.product_snapshot or [])
                    if isinstance(row, dict)
                ],
            }
        )


class PublicBrochureEnquiryCreateView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [BrochureEnquiryAnonThrottle]

    def post(self, request, public_token):
        document = _active_public_brochure(public_token)
        if document is None:
            return Response(
                {"detail": "This brochure link has expired."},
                status=status.HTTP_410_GONE,
            )
        serializer = PublicBrochureEnquirySerializer(
            data=request.data,
            context={"brochure": document},
        )
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        resolved_products = validated.pop("resolved_products", [])
        validated.pop("products", None)
        with transaction.atomic():
            enquiry = BrochureEnquiry.objects.create(
                enquiry_no=_enquiry_no(),
                brochure=document,
                brochure_token_snapshot=document.public_token,
                source="BROCHURE",
                phone_normalized=normalize_phone_for_comparison(validated["phone"]),
                ip_address=_client_ip(request),
                user_agent=str(request.META.get("HTTP_USER_AGENT") or "")[:2000],
                **validated,
            )
            product_ids = [item["product_id"] for item in resolved_products]
            products = {
                product.id: product
                for product in Product.objects.filter(id__in=product_ids)
            }
            BrochureEnquiryProduct.objects.bulk_create(
                [
                    BrochureEnquiryProduct(
                        enquiry=enquiry,
                        product=products.get(item["product_id"]),
                        product_snapshot=item["snapshot"],
                        brochure_product_code=str(item["snapshot"].get("product_code") or ""),
                        brochure_product_name=str(item["snapshot"].get("name") or ""),
                        requested_quantity=item["requested_quantity"],
                        preferred_plan=item.get("preferred_plan"),
                        notes=item.get("notes", ""),
                    )
                    for item in resolved_products
                ]
            )
            record_initial_enquiry_history(enquiry)
            mark_possible_duplicate(enquiry)
        link_brochure_enquiry_to_crm(enquiry)
        return Response(
            {
                "enquiry_no": enquiry.enquiry_no,
                "status": enquiry.status,
                "message": "Thank you. Our team will contact you soon.",
            },
            status=status.HTTP_201_CREATED,
        )


def _enquiry_queryset():
    return BrochureEnquiry.objects.select_related(
        "brochure",
        "assigned_to",
        "crm_party",
        "crm_interaction",
        "crm_lead",
        "duplicate_of",
    ).prefetch_related("products", "status_history__changed_by", "quotations")


class AdminBrochureEnquiryListView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        queryset = _enquiry_queryset()
        q = str(request.query_params.get("q") or "").strip()
        if q:
            queryset = queryset.filter(
                Q(enquiry_no__icontains=q)
                | Q(customer_name__icontains=q)
                | Q(phone__icontains=q)
                | Q(location__icontains=q)
                | Q(products__brochure_product_name__icontains=q)
            ).distinct()
        for field in ("status", "preferred_plan", "priority"):
            value = str(request.query_params.get(field) or "").strip()
            if value:
                queryset = queryset.filter(**{field: value})
        brochure_type = str(request.query_params.get("brochure_type") or "").strip()
        if brochure_type:
            queryset = queryset.filter(brochure__brochure_type=brochure_type)
        assigned_to = str(request.query_params.get("assigned_to") or "").strip()
        if assigned_to.isdigit():
            queryset = queryset.filter(assigned_to_id=int(assigned_to))
        product_id = str(request.query_params.get("product_id") or "").strip()
        if product_id.isdigit():
            queryset = queryset.filter(products__product_id=int(product_id)).distinct()
        date_from = str(request.query_params.get("date_from") or "").strip()
        date_to = str(request.query_params.get("date_to") or "").strip()
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        follow_up_due = _bool_query(request.query_params.get("follow_up_due"))
        if follow_up_due is True:
            queryset = queryset.filter(
                follow_up_at__isnull=False,
                follow_up_at__lte=timezone.now(),
                status__in=[
                    BrochureEnquiry.Status.NEW,
                    BrochureEnquiry.Status.CONTACTED,
                    BrochureEnquiry.Status.QUOTED,
                ],
            )
        possible_duplicate = _bool_query(
            request.query_params.get("possible_duplicate")
        )
        if possible_duplicate is not None:
            queryset = queryset.filter(is_possible_duplicate=possible_duplicate)
        crm_link_status = str(
            request.query_params.get("crm_link_status") or ""
        ).strip()
        if crm_link_status:
            queryset = queryset.filter(crm_link_status=crm_link_status)
        return Response(
            build_paginated_payload(
                request,
                queryset,
                lambda rows: BrochureEnquiryAdminSerializer(rows, many=True).data,
                default_page_size=25,
            )
        )


class AdminBrochureEnquiryDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get_object(self, pk):
        return get_object_or_404(_enquiry_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(
            BrochureEnquiryAdminSerializer(
                self.get_object(pk),
                context={"include_internal_detail": True},
            ).data
        )

    def patch(self, request, pk):
        enquiry = self.get_object(pk)
        serializer = BrochureEnquiryUpdateSerializer(
            enquiry,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        enquiry = update_enquiry_follow_up(
            enquiry,
            changes=serializer.validated_data,
            changed_by=request.user,
        )
        _sync_crm_follow_up(enquiry)
        return Response(
            BrochureEnquiryAdminSerializer(
                self.get_object(pk),
                context={"include_internal_detail": True},
            ).data
        )


class AdminBrochureEnquiryAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request, pk):
        enquiry = get_object_or_404(BrochureEnquiry, pk=pk)
        serializer = BrochureEnquiryAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enquiry = update_enquiry_follow_up(
            enquiry,
            changes={"assigned_to": serializer.validated_data["assigned_to"]},
            changed_by=request.user,
        )
        _sync_crm_follow_up(enquiry)
        return Response(
            BrochureEnquiryAdminSerializer(
                _enquiry_queryset().get(pk=pk),
                context={"include_internal_detail": True},
            ).data
        )


class AdminBrochureEnquiryMarkContactedView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request, pk):
        enquiry = get_object_or_404(BrochureEnquiry, pk=pk)
        enquiry = mark_enquiry_contacted(
            enquiry,
            changed_by=request.user,
            note=str(request.data.get("note") or ""),
        )
        _sync_crm_follow_up(enquiry)
        return Response(
            BrochureEnquiryAdminSerializer(
                _enquiry_queryset().get(pk=pk),
                context={"include_internal_detail": True},
            ).data
        )


class AdminBrochureEnquiryCloseView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request, pk):
        enquiry = get_object_or_404(BrochureEnquiry, pk=pk)
        serializer = BrochureEnquiryCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = {"status": serializer.validated_data["status"]}
        if "internal_note" in serializer.validated_data:
            changes["internal_note"] = serializer.validated_data["internal_note"]
        enquiry = update_enquiry_follow_up(
            enquiry,
            changes=changes,
            changed_by=request.user,
            history_note=serializer.validated_data.get("internal_note", ""),
        )
        _sync_crm_follow_up(enquiry)
        return Response(
            BrochureEnquiryAdminSerializer(
                _enquiry_queryset().get(pk=pk),
                context={"include_internal_detail": True},
            ).data
        )


def _sync_crm_follow_up(enquiry):
    if not enquiry.crm_lead_id:
        return
    stage_map = {
        BrochureEnquiry.Status.NEW: "NEW",
        BrochureEnquiry.Status.CONTACTED: "CONTACTED",
        BrochureEnquiry.Status.QUOTED: "INTERESTED",
        BrochureEnquiry.Status.CONVERTED: "CONVERTED",
        BrochureEnquiry.Status.LOST: "LOST",
    }
    update_fields = []
    next_stage = stage_map.get(enquiry.status)
    if next_stage and enquiry.crm_lead.stage != next_stage:
        enquiry.crm_lead.stage = next_stage
        update_fields.append("stage")
    if enquiry.crm_lead.assigned_to_id != enquiry.assigned_to_id:
        enquiry.crm_lead.assigned_to = enquiry.assigned_to
        update_fields.append("assigned_to")
    if update_fields:
        enquiry.crm_lead.save(update_fields=[*update_fields, "updated_at"])


def _quotation_queryset():
    return BrochureQuotation.objects.select_related(
        "created_by",
        "enquiry",
        "brochure",
    ).prefetch_related(
        "lines",
        "status_history__changed_by",
    )


class AdminBrochureQuotationListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request):
        queryset = _quotation_queryset()
        q = str(request.query_params.get("q") or "").strip()
        if q:
            queryset = queryset.filter(
                Q(quotation_no__icontains=q)
                | Q(customer_name__icontains=q)
                | Q(phone__icontains=q)
                | Q(location__icontains=q)
                | Q(lines__product_name__icontains=q)
            ).distinct()
        for field in ("status", "quotation_type"):
            value = str(request.query_params.get(field) or "").strip()
            if value:
                queryset = queryset.filter(**{field: value})
        enquiry_id = str(request.query_params.get("enquiry_id") or "").strip()
        if enquiry_id.isdigit():
            queryset = queryset.filter(enquiry_id=int(enquiry_id))
        date_from = str(request.query_params.get("date_from") or "").strip()
        date_to = str(request.query_params.get("date_to") or "").strip()
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        payload = build_paginated_payload(
            request,
            queryset,
            lambda rows: BrochureQuotationAdminSerializer(
                rows,
                many=True,
                context={"request": request},
            ).data,
            default_page_size=25,
        )
        return Response(payload)

    def post(self, request):
        serializer = BrochureQuotationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quotation = create_quotation(
            payload=dict(serializer.validated_data),
            created_by=request.user,
        )
        quotation = _quotation_queryset().get(pk=quotation.pk)
        return Response(
            BrochureQuotationAdminSerializer(
                quotation,
                context={"request": request, "include_internal_detail": True},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AdminBrochureQuotationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def get(self, request, pk):
        quotation = get_object_or_404(_quotation_queryset(), pk=pk)
        return Response(
            BrochureQuotationAdminSerializer(
                quotation,
                context={"request": request, "include_internal_detail": True},
            ).data
        )

    def patch(self, request, pk):
        quotation = get_object_or_404(BrochureQuotation, pk=pk)
        serializer = BrochureQuotationUpdateSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        quotation = update_quotation(
            quotation=quotation,
            payload=dict(serializer.validated_data),
            changed_by=request.user,
        )
        quotation = _quotation_queryset().get(pk=quotation.pk)
        return Response(
            BrochureQuotationAdminSerializer(
                quotation,
                context={"request": request, "include_internal_detail": True},
            ).data
        )


class AdminBrochureQuotationFromEnquiryView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request, enquiry_id):
        enquiry = get_object_or_404(BrochureEnquiry, pk=enquiry_id)
        quotation = create_quotation_from_enquiry(
            enquiry=enquiry,
            created_by=request.user,
        )
        quotation = _quotation_queryset().get(pk=quotation.pk)
        return Response(
            BrochureQuotationAdminSerializer(
                quotation,
                context={"request": request, "include_internal_detail": True},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AdminBrochureQuotationRecalculateView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request, pk):
        quotation = get_object_or_404(BrochureQuotation, pk=pk)
        quotation = recalculate_quotation(quotation)
        return Response(
            BrochureQuotationAdminSerializer(
                _quotation_queryset().get(pk=quotation.pk),
                context={"request": request, "include_internal_detail": True},
            ).data
        )


class AdminBrochureQuotationRegeneratePdfView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]

    def post(self, request, pk):
        quotation = get_object_or_404(BrochureQuotation, pk=pk)
        quotation = regenerate_quotation_pdf(
            quotation,
            public_url=quotation_public_url(quotation, request),
        )
        return Response(
            BrochureQuotationAdminSerializer(
                _quotation_queryset().get(pk=quotation.pk),
                context={"request": request, "include_internal_detail": True},
            ).data
        )


class _AdminBrochureQuotationStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageBrochures]
    target_status = ""
    regenerate_pdf = False

    def post(self, request, pk):
        quotation = get_object_or_404(BrochureQuotation, pk=pk)
        serializer = BrochureQuotationStatusActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if self.regenerate_pdf:
            regenerate_quotation_pdf(
                quotation,
                public_url=quotation_public_url(quotation, request),
            )
            quotation.refresh_from_db()
        quotation = transition_quotation_status(
            quotation=quotation,
            to_status=self.target_status,
            changed_by=request.user,
            note=serializer.validated_data.get("note", ""),
        )
        return Response(
            BrochureQuotationAdminSerializer(
                _quotation_queryset().get(pk=quotation.pk),
                context={"request": request, "include_internal_detail": True},
            ).data
        )


class AdminBrochureQuotationSendView(_AdminBrochureQuotationStatusView):
    target_status = BrochureQuotation.Status.SENT
    regenerate_pdf = True


class AdminBrochureQuotationAcceptView(_AdminBrochureQuotationStatusView):
    target_status = BrochureQuotation.Status.ACCEPTED


class AdminBrochureQuotationRejectView(_AdminBrochureQuotationStatusView):
    target_status = BrochureQuotation.Status.REJECTED


class AdminBrochureQuotationCancelView(_AdminBrochureQuotationStatusView):
    target_status = BrochureQuotation.Status.CANCELLED


class PublicBrochureQuotationDetailView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_token):
        quotation = get_object_or_404(
            _quotation_queryset(),
            public_token=public_token,
        )
        if quotation.status in {
            BrochureQuotation.Status.CANCELLED,
            BrochureQuotation.Status.EXPIRED,
        }:
            return Response(
                {
                    "detail": "This quotation is no longer active.",
                    "status": quotation.status,
                },
                status=status.HTTP_410_GONE,
            )
        if (
            quotation.validity_date
            and quotation.validity_date < timezone.localdate()
            and quotation.status == BrochureQuotation.Status.SENT
        ):
            return Response(
                {"detail": "This quotation has passed its validity date.", "status": "EXPIRED"},
                status=status.HTTP_410_GONE,
            )
        return Response(
            PublicBrochureQuotationSerializer(
                quotation,
                context={"request": request},
            ).data
        )
