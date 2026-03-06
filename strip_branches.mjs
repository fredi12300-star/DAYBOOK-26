import fs from 'fs';
import path from 'path';

const sqlPath = path.resolve('c:/Antigravity/Day Book/database/migrations/supbase.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

// 1. Remove the branches table creation
sql = sql.replace(/-- Branches[\s\S]*?CREATE TABLE IF NOT EXISTS public\.branches \([^;]*\);/g, '');

// 2. Remove branch_id column definitions in all tables
// E.g., branch_id UUID REFERENCES public.branches(id),
sql = sql.replace(/^\s*branch_id\s+UUID.*?,\r?\n/gm, '');
sql = sql.replace(/^\s*branch_id\s+UUID.*?(?=\n\s*\))/gm, '');

// 3. Remove v_branch_id variables in logic blocks
sql = sql.replace(/^\s*v_branch_id\s+UUID;\r?\n/gm, '');
sql = sql.replace(/^\s*IF TG_OP = 'DELETE' THEN v_branch_id := OLD\.branch_id;[\s\S]*?ELSE v_branch_id := NEW\.branch_id; END IF;\r?\n/g, '');
sql = sql.replace(/^\s*v_branch_id := NULL;\r?\n/gm, '');

// 4. Update trg_audit_logs to remove branch_id
sql = sql.replace(/INSERT INTO public\.system_audit_logs \(user_id, branch_id/g, 'INSERT INTO public.system_audit_logs (user_id');
sql = sql.replace(/VALUES \(v_user_id, v_branch_id/g, 'VALUES (v_user_id');

// 5. Remove p_branch_id parameters from functions
sql = sql.replace(/^\s*p_branch_id\s+UUID( DEFAULT NULL)?,\r?\n/gm, '');
sql = sql.replace(/^\s*p_branch_id\s+UUID( DEFAULT NULL)?(?=\r?\n\s*\))/gm, '');

// 6. Remove 'branch_id = p_branch_id,' lines in updates
sql = sql.replace(/^\s*branch_id = p_branch_id,?\s*\r?\n/gm, '');

// 7. Remove 'branch_id' from Insert statement column lists
// This is tricky using regex, let's target specific known ones from grep
sql = sql.replace(/session_id, branch_id, total_debit/g, 'session_id, total_debit');
sql = sql.replace(/p_session_id, p_branch_id, p_total_debit/g, 'p_session_id, p_total_debit');

sql = sql.replace(/session_ref, branch_id, status/g, 'session_ref, status');
sql = sql.replace(/p_session_ref, p_branch_id, p_status/g, 'p_session_ref, p_status');

sql = sql.replace(/,\s*branch_id\s*\)/g, ')');
sql = sql.replace(/,\s*p_branch_id\s*\)/g, ')');

// 8. Remove AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
sql = sql.replace(/^\s*AND \(p_branch_id IS NULL OR v\.branch_id = p_branch_id\)\s*\r?\n/gm, '');

// 9. Remove any trailing commas where p_branch_id was removed at the end of arg lists
// (Handled by formatting or strict replace, but let's be safe - we'll format it)

fs.writeFileSync(sqlPath, sql);
console.log('Successfully stripped branch logic from supbase.sql');
