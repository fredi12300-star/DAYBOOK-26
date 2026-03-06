import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
    envFile.split('\n')
        .filter(line => line.includes('='))
        .map(line => line.split('=').map(p => p.trim()))
);

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLedgerStatement() {
    // 1. Get Cash in Hand ledger ID
    const { data: ledgers } = await supabase.from('ledgers').select('id, ledger_name').eq('ledger_name', 'Cash in Hand');
    if (!ledgers || ledgers.length === 0) {
        console.error('Cash in Hand ledger not found');
        return;
    }
    const cashLedgerId = ledgers[0].id;
    console.log('Cash Ledger ID:', cashLedgerId);

    // 2. Fetch Ledger Statement
    const { data: stmt, error: stmtErr } = await supabase.rpc('fetch_ledger_statement_v1', {
        p_ledger_id: cashLedgerId,
        p_party_id: null,
        p_start_date: '2020-01-01',
        p_end_date: '2030-12-31',
        p_branch_id: null,
        p_limit: 1000,
        p_offset: 0
    });

    if (stmtErr) {
        console.error('RPC Error:', stmtErr);
    } else {
        console.log('Statement Data:', JSON.stringify(stmt, null, 2));
    }
}

checkLedgerStatement();
