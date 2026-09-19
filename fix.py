with open('frontend/src/app/(dashboard)/admin/purchases/vendor-returns/page.tsx', 'r') as f:
    text = f.read()

text = text.replace('const [purchaseBills, setPurchaseBills] = useState<AccountingPurchaseBill[]>([]);', 'const [purchaseBills, setPurchaseBills] = useState<any[]>([]);')
text = text.replace("listPurchaseBills({ status: 'POSTED' })", "listPurchaseBills({ status: 'POSTED' }),\n          listVendorBills({ status: 'POSTED' })")
text = text.replace('const [returnPayload, vendorPayload, billsPayload] = await Promise.all', 'const [returnPayload, vendorPayload, billsPayload, vbPayload] = await Promise.all')

merge_code = """const pbills = Array.isArray(billsPayload) ? billsPayload : billsPayload.results;
      const vbills = Array.isArray(vbPayload) ? vbPayload : vbPayload.results;
      const combined = [
        ...(pbills || []).map((b: any) => ({ ...b, _isVendor: false, _id: f"pb_{b.id}", lines: b.lines?.map((l: any) => ({ ...l, _item_name: l.item_name, _id: f"pb_{l.id}" })) })),
        ...(vbills || []).map((b: any) => ({ ...b, _isVendor: true, _id: f"vb_{b.id}", lines: b.lines?.map((l: any) => ({ ...l, _item_name: l.inventory_item_product_name || l.description, _id: f"vb_{l.id}" })) }))
      ];
      setPurchaseBills(combined);"""
merge_code = merge_code.replace('f"pb_{b.id}"', '`pb_${b.id}`').replace('f"pb_{l.id}"', '`pb_${l.id}`').replace('f"vb_{b.id}"', '`vb_${b.id}`').replace('f"vb_{l.id}"', '`vb_${l.id}`')

text = text.replace('const pbills = Array.isArray(billsPayload) ? billsPayload : billsPayload.results;\n      setPurchaseBills(pbills || []);', merge_code)

text = text.replace('const selectedBill = purchaseBills.find((b) => String(b.id) === selectedBillId);', 'const selectedBill = purchaseBills.find((b) => b._id === selectedBillId);')

payload_code = """const validLines = Object.entries(returnLines)
        .map(([id, qty]) => ({
          [selectedBill._isVendor ? "vendor_bill_line_id" : "purchase_bill_line_id"]: Number(id),
          quantity: Number(qty)
        }))
        .filter((l) => l.quantity > 0);"""

text = text.replace("""const validLines = Object.entries(returnLines)
        .map(([id, qty]) => ({
          purchase_bill_line_id: Number(id),
          quantity: Number(qty)
        }))
        .filter((l) => l.quantity > 0);""", payload_code)

text = text.replace('await createAdminPurchaseReturn(Number(selectedBillId), {', 'await createAdminPurchaseReturn(selectedBill._isVendor ? undefined : Number(selectedBill.id), selectedBill._isVendor ? Number(selectedBill.id) : undefined, {')

text = text.replace('value={b.id}', 'value={b._id}')
text = text.replace('key={b.id}', 'key={b._id}')

text = text.replace('key={line.id}', 'key={line._id}')
text = text.replace('{line.item_name}', '{line._item_name}')
text = text.replace('returnLines[line.id]', "returnLines[line.id || line._id?.split('_')[1]]")
text = text.replace('onChange={(e) => setReturnLines({ ...returnLines, [line.id]: e.target.value })}', "onChange={(e) => setReturnLines({ ...returnLines, [line.id || line._id?.split('_')[1]]: e.target.value })}")

with open('frontend/src/app/(dashboard)/admin/purchases/vendor-returns/page.tsx', 'w') as f:
    f.write(text)
