from __future__ import annotations

import re
from dataclasses import dataclass


class AIChunkingError(ValueError):
    pass


@dataclass(frozen=True)
class ChunkPayload:
    chunk_index: int
    heading: str
    content: str
    token_count: int


def _extract_headings(text: str) -> list[tuple[int, str]]:
    headings: list[tuple[int, str]] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
            if heading:
                headings.append((offset, heading[:255]))
        offset += len(line)
    return headings


def _heading_for_offset(headings: list[tuple[int, str]], offset: int) -> str:
    current = ""
    for position, heading in headings:
        if position > offset:
            break
        current = heading
    return current


def _find_split_point(text: str, start: int, target_end: int, overlap: int) -> int:
    if target_end >= len(text):
        return len(text)

    floor = min(start + max(overlap, 1), target_end)
    newline_at = text.rfind("\n", floor, target_end)
    sentence_at = text.rfind(". ", floor, target_end)

    if newline_at != -1:
        return newline_at + 1
    if sentence_at != -1:
        return sentence_at + 1
    return target_end


def chunk_source_text(
    text: str,
    *,
    max_chars: int = 1800,
    overlap_chars: int = 200,
) -> list[ChunkPayload]:
    normalized = (text or "").replace("\r\n", "\n").strip()
    if not normalized:
        raise AIChunkingError("Source text is empty after normalization.")
    if max_chars < 1500 or max_chars > 2500:
        raise AIChunkingError("max_chars must be between 1500 and 2500.")
    if overlap_chars < 150 or overlap_chars > 250:
        raise AIChunkingError("overlap_chars must be between 150 and 250.")
    if overlap_chars >= max_chars:
        raise AIChunkingError("overlap_chars must be smaller than max_chars.")

    headings = _extract_headings(normalized)
    chunks: list[ChunkPayload] = []
    start = 0
    chunk_index = 0
    text_length = len(normalized)

    while start < text_length:
        desired_end = min(start + max_chars, text_length)
        end = _find_split_point(normalized, start, desired_end, overlap_chars)
        raw_chunk = normalized[start:end]
        content = raw_chunk.strip()
        if content:
            token_count = len(re.findall(r"\S+", content))
            if token_count > 0:
                chunks.append(
                    ChunkPayload(
                        chunk_index=chunk_index,
                        heading=_heading_for_offset(headings, start),
                        content=content,
                        token_count=token_count,
                    )
                )
                chunk_index += 1
        if end >= text_length:
            break
        next_start = max(end - overlap_chars, start + 1)
        start = next_start

    if not chunks:
        raise AIChunkingError("Chunking produced no usable chunks.")
    return chunks
