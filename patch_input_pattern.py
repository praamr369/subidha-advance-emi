import sys

with open('frontend/src/components/admin/products/CatalogSpecificationFields.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    '<input className={common} value={typeof val === "string" ? val : ""} disabled={disabled} onChange={(e) => setVal(attr.slug, e.target.value)} />',
    '<input className={common} value={typeof val === "string" ? val : ""} disabled={disabled} pattern={attr.regex_validation || undefined} title={attr.regex_validation ? "Must match required format" : undefined} onChange={(e) => setVal(attr.slug, e.target.value)} />'
)

with open('frontend/src/components/admin/products/CatalogSpecificationFields.tsx', 'w') as f:
    f.write(content)
