
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyRoles() {
    console.log('--- Verifying Role Categories ---');
    const { data, error } = await supabase
        .from('roles')
        .select('role_name, category, is_system');

    if (error) {
        console.error('Error fetching roles:', error);
        return;
    }

    console.table(data);

    const issues = data.filter(r => {
        if (['Master Admin', 'User Admin'].includes(r.role_name) && r.category !== 'ADMIN') return true;
        if (!r.category) return true;
        return false;
    });

    if (issues.length > 0) {
        console.error('❌ Found issues with role classification:', issues);
    } else {
        console.log('✅ All roles are correctly classified.');
    }
}

verifyRoles();
