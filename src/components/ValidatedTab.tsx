import { CheckCircle2, XCircle, Building2 } from 'lucide-react';
import type { Voucher, Ledger, LedgerTag } from '../types/accounting';
import { formatDate, formatNumber } from '../lib/validation';
import { getBankAmount } from './BankTransactions';

interface ValidatedTabProps {
    vouchers: Voucher[];
    banks: Ledger[];
    tags: LedgerTag[];
    selectedVoucherIds: string[];
    onToggleSelection: (id: string) => void;
    onReject: (id: string) => void;
    onValidate?: (id: string) => void;
    onSendForApproval?: () => void;
    selectedBankId?: string;
}

export default function ValidatedTab({
    vouchers,
    tags,
    selectedVoucherIds,
    onToggleSelection,
    onReject,
    onSendForApproval
}: ValidatedTabProps) {
    const filtered = vouchers.filter(v => v.bank_status === 'APPROVED' && v.bank_validation_status === 'VALIDATED');

    if (filtered.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center surface-card bg-slate-950/20">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No Validated Items</h3>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">Validate items in the 'Maker Validation' tab first</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                        <CheckCircle2 size={20} className="text-brand-400" />
                    </div>
                    <div>
                        <h2 className="text-xs font-black text-white uppercase tracking-widest">Awaiting Checker Review</h2>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Select items for final export and authorization</p>
                    </div>
                </div>

                {selectedVoucherIds.length > 0 && onSendForApproval && (
                    <button
                        onClick={onSendForApproval}
                        className="btn-primary h-12 px-8 flex items-center gap-3 text-[10px] uppercase font-black tracking-widest shadow-glow shadow-brand-500/20 animate-scale-up"
                    >
                        <CheckCircle2 size={16} />
                        Checker Approved ({selectedVoucherIds.length})
                    </button>
                )}
            </div>

            <div className="surface-card bg-slate-950/20 backdrop-blur-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-800/50">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Execution Date</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Counterparty</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount to Send</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Voucher Type</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                            {filtered.map(v => (
                                <tr key={v.id} className="group hover:bg-brand-500/5 transition-all duration-300">
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white">{formatDate(v.voucher_date)}</span>
                                            <span className="text-[9px] font-mono text-slate-600 mt-1 uppercase">Ref: {v.voucher_no}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/50">
                                                <Building2 size={14} className="text-slate-400" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-200 uppercase tracking-tight">{v.party?.party_name || 'Individual'}</span>
                                                <span className="text-[9px] font-bold text-slate-500 mt-0.5">{v.party?.phone || 'No Contact Info'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-sm font-mono font-black text-emerald-400">₹ {formatNumber(getBankAmount(v, tags))}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2">
                                            <div className="px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 rounded-md">
                                                <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">
                                                    {v.voucher_type?.type_name || 'Voucher'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex items-center justify-center gap-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedVoucherIds.includes(v.id)}
                                                onChange={() => onToggleSelection(v.id)}
                                                className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-900 checked:bg-brand-500 checked:border-brand-500 cursor-pointer transition-all"
                                            />
                                            <button
                                                onClick={() => onReject(v.id)}
                                                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg border border-rose-500/20 transition-all active:scale-95"
                                                title="Reject"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
