const fs = require('fs');
const content = fs.readFileSync('frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx', 'utf8');
console.log(content.includes('OperationalCalendar />'));
console.log(content.includes('grid-cols-1 xl:grid-cols-4'));
