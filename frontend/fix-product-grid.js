const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/app/(public)/products/ProductGrid.tsx');
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/bg-\[linear-gradient\([^)]+\)\]/g, 'bg-card');
code = code.replace(/border-white\/75/g, 'border-border');
code = code.replace(/bg-white\/85/g, 'bg-card');
code = code.replace(/text-slate-500/g, 'text-muted-foreground');
code = code.replace(/text-slate-700/g, 'text-foreground');
code = code.replace(/text-slate-400/g, 'text-muted-foreground');
code = code.replace(/bg-white\/90/g, 'bg-muted');
code = code.replace(/border-slate-200\/80/g, 'border-border');
code = code.replace(/bg-white\/80/g, 'bg-card');
code = code.replace(/bg-white\/82/g, 'bg-card');
code = code.replace(/border-slate-300\/80/g, 'border-border');
code = code.replace(/bg-white(?!\/)/g, 'bg-card');
code = code.replace(/border-white\/80/g, 'border-border');

fs.writeFileSync(file, code);
console.log('Fixed ProductGrid.tsx');
