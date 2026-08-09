import os
import ast

def add_missing_db_tables(filepath, app_name):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    tree = ast.parse(content)
    
    replacements = []
    
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            has_fields = any(isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Call) and getattr(stmt.value.func, 'attr', '').endswith('Field') for stmt in node.body)
            # Or if it inherits from TimeStampedModel
            inherits = any(getattr(b, 'id', '') == 'TimeStampedModel' for b in node.bases)
            
            if not (has_fields or inherits):
                continue
                
            has_meta = False
            has_db_table = False
            meta_node = None
            
            for stmt in node.body:
                if isinstance(stmt, ast.ClassDef) and stmt.name == 'Meta':
                    has_meta = True
                    meta_node = stmt
                    for meta_stmt in stmt.body:
                        if isinstance(meta_stmt, ast.Assign):
                            for target in meta_stmt.targets:
                                if getattr(target, 'id', '') == 'db_table':
                                    has_db_table = True
                                    
            if not has_db_table:
                # Add db_table
                table_name = f"subscriptions_{node.name.lower()}"
                
                # Where to insert?
                if has_meta:
                    # insert into existing Meta
                    replacements.append((meta_node.lineno, f'        db_table = "{table_name}"\n'))
                else:
                    # insert new Meta at the end of class or beginning
                    # easiest is to append at the end of class definition, but let's insert right after the class def
                    insert_line = node.lineno
                    replacements.append((insert_line, f'    class Meta:\n        db_table = "{table_name}"\n'))

    if not replacements:
        return

    # To avoid messing up line numbers, we apply from bottom up
    lines = content.split('\n')
    replacements.sort(key=lambda x: x[0], reverse=True)
    
    for lineno, text in replacements:
        lines.insert(lineno, text)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

if __name__ == "__main__":
    apps = ["contracts", "payments", "lucky_plan", "deliveries", "commissions", "products_core"]
    base_dir = r"C:\Users\Roy35\Desktop\subidha-advance-emi\backend"
    for app in apps:
        filepath = os.path.join(base_dir, app, "models.py")
        add_missing_db_tables(filepath, app)
