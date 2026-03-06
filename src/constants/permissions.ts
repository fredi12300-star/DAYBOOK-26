export const MODULE_CATEGORIES = [
    { id: 'intelligence', name: 'Intelligence' },
    { id: 'operations', name: 'Operations' },
    { id: 'masters', name: 'Masters' },
    { id: 'user_mgmt', name: 'User Management' },
    { id: 'admin', name: 'Administration' },
    { id: 'hr', name: 'HR Management' },
];

export const MODULES = [
    // Intelligence
    { id: 'dashboard', name: 'Main Dashboard', category: 'intelligence' },
    { id: 'reports', name: 'Financial Hub', category: 'intelligence' },

    // Operations
    { id: 'session', name: 'Add New TXN', category: 'operations' },
    { id: 'daybook', name: 'Global Journal', category: 'operations' },
    { id: 'bank_txn', name: 'Bank Txn', category: 'operations' },
    { id: 'approvals', name: 'TXN Approvals', category: 'operations' },

    // Masters
    { id: 'ledgers', name: 'Ledger Master', category: 'masters' },
    { id: 'vouchers', name: 'Voucher Master', category: 'masters' },
    { id: 'parties', name: 'Party Master', category: 'masters' },
    { id: 'templates', name: 'Automation', category: 'masters' },

    // User Management
    { id: 'staff_mgmt', name: 'Staff & Roles', category: 'user_mgmt' },
    { id: 'role_mgmt', name: 'User Roles', category: 'user_mgmt' },
    { id: 'device_mgmt', name: 'Devices', category: 'user_mgmt' },
    { id: 'approval_hub', name: 'Approval Hub', category: 'user_mgmt' },
    { id: 'audit_logs', name: 'System Logs', category: 'user_mgmt' },

    // Administration
    { id: 'core_settings', name: 'Core Settings', category: 'admin' },
    { id: 'general_settings', name: 'Settings', category: 'admin' },

    // HR Management
    { id: 'hr_dashboard', name: 'HR Management', category: 'hr' },
    { id: 'hr_staff_dir', name: 'Staff Directory', category: 'hr' },
    { id: 'hr_leave', name: 'Leave Management', category: 'hr' },
    { id: 'hr_exit', name: 'Relieving & Exit', category: 'hr' },
    { id: 'hr_payroll', name: 'Payroll', category: 'hr' },
    { id: 'hr_attendance', name: 'Attendance & Shift', category: 'hr' },
    { id: 'hr_recruitment', name: 'Recruitment', category: 'hr' },
    { id: 'hr_onboarding', name: 'Onboarding', category: 'hr' },
    { id: 'hr_performance', name: 'Performance Management', category: 'hr' },
    { id: 'hr_training', name: 'Training & Development', category: 'hr' },
    { id: 'hr_documents', name: 'Employee Documents', category: 'hr' },
    { id: 'hr_grievance', name: 'Grievance & Discipline', category: 'hr' },
    { id: 'hr_analytics', name: 'Reports & Analytics', category: 'hr' },
    { id: 'hr_settings', name: 'HR Settings', category: 'hr' },
];

const HR_MODULE_IDS = [
    'hr_dashboard', 'hr_staff_dir', 'hr_leave', 'hr_exit', 'hr_payroll',
    'hr_attendance', 'hr_recruitment', 'hr_onboarding', 'hr_performance',
    'hr_training', 'hr_documents', 'hr_grievance', 'hr_analytics', 'hr_settings'
];

export const ACTIONS = [
    // Standard CRUD — applies to all modules
    { id: 'view', name: 'View', modules: MODULES.map(m => m.id) },
    { id: 'create', name: 'Create', modules: MODULES.filter(m => ['operations', 'masters', 'hr'].includes(m.category)).map(m => m.id) },
    { id: 'edit', name: 'Edit', modules: MODULES.filter(m => ['operations', 'masters', 'admin', 'hr'].includes(m.category)).map(m => m.id) },
    { id: 'delete', name: 'Delete', modules: MODULES.filter(m => ['operations', 'masters', 'hr'].includes(m.category)).map(m => m.id) },

    // Accounting / Ops specific
    { id: 'post', name: 'Post', modules: ['session', 'daybook', 'bank_txn'] },
    { id: 'reverse', name: 'Reverse', modules: ['session', 'daybook', 'bank_txn'] },

    // Admin / User Mgmt specific
    { id: 'manage_org', name: 'Manage Org', modules: ['role_mgmt', 'core_settings'] },
    { id: 'manage_staff', name: 'Manage Staff', modules: ['staff_mgmt'] },
    { id: 'manage_devices', name: 'Manage Devices', modules: ['device_mgmt'] },
    { id: 'view_approvals', name: 'View Approvals', modules: ['approval_hub', 'approvals'] },
    { id: 'view_audits', name: 'View Audits', modules: ['audit_logs'] },

    // HR specific
    { id: 'approve_leave', name: 'Approve Leave', modules: ['hr_leave'] },
    { id: 'approve_exit', name: 'Approve Exit', modules: ['hr_exit'] },
    { id: 'run_payroll', name: 'Run Payroll', modules: ['hr_payroll'] },
    { id: 'lock_payroll', name: 'Lock Payroll', modules: ['hr_payroll'] },
    { id: 'manage_attendance', name: 'Manage Attendance', modules: ['hr_attendance'] },
    { id: 'approve_correction', name: 'Approve Correction', modules: ['hr_attendance'] },
    { id: 'manage_pipeline', name: 'Manage Pipeline', modules: ['hr_recruitment'] },
    { id: 'send_offer', name: 'Send Offer Letter', modules: ['hr_recruitment'] },
    { id: 'manage_checklist', name: 'Manage Checklist', modules: ['hr_onboarding', 'hr_exit'] },
    { id: 'conduct_review', name: 'Conduct Review', modules: ['hr_performance'] },
    { id: 'manage_training', name: 'Manage Training', modules: ['hr_training'] },
    { id: 'manage_documents', name: 'Manage Documents', modules: ['hr_documents'] },
    { id: 'handle_grievance', name: 'Handle Grievance', modules: ['hr_grievance'] },
    { id: 'hr_full_access', name: 'Full HR Access', modules: HR_MODULE_IDS },
];
