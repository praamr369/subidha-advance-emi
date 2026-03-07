"use client";

export default function Topbar({ title }: { title: string }) {
  return <header style={{ borderBottom: "1px solid #e5e7eb", padding: 12, fontWeight: 700 }}>{title}</header>;
}
