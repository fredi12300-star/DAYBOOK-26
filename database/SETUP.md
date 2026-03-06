# Database Setup Guide

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to "SQL Editor" in the left sidebar

## Step 2: Run the Schema Script

1. Copy the entire contents of `database/schema.sql`
2. Paste into a new query in the SQL Editor
3. Click "Run" or press `Ctrl + Enter`

## What the Script Does

The schema script will:

✅ Create all necessary tables:
   - `ledger_groups` - Chart of accounts structure
   - `ledgers` - Master ledger heads
   - `voucher_types` - Transaction categories
   - `vouchers` - Transaction headers
   - `voucher_lines` - Journal entries
   - `templates` - Voucher templates
   - `template_lines` - Template details
   - `parties` - Customers/vendors
   - `voucher_sequences` - Auto-numbering
   - `audit_log` - Complete audit trail

✅ Create database functions:
   - `get_next_voucher_number()` - Concurrency-safe numbering
   - `update_voucher_totals()` - Auto-calculate totals

✅ Seed default data:
   - 12 Ledger Groups
   - 25+ Default Ledger Heads (Cash, Bank, Sales, etc.)
   - 12 Voucher Types
   - 6 Predefined Templates

## Step 3: Verify Installation

Run this query to verify:

```sql
SELECT COUNT(*) as ledgers_count FROM ledgers;
SELECT COUNT(*) as voucher_types_count FROM voucher_types;
SELECT COUNT(*) as templates_count FROM templates;
```

You should see:
- ~25 ledgers
- 12 voucher types  
- 6 templates

## Troubleshooting

**Error: relation already exists**
- If you're re-running the script, first drop all tables:
```sql
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS template_lines CASCADE;
DROP TABLE IF EXISTS templates CASCADE;
DROP TABLE IF EXISTS voucher_lines CASCADE;
DROP TABLE IF EXISTS vouchers CASCADE;
DROP TABLE IF EXISTS voucher_sequences CASCADE;
DROP TABLE IF EXISTS voucher_types CASCADE;
DROP TABLE IF EXISTS parties CASCADE;
DROP TABLE IF EXISTS ledgers CASCADE;
DROP TABLE IF EXISTS ledger_groups CASCADE;
```

Then run the schema.sql again.

## Next Steps

After database setup is complete:

1. Run `npm install` in the project directory
2. Run `npm run dev` to start the development server
3. Open http://localhost:1420
4. Start creating vouchers!

## Default Credentials

The database is ready to use immediately. No authentication setup is required in this version.

## Support

If you encounter any issues, check:
- Supabase project status
- Environment variables in `.env` file
- Console errors in browser developer tools
