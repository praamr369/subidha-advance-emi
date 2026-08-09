const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'src/app/(public)');

function fixMetadata(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if there is an export const metadata that uses dict.
    if (!content.includes('export const metadata: Metadata =') || !content.includes('dict.public.')) {
        // if it uses dict.public somewhere, and has metadata. Let's see if metadata block uses it.
        // We'll just convert any export const metadata that contains dict.public.
        return;
    }

    // Find the full block of export const metadata: Metadata = ... ;
    // It usually ends with "});" or "};"
    // We can use a regex to capture it.
    const metadataRegex = /export\s+const\s+metadata:\s*Metadata\s*=\s*(buildPublicMetadata\(\{[\s\S]*?\}\)|{[\s\S]*?});/g;
    
    let match = metadataRegex.exec(content);
    if (!match) return;
    
    const metadataBlock = match[0];
    const metadataValue = match[1];

    if (!metadataBlock.includes('dict.public.')) return;

    console.log(`Fixing metadata in ${filePath}`);

    const generateMetadataFunc = `export async function generateMetadata(): Promise<Metadata> {\n  const locale = await getPublicLocale();\n  const dict = getPublicDictionary(locale);\n\n  return ${metadataValue};\n}`;
    
    content = content.replace(metadataBlock, generateMetadataFunc);
    
    // Ensure getPublicLocale and getPublicDictionary are imported
    if (!content.includes('getPublicLocale')) {
        content = `import { getPublicLocale } from "@/lib/public-i18n.server";\n` + content;
    }
    if (!content.includes('getPublicDictionary')) {
        content = `import { getPublicDictionary } from "@/lib/public-i18n";\n` + content;
    }
    
    fs.writeFileSync(filePath, content);
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            fixMetadata(fullPath);
        }
    });
}

walkDir(targetDir);
