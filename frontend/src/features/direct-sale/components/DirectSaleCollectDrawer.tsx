"use client";

import DrawerShell from "@/components/ui/DrawerShell";
import AdminDirectSaleCollectForm from "@/features/direct-sale/components/AdminDirectSaleCollectForm";

type DirectSaleCollectDrawerProps = {
  open: boolean;
  saleId: number | null;
  onClose: () => void;
  onCollected?: () => void | Promise<void>;
};

export default function DirectSaleCollectDrawer({
  open,
  saleId,
  onClose,
  onCollected,
}: DirectSaleCollectDrawerProps) {
  if (!open || !saleId) return null;

  const fullPageHref = `/admin/finance/collect?workflow=direct-sale&sale_id=${saleId}`;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title="Collect Direct-Sale Balance"
      description="Posts a retail receipt against an invoiced direct-sale receivable."
      size="wide"
      closeOnOverlayClick={false}
    >
      <AdminDirectSaleCollectForm
        variant="drawer"
        canonicalSelfHref={fullPageHref}
        prefillDirectSaleId={saleId}
        onCollected={onCollected}
      />
    </DrawerShell>
  );
}
