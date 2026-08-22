import { apiFetch } from '@/lib/api'

// --- Vendor opening balances ---

export interface VendorWithBalance {
  id: number
  name: string
  phone: string
  opening_balance: string
}

export async function listVendorOpeningBalances(): Promise<VendorWithBalance[]> {
  const res = await apiFetch<{ results?: VendorWithBalance[] }>('/api/v1/admin/opening-balances/vendors/')
  return res.results ?? []
}

export async function saveVendorOpeningBalance(
  vendorId: number,
  data: { amount: string; entry_date: string; notes?: string }
): Promise<unknown> {
  return apiFetch(`/api/v1/admin/opening-balances/vendors/${vendorId}/`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// --- Vendor master ---

export interface VendorMasterForm {
  name: string
  phone: string
  email: string
  gst_number: string
  address: string
}

export async function createVendor(form: VendorMasterForm): Promise<unknown> {
  return apiFetch('/api/v1/admin/vendors/', {
    method: 'POST',
    body: JSON.stringify(form),
  })
}

// --- Opening stock ---

export interface OpeningStockDraft {
  id: number
  [key: string]: unknown
}

export async function createOpeningStockDraft(data: {
  inventory_item: { pk: number }
  stock_location: { pk: number }
  quantity: number
  unit_cost_snapshot: string | null
  effective_date: string
  note: string
}): Promise<OpeningStockDraft> {
  return apiFetch<OpeningStockDraft>('/api/v1/admin/inventory/opening-stock/', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function postOpeningStockDraft(draftId: number): Promise<unknown> {
  return apiFetch(`/api/v1/admin/inventory/opening-stock/${draftId}/post/`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// --- Employee / staff master ---

export interface EmployeeForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  role: string
}

export async function createEmployee(form: EmployeeForm): Promise<unknown> {
  return apiFetch('/api/v1/admin/hr/staff/', {
    method: 'POST',
    body: JSON.stringify(form),
  })
}

// --- Customer opening outstanding ---

export interface CustomerOutstandingForm {
  customer_name: string
  phone: string
  outstanding_amount: string
  entry_date: string
  notes: string
}

export async function createCustomerOpeningOutstanding(form: CustomerOutstandingForm): Promise<unknown> {
  return apiFetch('/api/v1/admin/opening-balances/customers/', {
    method: 'POST',
    body: JSON.stringify(form),
  })
}

// --- Customer master ---

export interface CustomerMasterForm {
  name: string
  phone: string
  email: string
  address: string
}

export async function createCustomer(form: CustomerMasterForm): Promise<unknown> {
  return apiFetch('/api/v1/admin/customers/', {
    method: 'POST',
    body: JSON.stringify(form),
  })
}
