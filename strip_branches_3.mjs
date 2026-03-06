import fs from 'fs';
import path from 'path';

const sqlPath = path.resolve('c:/Antigravity/Day Book/database/migrations/supbase.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

// 1. Remove staff_branch_mapping
sql = sql.replace(/-- Staff Branch Assignment[\s\S]*?CREATE TABLE IF NOT EXISTS public\.staff_branch_mapping \([^;]*\);/g, '');
sql = sql.replace(/ALTER TABLE public\.staff_branch_mapping ENABLE ROW LEVEL SECURITY;/g, '');
sql = sql.replace(/CREATE POLICY "RLS: staff_branch_mapping ALL" ON public\.staff_branch_mapping FOR ALL TO authenticated USING \(true\);/g, '');

// 2. Remove regions
sql = sql.replace(/-- Regions[\s\S]*?CREATE TABLE IF NOT EXISTS public\.regions \([^;]*\);/g, '');
sql = sql.replace(/region_id UUID REFERENCES public\.regions\(id\),?/g, '');
sql = sql.replace(/,\s*region_id\s+UUID/g, '');
sql = sql.replace(/region_id\s+UUID\s*,/g, '');

sql = sql.replace(/ALTER TABLE public\.regions ENABLE ROW LEVEL SECURITY;/g, '');
sql = sql.replace(/CREATE POLICY "RLS: regions ALL" ON public\.regions FOR ALL TO authenticated USING \(true\);/g, '');

// 3. Remove ALTER TABLE public.branches
sql = sql.replace(/ALTER TABLE public\.branches ENABLE ROW LEVEL SECURITY;/g, '');
sql = sql.replace(/CREATE POLICY "RLS: branches ALL" ON public\.branches FOR ALL TO authenticated USING \(true\);/g, '');

// 4. Clean up lists (like array of strings containing 'branches' or 'regions')
sql = sql.replace(/'branches',\s*/g, '');
sql = sql.replace(/'regions',\s*/g, '');
sql = sql.replace(/,\s*'branches'/g, '');
sql = sql.replace(/,\s*'regions'/g, '');

sql = sql.replace(/"staff_branch_mapping",\s*/g, '');
sql = sql.replace(/"branches",\s*/g, '');
sql = sql.replace(/"regions",\s*/g, '');
sql = sql.replace(/,\s*"staff_branch_mapping"/g, '');
sql = sql.replace(/,\s*"branches"/g, '');
sql = sql.replace(/,\s*"regions"/g, '');

sql = sql.replace(/{name:"staff_branch_mapping"},\s*/g, '');
sql = sql.replace(/{name:"branches"},\s*/g, '');
sql = sql.replace(/{name:"regions"},\s*/g, '');
sql = sql.replace(/,\s*{name:"staff_branch_mapping"}/g, '');
sql = sql.replace(/,\s*{name:"branches"}/g, '');
sql = sql.replace(/,\s*{name:"regions"}/g, '');

// 5. Final pass for variable assignments
sql = sql.replace(/status = 'staff_branch_mapping'/gi, "status = 'staff_master'");
sql = sql.replace(/-- Includes: Units, Regions\/Branches/g, '-- Includes: Units, Masters');

fs.writeFileSync(sqlPath, sql);
console.log('Stripped remaining related branch and region tables from supbase.sql');
