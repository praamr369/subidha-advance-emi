"""
Customer "View in your room" (AR) for PIM products.

Every product page resolves to at most one AR model:

1. an uploaded real-scale .glb (MediaKind.MODEL_3D) — a variant's own model first;
2. otherwise, when the product has a saved AR size, an auto-built "size preview":
   a box of exactly that size with the product photo on its front. Customers can
   check fit for any sized product before a proper 3D model exists.

Sizes are never invented here. ``suggest_ar_size`` only *proposes* values parsed
from the product's attributes; an admin saves them before AR uses them.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import struct

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

PROXY_DIR = "pim/ar-proxy"
PROXY_VERSION = 1  # bump when the generated geometry or material changes
FOOTPRINT_HEIGHT_M = 0.02  # height unknown: show only the floor space it takes
TEXTURE_MAX_PX = 1024
BODY_COLOR = [0.62, 0.55, 0.47, 1.0]
PHOTO_PAD_RGB = (236, 232, 226)
MIN_CM, MAX_CM = 1, 500


# ── which media belongs to a product page ────────────────────────────────────

def product_pim(product):
    return product.pim.first()


def scoped_pim_media(product):
    """PIM media for this page: shared items, plus the variant's own on a variant page."""
    from django.db.models import Q

    from products_pim.models import ProductMediaItem

    pim = product_pim(product)
    if not pim:
        return []
    base_pim = pim.parent if pim.parent_id else pim
    qs = ProductMediaItem.objects.filter(product=base_pim)
    own_variant = getattr(product, "pim_variant", None) if pim.parent_id else None
    if own_variant:
        qs = qs.filter(Q(scope="ALL_VARIANTS") | Q(scope="VARIANT", variant=own_variant))
    else:
        qs = qs.filter(scope="ALL_VARIANTS")
    return list(qs.order_by("display_order", "-created_at"))


def hero_image_file(product, media_items):
    """Variant image → product image → hero/first gallery photo."""
    own_variant = getattr(product, "pim_variant", None)
    if own_variant and own_variant.image:
        return own_variant.image
    if product.image:
        return product.image
    images = [i for i in media_items if i.kind == "IMAGE" and i.file]
    images.sort(key=lambda i: (not i.is_hero, i.display_order))
    return images[0].file if images else None


def ar_size_cm(pim):
    """Saved (width, depth, height|None) in cm — a variant inherits its base product's size."""
    for source in (pim, pim.parent if pim.parent_id else None):
        if source and source.ar_width_cm and source.ar_depth_cm:
            height = source.ar_height_cm
            return float(source.ar_width_cm), float(source.ar_depth_cm), float(height) if height else None
    return None


def _absolute(request, url):
    return request.build_absolute_uri(url) if request is not None else url


def resolve_ar_model(product, request, media_items=None):
    """The page's AR model payload, or None when the product has neither a model nor a size."""
    pim = product_pim(product)
    if not pim:
        return None
    items = scoped_pim_media(product) if media_items is None else media_items
    size = ar_size_cm(pim)
    size_cm = {"width": size[0], "depth": size[1], "height": size[2]} if size else None

    models_3d = [i for i in items if i.kind == "MODEL_3D" and i.file]
    if models_3d:
        models_3d.sort(key=lambda i: (i.scope != "VARIANT", not i.is_hero, i.display_order))
        item = models_3d[0]
        return {
            "kind": "MODEL",
            "src": _absolute(request, item.file),
            "ios_src": _absolute(request, item.ios_file) if item.ios_file else None,
            "title": item.title or "",
            "size_cm": size_cm,
        }

    if not size:
        return None
    name = ensure_size_preview(pim, size, hero_image_file(product, items))
    if not name:
        return None
    return {
        "kind": "SIZE_PREVIEW",
        "src": _absolute(request, default_storage.url(name)),
        "ios_src": None,
        "title": "",
        "size_cm": size_cm,
    }


# ── auto-built size preview ──────────────────────────────────────────────────

def ensure_size_preview(pim, size, image_file):
    """Storage name of the cached preview .glb, building it on first use. None on failure."""
    width, depth, height = size
    image_key = getattr(image_file, "name", "") or ""
    digest = hashlib.sha1(
        json.dumps([PROXY_VERSION, width, depth, height, image_key]).encode()
    ).hexdigest()[:12]
    name = f"{PROXY_DIR}/{pim.pk}-{digest}.glb"
    try:
        if default_storage.exists(name):
            return name
        face_ratio = width / (height or depth)
        texture = _texture_jpeg(image_file, face_ratio)
        glb = build_box_glb(width / 100, depth / 100, height / 100 if height else None, texture)
        saved = default_storage.save(name, ContentFile(glb))
        _remove_stale_previews(pim.pk, keep=saved)
        return saved
    except Exception:  # noqa: BLE001 - a preview failure must never break the product page
        logger.exception("AR size preview failed for PIM product %s", pim.pk)
        return None


def _remove_stale_previews(pim_pk, keep):
    try:
        _dirs, files = default_storage.listdir(PROXY_DIR)
    except (OSError, NotImplementedError):
        return
    keep_base = keep.rsplit("/", 1)[-1]
    for filename in files:
        if filename.startswith(f"{pim_pk}-") and filename != keep_base:
            default_storage.delete(f"{PROXY_DIR}/{filename}")


def _texture_jpeg(image_file, face_ratio):
    """The whole product photo, padded (not cropped) to the textured face's shape."""
    if not image_file:
        return None
    try:
        from PIL import Image, ImageOps

        image_file.open("rb")
        try:
            img = Image.open(image_file)
            img.load()
        finally:
            image_file.close()
        img = ImageOps.exif_transpose(img).convert("RGB")
        if face_ratio >= 1:
            target = (TEXTURE_MAX_PX, max(1, round(TEXTURE_MAX_PX / face_ratio)))
        else:
            target = (max(1, round(TEXTURE_MAX_PX * face_ratio)), TEXTURE_MAX_PX)
        img = ImageOps.pad(img, target, method=Image.Resampling.LANCZOS, color=PHOTO_PAD_RGB)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=82)
        return buf.getvalue()
    except Exception:  # noqa: BLE001 - untextured box is still a valid size check
        logger.warning("AR size preview: could not read product photo %s", getattr(image_file, "name", ""))
        return None


class _GlbBuilder:
    """Minimal glTF 2.0 binary writer — just enough for a textured box."""

    def __init__(self):
        self.blob = bytearray()
        self.views = []
        self.accessors = []

    def add_view(self, data, target=None):
        self.blob += b"\x00" * (-len(self.blob) % 4)
        view = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.blob += data
        self.views.append(view)
        return len(self.views) - 1

    def _accessor(self, data, component_type, count, type_, **extra):
        target = 34963 if type_ == "SCALAR" else 34962
        view = self.add_view(data, target=target)
        self.accessors.append(
            {"bufferView": view, "componentType": component_type, "count": count, "type": type_, **extra}
        )
        return len(self.accessors) - 1

    def primitive(self, faces, material, with_uv=False):
        positions, normals, uvs, indices = [], [], [], []
        for normal, quad in faces:
            base = len(positions)
            positions += quad
            normals += [normal] * 4
            # glTF UV origin is top-left: the quad's first edge is the image's bottom edge.
            uvs += [(0, 1), (1, 1), (1, 0), (0, 0)]
            indices += [base, base + 1, base + 2, base, base + 2, base + 3]
        attributes = {
            "POSITION": self._accessor(
                b"".join(struct.pack("<3f", *p) for p in positions), 5126, len(positions), "VEC3",
                min=[min(p[i] for p in positions) for i in range(3)],
                max=[max(p[i] for p in positions) for i in range(3)],
            ),
            "NORMAL": self._accessor(b"".join(struct.pack("<3f", *n) for n in normals), 5126, len(normals), "VEC3"),
        }
        if with_uv:
            attributes["TEXCOORD_0"] = self._accessor(
                b"".join(struct.pack("<2f", *t) for t in uvs), 5126, len(uvs), "VEC2"
            )
        index_accessor = self._accessor(b"".join(struct.pack("<H", i) for i in indices), 5123, len(indices), "SCALAR")
        return {"attributes": attributes, "indices": index_accessor, "material": material}

    def to_glb(self, gltf):
        self.blob += b"\x00" * (-len(self.blob) % 4)
        gltf["buffers"] = [{"byteLength": len(self.blob)}]
        gltf["bufferViews"] = self.views
        gltf["accessors"] = self.accessors
        js = json.dumps(gltf, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        body = (
            struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(self.blob), 0x004E4942) + bytes(self.blob)
        )
        return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def build_box_glb(width_m, depth_m, height_m=None, texture_jpeg=None):
    """
    A real-size box standing on the floor (y = 0) with its front facing +Z.

    The photo goes on the front face — or on top when the height is unknown and
    only a thin floor footprint is drawn.
    """
    footprint = height_m is None
    h = FOOTPRINT_HEIGHT_M if footprint else height_m
    x, z = width_m / 2, depth_m / 2
    # Counter-clockwise when seen from outside, so every face's normal points out.
    faces = {
        "front": ((0, 0, 1), [(-x, 0, z), (x, 0, z), (x, h, z), (-x, h, z)]),
        "back": ((0, 0, -1), [(x, 0, -z), (-x, 0, -z), (-x, h, -z), (x, h, -z)]),
        "right": ((1, 0, 0), [(x, 0, z), (x, 0, -z), (x, h, -z), (x, h, z)]),
        "left": ((-1, 0, 0), [(-x, 0, -z), (-x, 0, z), (-x, h, z), (-x, h, -z)]),
        "top": ((0, 1, 0), [(-x, h, z), (x, h, z), (x, h, -z), (-x, h, -z)]),
        "bottom": ((0, -1, 0), [(-x, 0, -z), (x, 0, -z), (x, 0, z), (-x, 0, z)]),
    }
    photo_face = ("top" if footprint else "front") if texture_jpeg else None

    builder = _GlbBuilder()
    primitives = [builder.primitive([f for n, f in faces.items() if n != photo_face], material=0)]
    materials = [{
        "name": "Body",
        "pbrMetallicRoughness": {"baseColorFactor": BODY_COLOR, "metallicFactor": 0, "roughnessFactor": 0.85},
    }]
    extra = {}
    if photo_face:
        primitives.append(builder.primitive([faces[photo_face]], material=1, with_uv=True))
        image_view = builder.add_view(texture_jpeg)
        materials.append({
            "name": "Photo",
            "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.9},
        })
        extra = {
            "images": [{"bufferView": image_view, "mimeType": "image/jpeg"}],
            "samplers": [{"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}],
            "textures": [{"source": 0, "sampler": 0}],
        }
    gltf = {
        "asset": {"version": "2.0", "generator": "subidha-ar-size-preview"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "SizePreview"}],
        "meshes": [{"primitives": primitives}],
        "materials": materials,
        **extra,
    }
    return builder.to_glb(gltf)


# ── size suggestions from attributes (admin confirms before use) ─────────────

_UNIT_CM = {
    "cm": 1.0, "mm": 0.1,
    "in": 2.54, "inch": 2.54, "inches": 2.54, '"': 2.54,
    "ft": 30.48, "feet": 30.48, "'": 30.48,
}
_MEASURE = re.compile(
    r"(\d+(?:\.\d+)?)\s*[x×X*]\s*(\d+(?:\.\d+)?)(?:\s*[x×X*]\s*(\d+(?:\.\d+)?))?\s*(cm|mm|inches|inch|in|ft|feet|\"|')?",
)
_NAME_UNIT = re.compile(r"\((cm|mm|inches|inch|in|ft|feet)\)", re.I)
_NOT_A_SIZE = re.compile(r"screen|power|weight|capacity|warranty|volume", re.I)
_SINGLE_AXES = (("height", ("height",)), ("width", ("width", "breadth")), ("depth", ("depth", "length")))


def _attribute_pairs(pim):
    """(name, value) from this product, then its variant SKU values, then its base product."""
    from products_pim.models import ProductVariant

    def own(p):
        return [(a.attribute.name, str(a.display_value or "")) for a in p.attributes.select_related("attribute")]

    pairs = own(pim)
    if pim.parent_id:
        variant = (
            ProductVariant.objects.filter(sku=pim.code).prefetch_related("attribute_values__attribute").first()
        )
        if variant:
            for v in variant.attribute_values.all():
                value = v.value_text or ("" if v.value_number is None else str(v.value_number))
                pairs.append((v.attribute.name, value))
        if pim.parent:
            pairs += own(pim.parent)
    return [(name, value.strip()) for name, value in pairs if value and value.strip()]


def suggest_ar_size(pim):
    """
    Best-effort W × D × H (cm) from attributes like "Size: King (6x7)",
    "Width (inches): 40" or "Dimensions: 180x200x45 cm". None when no width+depth.

    A unit-less pair of small numbers (≤ 10) is read as feet — the way bed sizes are
    written here. That is a mattress size, which is why this is only a suggestion.
    """
    size, sources = {}, []
    for name, value in _attribute_pairs(pim):
        if _NOT_A_SIZE.search(name):
            continue
        name_unit = _NAME_UNIT.search(name)
        name_factor = _UNIT_CM[name_unit.group(1).lower()] if name_unit else None
        axis = next((key for key, words in _SINGLE_AXES if any(w in name.lower() for w in words)), None)
        if axis:
            try:
                number = float(value)
            except ValueError:
                continue
            if axis not in size:
                size[axis] = round(number * (name_factor or 1.0), 1)
                sources.append(f"{name}: {value}")
            continue
        match = _MEASURE.search(value)
        if not match:
            continue
        numbers = [float(g) for g in match.groups()[:3] if g]
        unit = (match.group(4) or "").lower()
        if unit:
            factor = _UNIT_CM[unit]
        elif name_factor:
            factor = name_factor
        else:
            factor = _UNIT_CM["ft"] if max(numbers) <= 10 else 1.0
        took = False
        for axis_key, number in zip(("width", "depth", "height"), numbers):
            if axis_key not in size:
                size[axis_key] = round(number * factor, 1)
                took = True
        if took:
            sources.append(f"{name}: {value}")

    width, depth, height = size.get("width"), size.get("depth"), size.get("height")
    if width is None or depth is None:
        return None
    if not all(MIN_CM <= v <= MAX_CM for v in (width, depth) + ((height,) if height is not None else ())):
        return None
    return {"width_cm": width, "depth_cm": depth, "height_cm": height, "source": "; ".join(sources)}
