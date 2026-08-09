const fs = require('fs');
const path = require('path');

const targetDirs = [
    path.join(__dirname, 'src/app/(public)'),
    path.join(__dirname, 'src/components/public')
];

function fixUseClient(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Check if use client exists
    const useClientIndex = lines.findIndex(line => line.includes('"use client"') || line.includes("'use client'"));
    
    if (useClientIndex > 0) { // If it's not the first line
        const useClientLine = lines[useClientIndex];
        lines.splice(useClientIndex, 1); // Remove from current position
        lines.unshift(useClientLine);    // Add to the top
        fs.writeFileSync(filePath, lines.join('\n'));
        console.log(`Fixed use client position in ${filePath}`);
    }
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            fixUseClient(fullPath);
        }
    });
}

targetDirs.forEach(walkDir);
