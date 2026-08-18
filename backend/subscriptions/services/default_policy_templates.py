from __future__ import annotations





from copy import deepcopy





DEFAULT_POLICY_STATUS = "DRAFT"





_ADDR = "[BUSINESS_ADDRESS]"

_PHONE = "[BUSINESS_PHONE]"

_EMAIL = "[BUSINESS_EMAIL]"

_WEB = "[WEBSITE_URL]"

_BIZ = "[BUSINESS_NAME]"

_OWNER = "[BUSINESS_OWNER]"




DEFAULT_POLICY_TEMPLATES = [


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 1. TERMS AND CONDITIONS


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "terms",


        "title": "Terms and Conditions",


        "category": "GENERAL",


        "summary": "General terms governing use of Subidha Furniture's website, showroom, direct sale, Lucky Plan EMI, rent/lease, payment, delivery, and service workflows.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Terms and Conditions





**Subidha Furniture** (Proprietor: Pradip Roy, Business Code SUBIDHA-ASN-001) operates from South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal 713302. By engaging with our website, showroom, staff, or any of our products and services, you agree to these Terms and Conditions.





## 1. Scope of Application





These terms apply to every person who visits our website, submits an enquiry, registers as a customer, accepts a quotation, purchases a product, joins the Lucky Plan EMI subscription, enters a rent/lease contract, makes a payment, receives delivery, or requests service or support from us.





## 2. Authoritative Business Records





Invoices, receipts, signed contracts, payment acknowledgements, delivery confirmations, audit logs, and other system-generated or admin-approved documents are the official business records. Verbal commitments, informal messages, handwritten notes, and screenshots are not binding unless backed by an approved business document.





## 3. Customer Responsibilities





Customers must provide accurate and complete:


- Full name, phone, email, and residential or business address


- KYC and identity proof where required (e.g., Aadhaar, PAN, GSTIN)


- Payment references and instrument details


- Delivery availability and site access confirmation


- Product or service specifics





Errors, omissions, or outdated information provided by the customer may result in delays to orders, deliveries, refunds, service appointments, EMI processing, or account support, and may transfer liability to the customer.





## 4. Product Description and Pricing





Product images, catalogue entries, brochure content, and website listings are provided for general information only. Final product specifications, pricing (inclusive of GST), discounts, delivery charges, warranty terms, and contract conditions are confirmed exclusively through approved quotation, invoice, or contract documents issued by Subidha Furniture.





## 5. Separate Business Workflows





Direct sale, Lucky Plan EMI, rent/lease, and service are distinct business workflows with separate contracts, obligations, and rights:


- A direct sale does not create a Lucky ID or subscription.


- A Lucky Plan subscription does not create a rent/lease contract.


- Rent/lease possession does not transfer product ownership unless a separate written sale document is executed.


- Service appointments apply only to products sold or rented through Subidha Furniture unless otherwise agreed in writing.





## 6. Payment Obligations





All amounts are payable through modes accepted by Subidha Furniture (cash, UPI, bank transfer, or approved card terminals). Payments are confirmed only upon receipt of funds and issuance of a machine-generated receipt. Partial payment does not constitute full settlement unless the contract expressly states otherwise.





## 7. Statutory Consumer Rights





These terms do not limit, restrict, or waive any statutory rights available to consumers under the Consumer Protection Act, 2019, or any other applicable Indian law. Where applicable law provides greater protection than these terms, the law prevails.





## 8. Limitation of Liability





Subidha Furniture's liability for any claim, loss, or damage arising from a business transaction is limited to the amount paid by the customer for the specific product or service giving rise to the claim, except where prohibited by law.





## 9. Amendments





We may update these terms from time to time. The current version is always available at our showroom and website. Continued engagement with our business after an update constitutes acceptance of the revised terms.





## 10. Governing Law and Jurisdiction





These terms are governed by the laws of India. Subject to mandatory consumer protection provisions, disputes are subject to the jurisdiction of competent courts at Asansol, West Bengal, India.





## 11. Contact





**Phone/WhatsApp:** {phone}


**Email:** {email}


**Address:** {addr}


**Website:** {web}


""".format(phone=_PHONE, email=_EMAIL, addr=_ADDR, web=_WEB),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 2. PRIVACY POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "privacy",


        "title": "Privacy Policy",


        "category": "PRIVACY",


        "summary": "How Subidha Furniture collects, uses, stores, shares, and protects customer personal data under DPDP 2023.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Privacy Policy





**Subidha Furniture** (Data Fiduciary) respects the privacy of every Data Principal (customer, prospect, vendor, or partner) whose personal data we process. This policy is published in compliance with the Digital Personal Data Protection Act, 2023 (DPDP 2023) and applicable Indian data protection norms.





## 1. Data We Collect





We may collect:


- **Identity data**: name, date of birth, Aadhaar number (last 4 digits), PAN, GSTIN, photograph (where required for KYC)


- **Contact data**: phone number, email address, residential or business address


- **Transaction data**: invoices, receipts, payment references, EMI schedules, contract records


- **Subscription data**: Lucky Plan subscription details, Lucky IDs, draw history, waiver records


- **Delivery data**: delivery address, delivery confirmation, condition photographs


- **Service data**: service request records, technician visit logs, photographs of product condition


- **Communication data**: enquiry records, support tickets, call logs (where applicable)


- **Technical data**: login records, IP addresses, browser or device type (for website users)





## 2. Lawful Purpose for Processing





We process personal data only for the following lawful purposes (DPDP 2023 s.4):


- Customer registration and KYC verification


- Quotation, invoicing, receipt, and contract generation


- EMI and Lucky Plan subscription management


- Rent/lease possession, demand notices, and account management


- Delivery scheduling and confirmation


- Warranty and service appointment management


- Payment processing, reconciliation, and accounting


- Fraud detection and prevention


- Compliance with tax obligations (GST, Income Tax Act 1961)


- Compliance with MSMED Act, DPDP 2023, and other applicable law


- Dispute resolution and legal proceedings





## 3. Data Sharing





We do not sell personal data. We may share limited personal data with:


- Authorised staff and business associates (on a need-to-know basis)


- Delivery partners and service technicians (for logistics and service only)


- Payment processors and banking partners (for transaction processing)


- Accounting software and cloud service providers (for operational purposes)


- Legal advisers, auditors, and compliance consultants


- Government authorities and courts where required by law





All third-party data processors are required to handle data with reasonable security standards.





## 4. Data Retention





We retain personal data for as long as required by law or business necessity:


- Financial, GST, and accounting records: minimum 8 years (Income Tax Act 1961 / CGST Act 2017)


- Contract and dispute records: 3-7 years from contract closure or dispute resolution


- KYC and identity records: as required by applicable law


- Marketing and enquiry records: until withdrawn or 3 years from last interaction





See the **Data Retention and Deletion Policy** for full retention schedules.





## 5. Your Rights under DPDP 2023





As a Data Principal, you have the right to:


- **Access (s.11)**: Request a summary of your personal data and how it is processed


- **Correction and Erasure (s.12)**: Request correction of inaccurate data or deletion of data no longer needed


- **Grievance Redressal (s.13)**: Lodge a complaint with our DPO within 30 days


- **Nomination (s.14)**: Nominate a person to exercise your rights on your behalf





See the **Data Requests Policy** for how to exercise these rights.





## 6. Data Security





We implement access controls, role-based permissions, audit logging, secure backups, and internal process controls to protect personal data from unauthorised access, disclosure, alteration, or destruction. No system is completely risk-free. If you suspect a data breach or misuse, report it immediately to:





**Email:** {email}


**Phone:** {phone}





## 7. Cookies and Tracking





See the **Cookie and Tracking Consent Policy** for details of tracking on our website.





## 8. Updates to This Policy





We may update this privacy policy from time to time. The current version is available at our website and showroom. Continued use of our services after an update constitutes acceptance of the revised policy.





## 9. Data Protection Officer (DPO) Contact





**Name:** Pradip Roy


**Email:** {email}


**Phone:** {phone}


**Address:** {addr}


""".format(phone=_PHONE, email=_EMAIL, addr=_ADDR),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 3. REFUND AND CANCELLATION POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "refund-cancellation",


        "title": "Refund and Cancellation Policy",


        "category": "REFUND",


        "summary": "Rules for cancellation, return, refund, reversal, and adjustment across direct sale, Lucky Plan EMI, and rent/lease.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Refund and Cancellation Policy





Subidha Furniture processes refunds, cancellations, returns, reversals, and adjustments through a controlled workflow. These are not automatic rights and are subject to review against invoice, receipt, contract, payment, delivery, and product condition records.





## 1. Direct Sale Cancellation Before Delivery





A direct sale order may be cancelled before delivery if:


- The product has not been dispatched, delivered, or installed


- The product has not been specially ordered, customised, or modified to specification


- The cancellation request is received in writing within 24 hours of order confirmation





Approved cancellations before delivery: a full refund of amounts paid may be issued, less any payment gateway charges, packaging, or logistics costs already incurred.





## 2. Direct Sale Return After Delivery





Returns after delivery are accepted only if:


- The product has a manufacturing defect confirmed by our service team, **or**


- The wrong product was delivered (i.e., not matching the invoice), **or**


- The product was damaged in transit (reported at the time of delivery or within 24 hours)





Returns are **not accepted** for:


- Change of mind after delivery and acceptance


- Minor cosmetic variations within manufacturing tolerance


- Damage caused by customer misuse, improper assembly, or unauthorised modification


- Products that have been used beyond the initial inspection period





## 3. Lucky Plan EMI Cancellation





**Before subscription activation (before first EMI payment):**


Cancellation is permitted. Any advance or booking amount paid may be refunded less processing and administrative charges.





**After subscription activation but before product delivery:**


Cancellation is permitted subject to forfeiture of applicable advance and administrative charges.





**After product delivery:**


Cancellation is subject to:


- Return of the product in original or near-original condition


- Assessment of EMIs paid versus rental-equivalent value of the period the product was used


- Deductions for damage, delivery/pick-up logistics, and administrative closure





Lucky Draw waiver rights are forfeited on cancellation. Previously drawn waiver benefits already applied are not reversed.





## 4. Rent/Lease Cancellation





Rent/lease cancellation before possession: advance and deposit may be refunded less administrative charges.


Rent/lease cancellation after possession: subject to notice period in the contract, return inspection, and settlement of all outstanding rent and charges. See the **Security Deposit Policy** for deposit refund timelines.





## 5. Payment Reversal and Void





For double-payments, incorrect payment amounts, or technical errors:


- Report immediately to {phone} or {email}


- Provide payment reference, amount, date, and mode


- Reversal is processed subject to payment processor timelines (typically 3-7 working days after confirmation)





See the **Payment Reversal and Void Policy** for internal controls.





## 6. Refund Processing Timeline





| Scenario | Timeline |


|---|---|


| Pre-delivery cancellation (approved) | 3-7 working days |


| Post-delivery return (approved) | 7-15 working days from product return confirmation |


| Payment reversal / technical error | 3-7 working days after confirmation |


| Security deposit refund (rent/lease closure) | 7-15 working days from closure sign-off |





## 7. How to Raise a Refund or Cancellation Request





- **Phone/WhatsApp:** {phone} (9 AM-6 PM, Monday-Saturday)


- **Email:** {email}


- **In person:** {addr}





Include your name, phone, order/subscription number, reason for cancellation/refund, and any supporting evidence (photographs, receipts).


""".format(phone=_PHONE, email=_EMAIL, addr=_ADDR),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 4. DELIVERY POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "delivery-policy",


        "title": "Delivery Policy",


        "category": "DELIVERY",


        "summary": "Delivery scheduling, eligibility, process, inspection, and customer responsibilities for all product deliveries.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Delivery Policy





Subidha Furniture delivers furniture products to customers within its service area as part of direct sale, Lucky Plan EMI subscription, or rent/lease contracts. Delivery is a controlled handover process requiring scheduling, verification, and customer acknowledgement.





## 1. Delivery Eligibility





Delivery is initiated after:


- Payment of the required amount is confirmed (full payment for direct sale; first EMI and any advance for Lucky Plan; security deposit and first month rent for rent/lease)


- KYC and address verification is complete


- Product is available and prepared for dispatch


- Delivery date and time is confirmed with the customer





## 2. Delivery Area





We currently deliver within our serviceable area covering Asansol and nearby localities in Paschim Barddhaman, West Bengal. Deliveries outside our standard service area may require additional lead time and charges. Please confirm delivery feasibility before placing an order.





## 3. Scheduling





Delivery is scheduled by mutual agreement between our logistics team and the customer. The customer must:


- Confirm their availability for the scheduled date and time


- Ensure that the delivery address is accessible for our vehicle and delivery team


- Provide clear instructions for access (floor, lift availability, gate access, etc.)


- Inform us at least 24 hours in advance if reschedule is required





We will attempt to contact the customer at least once before delivery. If the customer is unreachable or unavailable at the scheduled time, the delivery may be rescheduled and a re-delivery charge may apply.





## 4. Delivery Team





Delivery is carried out by authorised Subidha Furniture staff or contracted delivery partners. Our team will:


- Bring the product to the customer's premises


- Assist with placement in the room of choice (ground-level access or where feasible)


- Demonstrate basic product use where applicable


- Obtain customer signature/acknowledgement on the delivery record





## 5. Customer Inspection at Delivery





The customer must inspect the product at the time of delivery before signing the delivery acknowledgement:


- Check that the product matches the invoice/order description


- Check for visible damage, defects, or missing components


- Confirm assembly or placement is satisfactory





**Signing the delivery record confirms that the product was received in satisfactory condition.** Damage or defect claims raised after the delivery acknowledgement is signed will be assessed under the **Warranty Policy** or **Return Damage Inspection Policy** as applicable.





Visible damage or wrong product delivery must be reported at the time of delivery or within 24 hours to {phone} or {email}.





## 6. Risk Transfer





Risk of loss or accidental damage to the product passes to the customer from the moment of confirmed handover (delivery acknowledgement signed). For rent/lease customers, risk of accidental or customer-caused damage passes at handover but ownership remains with Subidha Furniture.





## 7. Delivery Charges





Delivery charges (if any) are stated in the quotation or invoice. Free delivery may be offered as part of a promotion; this applies only to the first delivery attempt. Re-delivery due to customer unavailability or rescheduling may attract additional charges.





## 8. Failed Delivery





If delivery cannot be completed due to reasons on the customer's side (no access, customer absent, address incorrect):


- A second delivery attempt will be made on a mutually agreed date


- A re-delivery charge may apply from the second attempt onward


- If delivery cannot be completed within 30 days of the original schedule, the order may be cancelled and refund processed under the Refund and Cancellation Policy





## 9. Contact for Delivery Issues





**Phone/WhatsApp:** {phone}


**Email:** {email}


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 5. WARRANTY POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "warranty",


        "title": "Warranty Policy",


        "category": "WARRANTY",


        "summary": "Warranty coverage, claim process, exclusions, and customer responsibilities for products sold or rented by Subidha Furniture.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Warranty Policy





Subidha Furniture provides warranty coverage on furniture products sold or rented through us, as specified in the product invoice or rental contract. This policy defines what is covered, how to make a claim, and what is excluded.





## 1. Warranty Period





The warranty period is stated in the product invoice or contract. Standard warranty periods are:


- **Structural defects** (frame, joints, core material): as stated per product, typically 1-2 years


- **Surface and finish defects** (fabric, paint, laminate): as stated per product, typically 6-12 months


- **Mechanical components** (hinges, sliders, castors): as stated per product





If no warranty period is stated, the statutory guarantee under the **Consumer Protection Act, 2019** applies.





## 2. What is Covered





Warranty covers:


- Manufacturing defects in materials or workmanship that arise during normal domestic use


- Structural failure of frames, joints, or load-bearing components under normal use


- Defective hardware (hinges, drawer sliders, lock mechanisms) supplied as part of the product





## 3. What is NOT Covered





Warranty does not cover:


- Damage caused by accident, misuse, neglect, or abnormal use


- Damage caused by water, moisture, direct sunlight, heat, chemicals, or pests


- Normal wear and tear (fading, minor surface scratches, loose joints over time)


- Damage from unauthorised repair, modification, or disassembly


- Cosmetic variations within manufacturing tolerance (minor colour or texture differences)


- Products that have been moved to an address other than the delivery address without notifying us (for rent/lease)


- Commercial or institutional use of products sold for domestic use


- Products where the serial number or identification label has been removed or defaced





## 4. How to Make a Warranty Claim





1. Contact us with your invoice number, product details, purchase/rent date, and a description of the defect


2. Provide clear photographs or video of the defect


3. Our team will review the claim and arrange an inspection visit if required


4. If the defect is covered, we will repair or replace the defective component or product at no charge


5. If repair is not feasible, a replacement product or pro-rated credit may be offered at our discretion





**Contact:**


- **Phone/WhatsApp:** {phone}


- **Email:** {email}





## 5. Warranty Service Timeline





- Acknowledgement of claim: within 2 business days


- Site inspection (if required): within 5 business days of claim acknowledgement


- Repair or replacement: within 15 business days of defect confirmation





## 6. Exclusion of Consequential Damages





Our warranty liability is limited to repair or replacement of the defective product or component. We are not liable for any indirect, incidental, or consequential damages arising from a product defect.





## 7. Rent/Lease Products





Warranty for rent/lease products covers defects in the product itself. Damage caused by the customer is not covered by warranty and is assessed under the **Return Damage Inspection Policy**.





## 8. Service After Warranty





Out-of-warranty repair and maintenance services are available for products sold or rented by us at applicable service charges. Contact us to schedule a paid service visit.


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 6. SERVICE POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "service-policy",


        "title": "Service Policy",


        "category": "SERVICE",


        "summary": "Rules for product service, repair appointments, technician visits, service charges, and customer cooperation.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Service Policy





Subidha Furniture provides after-sale and after-rent service and repair support for furniture products transacted through us. Service is subject to product eligibility, appointment scheduling, and the terms below.





## 1. Service Eligibility





Service support is available for:


- Products purchased directly from Subidha Furniture (under warranty or paid service)


- Products currently rented/leased from Subidha Furniture (covered under the rental contract)


- Out-of-warranty products previously sold or rented by us (subject to service charge)





We do not provide service for products not purchased or rented from Subidha Furniture.





## 2. Requesting Service





To request a service appointment:


- Call or WhatsApp us at **{phone}**


- Email us at **{email}**


- Use the customer portal: Customer  Support  New Service Request





Provide:


- Your name, phone, and order/subscription/rental number


- A description of the issue and when it started


- Photographs or video of the defect (helps us bring the right parts/tools)


- Your available dates and time slots for a technician visit





## 3. Service Visit Process





- Our team will confirm the appointment date and time


- A technician will visit at the confirmed time


- The technician will inspect the product and diagnose the issue


- For warranty cases: repair is carried out at no charge if the defect is covered (see Warranty Policy)


- For non-warranty or out-of-warranty cases: a service charge quotation will be provided before work commences





**Customer responsibilities during the visit:**


- Ensure an adult (18+) is present at the premises during the visit


- Provide clear access to the product


- Cooperate with the technician and provide any requested usage information





## 4. Service Charges





| Service Type | Charge |


|---|---|


| In-warranty repair (covered defect) | No charge |


| Out-of-warranty repair inspection/visit fee | As quoted |


| Out-of-warranty repair parts + labour | As quoted |


| Reinstallation / relocation support | As quoted |





Charges are confirmed by written quotation before work begins. No work proceeds without customer acceptance of the charge.





## 5. Replacement Parts





Parts used in warranty repairs are new or manufacturer-equivalent. For paid repairs, part source (new/OEM/compatible) and cost are disclosed in the quotation.





## 6. Service Timeline





- Service appointment acknowledgement: within 1-2 business days


- Technician visit: within 5-7 business days (sooner for urgent cases; subject to availability)


- Parts order (if required): timeline communicated at time of diagnosis





## 7. Customer Obligations





Customers must:


- Provide accurate problem description and photographs in advance


- Be available at the confirmed appointment time


- Not attempt self-repair, disassembly, or third-party repair (for in-warranty products) - this voids the warranty





## 8. Escalation





If a service concern is not resolved satisfactorily, escalate under the **Grievance Policy**.


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 7. PAYMENT POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "payment-policy",


        "title": "Payment Policy",


        "category": "PAYMENT",


        "summary": "Accepted payment modes, receipt confirmation, partial payment, late payment, and GST compliance for all transactions.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Payment Policy





All payments to Subidha Furniture must be made through approved channels and are subject to confirmation, receipt, and accounting controls.





## 1. Accepted Payment Modes





- **Cash** - accepted at our showroom; subject to cash limits under Income Tax Act 1961 s.269ST (no single transaction in cash exceeding 2,00,000)


- **UPI** - Google Pay, PhonePe, Paytm, BHIM UPI, and all UPI-enabled apps


- **Bank transfer (NEFT / RTGS / IMPS)** - to our registered business account


- **Debit/credit card** - via our card terminal at the showroom (where available)


- **Cheque** - accepted for select transactions; subject to clearance; receipt issued on clearance





Cash payments above 50,000 require the customer to furnish PAN as per Income Tax Act requirements.





## 2. Payment Confirmation and Receipt





A payment is **confirmed** only when:


- Cash is physically received and counted at our showroom, **or**


- UPI payment success notification is received on our registered UPI ID, **or**


- Bank transfer is reflected in our account, **or**


- Card payment is authorised and terminal confirmation is received





A **machine-generated receipt** is issued for every confirmed payment. Verbal payment acknowledgement is not a valid receipt.





**Customers must retain receipts.** Lost receipts may be re-issued as a certified copy subject to system records and administrative verification.





## 3. GST and Invoice Compliance





All invoices are issued in compliance with the **Central Goods and Services Tax (CGST) Act, 2017**. GST rates applicable to furniture products are as per the current GST schedule. GSTIN of the customer (if applicable) must be provided before invoice generation GST invoices cannot be amended after filing.





## 4. Partial Payment





Partial payment does not transfer product ownership or activate a Lucky Plan subscription unless the contract expressly states a partial-payment activation threshold. For rent/lease, partial rent payment does not constitute full monthly payment and may attract late charges.





## 5. Late Payment





Late or missed payments may result in:


- **Direct sale (balance due):** Delivery hold, invoice reminder, and recovery action if persistent


- **Lucky Plan EMI:** Reminder, draw eligibility suspension, and action under the **EMI Subscription Default Policy**


- **Rent/Lease:** Late payment charge as per contract, service/support hold, and repossession risk under the **Repossession Policy**





## 6. Payment Disputes





If you believe a payment has been incorrectly applied, duplicated, or not credited:


1. Provide the payment reference, amount, date, mode, and screenshot/bank statement


2. Contact us at **{phone}** or **{email}**


3. Do not make duplicate payments while a dispute is in progress





Payment disputes are reviewed under the **Payment Reversal and Void Policy**.





## 7. Record Keeping





Payment records, receipts, and reconciliation entries are maintained in our accounting system for a minimum of 8 years as required by the Income Tax Act, 1961 and CGST Act, 2017.


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 8. DIRECT SALE POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "direct-sale-policy",


        "title": "Direct Sale Policy",


        "category": "DIRECT_SALE",


        "summary": "Terms for direct furniture purchase: order confirmation, payment, ownership transfer, delivery, and post-sale rights.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Direct Sale Policy





A direct sale is the purchase of a furniture product from Subidha Furniture with full or instalment payment and immediate ownership transfer upon full payment confirmation. This policy defines how direct sale transactions are initiated, confirmed, completed, and supported.





## 1. Order Confirmation





An order is confirmed when:


- The customer accepts our written or digital quotation


- An advance or full payment is received and receipted


- The order record is created in our business system





Verbal orders, informal messages, or quotation discussions do not constitute confirmed orders.





## 2. Payment Terms





- Standard: full payment before delivery, unless credit or instalment terms are agreed in writing


- Advance + balance: advance paid at order confirmation; balance due before or at delivery


- Credit sale: documented in a separate credit sale agreement





Advance amounts are non-refundable if the customer cancels after the cooling-off period stated in the Refund and Cancellation Policy.





## 3. Ownership Transfer





Legal and beneficial ownership of the product transfers to the customer when:


- Full payment (including all balance and charges) is confirmed and receipted


- A sale invoice is issued





For advance/part-payment orders, ownership remains with Subidha Furniture until full payment is received and a final invoice is issued.





## 4. Delivery and Possession





After ownership transfer, the product is delivered as per the **Delivery Policy**. The customer must inspect the product at delivery and raise any defect or mismatch claim at the time of delivery or within 24 hours.





## 5. GST Invoice





A GST-compliant tax invoice is issued for every direct sale upon full payment. Customers requiring a GST invoice in their business name and GSTIN must provide this information before invoice generation.





## 6. Warranty





All products sold carry the warranty described in the **Warranty Policy**. The warranty period and scope are stated on the invoice.





## 7. Returns and Refunds





Returns and refunds after delivery are governed by the **Refund and Cancellation Policy** and **Warranty Policy**. Direct sale products are not eligible for return based on change of mind after delivery.





## 8. Customer Rights





These terms do not affect your rights under the Consumer Protection Act, 2019 or any other applicable Indian consumer protection law.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 9. LUCKY PLAN POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "lucky-plan-policy",


        "title": "Lucky Plan Policy",


        "category": "LUCKY_PLAN",


        "summary": "Lucky Plan EMI subscription terms: enrollment, Lucky IDs, monthly draw, waiver benefit, eligibility, and cancellation.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Lucky Plan Policy





The Lucky Plan is Subidha Furniture's **Product Instalment Sale with Optional Company-Funded Monthly Waiver Benefit**. Customers pay monthly instalments (EMIs) for the product and participate in a monthly lucky draw. The draw winner's remaining future EMIs are waived by Subidha Furniture as a business promotion.





**Legal classification:** The Lucky Plan is a lawful EMI subscription with an embedded waiver incentive. It is **not** a lottery, prize draw, gambling scheme, prize chit, or money circulation scheme under the Prize Chits and Money Circulation Schemes (Banning) Act, 1978 or any other applicable law. No cash prize is offered. The waiver is a company-funded credit against future EMI obligations only.





## 1. What is the Lucky Plan





The Lucky Plan allows you to:


- Purchase a furniture product through a monthly EMI subscription


- Receive a unique Lucky ID for your subscription batch


- Participate in a monthly draw where one winner per batch has their remaining future EMIs waived by Subidha Furniture





The number of EMIs, batch size, and monthly draw structure are defined in the subscription contract signed at enrollment.





## 2. Enrollment Requirements





To enroll in the Lucky Plan, you must:


- Complete customer registration and KYC (identity and address verification)


- Execute a Lucky Plan Subscription Contract (specifying product, tenure, EMI amount, Lucky ID batch, and terms)


- Pay the first EMI (and any initial advance or security, if required)


- Receive delivery or possession of the subscribed product





Enrollment is not complete until the contract is executed, first payment is confirmed, and the subscription is activated in the Subidha Furniture system.





## 3. Lucky IDs





- One Lucky ID is assigned per subscription batch at enrollment


- Lucky IDs are unique, system-generated, and non-transferable


- Your Lucky ID is displayed in your customer account portal


- Lucky IDs from different batches do not combine for draw purposes





## 4. Monthly EMI Obligation





- EMI is due each month on the date stated in your subscription schedule


- Timely payment is required to maintain draw eligibility


- Late or missed EMI may result in reminders, draw eligibility suspension, or action under the **EMI Subscription Default Policy**





## 5. The Monthly Lucky Draw





- One Lucky ID per batch is drawn each month


- The draw uses a cryptographic random selection method with a tamper-evident audit record


- Draw results are recorded, logged with the drawn Lucky ID and batch reference, and communicated to participants


- The draw winner's remaining unpaid future EMIs in the current subscription are waived this is the **EMI Waiver Benefit**


- **No cash prize is paid.** The waiver is a credit against future EMI obligations only





## 6. Draw Eligibility





Your Lucky ID is eligible for a given month's draw if, at the time of the draw:


- Your subscription is active (not cancelled or suspended)


- All EMIs due on or before the draw date are paid and confirmed in the system


- No outstanding default is in effect





Late or unconfirmed payments at draw time may result in your Lucky ID being ineligible for that month's draw.





## 7. Winner Benefit and Settlement





- The winner is notified by phone, WhatsApp, or email to their registered contact details


- The waiver of future EMIs is applied to the subscription account within 7 working days of draw confirmation


- The winner must sign or confirm waiver settlement documents as required


- The waiver applies only to future unpaid EMIs in the current subscription





## 8. Cancellation and Early Closure





- **Before product delivery:** Advances may be refunded per the **Refund and Cancellation Policy**


- **After product delivery:** Subject to review of EMIs paid, product condition, and contract settlement terms


- On cancellation, any future draw eligibility and waiver entitlement is forfeited


- A previously drawn waiver already applied to the account is not reversed by later cancellation





## 9. Draw Transparency





Subidha Furniture publishes draw results (Lucky ID, batch, date, and draw method reference) for all participants. Personal details of the winner are not published without consent. Audit records are maintained for inspection upon request.





## 10. Disputes





Draw disputes must be raised within 7 days of draw result publication, providing your Lucky ID, subscription number, EMI payment proof, and reason for dispute. We will review audit records and provide a written response within 15 business days.





## 11. Contact





**Phone/WhatsApp:** {phone}


**Email:** {email}


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 10. RENTAL AND LEASE POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "rental-lease-policy",


        "title": "Rental and Lease Policy",


        "category": "RENT_LEASE",


        "summary": "Rent/lease contract terms, possession, monthly obligations, maintenance, closure, and repossession rights.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Rental and Lease Policy





Subidha Furniture offers furniture products on a monthly rent/lease basis. Under this arrangement, you have use of the product for the agreed period; **ownership remains with Subidha Furniture at all times** unless a separate written sale is executed.





## 1. Eligibility





Rent/lease is available to individual and business customers who:


- Complete KYC and address verification


- Execute the rent/lease contract


- Pay the security deposit and first month's rent before possession


- Provide a valid delivery and possession address within our service area





## 2. Contract





The rent/lease contract specifies:


- Product(s) and asset details (model, asset number, condition at handover)


- Monthly rent and due date


- Security deposit amount (see **Security Deposit Policy**)


- Minimum tenure and notice period for closure


- Approved address of use





The contract is binding from the date of execution and mutual signing. Changes to the contract are valid only through a written **Contract Amendment** process.





## 3. Possession





Possession of the product is provided after:


- Contract is executed and signed by both parties


- Security deposit payment is confirmed


- First month's rent is confirmed


- KYC and delivery address is verified





The condition of the product at the time of handover is documented with photographs and a signed **Possession and Handover Record**.





## 4. Monthly Rent and Payment





- Monthly rent is due on the date stated in the contract


- You will receive a payment demand or reminder before the due date


- Failure to receive a reminder does not remove your obligation to pay on time


- Late payment may attract a late charge as specified in the contract (typically 1.5%"2% per month on the outstanding amount) and may result in service/support hold





## 5. Your Obligations as a Lessee





You must:


- Pay rent on time each month


- Use the product only at the approved address stated in the contract


- Use the product with reasonable care and for its intended purpose


- Report any damage, defect, or required maintenance promptly


- Not sublet, lend, pledge, or assign the product to any third party


- Not modify, disassemble, or attempt self-repair without written permission from Subidha Furniture


- Return the product in its original condition (subject to fair wear and tear) upon contract closure





Moving the product to a different address without our written permission is a material breach of the contract.





## 6. Maintenance and Repairs





Subidha Furniture is responsible for maintenance and repair of defects arising from normal use or manufacturing issues, provided:


- You report the defect promptly


- The defect is not caused by customer misuse, negligence, or unauthorised modification





Damage caused by or attributable to the customer will be assessed under the **Return Damage Inspection Policy** and may be deducted from the security deposit.





## 7. Contract Closure and Return





To close a rent/lease contract:


1. Give written notice as stated in the contract (typically 30 days in advance)


2. Ensure all outstanding rent, charges, and dues are cleared


3. Schedule a return inspection with our team


4. Handover the product at the agreed date and time





After return:


- Our team inspects the product against the original possession record and photographs


- Deductions for damage, missing components, outstanding dues, or transport are assessed


- The security deposit balance (after all deductions) is refunded within 7-15 working days of closure sign-off





## 8. Renewal





At the end of the minimum tenure, the contract may be renewed by mutual agreement at updated terms. We will notify you at least 15 days before the minimum tenure expiry.





## 9. Repossession





Subidha Furniture reserves the right to repossess the product if:


- Rent remains unpaid beyond the overdue period stated in the contract


- The product is found at an address other than the approved address


- The contract is materially breached (subletting, modification, damage, KYC fraud)


- A court order or legal process requires it





Repossession will be conducted with reasonable prior notice where possible. Customers may dispute repossession through the **Grievance Policy**.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 11. GRIEVANCE POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "grievance",


        "title": "Grievance Policy",


        "category": "GRIEVANCE",


        "summary": "Customer complaint intake, escalation, response timelines, and grievance officer contact.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Grievance Policy





Subidha Furniture is committed to resolving every customer complaint fairly, promptly, and transparently. This policy defines how to raise a grievance, what to expect, and how to escalate if not satisfied.





## 1. Who Can Raise a Grievance





Any current or former customer, prospect, vendor, or partner with a legitimate complaint about:


- A product, delivery, or service experience


- A payment, refund, or account dispute


- A data privacy or data handling concern


- Staff conduct or communication


- Any policy, contract, or business practice





## 2. Step 1 Direct Contact (First Resolution Attempt)





Contact us first. Most issues are resolved within 1-3 business days at this stage.





| Channel | Details |


|---|---|


| Phone/WhatsApp | **{phone}** (9 AM-6 PM, Mon-Sat) |


| Email | **{email}** |


| In person | {addr} |





When contacting us, provide:


- Your name, phone, and order/subscription/rental reference


- A clear description of the complaint and your expected resolution


- Supporting documents, photographs, or evidence





## 3. Step 2 Escalation to Grievance Officer





If your concern is not resolved within **5 business days** of first contact:





**Grievance Officer:** Pradip Roy


**Contact:** {phone} | {email}


**Address:** {addr}





The Grievance Officer will acknowledge your escalation within **2 business days** and provide a resolution or status update within **15 business days** of receiving the escalation.





## 4. Step 3 External Escalation





If you remain unsatisfied after the internal grievance process:


- **Consumer Forum:** District Consumer Disputes Redressal Commission, Asansol (under Consumer Protection Act, 2019)


- **DPDP Complaints:** Data Protection Board of India (for data privacy concerns under DPDP 2023)





## 5. Grievance Record





All grievances received by phone, email, or in person are logged in our system with date, description, channel, assigned officer, status, and closure record. We maintain grievance records for 3 years.





## 6. What We Expect from Customers





- Raise complaints in good faith with accurate information


- Cooperate with our team during investigation


- Avoid abusive, threatening, or fraudulent complaint submissions





We reserve the right to close complaints that are found to be abusive, fraudulent, or duplicate.


""".format(phone=_PHONE, email=_EMAIL, addr=_ADDR),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 12. BUSINESS COMPLIANCE POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "business-compliance",


        "title": "Business Compliance Policy",


        "category": "COMPLIANCE",


        "summary": "Overview of statutory registrations, tax compliance, GST, MSMED, and legal obligations of Subidha Furniture.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Business Compliance Policy





Subidha Furniture operates in compliance with all applicable Indian laws governing furniture retail, subscription, and service businesses. This policy documents our statutory obligations and compliance commitments.





## 1. Business Registration





- **Trade Name:** Subidha Furniture


- **Proprietor:** Pradip Roy


- **Business Address:** {addr}


- **Business Nature:** Furniture retail (direct sale), Lucky Plan EMI subscription, furniture rent/lease, and after-sale service





## 2. GST Compliance





Subidha Furniture [is registered / is not yet registered update this section after GST registration] under the **Central Goods and Services Tax (CGST) Act, 2017**.


- GST invoices are issued for all taxable supplies in compliance with CGST Rules 2017


- GST returns are filed per the applicable schedule (monthly/quarterly)


- GSTIN: **[YOUR GSTIN update after registration]**





## 3. Income Tax Compliance





- All business income is reported under the Income Tax Act, 1961


- Cash transactions are limited to comply with s.269ST (no single cash transaction  2,00,000)


- TDS is deducted and deposited as applicable (vendor payments, rent, etc.)





## 4. MSMED Act Compliance





Subidha Furniture is [registered / in process of registering] under the **Micro, Small and Medium Enterprises Development (MSMED) Act, 2006** as an [Micro/Small] enterprise.


- Udyam Registration No.: **[YOUR UDYAM NO. - update after registration]**


- Benefits: priority lending access, MSME dispute resolution, government scheme eligibility





## 5. Consumer Protection Act, 2019





We comply with the Consumer Protection Act, 2019, including:


- Clear pricing and product disclosure


- Grievance redressal mechanism (see Grievance Policy)


- No unfair trade practices or misleading advertisements


- Statutory rights of consumers are preserved in all contracts





## 6. Data Protection





We comply with the **Digital Personal Data Protection Act, 2023 (DPDP 2023)** as a registered Data Fiduciary. See the **Privacy Policy** and **Data Requests Policy** for details.





## 7. Labour and Employment





All staff relationships comply with applicable labour laws including the Shops and Establishments Act (West Bengal), Payment of Wages Act, and other applicable statutes.





## 8. Review





This compliance position is reviewed annually and updated upon registration, amendment, or change in applicable law.


""".format(addr=_ADDR),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 13. OWNERSHIP AND BUSINESS PROOF POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "ownership-business-proof",


        "title": "Ownership and Business Proof Policy",


        "category": "COMPLIANCE",


        "summary": "Documents required to establish business ownership, legal standing, and KYC of Subidha Furniture.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Ownership and Business Proof Policy





This policy records the documentation framework used by Subidha Furniture to establish legal business ownership, identity, and standing for the purposes of bank account opening, vendor registration, customer contracts, government filings, and compliance audits.





## 1. Proprietor and Business Identity





| Field | Details |


|---|---|


| Proprietor | Pradip Roy |


| Business Name | Subidha Furniture |


| Business Type | Sole Proprietorship |


| Registered Address | {addr} |


| Contact | {phone} / {email} |





## 2. Primary Identity Documents (Proprietor)





- Aadhaar Card (Government-issued identity proof)


- PAN Card (Income tax identity and business PAN)


- Passport-size photographs (as required)





## 3. Business Address Proof





- Utility bill (electricity / water) in the business name or proprietor's name at the business address


- Rent/lease agreement if the business premises are rented


- Municipal trade licence (where required)





## 4. Business Registration Documents





- Udyam Registration Certificate (MSMED Act registration see MSME Policy)


- GST Registration Certificate (GSTIN see Business Compliance Policy)


- Trade Licence from local municipal authority





## 5. Bank Account Documentation





- Cancelled cheque or bank account statement in the business name


- Bank KYC documents as required by the bank





## 6. Document Custody





Originals of all registration and identity documents are held by the proprietor. Copies are maintained in the business compliance document register accessible to authorised staff only.





## 7. Updates





Document details are updated in the system within 30 days of any renewal, amendment, or change of address or registration status.


""".format(addr=_ADDR, phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 14. UDYAM / MSME POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "udyam-msme",


        "title": "MSME / Udyam Registration Policy",


        "category": "COMPLIANCE",


        "summary": "Udyam MSME registration details, benefits, and compliance obligations under the MSMED Act 2006.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# MSME / Udyam Registration Policy





Subidha Furniture is registered (or in process of registration) under the **Micro, Small and Medium Enterprises Development (MSMED) Act, 2006** through the **Udyam Registration Portal** maintained by the Ministry of MSME, Government of India.





## 1. Registration Details





| Field | Details |


|---|---|


| Udyam Registration Number | **[YOUR UDYAM REGISTRATION NO. - fill in after registration]** |


| Enterprise Category | Micro Enterprise |


| NIC Activity | Furniture retail and rental |


| Date of Registration | **[DATE fill in after registration]** |





## 2. Benefits of MSME Registration





- Priority access to credit and bank lending (Priority Sector Lending)


- Eligibility for government schemes and subsidies for MSMEs


- Access to MSME Samadhaan for delayed payment dispute resolution


- Preference in government procurement (where applicable)


- Reduced court fee in MSME Facilitation Council proceedings





## 3. Delayed Payment Obligations (MSMED Act s.15-16)





As an MSME, our vendors and buyers have obligations regarding payment timelines:


- Buyers must pay MSME vendors within **45 days** of acceptance of goods/services (or the agreed credit period, whichever is shorter)


- Delayed payments attract compound interest at 3 the bank rate (RBI)


- We honour these obligations in our own vendor payment process (see **Vendor Purchase Policy**)





## 4. Annual Filing





Udyam-registered enterprises must file the **Udyam Annual Return** on the Udyam portal by the due date each year.





## 5. Classification Review





Investment in plant and machinery/equipment and turnover are reviewed annually. If they cross the applicable MSME classification threshold, the registration is upgraded to the next category.





## 6. Contact for MSME Queries





**Phone/WhatsApp:** {phone}


**Email:** {email}


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 15. CONTACT AND ENQUIRY POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "contact-enquiry-policy",


        "title": "Contact and Enquiry Policy",


        "category": "GENERAL",


        "summary": "How Subidha Furniture handles product/service enquiries, lead follow-up, and data handling for enquiries.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Contact and Enquiry Policy





This policy explains how Subidha Furniture handles enquiries received through our website, phone, WhatsApp, email, social media, or in-person at our showroom.





## 1. How to Contact Us





| Channel | Details | Hours |


|---|---|---|


| Phone/WhatsApp | {phone} | 9 AM-6 PM, Mon-Sat |


| Email | {email} | Responses within 1-2 business days |


| In person | {addr} | Showroom hours |


| Website | {web} | 24/7 (contact form) |





## 2. What Happens After an Enquiry





On receiving an enquiry, our team will:


1. Acknowledge receipt (by reply WhatsApp/call/email) within 1 business day


2. Clarify the customer's requirement, budget, and delivery location


3. Provide product options, pricing, and availability


4. Share a written quotation if requested


5. Follow up within 3-5 business days if no response is received





## 3. What an Enquiry Does NOT Create





Submitting an enquiry or receiving a quotation does **not** create:


- A confirmed order or contract


- A price lock (prices are subject to change until order is confirmed)


- A Lucky ID, EMI subscription, or rent/lease contract


- A product reservation


- A delivery commitment





An order is confirmed only through a signed contract, advance payment receipt, and system-generated order confirmation.





## 4. Communication Consent





By contacting us through any channel, you consent to being contacted by us through the same or related channels (phone, WhatsApp, SMS, email) for the purpose of responding to your enquiry and providing product/service information.





You may withdraw this consent at any time by requesting to be removed from our follow-up list (see **Marketing Opt-Out Policy** if we have obtained separate marketing consent).





## 5. Enquiry Data





Data collected through enquiries (name, phone, email, product interest) is used only to respond to the enquiry and follow up. It is handled under our **Privacy Policy** and **Communication Consent Policy**.





## 6. Misuse and Spam





We reserve the right to disregard, block, or report enquiries that are:


- Abusive, threatening, or offensive


- Spam or duplicate submissions


- Intended to elicit proprietary information under false pretences


- Fraudulent or designed to manipulate our staff


""".format(phone=_PHONE, email=_EMAIL, addr=_ADDR, web=_WEB),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 16. DATA REQUESTS POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "data-requests",


        "title": "Data Requests Policy",


        "category": "PRIVACY",


        "summary": "How customers exercise data access, correction, erasure, and nomination rights under DPDP 2023 ss.11-14.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Data Requests Policy





This policy explains how you can exercise your personal data rights under the **Digital Personal Data Protection Act, 2023 (DPDP 2023)** as a Data Principal of Subidha Furniture.





## 1. Your Rights under DPDP 2023





| Right | Section | Description |


|---|---|---|


| Right to Information and Access | s.11 | Receive a summary of personal data held and how it is processed |


| Right to Correction and Erasure | s.12 | Request correction of inaccurate data or deletion of no-longer-needed data |


| Right to Grievance Redressal | s.13 | Raise a complaint with the DPO within 30 days |


| Right to Nominate | s.14 | Nominate a person to exercise your rights on your behalf |





## 2. How to Submit a Data Request





Submit your request to our Data Protection Officer (DPO):





- **Email:** {email} (Subject: Data Request - [Access / Correction / Erasure / Grievance / Nomination])


- **Phone/WhatsApp:** {phone}


- **In person:** {addr}





Your request must include:


- Full name and registered phone or email


- Type of request (access, correction, erasure, grievance, nomination)


- Specific details of the request


- Identity verification (we may ask for identity proof to verify you before processing)





## 3. Access Request (DPDP 2023 s.11)





On a verified access request, we provide:


- Categories of personal data held about you


- Purpose of processing


- Third parties with whom data has been shared (where applicable)





**Response timeline:** within 30 days of receipt of a verified request.





## 4. Correction Request (DPDP 2023 s.12)





We will correct inaccurate or incomplete personal data where:


- The correction is verifiable with evidence you provide


- The field is not legally locked (financial, contract, and audit records may have limited correction scope)





**Response timeline:** within 30 days of receipt of a verified request.





## 5. Erasure Request (DPDP 2023 s.12)





You may request deletion of personal data that:


- Is no longer needed for the purpose it was collected, and


- No legal, contractual, or regulatory retention obligation applies





We **cannot** immediately delete:


- Financial records required under Income Tax Act, 1961 or CGST Act, 2017


- Contract records during the contract term and dispute limitation period


- Audit and compliance records required by applicable law





Where full deletion is not possible, we will restrict processing of the data to the extent permitted.





## 6. Grievance (DPDP 2023 s.13)





If you are not satisfied with how your data is handled, raise a data grievance with our DPO using the contact above. Response within 30 days. If unresolved, you may approach the **Data Protection Board of India**.





## 7. Nomination (DPDP 2023 s.14)





You may nominate a trusted person to exercise your DPDP rights on your behalf. Submit nomination in writing with your identity proof and the nominee's identity proof.





## 8. DPO Contact





**Data Protection Officer:** Pradip Roy


**Email:** {email}


**Phone:** {phone}


""".format(phone=_PHONE, email=_EMAIL, addr=_ADDR),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 17. COOKIE AND TRACKING CONSENT POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "cookie-tracking-consent",


        "title": "Cookie and Tracking Consent Policy",


        "category": "PRIVACY",


        "summary": "Use of cookies, tracking technologies, consent management, and opt-out options on the Subidha Furniture website.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Cookie and Tracking Consent Policy





This policy explains how Subidha Furniture uses cookies and similar tracking technologies on its website and customer portal, and how you can manage your preferences.





## 1. What are Cookies





Cookies are small text files placed on your device by our website to enable functionality, remember your preferences, and improve your experience. We also use similar technologies such as local storage and session storage.





## 2. Types of Cookies We Use





| Type | Purpose | Can Opt Out? |


|---|---|---|


| **Essential / Strictly Necessary** | Required for login, session management, security, and shopping cart functions | No essential for the website to work |


| **Functional** | Remember your preferences (language, display settings) | Yes |


| **Analytics** | Understand how visitors use the website (page views, navigation paths) | Yes |


| **Marketing** | Track visits for targeted advertising (if applicable) | Yes |





We do **not** use cookies to collect sensitive personal data (Aadhaar, PAN, payment details). Payment pages may set cookies from third-party payment processors under their own privacy policies.





## 3. Your Consent





On your first visit to our website, a cookie consent banner is displayed. You may:


- **Accept all cookies** - enable all categories above


- **Accept essential only** - only strictly necessary cookies are set


- **Manage preferences** - individually toggle each category





Your choice is stored in a consent cookie for 12 months. You can change your preference at any time via the cookie settings link in our website footer.





## 4. Third-Party Cookies





Our website may include content or links from third-party services (payment processors, maps, social media widgets). These third parties may set their own cookies subject to their privacy policies. We do not control third-party cookies.





## 5. How to Manage Cookies in Your Browser





You can manage or delete cookies at any time through your browser settings:


- Chrome: Settings  Privacy and Security  Cookies


- Firefox: Settings  Privacy & Security  Cookies


- Safari: Preferences  Privacy  Cookies


- Edge: Settings  Privacy, Search, and Services  Cookies





Blocking essential cookies may affect website functionality.





## 6. Contact





For cookie-related queries, contact: **{email}** or **{phone}**


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 18. KYC AND IDENTITY VERIFICATION POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "kyc-identity-verification",


        "title": "KYC and Identity Verification Policy",


        "category": "COMPLIANCE",


        "summary": "KYC document requirements, verification process, and customer obligations for identity and address proof.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# KYC and Identity Verification Policy





Subidha Furniture collects Know Your Customer (KYC) information to verify customer identity and address before entering into contracts, activating EMI subscriptions, delivering products, or collecting security deposits.





## 1. Why We Collect KYC





KYC verification is required:


- To confirm customer identity before executing contracts


- To prevent fraud, impersonation, and misrepresentation


- To comply with applicable legal and tax obligations


- To enable recovery or contact in the event of payment default or contract breach





## 2. KYC Documents Required





**Individual customers:**


- **Identity Proof** (any one): Aadhaar Card, Passport, Driving Licence, Voter ID


- **Address Proof** (any one): Aadhaar Card (if not used for identity), Utility bill (not older than 3 months), Rent agreement, Passport


- **PAN Card** (required for cash transactions  50,000 and for Lucky Plan/rent/lease contracts)


- **Passport-size photograph** (for select contract types)





**Business customers:**


- GST Registration Certificate (GSTIN)


- Udyam / MSME Registration (if applicable)


- Business PAN


- Authorised signatory identity and address proof





## 3. Verification Process





- Documents are collected at enrollment, subscription, or contract signing


- Our staff verifies documents against the original (or clear scans/photographs)


- We record the document type and reference number; we do not store full Aadhaar number


- Address is verified against the delivery address provided





## 4. Re-verification





We may request updated KYC documents if:


- Existing documents expire or are reported as invalid


- The customer's address or contact details change


- A regulatory requirement mandates re-verification





## 5. Customer Obligations





- Provide genuine, unaltered documents


- Inform us within 30 days if your address or contact details change


- Cooperate with re-verification requests





Providing false or fraudulent KYC documents is a criminal offence and may result in contract termination, recovery action, and reporting to law enforcement.





## 6. Data Security





KYC data is stored securely with access restricted to authorised staff. KYC records are retained as required by applicable law and our **Data Retention and Deletion Policy**.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 19. COMMUNICATION CONSENT POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "communication-consent",


        "title": "Communication Consent Policy",


        "category": "PRIVACY",


        "summary": "How Subidha Furniture communicates with customers, consent requirements, and opt-out rights.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Communication Consent Policy





Subidha Furniture communicates with customers through phone, WhatsApp, SMS, email, and in-person for business and service purposes. This policy explains what communications you will receive, on what basis, and how to opt out of non-essential communications.





## 1. Transactional Communications (Consent Not Required)





We send the following communications in the course of our business relationship with you these are necessary for contract performance and do not require separate consent:





- Order confirmations, invoices, and payment receipts


- Delivery scheduling, confirmation, and update messages


- EMI and rent/lease payment reminders and demand notices


- Service appointment confirmations


- Warranty and service status updates


- Lucky Draw result notifications (for Lucky Plan subscribers)


- Account statements and subscription summaries


- Regulatory and compliance notices (data requests, privacy updates)





## 2. Marketing Communications (Consent Required)





The following communications are sent only if you have provided separate marketing consent:


- Promotional offers, new product launches, and seasonal discounts


- Event announcements (new showroom, Lucky Plan batch opening)


- Customer satisfaction surveys





You may provide or withdraw marketing consent at any time by contacting us (see below) or through our website preference centre.





## 3. Communication Channels





| Channel | Used for |


|---|---|


| Phone call | Order, delivery, service, payment follow-up |


| WhatsApp | EMI reminders, delivery updates, service confirmations |


| SMS | Payment receipts, reminders, OTP |


| Email | Invoices, statements, formal notices |


| In person | Contract signing, KYC, service visits |





## 4. DND / TRAI Compliance





We respect TRAI's Do Not Disturb (DND) registry for promotional SMS and calls. Transactional messages are sent to DND-registered numbers as permitted by TRAI regulations.





## 5. Opt-Out of Marketing Communications





To opt out of marketing communications at any time:


- **WhatsApp/Phone:** Send "STOP" or call **{phone}**


- **Email:** Reply with "Unsubscribe" or email **{email}**





Transactional and service communications cannot be opted out of while your account or contract is active, as they are necessary for the business relationship.





## 6. Data Handling





Communication records (call logs where applicable, message content, email) are handled under our **Privacy Policy**.


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 20. EMI SUBSCRIPTION DEFAULT POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "emi-subscription-default-policy",


        "title": "EMI Subscription Default Policy",


        "category": "LUCKY_PLAN",


        "summary": "Consequences of missed Lucky Plan EMI payments, escalation ladder, cure period, and subscription termination rules.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# EMI Subscription Default Policy





This policy defines what happens when a Lucky Plan EMI subscriber misses or delays a payment, and the escalation process that follows.





## 1. EMI Due Date and Grace Period





EMI is due on the date stated in the subscription schedule. A grace period of **[X] days** (as stated in the subscription contract) applies from the due date before an EMI is treated as overdue.





## 2. Overdue EMI Stage 1: Reminder





**Days 1-7 after due date (within grace period or immediately after):**


- Automated reminder by WhatsApp or SMS


- Follow-up call from our customer support team


- No penalty applied within the grace period





## 3. Overdue EMI Stage 2: Draw Eligibility Suspension





**After grace period expiry (Day 7 onwards):**


- The Lucky ID associated with the subscription is **suspended from the current month's draw**


- A formal demand notice is sent by WhatsApp and email


- Late payment charge (as stated in the contract) may be applied





## 4. Overdue EMI Stage 3: Subscription Review





**After 30 days overdue:**


- Subscription is placed in **Review** status


- Warranty support, service appointments, and account-related services may be held


- Further draw eligibility is suspended until all dues are cleared


- A formal notice is issued with a final cure period





## 5. Overdue EMI Stage 4: Default and Repossession





**After 60 days overdue (or as stated in the contract):**


- Subscription is declared in **Default**


- Subidha Furniture may initiate repossession of the product under the **Repossession Policy**


- Outstanding dues (overdue EMIs + late charges + repossession costs) become recoverable


- Legal recovery action may be initiated





## 6. Curing a Default





A subscriber may cure a default by:


1. Paying all overdue EMIs, late charges, and repossession costs (if incurred) in full


2. Confirming payment with our support team


3. Receiving written reinstatement confirmation





Reinstatement restores the subscription and draw eligibility from the next EMI cycle, subject to management approval.





## 7. Waiver of Rights on Default





On final default:


- All future draw eligibility and waiver entitlements are permanently forfeited


- Previously drawn waiver benefits already applied are not reversed





## 8. Contact for Payment Issues





If you are experiencing difficulty making a payment, contact us **before** the due date to discuss:


- **Phone/WhatsApp:** {phone}


- **Email:** {email}





Early communication helps us find a resolution without escalation.


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 21. LUCKY DRAW RULES AND FAIRNESS POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "lucky-draw-rules-fairness",


        "title": "Lucky Draw Rules and Fairness Policy",


        "category": "LUCKY_PLAN",


        "summary": "Cryptographic draw method, eligibility verification, result publication, audit controls, and fairness guarantees.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Lucky Draw Rules and Fairness Policy





This policy defines the technical and procedural rules governing the Lucky Plan monthly draw to ensure it is fair, transparent, and auditable.





## 1. Draw Scope





One draw is conducted per active Lucky Plan batch each month. The draw selects one eligible Lucky ID from the batch. No cross-batch draws are conducted.





## 2. Eligibility Verification (Pre-Draw)





Before the draw, our system generates a verified list of eligible Lucky IDs for each batch:


- Subscription must be ACTIVE (not cancelled, suspended, or in default)


- All EMIs due on or before the draw date must be confirmed as PAID


- The Lucky ID must not have been previously excluded due to fraud, dispute, or court order





The eligibility list is locked at the time of draw execution. No additions or modifications are permitted after the lock.





## 3. Draw Method





The draw uses a **cryptographically secure random number generator (CSPRNG)** to select one Lucky ID from the eligible list:


- The system generates a random seed using a secure entropy source


- The seed is applied to select one index from the eligible Lucky ID list


- The selection process is irreversible and non-repeatable with the same seed





## 4. Draw Record and Audit Trail





For every draw, the following are recorded in an immutable audit log:


- Batch reference and draw date/time (UTC timestamp)


- Total number of eligible Lucky IDs


- Random seed (hash) used


- Winning Lucky ID


- System operator and authorising admin


- Draw outcome signed with system integrity hash





This record is tamper-evident. Any modification to the record is detectable through log integrity checks.





## 5. Result Publication





Draw results are published to:


- The winning customer through registered contact details (phone/WhatsApp/email)


- The customer portal (visible to all batch participants Lucky ID only, not personal name)


- The admin governance dashboard (full details visible to authorised admin)





Results are published within 2 working days of the draw.





## 6. Winner Benefit Application





After the draw result is confirmed and the winner acknowledges:


- Future unpaid EMIs for the winner's subscription are waived


- A Waiver Settlement Record is generated and shared with the winner


- The waiver is applied to the subscription account within 7 working days





## 7. Dispute and Challenge





A participant may challenge a draw result within **7 days** of publication by providing:


- Their Lucky ID and subscription reference


- EMI payment proof for all due instalments


- Reason for challenge





Disputes are reviewed against the audit log and eligibility records. We provide a written response within 15 business days. The audit log is the authoritative record.





## 8. Fairness Commitment





Subidha Furniture commits:


- All eligible Lucky IDs have equal probability of selection


- No Lucky ID is favoured, pre-selected, or excluded other than on the objective eligibility criteria above


- Staff and management Lucky IDs (if any exist in a batch) are subject to the same rules as customer Lucky IDs


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 22. SECURITY DEPOSIT POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "security-deposit-policy",


        "title": "Security Deposit Policy",


        "category": "RENT_LEASE",


        "summary": "Security deposit collection, permitted deductions, refund timeline, and customer rights for rent/lease contracts.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Security Deposit Policy





Subidha Furniture collects a security deposit from customers entering a rent/lease contract. The deposit is held as security against unpaid rent, damage, and other contractual obligations. This policy defines how the deposit is collected, held, used, and refunded.





## 1. Deposit Amount





The security deposit amount is stated in the rent/lease contract. It is typically equivalent to **[X] months' rent** as agreed at contract signing. The specific amount may vary based on the product value, contract duration, and customer risk profile.





## 2. Payment of Deposit





- The deposit must be paid in full before possession of the product is handed over


- The deposit is separate from the first month's rent (both are payable before possession)


- A receipt is issued for the deposit payment





## 3. How the Deposit is Held





The deposit is held by Subidha Furniture as a trust amount for the duration of the contract. It is:


- Not applied to monthly rent payments (unless agreed in writing at contract closure)


- Not interest-bearing (unless stated in the contract)





## 4. Permitted Deductions from Deposit





At contract closure, the following may be deducted from the security deposit:


- Outstanding rent, late payment charges, or other dues under the contract


- Cost of repairing damage to the product beyond fair wear and tear (assessed per **Return Damage Inspection Policy**)


- Cost of missing components, accessories, or packaging


- Transport/pick-up charges if the product must be collected by us due to customer default


- Any outstanding cleaning charges





An itemised statement of deductions will be provided in writing.





## 5. What is NOT Deducted





- Normal wear and tear (minor surface scratches from regular use, slight fading of fabric over time)


- Pre-existing damage documented in the possession record at handover





## 6. Deposit Refund





The balance of the deposit (after all deductions) is refunded:


- **Method:** Refund to the original payment mode (UPI, bank transfer, or cash where applicable)


- **Timeline:** Within **7-15 working days** after:


  - All outstanding dues are cleared


  - The product has been returned and inspected


  - The closure sign-off is completed by our finance team





## 7. Dispute of Deductions





If you dispute any deduction:


1. Request an itemised statement of deductions


2. Review against the original possession handover record and photographs


3. Raise a dispute under the **Grievance Policy** within 15 days of receiving the deduction statement





## 8. Early Contract Termination





If the contract is terminated early by the customer (before minimum tenure):


- Deposit refund is subject to the notice period and early closure terms in the contract


- A break-clause charge (if specified in the contract) may be deducted from the deposit


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 23. POSSESSION AND HANDOVER POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "possession-handover-policy",


        "title": "Possession and Handover Policy",


        "category": "DELIVERY",


        "summary": "Product handover process, condition documentation, customer sign-off, and evidence standards for rent/lease.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Possession and Handover Policy





This policy defines the process for handing over furniture products to customers under rent/lease contracts, and for receiving products back at contract closure. A thorough handover process protects both the customer and Subidha Furniture.





## 1. Pre-Handover Checklist





Before handing over the product, our team verifies:


- Contract is executed and signed


- Security deposit payment is confirmed


- First month's rent is confirmed


- KYC and address verification is complete


- Product has been inspected and prepared





## 2. Handover Documentation





At the time of delivery/possession, a **Possession and Handover Record** is prepared capturing:


- Product details (model, asset number, serial number if applicable)


- Condition at handover (description + photographs)


- Number and condition of any accessories (remote controls, keys, cushions, legs, etc.)


- Delivery address confirmed


- Date and time of handover


- Names and signatures of our delivery staff and the receiving customer/representative





Both parties receive a copy of the Possession Record.





## 3. Photographs at Handover





Photographs are taken of:


- Overall product condition (all four sides and top)


- Any pre-existing marks, scratches, or blemishes (documented to protect the customer from future deductions)


- Accessories and packaging





These photographs are stored in our system and referenced at return inspection.





## 4. Customer Responsibilities at Handover





The customer must:


- Inspect the product carefully at the time of handover


- Raise any concern about condition, missing components, or damage **before signing** the Possession Record


- Sign the record to confirm receipt in the documented condition





Signing the record confirms agreement with the recorded condition. Post-handover claims of pre-existing damage not recorded at handover will be assessed against the photographic evidence.





## 5. Return Handover (at Contract Closure)





At contract closure:


- A Return Inspection is conducted by our team at the customer's premises or at our depot


- Product condition is assessed against the original Possession Record and photographs


- A Return Condition Report is prepared


- Any deductions for damage are itemised and communicated to the customer


- Customer signs or acknowledges the Return Condition Report





See the **Return Damage Inspection Policy** and **Security Deposit Policy** for details on deductions and deposit refund.





## 6. Dispute of Handover Condition





If a customer disputes the condition recorded at handover or at return, the photographic evidence in our system is the primary reference. The customer may raise a formal dispute under the **Grievance Policy**.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 24. RETURN DAMAGE INSPECTION POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "return-damage-inspection-policy",


        "title": "Return Damage Inspection Policy",


        "category": "RENT_LEASE",


        "summary": "Process and standards for assessing product condition at return, distinguishing fair wear from customer damage.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Return Damage Inspection Policy





When a rent/lease product is returned at contract closure, or when a direct sale product is returned under the Refund and Cancellation Policy, Subidha Furniture conducts a Return Damage Inspection to assess the product's condition and determine any charges.





## 1. What is a Return Inspection





A Return Inspection is a structured review of the returned product's condition against:


- The original **Possession and Handover Record** and photographs


- The product's expected condition after fair wear and tear for the period of use





## 2. Fair Wear and Tear (Not Chargeable)





The following are considered normal fair wear and tear and are **not chargeable**:


- Minor surface scratches consistent with careful domestic use


- Slight fading of fabric or finish due to normal exposure to light


- Small, non-structural marks from normal cleaning


- Minor loosening of joints after extended use (repaired as part of normal maintenance)





## 3. Customer Damage (Chargeable)





The following are considered customer damage and **may be charged**:


- Burns, stains, water damage, or chemical damage


- Structural damage (broken legs, cracked frames, bent components)


- Rips, tears, or punctures in fabric or surface material


- Damage caused by misuse (overloading, use outside intended purpose)


- Missing components, accessories, or hardware


- Damage from pet clawing, gnawing, or scratching


- Graffiti, paint, or modification marks


- Damage caused by unauthorised repair attempts





## 4. Inspection Process





1. Our technician visits the return location (or inspects at our depot after pick-up)


2. Product is compared against original Possession Record photographs


3. Each area of damage is photographed and described


4. A **Return Condition Report** is prepared detailing:


   - Each damage item


   - Repair/replacement cost estimate


   - Whether it is fair wear or customer damage


5. The report is shared with the customer before any deposit deduction





## 5. Charging for Damage





- Damage charges are deducted from the security deposit


- If damage cost exceeds the deposit, the excess is invoiced and payable within 15 days


- Costs are based on actual repair/replacement quotes from our service team or authorised repair partner





## 6. Customer Rights





- Customer may be present during the inspection and photograph the condition themselves


- Customer may dispute any charge under the **Grievance Policy** within 15 days of receiving the Return Condition Report


- Subidha Furniture's photographic evidence at possession and return is the primary reference


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 25. DOCUMENT AND E-SIGN CONSENT POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "document-esign-consent",


        "title": "Document and e-Sign Consent Policy",


        "category": "COMPLIANCE",


        "summary": "Validity of digital contracts, e-signatures, and digital document acceptance under Indian law.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Document and e-Sign Consent Policy





Subidha Furniture uses digital documents, electronic signatures (e-signatures), and digital consent records for contracts, agreements, and authorisations. This policy explains the legal basis, how digital signing works, and customer rights.





## 1. Legal Basis for Digital Documents and e-Signatures





Digital documents and e-signatures are valid and enforceable in India under:


- **Information Technology Act, 2000 (IT Act)** - recognises electronic records and electronic signatures as legally valid


- **Indian Contract Act, 1872** - contracts may be formed electronically


- **Evidence Act, 1872** (as amended) - electronic records are admissible as evidence





An e-signature applied through our system (OTP, click-to-accept, or digital signature pad) is a valid signature under these laws.





## 2. Types of Documents Signed Digitally





- Lucky Plan Subscription Contracts


- Rent/Lease Contracts


- Possession and Handover Records


- Waiver Settlement Records


- Contract Amendments


- Customer consent forms (data requests, communication consent)





## 3. How Digital Signing Works





1. The document is presented to the customer on screen or sent via WhatsApp/email


2. The customer reviews the document


3. Signing is completed by one of:


   - Entering a one-time password (OTP) sent to the registered phone


   - Clicking "I Accept" and providing a typed or touchscreen signature


   - Signing on a digital signature pad at our showroom


4. The signed document with timestamp and customer identity reference is stored in our system





## 4. Customer Rights





- You may request a copy of any digitally signed document at any time


- You may decline digital signing and request a physical paper contract contact us to arrange this


- The signed record is retained in our system and available for download from your customer account





## 5. Validity and Dispute





A digitally signed document with our audit log is the authoritative contract record. Disputes about the content of a contract must be raised within the limitation period under applicable law.





## 6. Copies and Accessibility





A copy of every signed document is sent to the customer's registered email or WhatsApp immediately after signing. If you did not receive a copy, contact {phone} or {email}.


""".format(phone=_PHONE, email=_EMAIL),


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 26. DATA RETENTION AND DELETION POLICY


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "data-retention-deletion-policy",


        "title": "Data Retention and Deletion Policy",


        "category": "PRIVACY",


        "summary": "Retention schedules for customer data, financial records, contracts, and KYC under applicable Indian law.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Data Retention and Deletion Policy





Subidha Furniture retains personal data and business records only as long as necessary for the purposes they were collected and as required by applicable Indian law. This policy defines retention periods and the deletion process.





## 1. Retention Schedules





| Data Category | Retention Period | Legal Basis |


|---|---|---|


| GST tax invoices and receipts | Minimum 6 years from the end of the financial year | CGST Act, 2017 |


| Income tax records and books of account | Minimum 8 years from end of assessment year | Income Tax Act, 1961 s.44AA |


| Signed contracts (sale, EMI, rent/lease) | 3 years after contract closure + dispute limitation period | Limitation Act, 1963 |


| KYC and identity documents | Duration of relationship + 5 years after closure | Anti-fraud and legal compliance |


| Payment records and receipts | Minimum 8 years | Income Tax Act / CGST Act |


| Lucky Plan draw records | 7 years from the draw date | Audit and dispute record |


| Delivery and possession records | 3 years after contract closure | Dispute evidence |


| Warranty records | Warranty period + 3 years | Consumer Protection Act, 2019 |


| Customer support and grievance records | 3 years from closure | Consumer Protection Act, 2019 |


| Marketing consent records | Until consent withdrawn + 1 year | DPDP 2023 |


| Website/portal access logs | 1 year | Security and fraud prevention |


| CCTV footage (showroom) | 30 days (unless required for investigation) | Operational security |





## 2. Deletion After Retention Period





After the applicable retention period:


- Data is securely deleted from our production database


- Backup copies are purged in the next scheduled backup rotation cycle


- Where cloud storage is used, deletion is confirmed through the storage provider's deletion process





## 3. Early Deletion Requests





Customers may request early deletion under DPDP 2023 s.12 (see **Data Requests Policy**). Early deletion is granted where:


- The data is no longer needed for any lawful purpose, **and**


- No legal retention obligation applies





Where full deletion is not possible (due to tax, legal, or contract obligations), we will restrict processing of the data to the minimum required.





## 4. Anonymisation





Where full deletion is not possible, we may anonymise data (removing all identifying information) so it can be retained for statistical or operational purposes without constituting personal data processing.





## 5. Data Deletion Log





All deletions are logged with:


- Category of data deleted


- Date of deletion


- Reason and authority (retention period expiry, customer request, or admin action)


- System record confirmation





## 6. Contact





For data retention or deletion queries:


**Email:** {email}


**Phone:** {phone}


""".format(phone=_PHONE, email=_EMAIL),


    },





    # 


    # INTERNAL GOVERNANCE POLICIES (13)


    # 





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 27. PAYMENT REVERSAL AND VOID POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "payment-reversal-void-policy",


        "title": "Payment Reversal and Void Policy",


        "category": "PAYMENT",


        "summary": "Internal controls for reversing, voiding, or adjusting payment records with approval and audit requirements.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Payment Reversal and Void Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines internal controls for reversing, voiding, or adjusting payment entries in the Subidha Furniture accounting and payment system.





## 1. Scope





Applies to: cashiers, finance staff, admin users, and system operators handling payment reversals, voids, refunds, or corrections in the backend ERP system.





## 2. When a Reversal or Void is Permitted





A payment entry may be reversed or voided only if:


- The payment was recorded in error (wrong amount, wrong customer, wrong account mapping)


- A confirmed duplicate payment was received and verified


- A customer-approved refund has been processed and documented


- The payment was dishonoured (cheque bounce, UPI reversal, card chargeback)


- An approved journal correction is required after period close review





## 3. Approval Requirements





| Reversal Amount | Approval Required |


|---|---|


| Up to 5,000 | Senior cashier or finance officer |


| 5,001 25,000 | Finance manager or admin |


| Above 25,000 | Business owner (Pradip Roy) or designated authority |





No cashier may reverse their own payment entries. Segregation of duty is mandatory: the person who posted the payment must not be the same person who authorises the reversal.





## 4. Documentation Required





Every reversal must be supported by:


- Original payment reference (receipt number, transaction ID)


- Reason for reversal (written note in the system)


- Evidence of error or approval (customer communication, bank notification, or internal approval record)


- Approval record with approver name, timestamp, and authority level





## 5. Audit Trail





All reversals are logged in the audit trail with:


- Original payment entry


- Reversal entry


- User who requested and user who approved


- Timestamp


- Reason code





No silent reversal (without audit log entry) is permitted under any circumstance.





## 6. Period Close Restriction





No reversal affecting a closed accounting period is permitted without Finance Manager/owner approval and a corresponding journal correction with narrative explanation.





## 7. Customer Communication





When a reversal is made due to a customer request or error, the customer must be notified of:


- The reversal amount and date


- Estimated refund timeline (for refunds to customer)


- Updated account statement


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 28. ACCOUNTING POSTING POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "accounting-posting-policy",


        "title": "Accounting Posting Policy",


        "category": "COMPLIANCE",


        "summary": "Internal rules for journal entry posting, account mapping, double-entry integrity, and period control.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Accounting Posting Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the rules for posting, reviewing, and correcting accounting journal entries in the Subidha Furniture ERP system.





## 1. Double-Entry Requirement





Every accounting transaction must balance: total debits must equal total credits for each journal entry. No unbalanced journal is permitted in the system.





## 2. Source-to-Ledger Mapping





All transactions must be mapped to the correct ledger account:





| Transaction Type | Debit | Credit |


|---|---|---|


| Cash received (sale) | Cash / UPI Clearing | Sales Revenue |


| EMI received | Cash / UPI Clearing | EMI Receivable / Revenue |


| Rent received | Cash / UPI Clearing | Rental Income |


| Security deposit received | Cash / Bank | Security Deposit Liability |


| Vendor payment | Creditor / Vendor Payable | Cash / Bank |


| Lucky Plan waiver | Waiver Expense | EMI Receivable |


| Commission payout | Commission Expense | Cash / Bank |


| Refund paid | Customer Refund / Revenue | Cash / Bank |





See the **Finance Account Mapping Policy** for the full chart of accounts.





## 3. Posting Timing





- Transactions should be posted on the same business day they occur


- Backdated entries (more than 2 business days) require Finance Manager approval


- Period-close entries have a deadline stated in the monthly close schedule





## 4. No Silent Mutation





Posted journal entries must not be edited or deleted except through an approved reversal/amendment workflow (see **Payment Reversal and Void Policy**). Direct database edits to posted entries are prohibited.





## 5. Unposted Items





Unposted (bridge/draft) journal items must be reviewed and posted or rejected before period close. Carry-over of unposted items beyond the close date requires Finance Manager approval and explanation.





## 6. Audit Entries





Each journal entry must record:


- Source model and source transaction ID


- Transaction type and event description


- Amount, account codes, and currency


- Operator / system user who posted


- Timestamp (system-generated, not user-editable)





## 7. Applicable Scope





These posting rules apply to all business workflows: Lucky Plan EMI, direct sale, rent/lease, vendor purchase, payroll/commission, deposit handling, and any future commerce expansion.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 29. RECONCILIATION POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "reconciliation-policy",


        "title": "Reconciliation Policy",


        "category": "COMPLIANCE",


        "summary": "Internal rules for daily and monthly reconciliation of cash, UPI, bank, and accounting records.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Reconciliation Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the internal process for reconciling payment collections, bank records, UPI settlements, and accounting entries at Subidha Furniture.





## 1. Daily Reconciliation





Every cashier day-close includes a reconciliation of:


- Cash received vs. cash receipts issued


- UPI receipts vs. UPI app settlement reports


- Bank transfer confirmations vs. receipts issued


- Advance, deposit, and partial payments vs. system records


- Voids, reversals, and adjustments vs. approval records





Unmatched items must be noted in the day-close record with reason and evidence.





## 2. Monthly Bank Reconciliation





At month-end, the Finance Officer or admin must:


1. Download the bank statement for the period


2. Match each bank credit to a corresponding receipt in the system


3. Match each bank debit to a vendor payment, refund, or approved withdrawal


4. Identify and document: outstanding deposits, unpresented cheques, uncleared UPI credits


5. Prepare a signed Bank Reconciliation Statement





The Bank Reconciliation Statement is retained for 8 years (CGST / Income Tax Act compliance).





## 3. Evidence Standards





Each reconciliation exception requires:


- Amount, date, and payment mode


- Reference number (UPI transaction ID, bank reference, cheque number)


- Customer/subscription/invoice reference


- Screenshot or bank statement excerpt where relevant


- Resolution status and assigned staff





## 4. Resolution Paths





Reconciliation exceptions may only be resolved through:


- Match to an existing unmatched receipt or payment


- Mark as duplicate with reference to the original


- Reverse under the **Payment Reversal and Void Policy**


- Escalate to Finance Manager / admin for review and correction





No exception is to be closed with a description of "unknown" or "ignore" without Finance Manager approval.





## 5. Segregation of Duty





The cashier who collected the payment must not independently close a major reconciliation exception. Mismatches above 5,000 require Finance Manager or admin review before closure.





## 6. Period Close Control





Accounting period close or day-close must not be signed off with material unresolved reconciliation items. "Material" is defined as any single item above 500 or total unreconciled items above 2,000.





## 7. Audit Retention





All reconciliation records (daily close statements, bank reconciliation statements, exception registers) are retained for a minimum of 8 years.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 30. CASHIER DAY CLOSE POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "cashier-day-close-policy",


        "title": "Cashier Day Close Policy",


        "category": "PAYMENT",


        "summary": "Internal controls for daily cashier close, cash and UPI handover, mismatch resolution, and sign-off.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Cashier Day Close Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the daily cashier close procedure for Subidha Furniture's cash handling, UPI, and payment reconciliation controls.





## 1. Close Timing





Cashier day close must be completed by **6:00 PM** each business day, or immediately before shift handover if the shift ends earlier. The close must not be delayed unless pre-approved by the Finance Manager with a documented reason.





## 2. Pre-Close Review





Before initiating the close, the cashier must review:


- All cash receipts issued during the day


- All UPI payment notifications received on the registered business UPI ID


- All bank transfer confirmations received


- Any payment reversals or voids processed during the day


- Outstanding (unpaid) invoices, advances, and deposits pending for the day


- Any exceptions flagged during the day





## 3. Cash Count and Handover





- Count physical cash on hand


- Match cash count to receipts issued for cash payments


- Record any variance with reason


- Hand over cash to the safe or designated deposit bag with a cash handover receipt





## 4. UPI Settlement Review





- Cross-check UPI collections in the business UPI app/statement against receipts posted in the system


- Note any UPI credit received without a matching system receipt (unmatched inflow)


- Note any receipt in the system without a confirmed UPI credit (pending confirmation)





## 5. Mismatch Handling





Any mismatch between physical/bank collections and system records must be:


- Documented in the day-close record with: type, amount, reference, and reason


- Supported with evidence (UPI screenshot, bank SMS)


- Escalated to the Finance Manager if the mismatch is above 500





Mismatches are not resolved by adjusting numbers without evidence. Each resolution must follow the **Reconciliation Policy** and, where applicable, the **Payment Reversal and Void Policy**.





## 6. Day Close Sign-Off





After completing the above steps:


- The cashier marks the day-close as submitted in the ERP system


- The Finance Manager or designated admin reviews and approves the close


- A day-close report is generated and stored in the audit system





No new receipts or transactions may be back-dated to a closed day without Finance Manager approval.





## 7. Next-Day Opening





On the following business day:


- Carry-forward amounts (unresolved items from previous close) are reviewed first


- Any resolution of prior-day exceptions is documented before new-day transactions begin


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 31. FINANCE ACCOUNT MAPPING POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "finance-account-mapping-policy",


        "title": "Finance Account Mapping Policy",


        "category": "COMPLIANCE",


        "summary": "Chart of accounts, ledger mapping rules, and account code standards for all Subidha Furniture transactions.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Finance Account Mapping Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the chart of accounts and ledger mapping standards for Subidha Furniture's ERP accounting system.





## 1. Account Code Structure





Ledger accounts follow a structured code:





| Range | Category |


|---|---|


| 1000-1999 | Assets |


| 2000-2999 | Liabilities |


| 3000-3999 | Capital / Equity |


| 4000-4999 | Revenue |


| 5000-5999 | Cost of Goods Sold |


| 6000-6999 | Operating Expenses |


| 7000-7999 | Other Income |


| 8000-8999 | Other Expenses / Provisions |





## 2. Key Account Mappings





| Account | Code | Type |


|---|---|---|


| Cash in hand | 1001 | Asset |


| UPI Clearing Account | 1010 | Asset |


| Bank Current Account | 1020 | Asset |


| EMI Receivable | 1101 | Asset |


| Rent Receivable | 1102 | Asset |


| Inventory Furniture | 1201 | Asset |


| Security Deposit Liability | 2001 | Liability |


| GST Payable (Output) | 2010 | Liability |


| GST Input Credit | 1301 | Asset |


| Direct Sale Revenue | 4001 | Revenue |


| EMI / Subscription Revenue | 4002 | Revenue |


| Rental Income | 4003 | Revenue |


| Lucky Plan Waiver Expense | 6010 | Expense |


| Commission Expense | 6020 | Expense |


| Staff Commission Payable | 2020 | Liability |





## 3. New Account Creation





New ledger accounts may only be created by the Finance Manager or admin with:


- Approved account name and code


- Account type (asset, liability, revenue, expense)


- Description and applicable transaction types


- Approval logged in the system





## 4. Account Mapping Rules





- Every posted transaction must map to exactly one debit account and one credit account (or multiple, but balanced)


- Account codes may not be changed on posted entries


- Any mapping error must be corrected through the **Payment Reversal and Void Policy** reversal process





## 5. Annual Review





The chart of accounts is reviewed annually at financial year close. Inactive accounts (no transactions in 12 months) are flagged for archival.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 32. COMMISSION AND PARTNER PAYOUT POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "commission-partner-payout-policy",


        "title": "Commission and Partner Payout Policy",


        "category": "COMPLIANCE",


        "summary": "Internal rules for calculating, approving, and paying sales commissions and partner referral payouts.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Commission and Partner Payout Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines how sales commissions and partner referral payouts are calculated, approved, and disbursed at Subidha Furniture.





## 1. Commission-Eligible Events





Commission or referral payout is earned on:


- Direct sale on confirmed invoice and payment received


- Lucky Plan subscription on first EMI payment confirmed and subscription activated


- Rent/lease contract on security deposit and first month's rent confirmed





No commission is earned on cancelled, reversed, or defaulted transactions.





## 2. Commission Rates





Commission rates are defined in individual staff or partner agreements. Rates may vary by:


- Product category


- Transaction type (direct sale / EMI / rent)


- Sales channel (walk-in / digital / referral partner)


- Promotional period (special rates during campaigns)





Commission rates are not disclosed publicly. Staff and partners are notified of their applicable rates in their signed agreements.





## 3. Commission Calculation





- Commission is calculated by the Finance Officer at the end of each calendar month


- Each qualifying transaction is listed with amount, commission rate, and calculated payout


- A Commission Statement is prepared and shared with each eligible staff/partner for confirmation





## 4. Approval and Disbursement





- Commission Statement must be reviewed and approved by the Finance Manager or business owner before disbursement


- Payment is made by the 10th of the following month (unless otherwise stated in the agreement)


- Payment mode: bank transfer or UPI to the registered bank account of the staff/partner


- A payout receipt is issued and recorded in the accounting system





## 5. TDS (Tax Deducted at Source)





TDS is deducted on commission payments as applicable under the Income Tax Act, 1961 (typically s.194H for commission to non-employees). TDS certificates (Form 16A) are issued quarterly.





## 6. Disputes





Commission disputes must be raised in writing within 15 days of receiving the Commission Statement. The Finance Manager reviews and resolves disputes within 15 working days.





## 7. Audit





Commission records (statements, approvals, payment confirmations) are retained for 8 years.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 33. VENDOR PURCHASE POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "vendor-purchase-policy",


        "title": "Vendor Purchase Policy",


        "category": "COMPLIANCE",


        "summary": "Internal controls for vendor onboarding, purchase orders, goods receipt, invoice approval, and payment.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Vendor Purchase Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the internal process for purchasing furniture and materials from vendors, from vendor onboarding through to payment.





## 1. Vendor Onboarding





Before placing an order with a new vendor:


- Vendor name, address, GSTIN, PAN, and bank details must be recorded in the system


- A basic reference check or product quality assessment must be completed


- Vendor terms (payment days, return policy, delivery lead time) must be agreed and documented





## 2. Purchase Order





- A written/digital Purchase Order (PO) must be raised in the system before goods are ordered


- PO must specify: product description, quantity, unit price, GST, delivery date, delivery address


- PO must be approved by the Finance Manager or business owner for amounts above 10,000





## 3. Goods Receipt





- On delivery, staff must check the delivered goods against the PO (quantity, product, condition)


- A Goods Receipt Note (GRN) must be recorded in the system with date, quantity received, and any shortfall or damage noted


- Goods not matching the PO must be flagged for return or supplier resolution





## 4. Invoice Matching and Approval





- Vendor invoice must be matched to the PO and GRN before approval


- Three-way match: PO quantity  PO price = GRN quantity  Invoice amount (within tolerance)


- Invoice discrepancies must be resolved with the vendor before payment





## 5. Payment





- Payment is made only against a matched and approved invoice


- Payment is processed within the agreed credit period (or 45 days maximum per MSMED Act obligations)


- Payment requires Finance Manager or business owner approval for amounts above 10,000


- TDS is deducted on applicable payments (rent, professional fees, contract payments per Income Tax Act 1961)





## 6. GST Input Credit





- Valid vendor GST invoices (with correct GSTIN) are recorded for GST Input Tax Credit (ITC) claims


- ITC is reconciled with GSTR-2A/2B monthly before claiming





## 7. Vendor Payment Records





All purchase records (POs, GRNs, invoices, payments) are retained for 8 years.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 34. INVENTORY ADJUSTMENT POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "inventory-adjustment-policy",


        "title": "Inventory Adjustment Policy",


        "category": "COMPLIANCE",


        "summary": "Internal controls for stock adjustments, write-offs, and physical count reconciliation.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Inventory Adjustment Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the controls and approval requirements for adjusting inventory records in the Subidha Furniture ERP system.





## 1. When Adjustments are Permitted





Inventory adjustments are permitted for:


- Physical count discrepancy: actual stock differs from system stock after a count


- Damaged or defective stock: items that cannot be sold or used


- Write-off due to theft, loss, or irrecoverable damage


- Returned stock reintegration (product returned by customer in resalable condition)


- Opening balance correction (setup or migration errors)





## 2. Approval Requirements





| Adjustment Value (per item) | Approval Required |


|---|---|


| Up to 2,000 | Store manager |


| 2,001 10,000 | Finance Manager |


| Above 10,000 | Business owner (Pradip Roy) |





## 3. Physical Stock Count





A full physical inventory count must be conducted:


- At financial year end (before accounts are finalised)


- After any suspected theft or significant loss event


- Quarterly spot-checks for high-value items





The physical count is conducted by at least two staff members and results are signed off before system adjustment.





## 4. Adjustment Documentation





Every adjustment entry must include:


- Product reference (model, SKU, asset number)


- Quantity adjusted (+ or ")


- Reason code (count discrepancy, damage, write-off, return, correction)


- Supporting evidence (count sheet, damage photograph, theft report)


- Approval record





## 5. Write-Off Accounting





Write-offs are posted to the Inventory Write-Off expense account. For damaged items, photograph evidence must be retained. For theft, a police report reference must be recorded where applicable.





## 6. Audit





All adjustments are logged with the adjusting user, approving authority, timestamp, and reason. Inventory adjustment logs are retained for 8 years.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 35. CONTRACT AMENDMENT POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "contract-amendment-policy",


        "title": "Contract Amendment Policy",


        "category": "COMPLIANCE",


        "summary": "Internal controls for amending active contracts: approval, customer consent, documentation, and audit requirements.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Contract Amendment Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the process and controls for amending active customer contracts (Lucky Plan subscriptions, rent/lease contracts, direct sale credit agreements) at Subidha Furniture.





## 1. What Constitutes an Amendment





An amendment is any change to a signed, active contract that alters:


- Subscription or rent amount


- Due date or payment schedule


- Product or asset details (substitution)


- Contract tenure or minimum period


- Security deposit amount


- Delivery or possession address


- Terms or conditions





An amendment does NOT include: posting a payment, issuing a receipt, updating contact details, or correcting a typo in non-material fields.





## 2. Grounds for Amendment





Amendments are permitted for:


- Customer-requested changes (subject to business approval)


- Product substitution due to unavailability (with customer consent)


- Correction of clerical errors in the original contract


- Business-initiated changes with customer consent (e.g., GST rate change affecting rent)





## 3. Approval Requirements





- All amendments require written customer consent (signed amendment document or OTP-confirmed digital consent)


- Amendments affecting payment amounts above 1,000 per month require Finance Manager or business owner approval


- Amendments to Lucky Plan EMI amounts or tenure require business owner approval





## 4. Documentation





Each amendment must be supported by:


- Amendment request (customer request in writing or system record)


- Approval record (staff and authority level)


- Signed or OTP-confirmed amendment agreement


- Updated contract document shared with the customer





The original contract is retained alongside the amendment record. The amendment references the original contract.





## 5. System Update





After amendment approval and customer sign-off:


- The subscription/contract record in the ERP system is updated


- The audit trail records: original value, amended value, date, amending staff, approving authority, and customer consent reference





## 6. Invalid Amendments





Verbal or informal amendments (WhatsApp messages, handwritten notes) not supported by a signed amendment document are not valid. Staff must not make verbal promises to customers that contradict the signed contract without following this amendment process.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 36. ADMIN ACCESS AND ROLE CONTROL POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "admin-access-role-control-policy",


        "title": "Admin Access and Role Control Policy",


        "category": "COMPLIANCE",


        "summary": "Internal controls for ERP admin access, role assignments, password standards, and access review.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Admin Access and Role Control Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines access control, role assignment, and credential management standards for the Subidha Furniture ERP and backend administration system.





## 1. Principle of Least Privilege





Every staff member is granted the minimum level of system access required to perform their job function. No user is granted blanket admin access unless their role requires it.





## 2. Role Categories





| Role | Typical Access |


|---|---|


| Cashier | Post receipts, view customer accounts, submit day-close |


| Sales Staff | Create customers, raise quotations, view products and orders |


| Store Manager | All cashier and sales access + inventory management |


| Finance Officer | All store manager access + accounting, reconciliation, reversal (with approval) |


| Admin / Finance Manager | All access + user management, policy governance, reports |


| Business Owner | Full access |





Role assignments are maintained in the ERP user management module.





## 3. Account Creation and Offboarding





- New user accounts are created only upon written request approved by the business owner


- User details (name, phone, role, start date) are recorded in the staff register


- On employee exit: account is disabled within 24 hours of exit confirmation


- Shared accounts are not permitted; each staff member has a unique login





## 4. Password Standards





- Minimum 10 characters with uppercase, lowercase, number, and special character


- Passwords must not be shared with colleagues or written in visible locations


- Passwords must be changed every 90 days


- Any suspected compromise must be reported immediately to the admin password is reset within 2 hours





## 5. Admin Action Logging





All privileged admin actions (user creation, role change, policy change, bulk data action, financial override) are logged with:


- User identity


- Action type


- Affected records


- Timestamp





Admin logs are reviewed monthly by the business owner.





## 6. Access Review





- Quarterly: Finance Manager reviews all active user accounts and role assignments


- Annually: Full role access review by business owner


- Immediately: Review triggered by any data breach, staff exit, or suspicious activity





## 7. Remote Access





Remote access to the admin system is permitted only through approved devices and secure network connections. Access from public Wi-Fi is prohibited without VPN.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 37. AUDIT LOG RETENTION POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "audit-log-retention-policy",


        "title": "Audit Log Retention Policy",


        "category": "COMPLIANCE",


        "summary": "Internal standards for system audit log generation, integrity, retention period, and access controls.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Audit Log Retention Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the requirements for generating, protecting, and retaining audit logs in the Subidha Furniture ERP and backend systems.





## 1. What Must Be Logged





The following events must generate audit log entries:


- User login and logout (success and failure)


- Role and permission changes


- Customer account creation, update, or deletion


- Contract creation, amendment, or closure


- Payment posting, reversal, or void


- Inventory adjustment


- Lucky Plan draw execution and result


- Policy page publication, amendment, or archival


- Data export or bulk data action


- Admin configuration changes


- Data deletion actions





## 2. Audit Log Content





Each audit log entry must contain:


- Event type and description


- User ID and role


- Affected record (model, record ID)


- Before and after values (for updates)


- Timestamp (UTC, system-generated not user-editable)


- IP address (where available)


- Session ID





## 3. Log Integrity





- Audit logs must be immutable once written: no user (including admin) may edit or delete individual log entries


- Log integrity is verified through hash chaining or equivalent tamper-detection mechanism


- Any log integrity failure must be escalated to the business owner immediately





## 4. Retention Period





Audit logs are retained for a minimum of **7 years** from the date of the event:


- Financial transaction logs: 8 years (Income Tax Act compliance)


- Access and security logs: 5 years


- Policy governance logs: 7 years





## 5. Access to Audit Logs





- Audit logs are accessible only to Finance Manager, admin, and business owner roles


- Export of bulk audit logs requires business owner approval


- Customer-facing audit summaries (e.g., for disputes) may be shared in redacted form





## 6. Backup





Audit logs are included in the system backup schedule. Log backups are retained in accordance with the **Backup and Restore Policy**.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 38. BACKUP AND RESTORE POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "backup-restore-policy",


        "title": "Backup and Restore Policy",


        "category": "COMPLIANCE",


        "summary": "Internal standards for database backup frequency, retention, off-site storage, and restore testing.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Backup and Restore Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the backup and restore procedures for the Subidha Furniture ERP system, database, and critical business data.





## 1. What Must Be Backed Up





- Full ERP database (customers, contracts, subscriptions, payments, inventory, accounting, policy records)


- System configuration files and environment settings


- Uploaded documents (contracts, KYC scans, handover photographs)


- Audit logs





## 2. Backup Frequency





| Data Type | Backup Frequency |


|---|---|


| Full database | Daily (automated, after business close) |


| Transaction logs / incremental | Every 4 hours during business hours |


| Configuration files | Weekly |


| Uploaded documents | Daily |





## 3. Backup Storage and Retention





- Backups are stored in a secure, off-site or cloud storage location separate from the production server


- Backup encryption is required (AES-256 or equivalent)


- Retention: 30 days of daily backups; 12 months of weekly backups; 5 years of monthly backups


- Backup storage location and credentials are known only to the business owner and designated admin





## 4. Restore Testing





- A restore test must be conducted at least **quarterly**


- The test verifies: backup is accessible, decryptable, and restores to a functional database state


- Restore test results (date, backup tested, success/failure, time to restore) are logged





## 5. Restore Procedure





In the event of data loss or system failure:


1. Escalate to the business owner immediately


2. Identify the last known good backup


3. Restore to a staging environment first to verify integrity


4. Restore to production after confirmation


5. Verify data integrity against known records


6. Log the incident and restore action in the incident register





## 6. Incident Response





For data loss events, follow the **Incident and Data Breach Policy** for notification and reporting obligations.





## 7. Review





The backup and restore policy is reviewed annually or after any restore event.


""",


    },





    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    # 39. INCIDENT AND DATA BREACH POLICY (INTERNAL)


    # """""""""""""""""""""""""""""""""""""""""""""""""""""


    {


        "slug": "incident-data-breach-policy",


        "title": "Incident and Data Breach Policy",


        "category": "COMPLIANCE",


        "summary": "Internal procedures for identifying, containing, assessing, and reporting data breaches under DPDP 2023 s.8.",


        "default_status": DEFAULT_POLICY_STATUS,


        "content": """# Incident and Data Breach Policy





**Internal Governance Policy Not Customer-Facing**





This policy defines the internal process for identifying, containing, assessing, and reporting data security incidents and personal data breaches at Subidha Furniture, in compliance with the **Digital Personal Data Protection Act, 2023 (DPDP 2023) s.8**.





## 1. What is a Data Breach





A data breach is any confirmed or suspected incident where personal data held by Subidha Furniture is:


- Accessed without authorisation


- Disclosed to an unauthorised party


- Lost or destroyed accidentally


- Altered or corrupted without authorisation


- Stolen or exfiltrated





## 2. Identifying and Reporting an Incident





Any staff member, system alert, or third party who suspects a data breach must report it **immediately** (within 1 hour of detection) to:





**Data Protection Officer (DPO):** Pradip Roy


**Phone:** {phone}


**Email:** {email}





Do not delay reporting to investigate independently. Report first, investigate together.





## 3. Incident Response Steps





**Step 1 Contain (within 6 hours):**


- Identify and isolate the affected systems or accounts


- Revoke compromised credentials immediately


- Preserve evidence (logs, screenshots) without deleting affected data





**Step 2 Assess (within 24 hours):**


- Determine: what data was affected, how many Data Principals (customers) are impacted, how the breach occurred


- Classify severity: LOW / MEDIUM / HIGH / CRITICAL


- Document the breach in the Breach Incident Register





**Step 3 Notify (within 72 hours for HIGH/CRITICAL):**


- Report HIGH and CRITICAL breaches to the **Data Protection Board of India** as required by DPDP 2023 s.8


- Notify affected Data Principals (customers) if their data has been compromised in a manner that may cause harm


- Notification includes: nature of breach, data affected, steps taken, and customer guidance





**Step 4 Remediate:**


- Patch vulnerability or fix the root cause


- Restore from backup if data loss occurred (see **Backup and Restore Policy**)


- Review and strengthen access controls





**Step 5 Review (within 30 days):**


- Conduct a post-incident review


- Update policies, controls, and training as required





## 4. Breach Incident Register





Every breach (confirmed and suspected) is logged in the Breach Incident Register with:


- Reference number and date


- Severity classification


- Data categories and estimated number of affected individuals


- Description, root cause, and timeline


- Notification details (DPB, customers)


- Remediation actions and closure date





The register is maintained by the DPO and retained for 7 years.





## 5. Severity Classification





| Level | Definition | Notification |


|---|---|---|


| LOW | Internal incident, no personal data at risk, contained | Internal log only |


| MEDIUM | Limited personal data affected, no financial or sensitive data | DPO review, customer notification if risk of harm |


| HIGH | Significant personal data, financial data, or KYC affected | Notify DPB and affected customers |


| CRITICAL | Widespread breach, Aadhaar/PAN/payment data, or large customer base | Immediate DPB notification and customer notification |





## 6. Customer Notification





Affected customers are notified through their registered contact (WhatsApp, phone, email) with:


- What happened and when


- What personal data was affected


- What we are doing to contain and remediate


- What the customer should do (e.g., change passwords, monitor accounts)


""".format(phone=_PHONE, email=_EMAIL),


    },


]








_LEGACY_TOKENS = [
    ("Subidha Furniture", "[BUSINESS_NAME]"),
    ("subidhafurnitureasansol.com", "[WEBSITE_URL]"),
    ("Asansol, West Bengal", "[CITY], [STATE]"),
    ("Asansol", "[CITY]"),
    ("West Bengal", "[STATE]"),
]


def _tokenize(text: str) -> str:
    for literal, token in _LEGACY_TOKENS:
        text = text.replace(literal, token)
    return text


def get_default_policy_templates() -> list[dict]:
    """Return all 39 policy templates with business data replaced by tokens."""
    from copy import deepcopy
    templates = deepcopy(DEFAULT_POLICY_TEMPLATES)
    for t in templates:
        for field in ("title", "summary", "content"):
            if t.get(field):
                t[field] = _tokenize(t[field])
    return templates


