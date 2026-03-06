import fs from 'fs';
import path from 'path';

const sqlPath = path.resolve('c:/Antigravity/Day Book/database/migrations/supbase.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

// 1. allow_cross_branch_reports
sql = sql.replace(/^\s*allow_cross_branch_reports BOOLEAN DEFAULT FALSE,\r?\n/gm, '');

// 2. scope_type
sql = sql.replace(/scope_type VARCHAR\(20\) NOT NULL CHECK \(scope_type IN \('GLOBAL', 'REGION', 'BRANCH'\)\)/g, "scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('GLOBAL'))");

// 3. remaining v_branch_id assignments in audit logs
sql = sql.replace(/^\s*IF TG_OP = 'DELETE' THEN v_branch_id := OLD\.branch_id;\r?\n/gm, '');
sql = sql.replace(/^\s*ELSE v_branch_id := NEW\.branch_id; END IF;\r?\n/gm, '');

// 4. Voucher reversal logic
sql = sql.replace(/^\s*IF v_original\.branch_id IS DISTINCT FROM p_branch_id THEN\r?\n\s*RAISE EXCEPTION 'PERMISSION_DENIED: Branch mismatch';\r?\n\s*END IF;\r?\n/gm, '');

// 5. Setup data inserts for branches
const branchInsertRegex = /-- Ensure default branches exist[\s\S]*?SELECT id INTO v_branch_id FROM public\.branches WHERE branch_code = 'MAIN' LIMIT 1;\r?\n/g;
sql = sql.replace(branchInsertRegex, '');

// 6. Remove v_branch_id from the ledger base data initialization
sql = sql.replace(/,\s*v_branch_id/g, '');

// 7. Remove 'SET branch_id = COALESCE( v_branch_id),'
sql = sql.replace(/^\s*SET branch_id = COALESCE\( v_branch_id\),\r?\n/gm, '');

// 8. Remove staff_branch_mapping policy blocks
const policyBlock = /-- staff_branch_mapping policy[\s\S]*?END IF;\r?\n/g;
sql = sql.replace(policyBlock, '');

// 9. Remove timezone alter table branches
const tzBlock = /-- 2\. Add timezone tracking to system and branches[\s\S]*?DEFAULT 'UTC';\r?\n/g;
sql = sql.replace(tzBlock, '-- 2. Add timezone tracking to system\nALTER TABLE public.system_configurations ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT \'UTC\';\n');

// 10. Clean up comments
sql = sql.replace(/\(branch-aware \+ optimistic lock\)/g, '(optimistic lock)');
sql = sql.replace(/\(branch-aware\)/g, '');
sql = sql.replace(/\(hierarchical, branch-aware\)/g, '(hierarchical)');

fs.writeFileSync(sqlPath, sql);
console.log('Final phase branches stripped');
