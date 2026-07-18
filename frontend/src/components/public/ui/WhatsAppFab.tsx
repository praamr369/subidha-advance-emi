"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppFabProps {
  href: string;
  className?: string;
}

export default function WhatsAppFab({ href, className }: WhatsAppFabProps) {
  if (!href) return null;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "fixed bottom-[84px] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-8px_rgba(37,211,102,0.6)] lg:bottom-6 lg:right-6",
        className
      )}
      aria-label="Chat on WhatsApp"
    >
      {/* Pulse effect */}
      <span className="absolute inset-0 z-[-1] inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75"></span>
      <MessageCircle className="h-7 w-7" />
    </motion.a>
  );
}
