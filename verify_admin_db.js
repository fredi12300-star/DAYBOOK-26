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

async function verify() {
    console.log('🔍 Verifying Super Admin Status...');

    // 1. Get any Super Admin staff ID
    const { data: staff } = await supabase
        .from('user_profiles')
        .select('id, is_super_admin, staff:staff_profiles(*)')
        .eq('is_super_admin', true)
        .limit(1)
        .maybeSingle();

    if (!staff) {
        console.error('❌ No Super Admin found in user_profiles');
        return;
    }

    // 2. Find the user profile
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('staff_id', staff.id)
        .maybeSingle();

    if (!profile) {
        console.log('⚠️ No user_profile found for Demo Administrator. Searching by ID if we can... (skipping for now)');
    } else {
        console.log(`✅ Profile found: ID ${profile.id}, is_super_admin: ${profile.is_super_admin}`);
        if (!profile.is_super_admin) {
            console.log('🚀 Elevating Demo Administrator to Super Admin...');
            await supabase.from('user_profiles').update({ is_super_admin: true }).eq('id', profile.id);
            console.log('✅ Elevation complete.');
        }
    }

    // 3. Check for any other accounts with is_super_admin = true
    const { data: bosses } = await supabase.from('user_profiles').select('id').eq('is_super_admin', true);
    console.log(`📊 Total Super Admins in DB: ${bosses?.length || 0}`);
}

verify();
