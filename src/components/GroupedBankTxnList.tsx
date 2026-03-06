import { useMemo } from 'react';
import { CheckCircle2, XCircle, Building2 } from 'lucide-react';
import type { Voucher, Ledger, LedgerTag } from '../types/accounting';
import { formatNumber } from '../lib/validation';

interface GroupedBankTxnListProps {
    vouchers: Voucher[];
    banks: Ledger[];
    tags: LedgerTag[];
    selectedVoucherIds: string[];
    onToggleSelect: (id: string) => void;
    onReject: (id: string) => void;
    onValidate?: (id: string) => void;
    showValidateAction?: boolean;
    showCheckboxes?: boolean;
}

// Logic copied from BankTransactions.tsx to avoid circular defaults
function getBankAmount(v: Voucher, tags: LedgerTag[] = []) {
    if (!v.lines) return null; // Return null so we can show loading state
    const bankSum = v.lines
        .filter(l => {
            if (l.side !== 'CR') return false;
            const ledger = l.ledger;
            if (!ledger) return false;
            const name = ledger.ledger_name?.toLowerCase() || '';
            const group = ledger.ledger_group?.group_name?.toLowerCase() || '';
            const settlementTagId = tags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id;
            const isBank = (
                (ledger.is_cash_bank && name.includes('bank')) ||
                (settlementTagId && ledger.business_tags?.includes(settlementTagId)) ||
                group.includes('bank') ||
                name.includes('bank')
            ) && !name.includes('cash');
            return isBank;
        })
        .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    return bankSum || 0; // If no bank line found, it's 0 (avoid flicker)
}

export default function GroupedBankTxnList({
    vouchers,
    banks,
    tags,
    selectedVoucherIds,
    onToggleSelect,
    onReject,
    onValidate,
    showValidateAction = false,
    showCheckboxes = true
}: GroupedBankTxnListProps) {

    const grouped = useMemo(() => {
        const groups: Record<string, Voucher[]> = {};
        vouchers.forEach(v => {
            const key = v.sender_bank_account_id || 'unassigned';
            if (!groups[key]) groups[key] = [];
            groups[key].push(v);
        });
        return groups;
    }, [vouchers]);

    const getBankName = (id: string) => {
        if (id === 'unassigned') return 'Unassigned Transactions';
        return banks.find(b => b.id === id)?.ledger_name || 'Unknown Bank';
    };

    return (
        <div className="space-y-4">
            {Object.entries(grouped).map(([bankId, groupVouchers]) => (
                <div key={bankId} className="surface-card bg-slate-950/20 backdrop-blur-sm overflow-hidden p-0 border border-slate-800">
                    <div className="bg-slate-900/50 p-3 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-brand-500" />
                            <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">
                                {getBankName(bankId)}
                            </h3>
                            <span className="bg-slate-800 text-slate-400 text-[9px] font-bold px-2 py-0.5 rounded-full">
                                {groupVouchers.length}
                            </span>
                        </div>
                    </div>

                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-800/50 bg-slate-900/20">
                                <th className="px-6 py-3 w-10">
                                    {showCheckboxes ? (
                                        <div className="w-4" />
                                    ) : null}
                                </th>
                                <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Recipient</th>
                                <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                                <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Bank Info</th>
                                <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                            {groupVouchers.map(v => (
                                <tr key={v.id} className="group hover:bg-brand-500/5 transition-all">
                                    <td className="px-6 py-4">
                                        {showCheckboxes && (
                                            <input
                                                type="checkbox"
                                                checked={selectedVoucherIds.includes(v.id)}
                                                onChange={() => onToggleSelect(v.id)}
                                                className="w-4 h-4 rounded-md border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500 cursor-pointer"
                                            />
                                        )}
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-200 uppercase">{v.party?.party_name}</span>
                                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">Ref: {v.voucher_no}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        {getBankAmount(v, tags) === null ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="h-3 w-16 bg-slate-800 rounded animate-pulse" />
                                                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">Verifying...</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs font-mono font-black text-white">
                                                ₹{formatNumber(getBankAmount(v, tags) || 0)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-slate-300">A/C: {v.party?.bank_accounts?.[0]?.bank_account_no || 'N/A'}</span>
                                            <span className="text-[9px] font-black text-slate-600 uppercase truncate max-w-[150px]">{v.party?.bank_accounts?.[0]?.bank_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {showValidateAction && onValidate && (
                                                <button
                                                    onClick={() => onValidate(v.id)}
                                                    className="p-1.5 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-500 rounded transition-colors"
                                                    title="Mark Validated"
                                                >
                                                    <CheckCircle2 size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onReject(v.id)}
                                                className="p-1.5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 rounded transition-colors"
                                                title="Reject"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}
