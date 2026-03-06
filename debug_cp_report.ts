
import { createClient } from '@supabase/supabase-js';


// Load env vars
// In this environment, we need to manually load from .env.local or similar if not present
// But we can try to use the ones from the user session if available.
// Since we are running in the user's terminal via run_command usually, we can expect process.env to be populated?
// Actually, `run_command` in this environment might not have the .env loaded unless we load it.
// I'll assume standard Vite/Supabase env vars are needed.


const SUPABASE_URL = 'https://qgoqminjgrwzukscdaez.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dAqtHARSx-E7dA3OnuATKg_6gRnCOnD';


const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function debug() {
    console.log('Starting debug...');

    // 1. Find Ledger "Customer Receivables"
    const { data: ledgers, error: lError } = await supabase
        .from('ledgers')
        .select('*')
        .ilike('ledger_name', '%Customer Receivables%');

    if (lError) {
        console.error('Error fetching ledgers:', lError);
        return;
    }

    if (!ledgers || ledgers.length === 0) {
        console.error('Customer Receivables ledger not found');
        return;
    }

    const ledger = ledgers[0];
    console.log('Found Ledger:', ledger.ledger_name, ledger.id);

    // 2. Find Party "JOMARIN"
    const { data: parties, error: pError } = await supabase
        .from('parties')
        .select('*')
        .ilike('party_name', '%JOMARIN%');

    if (pError) {
        console.error('Error fetching party:', pError);
        return;
    }

    if (!parties || parties.length === 0) {
        console.error('Party JOMARIN not found');
        return;
    }

    const party = parties[0];
    console.log('Found Party:', party.party_name, party.id);




    // 3. Test proposed OR query fix
    console.log('Testing proposed OR query fix...');
    const { data: orLines, error: orError } = await supabase
        .from('voucher_lines')
        .select(`
            *,
            voucher:vouchers!inner(
                id,
                party_id
            )
        `)
        .eq('ledger_id', ledger.id)
        .or(`party_id.eq.${party.id},voucher.party_id.eq.${party.id}`);

    if (orError) {
        console.error('OR Query Error:', orError);
    } else {
        console.log(`Found ${orLines?.length} lines with proposed OR query`);
        if (orLines && orLines.length > 0) {
            console.log('Sample OR Line:', orLines[0]);
        }
    }




    // 3. Replicate fetchPartyBalancesForLedger logic
    console.log('Replicating fetchPartyBalancesForLedger logic...');
    const { data: allLines, error: allLinesError } = await supabase
        .from('voucher_lines')
        .select(`
            amount,
            side,
            party_id,
            voucher:vouchers!inner(party_id)
        `)
        .eq('ledger_id', ledger.id);

    if (allLinesError) {
        console.error('Error fetching all lines for balance:', allLinesError);
    } else {
        const partyNet: Record<string, number> = {};
        allLines?.forEach(line => {
            // @ts-ignore
            const pid = line.party_id || line.voucher?.party_id;
            if (pid === party.id) {
                const amt = line.amount || 0;
                partyNet[pid] = (partyNet[pid] || 0) + (line.side === 'DR' ? amt : -amt);
                // Log the line contributing to balance
                console.log(`Found contributing line: Amount=${amt} ${line.side}, LineParty=${line.party_id}, VoucherParty=${line.voucher?.party_id}`);
            }
        });
        console.log(`Calculated Net Balance for JOMARIN: ${partyNet[party.id] || 0}`);
    }



    // 4. Mimic fetchLedgerStatement logic (original)


    const startDate = '2025-04-01'; // Assumption for current FY
    const endDate = '2026-03-31';

    console.log(`Fetching statement for Ledger ${ledger.id} and Party ${party.id}`);

    // Fetch lines
    const query = supabase
        .from('voucher_lines')
        .select(`
            *,
            voucher:vouchers!inner(
                id,
                voucher_no, 
                voucher_date, 
                narration, 
                created_at
            ),
            ledger:ledgers!inner(id, ledger_name, is_cash_bank, nature),
            line_party:parties(id, party_name)
        `)
        .eq('ledger_id', ledger.id)
        .eq('party_id', party.id)
        .order('voucher_date', { foreignTable: 'voucher', ascending: false })
        .limit(100);

    const { data: rawData, error: fetchError } = await query;

    if (fetchError) {
        console.error('Voucher Lines Query Error:', fetchError);
        return;
    }

    console.log(`Found ${rawData?.length} lines via direct query`);
    if (rawData && rawData.length > 0) {
        console.log('Sample Line:', rawData[0]);
    } else {
        console.log('No lines found directly. checking filtering logic.');
    }

    // Check Party Opening Balance
    console.log('Party Opening Balance:', party.opening_balance, party.opening_balance_side);

    // Check sumDataQuery equivalent (Balance B/F)
    // Assume start date is Today (if user didn't have FY set correctly)
    const today = new Date().toISOString().split('T')[0];

    const sumQuery = supabase
        .from('voucher_lines')
        .select('amount, side')
        .eq('ledger_id', ledger.id)
        .eq('party_id', party.id)
        .lt('voucher.voucher_date', today);
    // Note: nested filter on foreign table requires specific syntax or !inner join above.
    // We'll trust the direct query primarily.

}

debug().catch(console.error);
