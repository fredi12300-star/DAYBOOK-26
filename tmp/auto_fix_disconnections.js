import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function autoFix() {
    console.log("Starting Automated Security Cleanup...");

    // 1. Fetch all inactive staff
    const { data: inactiveStaff, error: sErr } = await supabase
        .from('staff_master')
        .select('id, full_name, staff_code')
        .eq('is_active', false);

    if (sErr) {
        console.error("Error fetching inactive staff:", sErr);
        return;
    }

    console.log(`Found ${inactiveStaff.length} inactive staff records.`);

    for (const staff of inactiveStaff) {
        // Check if they have a linked profile
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('staff_id', staff.id)
            .maybeSingle();

        if (profile) {
            console.log(`[ALERT] Staff ${staff.full_name} (${staff.staff_code}) is still CONNECTED. Revoking access...`);
            const { error: rpcError } = await supabase.rpc('rpc_disconnect_staff_account', {
                p_staff_id: staff.id
            });

            if (rpcError) {
                console.error(`- Failed to disconnect ${staff.full_name}:`, rpcError.message);
            } else {
                console.log(`- ✅ Successfully disconnected ${staff.full_name}.`);
            }
        }
    }

    console.log("Security Cleanup Complete.");
}

autoFix();
