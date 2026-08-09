const fs = require('fs');

const files = [
  'src/app/(public)/apply/ApplyPageClient.tsx',
  'src/app/(public)/contact/ContactLeadForm.tsx',
  'src/components/public/EmiJourneyTimeline.tsx',
  'src/components/public/immersive/CinematicStory.tsx',
  'src/components/public/ProductCategoryLanding.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const isClient = content.includes('"use client"') || content.includes("'use client'");
  const keyword = isClient ? 't' : 'dict';
  
  const componentRegex = /export\s+(default\s+)?(async\s+)?function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/;
  const componentMatch = componentRegex.exec(content);
  if (!componentMatch) return;
  
  const beforeComponent = content.substring(0, componentMatch.index);
  
  let modifiedBefore = beforeComponent;
  let varsToMove = [];
  
  // This regex matches `const NAME: TYPE = [ ... ]` or `{ ... }`
  const varRegex = /const\s+[a-zA-Z0-9_]+\s*(:\s*[a-zA-Z0-9_\[\]<>]+)?\s*=\s*(?:\[[\s\S]*?\]|\{[\s\S]*?\})\s*(?:as\s+const\s*)?;/g;
  let match;
  while ((match = varRegex.exec(beforeComponent)) !== null) {
      if (match[0].includes(`${keyword}.`) || match[0].includes(` ${keyword}(`) || match[0].includes(`${keyword}(`)) {
          varsToMove.push(match[0]);
          modifiedBefore = modifiedBefore.replace(match[0], '');
      }
  }
  
  if (varsToMove.length === 0) return;
  
  let afterComponent = content.substring(componentMatch.index);
  
  const initRegex = isClient ? /const\s+\{\s*t\s*\}\s*=\s*useI18n\(\);/ : /const\s+dict\s*=\s*getPublicDictionary\(locale\);/;
  afterComponent = afterComponent.replace(initRegex, (m) => {
      return m + '\n\n' + varsToMove.join('\n\n');
  });
  
  fs.writeFileSync(file, modifiedBefore + afterComponent);
  console.log(`Fixed typed constants in ${file}`);
});
