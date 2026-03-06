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

async function checkStatus(staffId) {
    console.log(`Checking status for Staff ID: ${staffId}`);

    // 1. Check staff_master
    const { data: staff, error: sErr } = await supabase
        .from('staff_master')
        .select('full_name, is_active, staff_code')
        .eq('id', staffId)
        .single();

    if (sErr) console.error("Error fetching staff:", sErr);
    else console.log("Staff Master:", staff);

    // 2. Check exit_cases
    const { data: exitCase, error: eErr } = await supabase
        .from('exit_cases')
        .select('status, final_lwd')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (eErr) console.error("Error fetching exit case:", eErr);
    else console.log("Latest Exit Case:", exitCase);

    // 3. Check user_profiles
    const { data: profile, error: pErr } = await supabase
        .from('user_profiles')
        .select('id, staff_id')
        .eq('staff_id', staffId)
        .maybeSingle();

    if (pErr) console.error("Error fetching profile:", pErr);
    else console.log("Linked Profile:", profile);
}

const STAFF_ID = 'e4c842ba-43e9-46c4-ad07-560da220a8df';
checkStatus(STAFF_ID);
