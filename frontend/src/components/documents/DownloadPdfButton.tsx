"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";

export default function DownloadPdfButton({
  path,
  filename,
  label = "Download PDF",
  disabled = false,
  variant = "secondary",
  size = "sm",
  onError,
}: {
  path: string;
  filename: string;
  label?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  onError?: (error: Error) => void;
}) {
  const [loading, setLoading] = useState(false);
  const trimmed = useMemo(() => (path || "").trim(), [path]);

  async function handleDownload() {
    if (!trimmed) return;
    setLoading(true);
    try {
      await downloadAuthenticatedFile(trimmed, filename);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Download failed.");
      if (onError) onError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  return (
    <ActionButton
      variant={variant}
      size={size}
      disabled={disabled || !trimmed}
      loading={loading}
      leftIcon={<Download className="h-4 w-4" />}
      onClick={handleDownload}
    >
      {label}
    </ActionButton>
  );
}

