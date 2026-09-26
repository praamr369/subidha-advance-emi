import sys

with open('frontend/src/services/pim/index.ts', 'r') as f:
    content = f.read()

content = content.replace(
    '  is_variant_defining: boolean;\n  min_value: string | null;\n  max_value: string | null;',
    '  is_variant_defining: boolean;\n  min_value: string | null;\n  max_value: string | null;\n  regex_validation?: string;'
)

content = content.replace(
    '  subcategories: PimSubcategory[];\n  attributes: PimCategoryAttribute[];',
    '  subcategories: PimSubcategory[];\n  attributes: PimCategoryAttribute[];\n  google_taxonomy_id?: string;'
)

with open('frontend/src/services/pim/index.ts', 'w') as f:
    f.write(content)
