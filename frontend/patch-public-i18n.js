const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/lib/public-i18n.ts');
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'export function getPublicDictionary(locale: PublicLocale) {',
  `import enDict from "@/i18n/locales/en.json";
import hiDict from "@/i18n/locales/hi.json";
import bnDict from "@/i18n/locales/bn.json";

export function getPublicDictionary(locale: PublicLocale) {`
);

code = code.replace(
  /const content = \{[\s\S]*?\} as const;/,
  `const content = {
    en: { ...(enDict.publicHome || {}), nav: enDict.nav, footer: enDict.footer, common: enDict.common, homePage: enDict.homePage, seo: enDict.seo, public: (enDict as any).public },
    hi: { ...(hiDict.publicHome || {}), nav: hiDict.nav, footer: hiDict.footer, common: hiDict.common, homePage: hiDict.homePage, seo: hiDict.seo, public: (hiDict as any).public },
    bn: { ...(bnDict.publicHome || {}), nav: bnDict.nav, footer: bnDict.footer, common: bnDict.common, homePage: bnDict.homePage, seo: bnDict.seo, public: (bnDict as any).public }
  } as any;`
);

fs.writeFileSync(file, code);
