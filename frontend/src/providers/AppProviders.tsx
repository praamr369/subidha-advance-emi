"use client";

import type { ReactNode } from "react";

import AuthProvider from "@/providers/AuthProvider";
import QueryProvider from "@/providers/QueryProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import ToastProvider from "@/providers/ToastProvider";

export default function AppProviders({ children }: { children: ReactNode }) {
  return <ThemeProvider><QueryProvider><AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider></QueryProvider></ThemeProvider>;
}
