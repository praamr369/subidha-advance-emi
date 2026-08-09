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

let stringsToTranslate = {};

files.forEach(file => {
    // Skip already translated pages
    if (file.includes('page.tsx') && file.includes('app\\(public)')) return;
    
    const code = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    let keyPrefix = path.basename(file, '.tsx').replace(/[^a-zA-Z0-9]/g, '');
    let counter = 1;

    function visit(node) {
        if (ts.isJsxText(node)) {
            const text = node.getText().trim();
            // Basic heuristic to skip empty strings or code
            if (text.length > 0 && /[a-zA-Z]/.test(text) && !text.includes('{') && !text.includes('}')) {
                let key = `${keyPrefix}_text${counter++}`;
                stringsToTranslate[key] = text;
            }
        } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
            const text = node.initializer.text.trim();
            const attrName = node.name.getText();
            // Translate visual attributes only
            if (['title', 'description', 'eyebrow', 'label', 'alt', 'subtitle', 'text', 'placeholder'].includes(attrName)) {
                if (text.length > 0 && /[a-zA-Z]/.test(text)) {
                    let key = `${keyPrefix}_attr${counter++}`;
                    stringsToTranslate[key] = text;
                }
            }
        } else if (ts.isStringLiteral(node) && node.parent && ts.isPropertyAssignment(node.parent)) {
             const propName = node.parent.name.getText();
             if (['title', 'description', 'eyebrow', 'label', 'alt', 'subtitle', 'text', 'placeholder'].includes(propName)) {
                 const text = node.text.trim();
                 if (text.length > 0 && /[a-zA-Z]/.test(text)) {
                     let key = `${keyPrefix}_prop${counter++}`;
                     stringsToTranslate[key] = text;
                 }
             }
        } else if (ts.isStringLiteral(node) && node.parent && ts.isJsxExpression(node.parent)) {
             const text = node.text.trim();
             // Just a literal string inside an expression e.g. {"Hello"}
             if (text.length > 0 && /[a-zA-Z]/.test(text)) {
                 let key = `${keyPrefix}_expr${counter++}`;
                 stringsToTranslate[key] = text;
             }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
});

fs.writeFileSync('extracted_strings.json', JSON.stringify(stringsToTranslate, null, 2));
console.log(`Extracted ${Object.keys(stringsToTranslate).length} strings.`);
