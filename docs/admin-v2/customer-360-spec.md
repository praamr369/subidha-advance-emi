# Customer 360 Spec

Customer 360 is the first real Admin V2 workbench.

## Purpose

Give an admin one screen to understand the full customer relationship without jumping across many routes.

## Required data surfaces

- customer list
- search and filters
- create customer drawer
- edit customer drawer
- KYC panel
- business summary panel
- subscriptions panel
- EMI panel
- payments panel
- receipts panel
- direct sales panel
- rent / lease panel
- deliveries panel
- service / support panel
- timeline panel

## Primary backend source

Use the operational summary endpoint as the joined-data anchor:

- `GET /api/v1/admin/customers/{id}/operational-summary/`

## Behavior rules

- customer create stays in a drawer
- customer edit stays in a drawer
- KYC decisions must be backend-approved
- do not compute account balances in the browser
- do not fake payment or receipt history
- do not collapse subscriptions, deliveries, and service into one generic panel

## Recommended layout

Left column:

- customer list
- search
- filters

Center:

- summary cards
- tabs
- data grid

Right drawer:

- selected customer detail
- edit form
- timeline
- related records
- safe action buttons

## Empty and error states

- no customer selected
- no records found
- backend endpoint missing
- backend validation failed
- network error

## Acceptance note

The workbench is complete when an admin can open one customer and answer these questions without leaving the page:

- who is the customer
- what is the KYC status
- what contracts exist
- what is outstanding
- what has been paid
- what receipts exist
- what deliveries and support issues exist

