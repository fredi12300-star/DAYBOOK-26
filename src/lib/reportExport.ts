import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    LedgerStatementRow,
    TrialBalanceRow
} from '../types/accounting';
import { formatNumber } from './validation';

/**
 * Common Header for PDF Reports
 */
function addReportHeader(doc: jsPDF, title: string, subtitle?: string) {
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(title, 14, 22);

    if (subtitle) {
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(subtitle, 14, 30);
    }

    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, 35, 196, 35);
}

/**
 * 1. LEDGER STATEMENT EXPORT
 */
export function exportLedgerStatement(
    data: LedgerStatementRow[],
    ledgerName: string,
    period: string,
    format: 'PDF' | 'EXCEL'
) {
    const filename = `LedgerStatement_${ledgerName}_${period.replace(/\s+/g, '_')}`;

    if (format === 'EXCEL') {
        const rows = data.map(r => ({
            'Date': r.date,
            'Voucher No': r.voucher_no,
            'Narration': r.narration,
            'Party': r.party_name || '-',
            'Debit': r.debit || 0,
            'Credit': r.credit || 0,
            'Balance': r.balance,
            'Side': r.balance_side
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
        XLSX.writeFile(workbook, `${filename}.xls`, { bookType: 'biff8' });
    } else {
        const doc = new jsPDF();
        addReportHeader(doc, 'Ledger Statement', `${ledgerName} | ${period}`);

        const tableBody = data.map(r => [
            r.date,
            r.voucher_no,
            r.narration,
            r.party_name || '-',
            r.debit > 0 ? formatNumber(r.debit) : '-',
            r.credit > 0 ? formatNumber(r.credit) : '-',
            `${formatNumber(r.balance)} ${r.balance_side}`
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Date', 'Voucher No', 'Narration', 'Party', 'Debit', 'Credit', 'Balance']],
            body: tableBody,
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { top: 40 }
        });

        doc.save(`${filename}.pdf`);
    }
}

/**
 * 2. TRIAL BALANCE EXPORT
 */
export function exportTrialBalance(data: TrialBalanceRow[], period: string, format: 'PDF' | 'EXCEL') {
    const filename = `TrialBalance_${period.replace(/\s+/g, '_')}`;
    const totalClosingDr = data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.closing_dr, 0);
    const totalClosingCr = data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.closing_cr, 0);

    if (format === 'EXCEL') {
        const rows = data.map(r => ({
            'Account Head': r.node_name,
            'Nature': r.nature,
            'Opening (DR)': r.opening_dr || 0,
            'Opening (CR)': r.opening_cr || 0,
            'Period (DR)': r.period_dr || 0,
            'Period (CR)': r.period_cr || 0,
            'Closing (DR)': r.closing_dr || 0,
            'Closing (CR)': r.closing_cr || 0
        }));
        // Add footer
        rows.push({
            'Account Head': 'GRAND TOTAL',
            'Nature': '',
            'Opening (DR)': data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.opening_dr, 0),
            'Opening (CR)': data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.opening_cr, 0),
            'Period (DR)': data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.period_dr, 0),
            'Period (CR)': data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.period_cr, 0),
            'Closing (DR)': totalClosingDr,
            'Closing (CR)': totalClosingCr
        } as any);

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Trial Balance');
        XLSX.writeFile(workbook, `${filename}.xls`, { bookType: 'biff8' });
    } else {
        const doc = new jsPDF('l', 'mm', 'a4'); // Use landscape for 6-column
        addReportHeader(doc, 'Trial Balance', `System-wide Consolidated | as of ${period}`);

        const tableBody = data.map(r => [
            r.node_name,
            r.nature,
            r.opening_dr > 0 ? formatNumber(r.opening_dr) : '-',
            r.opening_cr > 0 ? formatNumber(r.opening_cr) : '-',
            r.period_dr > 0 ? formatNumber(r.period_dr) : '-',
            r.period_cr > 0 ? formatNumber(r.period_cr) : '-',
            r.closing_dr > 0 ? formatNumber(r.closing_dr) : '-',
            r.closing_cr > 0 ? formatNumber(r.closing_cr) : '-'
        ]);

        // Add Final Row
        tableBody.push([
            { content: 'GRAND TOTAL', styles: { fontStyle: 'bold' } },
            '',
            { content: formatNumber(data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.opening_dr, 0)), styles: { fontStyle: 'bold' } },
            { content: formatNumber(data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.opening_cr, 0)), styles: { fontStyle: 'bold' } },
            { content: formatNumber(data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.period_dr, 0)), styles: { fontStyle: 'bold' } },
            { content: formatNumber(data.filter(r => !r.parent_id).reduce((sum, r) => sum + r.period_cr, 0)), styles: { fontStyle: 'bold' } },
            { content: formatNumber(totalClosingDr), styles: { fontStyle: 'bold' } },
            { content: formatNumber(totalClosingCr), styles: { fontStyle: 'bold' } }
        ] as any);

        autoTable(doc, {
            startY: 40,
            head: [['Account Head', 'Nature', 'Op (DR)', 'Op (CR)', 'Period (DR)', 'Period (CR)', 'Closing (DR)', 'Closing (CR)']],
            body: tableBody,
            headStyles: { fillColor: [30, 41, 59] },
            margin: { top: 40 }
        });

        doc.save(`${filename}.pdf`);
    }
}

/**
 * 3. PROFIT & LOSS EXPORT
 */
export function exportProfitLoss(
    data: { income: any[], expense: any[] },
    period: string,
    format: 'PDF' | 'EXCEL'
) {
    const filename = `ProfitLoss_${period.replace(/\s+/g, '_')}`;
    const totalIncome = data.income.reduce((sum, r) => sum + r.amount, 0);
    const totalExpense = data.expense.reduce((sum, r) => sum + r.amount, 0);
    const netProfit = totalIncome - totalExpense;

    if (format === 'EXCEL') {
        const workbook = XLSX.utils.book_new();

        const incomeRows = data.income.map(r => ({ 'Account Head': r.head, 'Amount': r.amount }));
        incomeRows.push({ 'Account Head': 'TOTAL INCOME', 'Amount': totalIncome });

        const expenseRows = data.expense.map(r => ({ 'Account Head': r.head, 'Amount': r.amount }));
        expenseRows.push({ 'Account Head': 'TOTAL EXPENSE', 'Amount': totalExpense });

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(incomeRows), 'Incomes');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenseRows), 'Expenses');

        XLSX.writeFile(workbook, `${filename}.xls`, { bookType: 'biff8' });
    } else {
        const doc = new jsPDF();
        addReportHeader(doc, 'Profit & Loss Statement', `Performance Report | ${period}`);

        // Income Table
        doc.text('Incomes', 14, 45);
        autoTable(doc, {
            startY: 50,
            head: [['Particulars', 'Amount (INR)']],
            body: data.income.map(r => [r.head, formatNumber(r.amount)]),
            foot: [['Total Revenue', formatNumber(totalIncome)]],
            headStyles: { fillColor: [5, 150, 105] }, // emerald-600
        });

        // Expense Table
        const lastY = (doc as any).lastAutoTable.finalY + 15;
        doc.text('Expenses', 14, lastY);
        autoTable(doc, {
            startY: lastY + 5,
            head: [['Particulars', 'Amount (INR)']],
            body: data.expense.map(r => [r.head, formatNumber(r.amount)]),
            foot: [['Total Expenditure', formatNumber(totalExpense)]],
            headStyles: { fillColor: [225, 29, 72] }, // rose-600
        });

        // Net Result
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${netProfit >= 0 ? 'NET RETAINED PROFIT' : 'NET OPERATING LOSS'}:  INR ${formatNumber(Math.abs(netProfit))}`, 14, finalY);

        doc.save(`${filename}.pdf`);
    }
}

/**
 * 4. BALANCE SHEET EXPORT
 */
export function exportBalanceSheet(
    data: { assets: any[], liabilities: any[], equity: any[] },
    period: string,
    format: 'PDF' | 'EXCEL'
) {
    const filename = `BalanceSheet_${period.replace(/\s+/g, '_')}`;
    const totalAssets = data.assets.reduce((sum, r) => sum + r.amount, 0);
    const totalLiabEquity = data.liabilities.reduce((sum, r) => sum + r.amount, 0) + data.equity.reduce((sum, r) => sum + r.amount, 0);

    if (format === 'EXCEL') {
        const workbook = XLSX.utils.book_new();

        const assetsRows = data.assets.map(r => ({ 'Asset Item': r.head, 'Amount': r.amount }));
        assetsRows.push({ 'Asset Item': 'TOTAL ASSETS', 'Amount': totalAssets });

        const liabRows = [
            ...data.equity.map(r => ({ 'Liability/Equity Item': r.head, 'Amount': r.amount })),
            ...data.liabilities.map(r => ({ 'Liability/Equity Item': r.head, 'Amount': r.amount }))
        ];
        liabRows.push({ 'Liability/Equity Item': 'TOTAL LIABILITIES & EQUITY', 'Amount': totalLiabEquity });

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(assetsRows), 'Assets');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(liabRows), 'Liabilities & Equity');

        XLSX.writeFile(workbook, `${filename}.xls`, { bookType: 'biff8' });
    } else {
        const doc = new jsPDF();
        addReportHeader(doc, 'Executive Balance Sheet', `Statement of Financial Position | as of ${period}`);

        // Liabilities & Equity Table
        doc.text('Equities & Liabilities', 14, 45);
        autoTable(doc, {
            startY: 50,
            head: [['Particulars', 'Amount (INR)']],
            body: [
                ['--- EQUITY ---', ''],
                ...data.equity.map(r => [r.head, formatNumber(r.amount)]),
                ['--- LIABILITIES ---', ''],
                ...data.liabilities.map(r => [r.head, formatNumber(r.amount)]),
            ],
            foot: [['Total Equities & Liabilities', formatNumber(totalLiabEquity)]],
            headStyles: { fillColor: [30, 41, 59] },
        });

        // Assets Table
        const lastY = (doc as any).lastAutoTable.finalY + 15;
        doc.text('Application of Funds (Assets)', 14, lastY);
        autoTable(doc, {
            startY: lastY + 5,
            head: [['Particulars', 'Amount (INR)']],
            body: data.assets.map(r => [r.head, formatNumber(r.amount)]),
            foot: [['Total Assets (Magnitude)', formatNumber(totalAssets)]],
            headStyles: { fillColor: [5, 150, 105] },
        });

        // Balance Verification
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const balanced = Math.abs(totalAssets - totalLiabEquity) < 1;
        doc.setTextColor(balanced ? 5 : 225, balanced ? 150 : 29, balanced ? 105 : 72);
        doc.text(`SYSTEM INTEGRITY: ${balanced ? 'BALANCED (A = L + E)' : 'VARIANCE DETECTED'}`, 14, finalY);

        doc.save(`${filename}.pdf`);
    }
}
