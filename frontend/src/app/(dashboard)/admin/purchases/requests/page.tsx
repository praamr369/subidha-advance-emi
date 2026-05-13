"use client";
import { useEffect, useState } from "react";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listPurchaseRequests, type PurchaseRequest } from "@/services/inventory";
export default function AdminPurchaseRequestsPage(){const [rows,setRows]=useState<PurchaseRequest[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);useEffect(()=>{let active=true;async function load(){try{const payload=await listPurchaseRequests();if(!active)return;setRows(payload.results);}catch(err){if(!active)return;setError(accountingErrorMessage(err,"Failed to load purchase requests."));}finally{if(active)setLoading(false);}}void load();return()=>{active=false;};},[]);const columns:EnterpriseColumnDef<PurchaseRequest>[]=[{key:"request_no",header:"Request No"},{key:"request_date",header:"Date"},{key:"vendor_name",header:"Vendor"},{key:"status",header:"Status"},{key:"notes",header:"Notes"}];return <PortalPage title="Purchase Requests" subtitle="Internal demand-to-order request register." breadcrumbs={[{label:"Admin",href:ROUTES.admin.dashboard},{label:"Purchases",href:ROUTES.admin.purchases},{label:"Requests"}]}><WorkspaceSection title="Requests" description="Approved requests can be converted to purchase orders while preserving source traceability."><EnterpriseDataTable data={rows} columns={columns} loading={loading} error={error} emptyTitle="No purchase requests" emptyDescription="Create purchase requests through inventory demand planning or manual procurement intake."/></WorkspaceSection></PortalPage>;}
