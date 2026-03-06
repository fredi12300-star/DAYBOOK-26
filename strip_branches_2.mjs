import fs from 'fs';
import path from 'path';

const sqlPath = path.resolve('c:/Antigravity/Day Book/database/migrations/supbase.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

// Remaining matches like p_branch_id without trailing comma, inside JSON payloads, arrays or function param lists
sql = sql.replace(/,\s*p_branch_id UUID\s*/g, '');
sql = sql.replace(/p_branch_id UUID\s*,\s*/g, '');

sql = sql.replace(/,\s*branch_id\s+UUID\s*/g, '');
sql = sql.replace(/branch_id\s+UUID\s*,\s*/g, '');

sql = sql.replace(/,\s*p_branch_id\s*=\s*p_branch_id/g, '');
sql = sql.replace(/,\s*branch_id\s*=\s*p_branch_id/g, '');
sql = sql.replace(/branch_id\s*=\s*p_branch_id\s*,?/g, '');

// Explicit arrays or argument lists
sql = sql.replace(/,\s*p_branch_id/g, '');
sql = sql.replace(/p_branch_id\s*,/g, '');

sql = sql.replace(/,\s*branch_id/g, '');
sql = sql.replace(/branch_id\s*,/g, '');

sql = sql.replace(/AND \(p_branch_id IS NULL OR v\.branch_id = p_branch_id\)/g, '');

fs.writeFileSync(sqlPath, sql);
console.log('Stripped remaining branches from supbase.sql');
