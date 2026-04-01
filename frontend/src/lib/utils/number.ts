export function toSafeNumber(input: unknown, fallback = 0) { const n = Number(input); return Number.isFinite(n) ? n : fallback; }
