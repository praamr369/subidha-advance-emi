import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppFabProps {
  href: string;
  className?: string;
}

export default function WhatsAppFab({ href, className }: WhatsAppFabProps) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed bottom-[84px] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-8px_rgba(37,211,102,0.6)] transition-colors hover:bg-[#1ebe5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 lg:bottom-6 lg:right-6",
        className
      )}
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="h-7 w-7" aria-hidden="true" />
    </a>
  );
}
