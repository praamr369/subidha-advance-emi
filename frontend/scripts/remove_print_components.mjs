import fs from 'fs';
import path from 'path';

const filesToProcess = [
  "src/app/(dashboard)/admin/billing/contracts/page.tsx",
  "src/app/(dashboard)/admin/billing/credit-notes/page.tsx",
  "src/app/(dashboard)/admin/billing/debit-notes/page.tsx",
  "src/app/(dashboard)/admin/billing/documents/[id]/page.tsx",
  "src/app/(dashboard)/admin/billing/invoices/page.tsx",
  "src/app/(dashboard)/admin/billing/page.tsx",
  "src/app/(dashboard)/admin/billing/receipts/page.tsx",
  "src/app/(dashboard)/admin/billing/register/page.tsx",
  "src/app/(dashboard)/admin/receipts/sample/acknowledgement/page.tsx",
  "src/app/(dashboard)/admin/receipts/sample/invoice/page.tsx",
  "src/app/(dashboard)/admin/receipts/sample/payment/page.tsx",
  "src/app/(dashboard)/admin/receipts/sample/subscription/page.tsx",
  "src/app/(dashboard)/admin/receipts/sample/waiver/page.tsx",
  "src/components/accounting/BookRegisterPage.tsx",
];

const regexes = [
  /<PrintActionBanner[\s\S]*?\/>/g,
  /<BillingPrintDocument[\s\S]*?\/>/g,
  /<SubscriptionContractDocument[\s\S]*?\/>/g,
  /<RegisterPrintDocument[\s\S]*?\/>/g,
];

const importsRegexes = [
  /import PrintActionBanner from ["']@\/components\/print\/PrintActionBanner["'];?\r?\n?/g,
  /import BillingPrintDocument from ["']@\/components\/print\/BillingPrintDocument["'];?\r?\n?/g,
  /import SubscriptionContractDocument from ["']@\/components\/print\/SubscriptionContractDocument["'];?\r?\n?/g,
  /import RegisterPrintDocument from ["']@\/components\/print\/RegisterPrintDocument["'];?\r?\n?/g,
];

for (const file of filesToProcess) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const regex of regexes) {
      content = content.replace(regex, '');
    }
    for (const regex of importsRegexes) {
      content = content.replace(regex, '');
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Processed ${file}`);
  } else {
    console.log(`Not found: ${file}`);
  }
}
