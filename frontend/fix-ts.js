const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project({
    tsConfigFilePath: path.join(__dirname, 'tsconfig.json'),
});

const files = [
    'src/components/public/PoliciesRulesNavigator.tsx',
    'src/components/public/ProductCatalogueHero.tsx',
    'src/components/public/ProductCategoryLanding.tsx',
    'src/components/public/ProductDetailWorkflowBoundary.tsx',
    'src/components/public/ProductEnquiryHandoffPanel.tsx',
    'src/components/public/PublicOperationalDisclosure.tsx',
    'src/components/public/PublicStatsWidget.tsx',
    'src/components/public/PublicTrustStrip.tsx',
    'src/components/public/RentLeaseAnimatedHero.tsx',
    'src/components/public/RentLeaseComparison.tsx',
    'src/components/public/RentLeaseWorkflowPreview.tsx',
    'src/components/public/TrustPillars.tsx',
    'src/components/public/TrustStrip.tsx',
    'src/i18n/actions.ts'
];

files.forEach(filePath => {
    const file = project.getSourceFile(path.join(__dirname, filePath));
    if (!file) {
        console.log(`Could not find ${filePath}`);
        return;
    }

    if (filePath.endsWith('actions.ts')) {
        file.forEachDescendant(node => {
            if (node.getKind() === SyntaxKind.CallExpression) {
                const text = node.getText();
                if (text.startsWith('cookies().set')) {
                    node.replaceWithText(text.replace('cookies().set', '(await cookies()).set'));
                }
            }
        });
        file.saveSync();
        return;
    }

    const exportFuncs = file.getFunctions().filter(f => f.isExported());
    const exportArrowFuncs = file.getVariableStatements().filter(v => v.isExported() && v.getDeclarations()[0].getInitializerIfKind(SyntaxKind.ArrowFunction));

    let targetFunc = exportFuncs.length > 0 ? exportFuncs[0] : null;
    let targetArrowFunc = null;

    if (!targetFunc && exportArrowFuncs.length > 0) {
        targetArrowFunc = exportArrowFuncs[0].getDeclarations()[0].getInitializerIfKind(SyntaxKind.ArrowFunction);
    }

    const varDecls = file.getVariableStatements();
    const toMove = [];

    varDecls.forEach(v => {
        if (v.isExported()) return;
        const text = v.getText();
        if (text.includes('dict.public') || text.includes('t(\'public')) {
            toMove.push(text);
            v.remove();
        }
    });

    if (toMove.length > 0) {
        if (targetFunc) {
            const body = targetFunc.getBody();
            if (body && body.getKind() === SyntaxKind.Block) {
                // Insert after the dictionary declaration if present
                let insertIndex = 0;
                const statements = body.getStatements();
                const dictStmtIndex = statements.findIndex(s => s.getText().includes('getPublicDictionary') || s.getText().includes('useI18n'));
                if (dictStmtIndex !== -1) {
                    insertIndex = dictStmtIndex + 1;
                }
                body.insertStatements(insertIndex, toMove.join('\n\n'));
            }
        } else if (targetArrowFunc) {
            const body = targetArrowFunc.getBody();
            if (body && body.getKind() === SyntaxKind.Block) {
                let insertIndex = 0;
                const statements = body.getStatements();
                const dictStmtIndex = statements.findIndex(s => s.getText().includes('getPublicDictionary') || s.getText().includes('useI18n'));
                if (dictStmtIndex !== -1) {
                    insertIndex = dictStmtIndex + 1;
                }
                body.insertStatements(insertIndex, toMove.join('\n\n'));
            }
        }
        file.saveSync();
        console.log(`Fixed ${filePath}`);
    }
});
