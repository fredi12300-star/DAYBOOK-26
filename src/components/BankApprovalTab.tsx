import { ShieldCheck, XCircle, Building2, CheckCircle2, ArrowRight } from 'lucide-react';
import type { Voucher, Ledger, LedgerTag } from '../types/accounting';
import { formatDate, formatNumber } from '../lib/validation';
import { getBankAmount } from './BankTransactions';

interface BankApprovalTabProps {
    vouchers: Voucher[];
    banks: Ledger[];
    tags: LedgerTag[];
    selectedVoucherIds: string[];
    onToggleSelection: (id: string) => void;
    onFinalApprove: (id: string) => void;
    onReject: (id: string) => void;
}

export default function BankApprovalTab({
    vouchers,
    tags,
    onFinalApprove,
    onReject
}: BankApprovalTabProps) {
    if (vouchers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center surface-card bg-slate-950/20">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No Pending Bank Authorizations</h3>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">All validated transactions have been authorized</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <ShieldCheck size={20} className="text-violet-400" />
                </div>
                <div>
                    <h2 className="text-xs font-black text-white uppercase tracking-widest">Final Bank Authorization</h2>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Authorize funding and release payments</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {vouchers.map(v => {
                    const bankAmount = getBankAmount(v, tags);

                    return (
                        <div key={v.id} className="surface-card bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden group hover:border-brand-500/30 transition-all duration-300">
                            <div className="p-6 flex flex-col md:flex-row items-center gap-6">
                                {/* Date & Ref */}
                                <div className="flex flex-col min-w-[120px]">
                                    <span className="text-xs font-bold text-white">{formatDate(v.voucher_date)}</span>
                                    <span className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-wider">{v.voucher_no}</span>
                                </div>

                                {/* Flow Visualization */}
                                <div className="flex-1 flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">From Account</span>
                                        <div className="flex items-center gap-2">
                                            <Building2 size={14} className="text-slate-400" />
                                            <span className="text-xs font-bold text-slate-300">
                                                {v.lines?.find(l => l.amount === bankAmount && l.side === 'CR')?.ledger?.ledger_name || 'Bank Account'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex justify-center">
                                        <ArrowRight size={16} className="text-slate-600" />
                                    </div>

                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Beneficiary</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-white text-right">
                                                {v.party?.party_name || 'Unknown Beneficiary'}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mt-0.5">
                                            {v.party?.bank_accounts?.[0]?.bank_name || 'No Bank Details'}
                                        </span>
                                    </div>
                                </div>

                                {/* Amount */}
                                <div className="text-right min-w-[150px]">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Transfer Amount</span>
                                    <span className="text-xl font-mono font-black text-emerald-400">₹ {formatNumber(bankAmount)}</span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-3 pl-6 border-l border-slate-800">
                                    <button
                                        onClick={() => onReject(v.id)}
                                        className="p-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
                                        title="Reject"
                                    >
                                        <XCircle size={18} />
                                    </button>
                                    <button
                                        onClick={() => onFinalApprove(v.id)}
                                        className="py-3 px-6 rounded-xl bg-emerald-500 text-slate-900 font-black text-xs uppercase tracking-wider hover:bg-emerald-400 shadow-glow shadow-emerald-500/20 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> Authorize
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
