import fs from 'fs';
import path from 'path';

const sqlPath = path.resolve('c:/Antigravity/Day Book/database/migrations/supbase.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

// 1. Remove Bank Branch (oh wait, bank_branch is okay, but I can rename it to `branch_name` or leave it. I'll leave it).
// No, the instruction was completely remove the branch concept. bank_branch in a bank_accounts table is different from our business branch_id.
// The user request was "there is no branch in this software, remove all branch id related things if any exist."
// `bank_branch` (like "HDFC MG ROAD") is fine, but I'll ignore it.

// 2. Fix broken SQL around l.branch_id
sql = sql.replace(/AND \(p_branch_id IS NULL OR l\.OR l\.branch_id IS NULL\)/g, '');

// 3. Remove "Ensure branch_id set for system ledgers" comment
sql = sql.replace(/-- Ensure branch_id set for system ledgers/g, '');

// 4. Remove ALTER TABLE public.branches if it's there
sql = sql.replace(/ALTER TABLE public\.branches.*?;\r?\n/g, '');

// 5. Remove trailing 'OR l.branch_id = p_branch_id' if any
sql = sql.replace(/OR\s+l\.branch_id\s*=\s*p_branch_id/g, '');

// 6. Fix "WHERE l.is_active = true \s* AND \s*\)" 
sql = sql.replace(/WHERE l\.is_active = true\s*\)/g, 'WHERE l.is_active = true\n    )');

fs.writeFileSync(sqlPath, sql);
console.log('Final 5 matches stripped');
