import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
    const env = fs.readFileSync('.env', 'utf8');
    supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
    supabaseAnonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
} catch (e) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function diagnose() {
    console.log('🔍 Searching for Accountant via Email...');

    // 1. Search staff profiles by email
    const { data: staff } = await supabase
        .from('staff_profiles')
        .select('*')
        .ilike('email', '%accountant%');

    console.log('--- Staff Matching "accountant" ---');
    staff?.forEach(s => {
        console.log(`- ID: ${s.id}, Name: "${s.staff_name}", Email: ${s.email}`);
    });

    // 2. Search user profiles by email (though they might not have email field directly, let's try staff link)
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*, staff:staff_profiles(*)');

    console.log('\n--- User Profiles via Staff Email ---');
    profiles?.forEach(p => {
        if (p.staff?.email?.toLowerCase().includes('accountant')) {
            console.log(`- UserID: ${p.id}, Staff: ${p.staff?.staff_name}, Email: ${p.staff?.email}`);
        }
    });

    // 3. Just list every user profile to be sure
    console.log('\n--- ALL User Profiles ---');
    profiles?.forEach(p => {
        console.log(`- UserID: ${p.id}, StaffLinked: ${!!p.staff}, Name: ${p.staff?.staff_name || 'N/A'}`);
    });

    // 4. Check for ANY access records
    const { data: access } = await supabase.from('user_org_access').select('*, role:roles(*)');
    console.log('\n--- ALL Access Records ---');
    access?.forEach(a => {
        console.log(`- User: ${a.user_id}, Role: ${a.role?.role_name}, Active: ${a.is_active}`);
    });
}

diagnose();
