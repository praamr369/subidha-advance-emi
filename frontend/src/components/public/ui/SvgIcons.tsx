"use client";

import { motion } from "framer-motion";

export function SofaIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      whileHover={{ y: -2 }}
    >
      <path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" />
      <path d="M2 13h20" />
      <rect x="2" y="9" width="20" height="8" rx="2" />
      <path d="M6 17v2" />
      <path d="M18 17v2" />
    </motion.svg>
  );
}

export function BedIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      whileHover={{ y: -2 }}
    >
      <path d="M2 4v16" />
      <path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <path d="M2 17h20" />
      <path d="M6 8v9" />
    </motion.svg>
  );
}

export function TvIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      whileHover={{ scale: 1.05 }}
    >
      <rect x="2" y="7" width="20" height="11" rx="2" />
      <path d="m17 2-5 5-5-5" />
      <path d="M12 22v-4" />
      <path d="M8 22h8" />
    </motion.svg>
  );
}

export function FridgeIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      whileHover={{ y: -2 }}
    >
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M5 10h14" />
      <path d="M9 14v2" />
      <path d="M9 5v2" />
    </motion.svg>
  );
}

export function WashingMachineIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      whileHover={{ rotate: 5 }}
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M4 7h16" />
      <circle cx="12" cy="14" r="4" />
      <path d="M9 4h2" />
    </motion.svg>
  );
}
