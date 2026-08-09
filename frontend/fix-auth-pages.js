const fs = require('fs');
const path = require('path');

function fixFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  code = code.replace(/text-\[var\(--foreground\)\]/g, 'text-foreground');
  code = code.replace(/text-\[var\(--muted-foreground\)\]/g, 'text-muted-foreground');
  code = code.replace(/bg-\[var\(--surface-card-elevated\)\]/g, 'bg-card');
  code = code.replace(/bg-\[var\(--surface-card\)\]/g, 'bg-card');
  code = code.replace(/bg-\[var\(--surface-muted\)\]/g, 'bg-muted');
  
  // Replace the image url
  code = code.replace(
    /bg-\[url\('https:\/\/images.unsplash.com\/photo-1497366216548-[a-zA-Z0-9]+\?auto=format&fit=crop&q=80'\)\]/g,
    "bg-[url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80')]"
  );

  fs.writeFileSync(file, code);
  console.log('Fixed', file);
}

fixFile(path.join(__dirname, 'src/app/(auth)/login/page.tsx'));
fixFile(path.join(__dirname, 'src/app/(auth)/register/page.tsx'));
fixFile(path.join(__dirname, 'src/components/auth/AuthLayoutShell.tsx'));
