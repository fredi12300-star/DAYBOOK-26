import fs from 'fs';

const sqlPath = 'database/migrations/supbase.sql';
let sql = fs.readFileSync(sqlPath, 'utf8');

// Use a regex to find all CREATE POLICY blocks, even multi-line ones
// We want to capture the NAME and the TABLE.
// Syntax: CREATE POLICY "name" ON table_name ...
const createPolicyRegex = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+([\w\.]+)/gi;

let match;
const policies = [];
while ((match = createPolicyRegex.exec(sql)) !== null) {
    policies.push({
        name: match[1],
        table: match[2],
        index: match.index,
        fullMatch: match[0]
    });
}

// Sort policies backwards so we can inject without messing up indices
policies.sort((a, b) => b.index - a.index);

const lines = sql.split('\n');

// We'll work with lines for easier injection
for (const p of policies) {
    // Find which line this policy starts on
    let charCount = 0;
    let lineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const lineLen = lines[i].length + 1; // +1 for \n
        if (charCount <= p.index && p.index < charCount + lineLen) {
            lineIdx = i;
            break;
        }
        charCount += lineLen;
    }

    if (lineIdx !== -1) {
        // Check if a DROP exists within 5 lines above
        let hasDrop = false;
        for (let j = Math.max(0, lineIdx - 5); j < lineIdx; j++) {
            const lookback = lines[j];
            if (lookback.includes('DROP POLICY IF EXISTS') && lookback.includes(`"${p.name}"`) && lookback.includes(p.table)) {
                hasDrop = true;
                break;
            }
        }

        if (!hasDrop) {
            lines.splice(lineIdx, 0, `DROP POLICY IF EXISTS "${p.name}" ON ${p.table};`);
        }
    }
}

fs.writeFileSync(sqlPath, lines.join('\n'));
console.log(`Ensured idempotency for ${policies.length} policies.`);
