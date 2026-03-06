import fs from 'fs';

const sqlPath = 'database/migrations/supbase.sql';
let sql = fs.readFileSync(sqlPath, 'utf8');

// Fix: trailing comma before a ) that may have blank lines in between
// Pattern: a line ending with , (possibly with whitespace after), followed by optional blank lines, then a ) line
let fixCount = 0;
sql = sql.replace(/(,)\s*\r?\n(\s*\r?\n)*(\s*\))/g, (match, comma, blanks, closeParen) => {
    fixCount++;
    return '\n' + closeParen;
});

fs.writeFileSync(sqlPath, sql);
console.log(`Fixed ${fixCount} trailing comma(s) before closing parentheses.`);
