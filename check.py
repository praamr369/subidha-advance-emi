import sys
import re
import os

for root, dirs, files in os.walk("backend"):
    for file in files:
        if file.endswith(".py"):
            with open(os.path.join(root, file), "r", encoding="utf-8") as f:
                content = f.read()
                if "class EmiStatus" in content:
                    print(f"Found in {os.path.join(root, file)}")
                    match = re.search(r'class EmiStatus[^:]*:(.*?)(?=\nclass|\Z)', content, re.DOTALL)
                    if match:
                        print(match.group(0))
