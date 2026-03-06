import fs from 'fs';

const sql = fs.readFileSync('database/migrations/supbase.sql', 'utf8');
const lines = sql.split('\n');

// Find UPDATE statements that are immediately followed by a column assignment (missing SET)
// Pattern: line is "UPDATE public.something" and the next non-blank line does NOT start with SET or WHERE
const hits = [];
for (let i = 0; i < lines.length - 2; i++) {
    const cur = lines[i].trim().replace(/\r$/, '');
    if (!cur.toUpperCase().startsWith('UPDATE ')) continue;

    // Look ahead for next non-blank line
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const next = lines[j].trim().replace(/\r$/, '');
        if (next === '') continue;
        if (!next.toUpperCase().startsWith('SET') && !next.toUpperCase().startsWith('WHERE') && /\S\s*=\s*/.test(next)) {
            hits.push(`Line ${i + 1}: ${cur}`);
            hits.push(`  --> Next: ${next}`);
        }
        break;
    }
}

if (hits.length === 0) {
    console.log('✅ No UPDATE-without-SET issues found!');
} else {
    console.log('❌ UPDATE statements missing SET:');
    hits.forEach(h => console.log(h));
}
