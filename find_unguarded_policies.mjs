import fs from 'fs';

const sqlPath = 'database/migrations/supbase.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');
const lines = sql.split('\n');

// Find CREATE POLICY lines that are NOT preceded by DROP POLICY IF EXISTS within 3 lines
const issues = [];
for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('CREATE POLICY')) continue;

    // Extract the policy name
    const match = t.match(/CREATE POLICY "([^"]+)"/);
    if (!match) continue;
    const policyName = match[1];

    // Look back 3 lines for matching DROP
    let hasDropGuard = false;
    for (let j = Math.max(0, i - 4); j < i; j++) {
        if (lines[j].includes(`DROP POLICY IF EXISTS`) && lines[j].includes(policyName)) {
            hasDropGuard = true;
            break;
        }
    }
    if (!hasDropGuard) {
        issues.push({ line: i + 1, policy: policyName, text: t });
    }
}

if (issues.length === 0) {
    console.log('✅ All CREATE POLICY statements have DROP POLICY IF EXISTS guards!');
} else {
    console.log(`Found ${issues.length} CREATE POLICY statements without DROP guards:`);
    issues.forEach(p => console.log(`  Line ${p.line}: "${p.policy}"`));
}
