import sys

with open('frontend/src/services/catalog.ts', 'r') as f:
    content = f.read()

content = content.replace(
    '  is_active: boolean;\n};\n\nexport type AttributeDefinition = {',
    '  is_active: boolean;\n  google_taxonomy_id?: string;\n};\n\nexport type AttributeDefinition = {'
)

content = content.replace(
    '  max_value: string | null;\n  is_active: boolean;',
    '  max_value: string | null;\n  regex_validation?: string;\n  is_active: boolean;'
)

with open('frontend/src/services/catalog.ts', 'w') as f:
    f.write(content)
