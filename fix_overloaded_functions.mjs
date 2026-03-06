import fs from 'fs';

const sqlPath = 'database/migrations/supbase.sql';
let sql = fs.readFileSync(sqlPath, 'utf8');

const drops = [
    {
        name: 'save_voucher_v1',
        target: 'CREATE OR REPLACE FUNCTION public.save_voucher_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.save_voucher_v1(UUID, UUID, UUID, DATE, TEXT, VARCHAR, UUID, UUID, DECIMAL, DECIMAL, VARCHAR, VARCHAR, VARCHAR, JSONB, TIMESTAMPTZ, UUID);'
    },
    {
        name: 'fetch_ledger_statement_v1',
        target: 'CREATE OR REPLACE FUNCTION public.fetch_ledger_statement_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.fetch_ledger_statement_v1(UUID, UUID, DATE, DATE, UUID, INTEGER, INTEGER);'
    },
    {
        name: 'fetch_trial_balance_tally_v1',
        target: 'CREATE OR REPLACE FUNCTION public.fetch_trial_balance_tally_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.fetch_trial_balance_tally_v1(DATE, DATE, BOOLEAN, UUID);'
    },
    {
        name: 'verify_day_v1',
        target: 'CREATE OR REPLACE FUNCTION public.verify_day_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.verify_day_v1(DATE, UUID, UUID, UUID);'
    },
    {
        name: 'get_daily_muster_summary_v1',
        target: 'CREATE OR REPLACE FUNCTION public.get_daily_muster_summary_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.get_daily_muster_summary_v1(DATE, UUID);'
    },
    {
        name: 'get_late_report_v1',
        target: 'CREATE OR REPLACE FUNCTION public.get_late_report_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.get_late_report_v1(DATE, DATE, UUID);'
    },
    {
        name: 'create_delay_incident_v1',
        target: 'CREATE OR REPLACE FUNCTION public.create_delay_incident_v1(',
        drop: 'DROP FUNCTION IF EXISTS public.create_delay_incident_v1(DATE, TEXT, UUID[], INTEGER, UUID, UUID, TIME, TIME);'
    }
];

let modified = false;
for (const d of drops) {
    // We search for the specific CREATE block and inject the drop before it.
    // If the drop already exists but with a wrong signature, we replace it.

    // Check if any DROP exists for this function name
    const dropPrefix = `DROP FUNCTION IF EXISTS public.${d.name}(`;
    const lines = sql.split('\n');
    let existingDropIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(dropPrefix)) {
            existingDropIdx = i;
            break;
        }
    }

    if (existingDropIdx !== -1) {
        if (lines[existingDropIdx].trim() !== d.drop.trim()) {
            console.log(`Updating existing drop signature for ${d.name}`);
            lines[existingDropIdx] = d.drop;
            sql = lines.join('\n');
            modified = true;
        }
    } else {
        if (sql.includes(d.target)) {
            console.log(`Adding new drop for ${d.name}`);
            sql = sql.replace(d.target, `${d.drop}\n${d.target}`);
            modified = true;
        }
    }
}

if (modified) {
    fs.writeFileSync(sqlPath, sql);
    console.log('Successfully updated supbase.sql with corrected DROP FUNCTION guards.');
} else {
    console.log('No additional changes needed.');
}
