const fs = require('fs');
const files = [
    'c:\\Antigravity\\Day Book\\src\\components\\enterprise\\StaffManagement.tsx',
    'c:\\Antigravity\\Day Book\\src\\components\\enterprise\\RoleManagement.tsx',
    'c:\\Antigravity\\Day Book\\src\\components\\enterprise\\AuditLogViewer.tsx'
];
files.forEach(f => {
    try {
        let text = fs.readFileSync(f, 'utf8');
        text = text.replace(/\bstaff_name\b/g, 'full_name');
        text = text.replace(/\bdesignation\b/g, 'department');
        // For phone, only replace where it's property access like editingStaff?.phone or assignment like phone: formData...
        text = text.replace(/\bphone\b/g, 'primary_mobile');
        fs.writeFileSync(f, text, 'utf8');
        console.log(`Updated ${f}`);
    } catch (err) {
        console.error(`Error processing ${f}:`, err);
    }
});
