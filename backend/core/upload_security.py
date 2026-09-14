"""Shared upload-content validation.

Why this exists
---------------
Uploads used to be trusted by their client-supplied ``Content-Type`` while the
stored file kept the client-supplied filename extension. That let a self-service
user upload an HTML/JS payload labelled ``image/png`` (or a ``.html`` file that
happens to pass a content-type check): nginx then served it from ``/media`` on
the primary origin as ``text/html``, giving stored XSS that can read the JWTs an
admin keeps in ``localStorage``.

This module closes the code side of that hole:

* It verifies the file's real type from its **magic bytes**, not the header the
  browser claimed. A text/HTML/SVG/exe body has no image or PDF signature and is
  rejected before it is ever stored.
* It rewrites the stored filename to a **safe extension derived from the detected
  type**, so a valid-image-with-``.html``-name polyglot can't keep a dangerous
  extension.

The nginx ``/media`` location adds the belt (``X-Content-Type-Options: nosniff``
plus a sandbox CSP) for anything already on disk and for types we still serve
inline. Keep both.

Signature matching (not a full decode) is deliberate: it blocks the real attack
without depending on a raster library being able to fully decode every valid
file, and it matches how the rest of the codebase validates uploads.
"""
from __future__ import annotations

import re
from pathlib import Path

# Logical kind -> (list of magic-byte matchers, safe extension).
# A matcher is a callable(header_bytes) -> bool so multi-part signatures
# (e.g. WEBP's RIFF....WEBP) stay readable.
_JPEG = ("jpeg", lambda h: h[:3] == b"\xff\xd8\xff", ".jpg")
_PNG = ("png", lambda h: h[:8] == b"\x89PNG\r\n\x1a\n", ".png")
_GIF = ("gif", lambda h: h[:6] in (b"GIF87a", b"GIF89a"), ".gif")
_WEBP = ("webp", lambda h: h[:4] == b"RIFF" and h[8:12] == b"WEBP", ".webp")
_PDF = ("pdf", lambda h: h[:5] == b"%PDF-", ".pdf")

_SIGNATURES = {kind: (matcher, ext) for (kind, matcher, ext) in (_JPEG, _PNG, _GIF, _WEBP, _PDF)}

# Convenience presets for the common call sites.
IMAGE_KINDS = frozenset({"jpeg", "png", "webp", "gif"})
IMAGE_PDF_KINDS = frozenset({"jpeg", "png", "pdf"})

DEFAULT_MAX_BYTES = 5 * 1024 * 1024  # 5 MB

_SAFE_STEM_RE = re.compile(r"[^A-Za-z0-9._-]+")


class UploadValidationError(ValueError):
    """Raised when an upload fails size or content-signature validation.

    Subclasses ``ValueError`` so existing service-layer callers that already
    expect ``ValueError`` keep working unchanged.
    """


def _detect_kind(header: bytes) -> str | None:
    for kind, (matcher, _ext) in _SIGNATURES.items():
        if matcher(header):
            return kind
    return None


def _safe_name(original: str, extension: str) -> str:
    stem = Path(original or "").stem
    stem = _SAFE_STEM_RE.sub("_", stem).strip("._-")[:60]
    return f"{stem or 'upload'}{extension}"


def validate_upload(
    uploaded_file,
    *,
    allowed_kinds,
    max_bytes: int = DEFAULT_MAX_BYTES,
    label: str = "file",
) -> str:
    """Validate an uploaded file by size and true content type.

    * Rejects empty files and files larger than ``max_bytes``.
    * Reads the leading bytes and rejects anything whose magic-byte signature is
      not in ``allowed_kinds`` (so HTML/SVG/JS/exe payloads are refused even when
      the client claims an allowed ``Content-Type``).
    * Rewrites ``uploaded_file.name`` to a sanitized stem plus the extension for
      the detected type, so the stored file can never keep a dangerous extension.

    Returns the detected logical kind (e.g. ``"png"``). Raises
    :class:`UploadValidationError` on any failure. Leaves the file's read
    position at 0.
    """
    allowed = frozenset(allowed_kinds)

    size = int(getattr(uploaded_file, "size", 0) or 0)
    if size <= 0:
        raise UploadValidationError("Uploaded file is empty.")
    if size > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise UploadValidationError(f"File must be {mb} MB or smaller.")

    try:
        uploaded_file.seek(0)
        header = uploaded_file.read(32) or b""
    finally:
        try:
            uploaded_file.seek(0)
        except (OSError, ValueError):
            pass

    kind = _detect_kind(header)
    if kind is None or kind not in allowed:
        pretty = ", ".join(sorted(k.upper() for k in allowed))
        raise UploadValidationError(f"Unsupported or unrecognized {label} type. Allowed: {pretty}.")

    _matcher, extension = _SIGNATURES[kind]
    try:
        uploaded_file.name = _safe_name(getattr(uploaded_file, "name", ""), extension)
    except (AttributeError, TypeError):
        # Some file-like objects don't allow setting .name; the signature check
        # and the nginx sandbox still protect us in that case.
        pass

    return kind
