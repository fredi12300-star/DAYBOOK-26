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
    console.log('🔍 Logging in as Admin...');

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'demo@daybook.com',
        password: 'admin123'
    });

    if (loginError) {
        console.error('❌ Login Error:', loginError);
        return;
    }

    console.log('✅ Logged in as:', loginData.user.email);

    console.log('🔍 Attempting Maya Lookup via RPC...');

    const { data, error } = await supabase.rpc('update_user_auth_credentials', {
        p_email: 'maya@123.com'
    });

    if (error) {
        console.error('❌ RPC Error:', error);
        return;
    }

    if (data.success) {
        console.log('✅ Found Maya User ID:', data.user_id);

        const staffId = 'c56e1214-0cc3-4d15-b840-e61c644baec8'; // Previously found for MAYA

        console.log('🔍 Checking/Fixing Linkage...');

        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .upsert({
                id: data.user_id,
                staff_id: staffId,
                is_super_admin: false
            })
            .select()
            .single();

        if (profileError) {
            console.error('❌ Profile Linkage Error:', profileError);
        } else {
            console.log('✅ Linked to User Profile');
        }

        const { data: role } = await supabase.from('roles').select('id').eq('role_name', 'Accountant').single();
        if (!role) {
            console.error('❌ Accountant role not found');
            return;
        }

        console.log('✅ Found Accountant Role ID:', role.id);

        const { error: accessError } = await supabase
            .from('user_org_access')
            .upsert({
                user_id: data.user_id,
                role_id: role.id,
                scope_type: 'GLOBAL',
                is_active: true
            });

        if (accessError) {
            console.error('❌ Role Assignment Error:', accessError);
        } else {
            console.log('✅ Assigned Accountant Role');
        }

    } else {
        console.error('❌ RPC reported failure:', data.error);
    }
}

diagnose();
