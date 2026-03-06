import fs from 'fs';

const sql = fs.readFileSync('database/migrations/supbase.sql', 'utf8');
const lines = sql.split('\n');

// Track DO $$ blocks (standalone, not inside CREATE FUNCTION AS $$)
let doDepth = 0;
let fnDepth = 0;
let issues = [];

lines.forEach((line, i) => {
    const t = line.trim();

    // Function open (style 1: CREATE ... AS $$)  
    if (/CREATE OR REPLACE FUNCTION/.test(t) || /CREATE FUNCTION/.test(t)) {
        fnDepth++;
    }
    // Function close - all styles: $$ LANGUAGE xxx; or $$; or ); when using inline LANGUAGE
    if (/^\$\$\s+LANGUAGE\s+\w+/.test(t) || (/^\$\$;$/.test(t) && fnDepth > 0)) {
        if (fnDepth > 0) fnDepth--;
    }

    // DO block tracking (not inside a function)
    if (/^\s*DO\s+\$\$/.test(line)) {
        doDepth++;
    }
    if (/^\s*END\s+\$\$\s*;/.test(line)) {
        if (doDepth > 0) {
            doDepth--;
        } else {
            issues.push(`Line ${i + 1}: ORPHAN END $$ — ${t}`);
        }
    }
});

if (doDepth > 0) issues.push(`${doDepth} unclosed DO $$ block(s) remaining`);
if (fnDepth > 0) issues.push(`${fnDepth} unclosed FUNCTION block(s) remaining`);

if (issues.length === 0) {
    console.log('✅ SQL structure looks balanced!');
} else {
    console.log('Issues found:');
    issues.forEach(i => console.log(' ', i));
}
