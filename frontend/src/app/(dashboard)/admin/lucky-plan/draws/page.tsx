import { redirect } from "next/navigation";

export default function LuckyPlanDrawsPage() {
  redirect("/admin/lucky-draws");
}

// Note: Lucky Draws are managed under /admin/lucky-draws (existing full-featured module).
// This page redirects there to keep Lucky Plan nav links consistent.
