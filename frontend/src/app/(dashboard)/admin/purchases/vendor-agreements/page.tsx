"use client";
import { useEffect, useState } from "react";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listVendorAgreements, type VendorAgreement } from "@/services/inventory";
export default function AdminVendorAgreementsPage(){const [rows,setRows]=useState<VendorAgreement[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);useEffect(()=>{let active=true;async function load(){try{const payload=await listVendorAgreements();if(!active)return;setRows(payload.results);}catch(err){if(!active)return;setError(accountingErrorMessage(err,"Failed to load vendor agreements."));}finally{if(active)setLoading(false);}}void load();return()=>{active=false;};},[]);const columns:EnterpriseColumnDef<VendorAgreement>[]=[{key:"agreement_no",header:"Agreement No"},{key:"vendor_name",header:"Vendor"},{key:"effective_from",header:"Start"},{key:"effective_to",header:"End"},{key:"status",header:"Status"},{key:"payment_terms",header:"Terms"}];return <PortalPage title="Vendor Agreements" subtitle="Commercial agreement register for procurement controls." breadcrumbs={[{label:"Admin",href:ROUTES.admin.dashboard},{label:"Purchases",href:ROUTES.admin.purchases},{label:"Vendor Agreements"}]}><WorkspaceSection title="Agreements" description="Agreement terms are explicit and auditable before PO issuance."><EnterpriseDataTable data={rows} columns={columns} loading={loading} error={error} emptyTitle="No vendor agreements" emptyDescription="Create vendor agreements before controlled procurement cycles."/></WorkspaceSection></PortalPage>;}
