from __future__ import annotations

import hashlib


def sha256_hex_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_hex_file(field_file, *, chunk_size: int = 1024 * 1024) -> str | None:
    if not field_file:
        return None
    hasher = hashlib.sha256()
    for chunk in field_file.chunks(chunk_size=chunk_size):
        hasher.update(chunk)
    return hasher.hexdigest()

