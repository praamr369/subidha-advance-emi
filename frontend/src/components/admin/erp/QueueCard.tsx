"use client";

import type { ErpCard } from "@/services/admin-erp";
import { OperationCard } from "./OperationCard";

export function QueueCard({ card }: { card: ErpCard }) {
  return <OperationCard card={card} />;
}
