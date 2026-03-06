import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// simple .env parser
const envFile = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
    envFile.split('\n')
        .filter(line => line.includes('='))
        .map(line => line.split('=').map(p => p.trim()))
);

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // 1. Get recent vouchers
    const { data: vouchers, error: vErr } = await supabase
        .from('vouchers')
        .select('id, voucher_no, voucher_date, status, branch_id, financial_year_id')
        .order('created_at', { ascending: false })
        .limit(10);

    if (vErr) {
        console.error('Voucher Error:', vErr);
    } else {
        console.log('--- Recent 10 Vouchers ---');
        console.log(JSON.stringify(vouchers, null, 2));
    }

    // 2. Try fetching trial balance
    const { data: tb, error: tbErr } = await supabase.rpc('fetch_trial_balance_tally_v1', {
        p_start_date: '2020-01-01',
        p_end_date: '2030-12-31',
        p_include_drafts: false
    });

    if (tbErr) {
        console.error('TB Error:', tbErr);
    } else {
        const withActivity = (tb || []).filter(r => r.period_dr > 0 || r.period_cr > 0 || r.opening_dr > 0 || r.opening_cr > 0);
        console.log('\n--- TB Nodes with Activity ---');
        console.log(JSON.stringify(withActivity.map(r => ({ node: r.node_name, DR: r.period_dr, CR: r.period_cr })), null, 2));
    }
}

check();
