const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'src/components/public');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const isClient = content.includes('"use client"') || content.includes("'use client'");
    const keyword = isClient ? 't' : 'dict';
    
    // Check if the file has `dict` or `t` used outside
    // Quick heuristic: find where the component starts.
    const componentRegex = /export\s+(default\s+)?(async\s+)?function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/;
    const componentMatch = componentRegex.exec(content);
    if (!componentMatch) return;
    
    const beforeComponent = content.substring(0, componentMatch.index);
    if (!beforeComponent.includes(`${keyword}.`) && !beforeComponent.includes(` ${keyword}(`)) return; // not used outside

    console.log(`Fixing ${filePath}`);
    
    // We just find all `const NAME = ...;` in beforeComponent that use the keyword
    // and move them to just after the declaration of dict / t.
    let modifiedBefore = beforeComponent;
    let varsToMove = [];
    
    const varRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*(?:\[[\s\S]*?\]|\{[\s\S]*?\})\s*(?:as\s+const\s*)?;/g;
    let match;
    while ((match = varRegex.exec(beforeComponent)) !== null) {
        if (match[0].includes(`${keyword}.`) || match[0].includes(` ${keyword}(`)) {
            varsToMove.push(match[0]);
            modifiedBefore = modifiedBefore.replace(match[0], '');
        }
    }
    
    let afterComponent = content.substring(componentMatch.index);
    
    const initRegex = isClient ? /const\s+\{\s*t\s*\}\s*=\s*useI18n\(\);/ : /const\s+dict\s*=\s*getPublicDictionary\(locale\);/;
    afterComponent = afterComponent.replace(initRegex, (m) => {
        return m + '\n\n' + varsToMove.join('\n\n');
    });
    
    fs.writeFileSync(filePath, modifiedBefore + afterComponent);
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            fixFile(fullPath);
        }
    });
}

walkDir(targetDir);
