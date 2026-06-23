// Handled by permanent HTTP redirect in next.config.ts → /admin/outstandings
// This file is a no-op tombstone kept only because the mount does not support unlink.
import { redirect } from "next/navigation";
export default function TombstonePage() { redirect("/admin/outstandings"); }
