export function formatRupee(value: number | string | null | undefined) { return `₹${Number(value || 0).toFixed(2)}`; }
