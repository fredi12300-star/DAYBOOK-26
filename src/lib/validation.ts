import type { VoucherFormData, ValidationError, ValidationResult, Ledger, CashBankFlow } from '../types/accounting';
import { getBusinessDate } from './businessDate';

// ================================================================
// VALIDATION ENGINE
// Professional accounting validation with 3-tier checks
// ================================================================

export function validateVoucher(formData: VoucherFormData): ValidationResult {
    const errors: ValidationError[] = [];

    // ================================================================
    // TIER 1: STRUCTURAL VALIDATION
    // ================================================================

    if (!formData.voucher_type_id) {
        errors.push({ field: 'voucher_type_id', message: 'Voucher type is required' });
    }

    if (!formData.voucher_date) {
        errors.push({ field: 'voucher_date', message: 'Voucher date is required' });
    }

    if (!formData.narration || formData.narration.trim().length === 0) {
        errors.push({ field: 'narration', message: 'Narration is required' });
    }

    if (!formData.lines || formData.lines.length < 2) {
        errors.push({ field: 'lines', message: 'Minimum 2 lines required for a voucher' });
    }

    // Validate each line
    formData.lines.forEach((line, index) => {
        if (!line.ledger_id) {
            errors.push({
                field: `lines.${index}.ledger_id`,
                message: `Line ${index + 1}: Ledger is required`
            });
        }

        if (!line.side || (line.side !== 'DR' && line.side !== 'CR')) {
            errors.push({
                field: `lines.${index}.side`,
                message: `Line ${index + 1}: Side must be DR or CR`
            });
        }

        if (!line.amount || line.amount <= 0) {
            errors.push({
                field: `lines.${index}.amount`,
                message: `Line ${index + 1}: Amount must be greater than 0`
            });
        }
    });

    // ================================================================
    // TIER 2: ACCOUNTING VALIDATION (Golden Rule)
    // ================================================================

    if (formData.lines.length >= 2) {
        const totalDebit = formData.lines
            .filter(l => l.side === 'DR')
            .reduce((sum, l) => sum + (l.amount || 0), 0);

        const totalCredit = formData.lines
            .filter(l => l.side === 'CR')
            .reduce((sum, l) => sum + (l.amount || 0), 0);

        const difference = Math.abs(totalDebit - totalCredit);

        if (difference > 0.01) {
            errors.push({
                field: 'balance',
                message: `Total Debit (₹${totalDebit.toFixed(2)}) must equal Total Credit (₹${totalCredit.toFixed(2)}). Difference: ₹${difference.toFixed(2)}`
            });
        }
    }

    // ================================================================
    // TIER 3: BUSINESS VALIDATION
    // ================================================================

    // Check for duplicate ledgers (optional warning)
    const ledgerIds = formData.lines.map(l => l.ledger_id).filter(Boolean);
    const uniqueLedgers = new Set(ledgerIds);

    if (ledgerIds.length !== uniqueLedgers.size) {
        // This is just a warning, not blocking
        errors.push({
            field: 'lines',
            message: 'Warning: Same ledger appears multiple times'
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

// ================================================================
// VALIDATE VOUCHER DATE
// ================================================================

export function isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
}

export function isDateInFuture(dateString: string): boolean {
    const date = new Date(dateString);
    const businessDate = getBusinessDate();
    const today = businessDate ? new Date(businessDate) : new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
}

// ================================================================
// AUTO SIDE SELECTION (Golden Rule for Templates)
// ================================================================

export function getAutoSide(
    ledgerNature: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY',
    templateDefaultSide?: 'DR' | 'CR',
    isFixedSide?: boolean,
    ledger?: Ledger,
    cashBankFlow?: CashBankFlow
): 'DR' | 'CR' {
    // Priority 1: Template default (if exists and fixed)
    if (templateDefaultSide && isFixedSide) {
        return templateDefaultSide;
    }

    // Priority 2: Cash/Bank Flow Automation
    if (ledger?.is_cash_bank && cashBankFlow && cashBankFlow !== 'NEUTRAL') {
        if (cashBankFlow === 'INFLOW') return 'DR';
        if (cashBankFlow === 'OUTFLOW') return 'CR';
    }

    // Priority 3: Template default (if exists but not fixed)
    if (templateDefaultSide) {
        return templateDefaultSide;
    }

    // Priority 4: Ledger nature fallback
    if (ledgerNature === 'LIABILITY' || ledgerNature === 'INCOME' || ledgerNature === 'EQUITY') {
        return 'CR';
    } else {
        return 'DR';
    }
}

// ================================================================
// CALCULATE RUNNING BALANCE
// ================================================================

export function calculateRunningBalance(
    openingBalance: number,
    openingSide: 'DR' | 'CR',
    nature: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY',
    transactions: { side: 'DR' | 'CR'; amount: number }[]
): { balance: number; side: 'DR' | 'CR' } {
    let balance = openingSide === 'DR' ? openingBalance : -openingBalance;

    const isAssetOrExpense = nature === 'ASSET' || nature === 'EXPENSE';

    transactions.forEach(txn => {
        if (isAssetOrExpense) {
            balance += txn.side === 'DR' ? txn.amount : -txn.amount;
        } else {
            balance += txn.side === 'CR' ? txn.amount : -txn.amount;
        }
    });

    return {
        balance: Math.abs(balance),
        side: balance >= 0 ? (isAssetOrExpense ? 'DR' : 'CR') : (isAssetOrExpense ? 'CR' : 'DR')
    };
}

// ================================================================
// FORMAT CURRENCY
// ================================================================

export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

export function formatNumber(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

// ================================================================
// FORMAT DATE
// ================================================================

export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    }).format(date);
}

export function formatDateDMY(dateString: string): string {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
}

export function formatTime(dateString: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).format(date);
}

export function getTodayDate(): string {
    const businessDate = getBusinessDate();
    if (businessDate) return businessDate;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
