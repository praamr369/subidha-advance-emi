"use client";
export default function SearchInput({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) { return <input className="w-full rounded border p-2" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />; }
