import fs from 'fs';

const sql = fs.readFileSync('database/migrations/supbase.sql', 'utf8');

// Find any line ending with a comma (after optional whitespace) where the next non-blank line is a closing paren
const lines = sql.split('\n');
const hits = [];

for (let i = 0; i < lines.length; i++) {
    const cur = lines[i].replace(/\r$/, '').trimEnd();
    if (!cur.endsWith(',')) continue;

    // Look ahead skipping blank lines
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trimStart();
        if (next === '') continue;
        if (next.startsWith(')')) {
            hits.push((i + 1) + ': ' + cur);
        }
        break; // stop after first non-blank line
    }
}

if (hits.length === 0) {
    console.log('✅ NO trailing comma issues found — SQL is clean!');
} else {
    console.log('❌ Remaining trailing comma issues:');
    hits.forEach(h => console.log(h));
}
