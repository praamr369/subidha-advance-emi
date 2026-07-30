// frontend/src/components/layout/NavigationCustomizerModal.tsx
"use client";

import React from "react";
import NavigationCustomizerWorkspace from "@/components/layout/NavigationCustomizerWorkspace";

interface NavigationCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NavigationCustomizerModal({ isOpen, onClose }: NavigationCustomizerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-card border border-white/10 shadow-2xl">
        <NavigationCustomizerWorkspace onClose={onClose} isModal={true} />
      </div>
    </div>
  );
}
