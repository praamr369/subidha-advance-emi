const fs = require('fs');
const path = require('path');

function mergeJson(targetFile, sourceFile) {
    if (!fs.existsSync(sourceFile)) {
        console.error(`Source file ${sourceFile} not found.`);
        return;
    }
    
    let targetObj = {};
    if (fs.existsSync(targetFile)) {
        targetObj = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    }
    
    const sourceObj = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    
    targetObj['public'] = sourceObj;
    
    fs.writeFileSync(targetFile, JSON.stringify(targetObj, null, 2));
    console.log(`Merged ${sourceFile} into ${targetFile}`);
}

const localesDir = path.join(__dirname, 'src/i18n/locales');

// Merge English
mergeJson(path.join(localesDir, 'en.json'), 'extracted_strings.json');

// Merge Hindi
mergeJson(path.join(localesDir, 'hi.json'), 'hi_strings.json');

// Merge Bengali
mergeJson(path.join(localesDir, 'bn.json'), 'bn_strings.json');
