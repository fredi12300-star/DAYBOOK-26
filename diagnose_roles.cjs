
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRoles() {
    const { data, error } = await supabase
        .from('roles')
        .select('id, role_name, is_system');

    if (error) {
        console.error('Error fetching roles:', error);
        return;
    }

    console.log('--- Current Roles ---');
    console.table(data);
}

checkRoles();
