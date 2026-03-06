import fs from 'fs';

const sqlPath = 'database/migrations/supbase.sql';
let sql = fs.readFileSync(sqlPath, 'utf8');
const lines = sql.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('CREATE POLICY')) {
        // Extract policy name and table from the line
        // Standard pattern: CREATE POLICY "name" ON table ...
        const nameMatch = line.match(/CREATE POLICY "([^"]+)"/);
        const tableMatch = line.match(/ ON ([\w\.]+)/);

        if (nameMatch && tableMatch) {
            const policyName = nameMatch[1];
            const tableName = tableMatch[1];

            // Check if DROP already exists in previous 3 lines
            let hasDrop = false;
            for (let j = Math.max(0, newLines.length - 3); j < newLines.length; j++) {
                if (newLines[j].includes('DROP POLICY IF EXISTS') && newLines[j].includes(`"${policyName}"`) && newLines[j].includes(tableName)) {
                    hasDrop = true;
                    break;
                }
            }

            if (!hasDrop) {
                newLines.push(`DROP POLICY IF EXISTS "${policyName}" ON ${tableName};`);
            }
        }
    }
    newLines.push(line);
}

fs.writeFileSync(sqlPath, newLines.join('\n'));
console.log('Fixed unguarded CREATE POLICY statements.');
