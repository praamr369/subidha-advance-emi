"use client";

import { useState, useEffect } from "react";
import {
  leaseCalculateROU,
  leaseGenerateSchedule,
  getCostCentrePL,
  getCashFlowStatement,
  getFundFlowStatement,
  getFinancialRatios,
  listDeferredTax,
  listLeaseContracts,
  createLeaseContract,
  listFixedAssets,
  createFixedAsset,
  depreciationGenerateSchedule,
  type CashFlowStatement,
  type FundFlowStatement,
  type FinancialRatios,
  type DeferredTaxList,
  type CostCentrePL,
  type LeaseContractRecord,
  type FixedAssetRecord,
} from "@/services/finance-complete";

type Tab = "lease" | "depreciation" | "cost-centre" | "cash-flow" | "fund-flow" | "ratios" | "deferred-tax";

export default function FinanceCompletePage() {
  const [activeTab, setActiveTab] = useState<Tab>("lease");
  const [loading, setLoading] = useState(false);

  // Lease state
  const [leaseSubId, setLeaseSubId] = useState("");
  const [leaseDiscountRate, setLeaseDiscountRate] = useState("8.5");
  const [leaseCalc, setLeaseCalc] = useState<any>(null);
  const [leaseContracts, setLeaseContracts] = useState<LeaseContractRecord[]>([]);
  const [leaseCreateBusy, setLeaseCreateBusy] = useState(false);
  const [leaseCreateMsg, setLeaseCreateMsg] = useState("");
  const [leaseFormVisible, setLeaseFormVisible] = useState(false);
  const [leaseForm, setLeaseForm] = useState({
    asset_description: "", lease_type: "FINANCE",
    lease_start_date: "", lease_end_date: "", monthly_lease_payment: "", discount_rate: "8.5",
  });

  // Depreciation state
  const [fixedAssets, setFixedAssets] = useState<FixedAssetRecord[]>([]);
  const [assetFormVisible, setAssetFormVisible] = useState(false);
  const [assetForm, setAssetForm] = useState({
    asset_code: "", asset_name: "", asset_type: "COMPUTERS",
    acquisition_date: "", acquisition_cost: "", useful_life_years: "5",
    salvage_value: "0", depreciation_method: "STRAIGHT_LINE",
    asset_account_id: "", accumulated_depreciation_account_id: "", depreciation_expense_account_id: "",
  });
  const [assetMsg, setAssetMsg] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [deprStart, setDeprStart] = useState("");
  const [deprEnd, setDeprEnd] = useState("");
  const [deprMsg, setDeprMsg] = useState("");

  // Cost centre state
  const [ccPL, setCCPL] = useState<CostCentrePL | null>(null);
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().split("T")[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split("T")[0]);

  // Cash flow state
  const [cashFlow, setCashFlow] = useState<CashFlowStatement | null>(null);

  // Fund flow state
  const [fundFlow, setFundFlow] = useState<FundFlowStatement | null>(null);

  // Ratios state
  const [ratios, setRatios] = useState<FinancialRatios | null>(null);

  // Deferred tax state
  const [deferredTax, setDeferredTax] = useState<DeferredTaxList | null>(null);

  // Load data based on active tab
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        if (activeTab === "lease") {
          // Lease tab stays interactive (form-based)
        } else if (activeTab === "depreciation") {
          const assets = await listFixedAssets();
          setFixedAssets(assets.results ?? assets);
        } else if (activeTab === "cost-centre") {
          const pl = await getCostCentrePL(undefined, periodStart, periodEnd);
          setCCPL(pl);
        } else if (activeTab === "cash-flow") {
          const cf = await getCashFlowStatement(periodStart, periodEnd);
          setCashFlow(cf);
        } else if (activeTab === "fund-flow") {
          const ff = await getFundFlowStatement(periodStart, periodEnd);
          setFundFlow(ff);
        } else if (activeTab === "ratios") {
          const r = await getFinancialRatios();
          setRatios(r);
        } else if (activeTab === "deferred-tax") {
          const dt = await listDeferredTax();
          setDeferredTax(dt);
        }
      } catch {
        // Silent failure
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [activeTab, periodStart, periodEnd]);

  const handleLeaseCalculate = async () => {
    if (!leaseSubId) return;
    setLoading(true);
    try {
      const calc = await leaseCalculateROU(Number(leaseSubId));
      setLeaseCalc(calc);
    } catch {
      // Silent failure
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLease = async () => {
    if (!leaseForm.asset_description || !leaseForm.lease_start_date || !leaseForm.lease_end_date || !leaseForm.monthly_lease_payment) {
      setLeaseCreateMsg("Please fill in all required fields.");
      return;
    }
    setLeaseCreateBusy(true);
    setLeaseCreateMsg("");
    try {
      await createLeaseContract({
        subscription_id: leaseSubId ? Number(leaseSubId) : 0,
        asset_description: leaseForm.asset_description,
        lease_type: leaseForm.lease_type,
        lease_start_date: leaseForm.lease_start_date,
        lease_end_date: leaseForm.lease_end_date,
        monthly_lease_payment: leaseForm.monthly_lease_payment,
        discount_rate: leaseForm.discount_rate,
      });
      setLeaseCreateMsg("Lease contract created successfully.");
      setLeaseFormVisible(false);
      setLeaseForm({ asset_description: "", lease_type: "FINANCE", lease_start_date: "", lease_end_date: "", monthly_lease_payment: "", discount_rate: "8.5" });
      const contracts = await listLeaseContracts();
      setLeaseContracts(contracts.results ?? []);
    } catch {
      setLeaseCreateMsg("Failed to create lease contract.");
    } finally {
      setLeaseCreateBusy(false);
    }
  };

  const handleCreateAsset = async () => {
    setAssetMsg("");
    try {
      await createFixedAsset({
        asset_code: assetForm.asset_code,
        asset_name: assetForm.asset_name,
        asset_type: assetForm.asset_type,
        acquisition_date: assetForm.acquisition_date,
        acquisition_cost: assetForm.acquisition_cost,
        useful_life_years: Number(assetForm.useful_life_years),
        salvage_value: assetForm.salvage_value,
        depreciation_method: assetForm.depreciation_method,
        asset_account_id: assetForm.asset_account_id ? Number(assetForm.asset_account_id) : undefined,
        accumulated_depreciation_account_id: assetForm.accumulated_depreciation_account_id ? Number(assetForm.accumulated_depreciation_account_id) : undefined,
        depreciation_expense_account_id: assetForm.depreciation_expense_account_id ? Number(assetForm.depreciation_expense_account_id) : undefined,
      });
      setAssetFormVisible(false);
      setAssetMsg("Asset created.");
      const assets = await listFixedAssets();
      setFixedAssets(assets.results ?? assets);
    } catch {
      setAssetMsg("Failed to create asset.");
    }
  };

  const handleGenerateDepr = async () => {
    if (!selectedAssetId) return;
    setDeprMsg("");
    try {
      const result = await depreciationGenerateSchedule(Number(selectedAssetId), deprStart, deprEnd);
      setDeprMsg(result.message || "Depreciation schedule generated.");
    } catch {
      setDeprMsg("Failed to generate depreciation schedule.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Core Finance — Complete Module</h1>
        <p className="text-sm text-muted-foreground mt-2">IFRS-16 Lease, Depreciation, Cost Centre P&L, Cash Flow, Fund Flow, Ratios, Deferred Tax</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {(["lease", "depreciation", "cost-centre", "cash-flow", "fund-flow", "ratios", "deferred-tax"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "lease" && "Lease Accounting"}
            {tab === "depreciation" && "Asset Depreciation"}
            {tab === "cost-centre" && "Cost Centre P&L"}
            {tab === "cash-flow" && "Cash Flow"}
            {tab === "fund-flow" && "Fund Flow"}
            {tab === "ratios" && "Financial Ratios"}
            {tab === "deferred-tax" && "Deferred Tax"}
          </button>
        ))}
      </div>

      {/* LEASE ACCOUNTING */}
      {activeTab === "lease" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold mb-4">IFRS-16 Lease Accounting</h2>
            <p className="text-sm text-muted-foreground mb-4">Calculate ROU asset & lease liability using PV method</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Subscription ID</label>
                <input
                  type="number"
                  value={leaseSubId}
                  onChange={(e) => setLeaseSubId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
                />
              </div>

              <button
                onClick={() => void handleLeaseCalculate()}
                disabled={loading || !leaseSubId}
                className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Calculating…" : "Calculate ROU & Liability"}
              </button>

              {leaseCalc && (
                <div className="mt-4 grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Term:</span>
                    <div className="font-semibold">{leaseCalc.lease_term_months} months</div>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Monthly Payment:</span>
                    <div className="font-semibold">₹{leaseCalc.monthly_payment}</div>
                  </div>
                  <div className="text-xs col-span-2">
                    <span className="text-muted-foreground">ROU Asset:</span>
                    <div className="font-bold text-lg">₹{leaseCalc.rou_asset}</div>
                  </div>
                  <div className="text-xs col-span-2">
                    <span className="text-muted-foreground">Lease Liability:</span>
                    <div className="font-bold text-lg">₹{leaseCalc.initial_lease_liability}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lease Contract Create Form */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Lease Contracts</h2>
              <button onClick={() => setLeaseFormVisible(!leaseFormVisible)} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                {leaseFormVisible ? "Cancel" : "+ New Lease Contract"}
              </button>
            </div>
            {leaseCreateMsg && <div className={`text-sm mb-3 ${leaseCreateMsg.startsWith("Failed") ? "text-red-600" : "text-green-700"}`}>{leaseCreateMsg}</div>}
            {leaseFormVisible && (
              <div className="bg-muted/20 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">Asset Description</label>
                    <input value={leaseForm.asset_description} onChange={e => setLeaseForm(p => ({...p, asset_description: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="Office building lease" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Lease Type</label>
                    <select value={leaseForm.lease_type} onChange={e => setLeaseForm(p => ({...p, lease_type: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1">
                      <option value="FINANCE">Finance Lease (IFRS-16)</option>
                      <option value="OPERATING">Operating Lease</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Discount Rate (%)</label>
                    <input type="number" step="0.1" value={leaseForm.discount_rate} onChange={e => setLeaseForm(p => ({...p, discount_rate: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="8.5" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Lease Start Date</label>
                    <input type="date" value={leaseForm.lease_start_date} onChange={e => setLeaseForm(p => ({...p, lease_start_date: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Lease End Date</label>
                    <input type="date" value={leaseForm.lease_end_date} onChange={e => setLeaseForm(p => ({...p, lease_end_date: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Monthly Lease Payment (₹)</label>
                    <input value={leaseForm.monthly_lease_payment} onChange={e => setLeaseForm(p => ({...p, monthly_lease_payment: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="25000.00" />
                  </div>
                </div>
                <button onClick={() => void handleCreateLease()} disabled={leaseCreateBusy} className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {leaseCreateBusy ? "Creating…" : "Create Lease Contract"}
                </button>
              </div>
            )}
            {leaseContracts.length === 0 && !leaseFormVisible && (
              <div className="text-sm text-muted-foreground text-center py-8">No lease contracts. Create one above.</div>
            )}
            {leaseContracts.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">ID</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-right">Monthly</th>
                      <th className="px-4 py-2 text-left">Start</th>
                      <th className="px-4 py-2 text-left">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaseContracts.map((lc: LeaseContractRecord) => (
                      <tr key={lc.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-4 py-2 text-xs">{lc.id}</td>
                        <td className="px-4 py-2">{lc.asset_description}</td>
                        <td className="px-4 py-2 text-xs">{lc.lease_type}</td>
                        <td className="px-4 py-2 text-right">₹{lc.monthly_lease_payment}</td>
                        <td className="px-4 py-2 text-xs">{lc.lease_start_date}</td>
                        <td className="px-4 py-2 text-xs">{lc.lease_end_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEPRECIATION */}
      {activeTab === "depreciation" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Fixed Assets</h2>
              <button onClick={() => setAssetFormVisible(!assetFormVisible)} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                {assetFormVisible ? "Cancel" : "+ Add Asset"}
              </button>
            </div>

            {assetMsg && <div className={`text-sm mb-3 ${assetMsg.startsWith("Failed") ? "text-red-600" : "text-green-700"}`}>{assetMsg}</div>}

            {assetFormVisible && (
              <div className="bg-muted/20 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Asset Code *</label>
                    <input value={assetForm.asset_code} onChange={e => setAssetForm(p => ({...p, asset_code: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="COMP-001" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Asset Name *</label>
                    <input value={assetForm.asset_name} onChange={e => setAssetForm(p => ({...p, asset_name: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="Laptop Dell XPS" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Asset Type</label>
                    <select value={assetForm.asset_type} onChange={e => setAssetForm(p => ({...p, asset_type: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1">
                      {["COMPUTERS", "FURNITURE", "VEHICLES", "MACHINERY", "BUILDING", "LAND", "OTHER"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Depreciation Method</label>
                    <select value={assetForm.depreciation_method} onChange={e => setAssetForm(p => ({...p, depreciation_method: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1">
                      <option value="STRAIGHT_LINE">Straight Line (SLM)</option>
                      <option value="DECLINING_BALANCE">Declining Balance (WDV)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Acquisition Date *</label>
                    <input type="date" value={assetForm.acquisition_date} onChange={e => setAssetForm(p => ({...p, acquisition_date: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Acquisition Cost *</label>
                    <input value={assetForm.acquisition_cost} onChange={e => setAssetForm(p => ({...p, acquisition_cost: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="50000.00" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Useful Life (years)</label>
                    <input type="number" min="1" value={assetForm.useful_life_years} onChange={e => setAssetForm(p => ({...p, useful_life_years: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Salvage Value</label>
                    <input value={assetForm.salvage_value} onChange={e => setAssetForm(p => ({...p, salvage_value: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Asset Account ID</label>
                    <input value={assetForm.asset_account_id} onChange={e => setAssetForm(p => ({...p, asset_account_id: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="GL Account ID" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Accum. Depr Account ID</label>
                    <input value={assetForm.accumulated_depreciation_account_id} onChange={e => setAssetForm(p => ({...p, accumulated_depreciation_account_id: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="GL Account ID" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Depr Expense Account ID</label>
                    <input value={assetForm.depreciation_expense_account_id} onChange={e => setAssetForm(p => ({...p, depreciation_expense_account_id: e.target.value}))} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" placeholder="GL Account ID" />
                  </div>
                </div>
                <button onClick={() => void handleCreateAsset()} className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                  Create Fixed Asset
                </button>
              </div>
            )}

            {loading && <div className="text-sm text-muted-foreground text-center py-4">Loading assets…</div>}
            {!loading && fixedAssets.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No fixed assets recorded yet.</div>}
            {fixedAssets.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Code</th>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-right">Cost</th>
                      <th className="px-4 py-2 text-left">Method</th>
                      <th className="px-4 py-2 text-left">Life</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixedAssets.map((a: FixedAssetRecord) => (
                      <tr key={a.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-4 py-2 font-mono text-xs">{a.asset_code}</td>
                        <td className="px-4 py-2">{a.asset_name}</td>
                        <td className="px-4 py-2 text-xs">{a.asset_type}</td>
                        <td className="px-4 py-2 text-right">₹{a.acquisition_cost}</td>
                        <td className="px-4 py-2 text-xs">{a.depreciation_method}</td>
                        <td className="px-4 py-2 text-xs">{a.useful_life_years}y</td>
                        <td className="px-4 py-2">
                          <button onClick={() => setSelectedAssetId(String(a.id))} className={`text-xs px-2 py-1 rounded-lg border ${selectedAssetId === String(a.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                            {selectedAssetId === String(a.id) ? "Selected" : "Select"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Depreciation schedule generator */}
          {selectedAssetId && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-bold mb-3">Generate Depreciation Schedule — Asset #{selectedAssetId}</h3>
              <div className="flex gap-3 items-end mb-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Period Start</label>
                  <input type="date" value={deprStart} onChange={e => setDeprStart(e.target.value)} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Period End</label>
                  <input type="date" value={deprEnd} onChange={e => setDeprEnd(e.target.value)} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                </div>
                <button onClick={() => void handleGenerateDepr()} disabled={!deprStart || !deprEnd} className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  Generate
                </button>
              </div>
              {deprMsg && <div className={`text-sm ${deprMsg.startsWith("Failed") ? "text-red-600" : "text-green-700"}`}>{deprMsg}</div>}
            </div>
          )}
        </div>
      )}

      {/* COST CENTRE P&L */}
      {activeTab === "cost-centre" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs font-semibold">Period Start</label>
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold">Period End</label>
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
            </div>

            {ccPL && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">P&L by Cost Centre</h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left">Centre</th>
                        <th className="px-3 py-2 text-right">Revenue</th>
                        <th className="px-3 py-2 text-right">Expenses</th>
                        <th className="px-3 py-2 text-right">Profit</th>
                        <th className="px-3 py-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ccPL.cost_centres.map((cc) => (
                        <tr key={cc.centre_id} className="border-t border-border">
                          <td className="px-3 py-2">{cc.centre_name}</td>
                          <td className="px-3 py-2 text-right">₹{cc.revenue}</td>
                          <td className="px-3 py-2 text-right">₹{cc.expenses}</td>
                          <td className="px-3 py-2 text-right font-semibold">₹{cc.gross_profit}</td>
                          <td className="px-3 py-2 text-right">{cc.allocation_percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CASH FLOW */}
      {activeTab === "cash-flow" && (
        <div className="rounded-xl border border-border bg-card p-6">
          {cashFlow ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold">Cash Flow Statement (Direct Method)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Operating Activities</span>
                  <span className="font-bold">₹{cashFlow.operating_activities.net_operating_cf}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Investing Activities</span>
                  <span className="font-bold">₹{cashFlow.investing_activities.net_investing_cf}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span>Financing Activities</span>
                  <span className="font-bold">₹{cashFlow.financing_activities.net_financing_cf}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between p-2 bg-green-50 rounded font-bold">
                  <span>Net Cash Flow</span>
                  <span>₹{cashFlow.net_cash_flow}</span>
                </div>
                <div className="text-xs text-muted-foreground">Closing Cash: ₹{cashFlow.closing_cash}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading cash flow…</p>
          )}
        </div>
      )}

      {/* FUND FLOW */}
      {activeTab === "fund-flow" && (
        <div className="rounded-xl border border-border bg-card p-6">
          {fundFlow ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold">Fund Flow Statement</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Sources of Funds</div>
                  <div className="space-y-1 text-xs">
                    {Object.entries(fundFlow.sources_of_funds).map(([key, val]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium">₹{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Uses of Funds</div>
                  <div className="space-y-1 text-xs">
                    {Object.entries(fundFlow.uses_of_funds).map(([key, val]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium">₹{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-2 flex justify-between p-2 bg-blue-50 rounded font-bold text-sm">
                <span>Net Fund Increase</span>
                <span>₹{fundFlow.net_fund_increase}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading fund flow…</p>
          )}
        </div>
      )}

      {/* FINANCIAL RATIOS */}
      {activeTab === "ratios" && (
        <div className="rounded-xl border border-border bg-card p-6">
          {ratios ? (
            <div className="space-y-4">
              <h3 className="text-sm font-bold">Financial Ratios & Intelligence</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(ratios).filter(([k]) => k !== 'alerts').map(([category, values]: any) => (
                  <div key={category} className="border border-border/50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2 capitalize">{category.replace(/_/g, " ")}</div>
                    <div className="space-y-1 text-xs">
                      {Object.entries(values as Record<string, number>).map(([key, val]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>
                          <span className="font-medium">{typeof val === 'number' ? val.toFixed(2) : val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {ratios.alerts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-amber-900 mb-2">Alerts</div>
                  <div className="space-y-1 text-xs text-amber-800">
                    {ratios.alerts.map((alert, i) => (
                      <div key={i}>• {alert.message}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading ratios…</p>
          )}
        </div>
      )}

      {/* DEFERRED TAX */}
      {activeTab === "deferred-tax" && (
        <div className="rounded-xl border border-border bg-card p-6">
          {deferredTax ? (
            <div className="space-y-4">
              <h3 className="text-sm font-bold">Deferred Tax Tracking</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                  <div className="text-xs text-muted-foreground">DTA Total</div>
                  <div className="text-lg font-bold text-blue-700">₹{deferredTax.dta_total}</div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                  <div className="text-xs text-muted-foreground">DTL Total</div>
                  <div className="text-lg font-bold text-red-700">₹{deferredTax.dtl_total}</div>
                </div>
              </div>
              {deferredTax.results.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deferredTax.results.map((dt) => (
                        <tr key={dt.code} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{dt.code}</td>
                          <td className="px-3 py-2">{dt.description}</td>
                          <td className="px-3 py-2 text-xs">{dt.tax_type}</td>
                          <td className="px-3 py-2 text-right font-semibold">₹{dt.dta_dtl_amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading deferred tax…</p>
          )}
        </div>
      )}
    </div>
  );
}
