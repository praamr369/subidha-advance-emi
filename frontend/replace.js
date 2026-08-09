const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const targetDirs = [
    path.join(__dirname, 'src/app/(public)'),
    path.join(__dirname, 'src/components/public')
];

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.tsx')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });
    return arrayOfFiles;
}

let files = [];
targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        files = getAllFiles(dir, files);
    }
});

const extracted = JSON.parse(fs.readFileSync('extracted_strings.json', 'utf8'));

let filesModified = 0;

files.forEach(file => {
    if (file.endsWith(path.join('app', '(public)', 'page.tsx'))) return;

    let code = fs.readFileSync(file, 'utf8');
    const originalCode = code;

    const isClient = code.includes('"use client"') || code.includes("'use client'");
    let keyPrefix = path.basename(file, '.tsx').replace(/[^a-zA-Z0-9]/g, '');

    let keysForThisFile = Object.entries(extracted).filter(([key, val]) => key.startsWith(keyPrefix + "_"));
    if (keysForThisFile.length === 0) return;

    let hasReplacements = false;
    for (const [key, text] of keysForThisFile) {
        const replacementNode = isClient ? `{t('public.${key}')}` : `{dict.public.${key}}`;
        const replacementProp = isClient ? `t('public.${key}')` : `dict.public.${key}`;

        if (code.includes(`>${text}<`)) {
            code = code.replace(new RegExp(`>${escapeRegExp(text)}<`, 'g'), `>${replacementNode}<`);
            hasReplacements = true;
        }
        
        if (code.includes(`="${text}"`)) {
            code = code.replace(new RegExp(`="${escapeRegExp(text)}"`, 'g'), `={${replacementProp}}`);
            hasReplacements = true;
        }

        if (code.includes(`='${text}'`)) {
            code = code.replace(new RegExp(`='${escapeRegExp(text)}'`, 'g'), `={${replacementProp}}`);
            hasReplacements = true;
        }

        if (code.includes(`: "${text}"`)) {
            code = code.replace(new RegExp(`: "${escapeRegExp(text)}"`, 'g'), `: ${replacementProp}`);
            hasReplacements = true;
        }
    }

    if (!hasReplacements) return;

    if (isClient) {
        if (!code.includes('useI18n')) {
            code = `import { useI18n } from "@/components/i18n/I18nProvider";\n` + code;
            code = code.replace(/export (default )?function ([a-zA-Z0-9_]+)\s*\([^)]*\)\s*{/, (match) => {
                return `${match}\n  const { t } = useI18n();\n`;
            });
            code = code.replace(/export (const|let|var) ([a-zA-Z0-9_]+) = \([^)]*\) =>\s*{/, (match) => {
                return `${match}\n  const { t } = useI18n();\n`;
            });
        }
    } else {
        if (!code.includes('getDictionary')) {
            code = `import { getPublicDictionary } from "@/lib/public-i18n";\nimport { getPublicLocale } from "@/lib/public-i18n.server";\n` + code;
            
            code = code.replace(/export default function ([a-zA-Z0-9_]+)/, 'export default async function $1');
            code = code.replace(/export function ([a-zA-Z0-9_]+)/, 'export async function $1');

            code = code.replace(/export (default )?async function ([a-zA-Z0-9_]+)\s*\([^)]*\)\s*{/, (match) => {
                return `${match}\n  const locale = await getPublicLocale();\n  const dict = getPublicDictionary(locale);\n`;
            });
        }
    }

    if (code !== originalCode) {
        fs.writeFileSync(file, code);
        filesModified++;
    }
});

console.log(`Modified ${filesModified} files.`);

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}
