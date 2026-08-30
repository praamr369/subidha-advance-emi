const fs = require('fs');
const content = fs.readFileSync('frontend/src/app/(dashboard)/admin/legacy-dashboard.tsx', 'utf8');
const lines = content.split('\n');
let index = lines.findIndex(l => l.includes("<OperationalCalendar />"));
if (index !== -1) {
    for (let i = Math.max(0, index - 20); i < Math.min(lines.length, index + 30); i++) {
        console.log(`${i}: ${lines[i]}`);
    }
}
