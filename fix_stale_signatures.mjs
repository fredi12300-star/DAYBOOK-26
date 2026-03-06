import fs from 'fs';

const sqlPath = 'database/migrations/supbase.sql';
let sql = fs.readFileSync(sqlPath, 'utf8');

// Fix verify_day_v1: old (DATE, UUID, UUID, UUID) -> new (DATE, UUID, UUID)
// The 3rd UUID was p_branch_id, so remove it
sql = sql.replace(
    /public\.verify_day_v1\(DATE, UUID, UUID, UUID\)/g,
    'public.verify_day_v1(DATE, UUID, UUID)'
);

// Also check DROP IF EXISTS at line ~5530
sql = sql.replace(
    /DROP FUNCTION IF EXISTS public\.verify_day_v1\(.*?\);/g,
    'DROP FUNCTION IF EXISTS public.verify_day_v1(DATE, UUID, UUID);'
);

// Also fix get_daily_muster_summary_v1 if it had branch in signature
// Old: (DATE, UUID)  new: (DATE)
sql = sql.replace(
    /public\.get_daily_muster_summary_v1\(DATE, UUID\)/g,
    'public.get_daily_muster_summary_v1(DATE)'
);

// Also fix get_late_report_v1 (DATE, DATE, UUID) -> (DATE, DATE)
sql = sql.replace(
    /public\.get_late_report_v1\(DATE, DATE, UUID\)/g,
    'public.get_late_report_v1(DATE, DATE)'
);

// Scan for any remaining double-UUID in REVOKE/GRANT lines and print them
const lines = sql.split('\n');
const remaining = [];
lines.forEach((l, i) => {
    if (/REVOKE|GRANT EXECUTE/i.test(l) && /UUID,\s*UUID/.test(l)) {
        remaining.push((i + 1) + ': ' + l.trim());
    }
});

fs.writeFileSync(sqlPath, sql);

if (remaining.length === 0) {
    console.log('✅ All REVOKE/GRANT signatures are now clean!');
} else {
    console.log('⚠️  Still remaining double-UUID patterns in REVOKE/GRANT:');
    remaining.forEach(l => console.log(l));
}
