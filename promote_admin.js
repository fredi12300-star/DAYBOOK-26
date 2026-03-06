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

async function promote() {
    console.log('🔍 Authenticating as Admin to capture ID...');

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'demo@daybook.com',
        password: 'admin123'
    });

    if (loginError) {
        console.error('❌ Login failed:', loginError.message);
        return;
    }

    const userId = loginData.user.id;
    console.log('✅ Captured Admin User ID:', userId);

    // Now Promote
    console.log('🚀 Promoting to Super Admin in DB...');

    // First insure staff profile is linked to this ID if needed
    const { data: staff } = await supabase.from('staff_profiles').select('id').eq('email', 'demo@daybook.com').maybeSingle();

    const { error: profileError } = await supabase.from('user_profiles').upsert({
        id: userId,
        staff_id: staff?.id || null,
        is_super_admin: true
    });

    if (profileError) {
        console.error('❌ Promotion failed:', profileError.message);
    } else {
        console.log('✅ SUCCESS! OMNI-ACCESS promoted in Database.');
    }
}

promote();
