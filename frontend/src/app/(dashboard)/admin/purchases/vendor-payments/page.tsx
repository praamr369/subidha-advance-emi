"use client";
import { useEffect, useState } from "react";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listVendorPayments, type VendorPayment } from "@/services/inventory";
export default function AdminVendorPaymentsPage(){const [rows,setRows]=useState<VendorPayment[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);useEffect(()=>{let active=true;async function load(){try{const payload=await listVendorPayments();if(!active)return;setRows(payload.results);}catch(err){if(!active)return;setError(accountingErrorMessage(err,"Failed to load vendor payments."));}finally{if(active)setLoading(false);}}void load();return()=>{active=false;};},[]);const columns:EnterpriseColumnDef<VendorPayment>[]=[{key:"payment_no",header:"Payment No"},{key:"payment_date",header:"Date"},{key:"vendor_name",header:"Vendor"},{key:"vendor_bill_no",header:"Vendor Bill"},{key:"amount",header:"Amount"},{key:"status",header:"Status"}];return <PortalPage title="Vendor Payments" subtitle="Payable settlement payments with posted journal trace." breadcrumbs={[{label:"Admin",href:ROUTES.admin.dashboard},{label:"Purchases",href:ROUTES.admin.purchases},{label:"Vendor Payments"}]}><WorkspaceSection title="Payments" description="Posted payments reduce vendor payable through controlled accounting bridges."><EnterpriseDataTable data={rows} columns={columns} loading={loading} error={error} emptyTitle="No vendor payments" emptyDescription="Post vendor payments from approved payable flow."/></WorkspaceSection></PortalPage>;}
