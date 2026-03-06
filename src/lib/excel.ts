import * as XLSX from 'xlsx';
import { Voucher } from '../types/accounting';
import { formatDate, getTodayDate } from './validation';

/**
 * Exports a list of vouchers to an Excel file.
 */
export function exportVouchersToExcel(vouchers: Voucher[]) {
    if (!vouchers || vouchers.length === 0) {
        console.warn('No vouchers to export');
        return;
    }

    // Map voucher data to a flat structure for Excel
    const data = vouchers.map(v => ({
        'Value Date': formatDate(v.voucher_date),
        'Voucher No': v.voucher_no,
        'Invoice No': v.session?.session_ref || v.reference_no || '-',
        'Transaction Type': v.voucher_type?.type_name || 'N/A',
        'Party Name': v.party?.party_name || 'Internal',
        'Mobile Number': v.party?.phone || '-',
        'Customer ID': v.party?.customer_id || '-',
        'Narration': v.narration || '',
        'Transaction Value': v.total_debit,
        'Business Impact': v.voucher_type?.cash_bank_flow === 'INFLOW'
            ? `+ ${v.total_debit}`
            : v.voucher_type?.cash_bank_flow === 'OUTFLOW'
                ? `- ${v.total_debit}`
                : v.total_debit,
        'Impact Direction': v.voucher_type?.cash_bank_flow || 'NEUTRAL',
        'Audit Status': v.status
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Journal Entries');

    // Set column widths
    const wscols = [
        { wch: 12 }, // Date
        { wch: 15 }, // Voucher No
        { wch: 15 }, // Invoice No
        { wch: 20 }, // Type
        { wch: 25 }, // Party Name
        { wch: 15 }, // Mobile
        { wch: 15 }, // Customer ID
        { wch: 40 }, // Narration
        { wch: 18 }, // Transaction Value
        { wch: 18 }, // Business Impact
        { wch: 15 }, // Impact Direction
        { wch: 12 }  // Status
    ];
    worksheet['!cols'] = wscols;

    // Generate filename with current date
    const dateStr = getTodayDate();
    const filename = `DayBook_Journal_${dateStr}.xls`;

    // Download the file
    XLSX.writeFile(workbook, filename, { bookType: 'biff8' });
}
