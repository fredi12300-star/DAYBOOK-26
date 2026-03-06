import { useMemo } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { VoucherLineInput } from '../types/accounting';
import { formatNumber } from '../lib/validation';

interface ProtocolVerificationProps {
    lines: VoucherLineInput[];
    variant?: 'vertical' | 'horizontal';
}

export default function ProtocolVerification({ lines, variant = 'vertical' }: ProtocolVerificationProps) {

    // Calculate Integrity Totals
    const totals = useMemo(() => {
        const debit = lines
            .filter(l => l.side === 'DR')
            .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

        const credit = lines
            .filter(l => l.side === 'CR')
            .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

        return {
            debit,
            credit,
            difference: Math.abs(debit - credit),
            isBalanced: Math.abs(debit - credit) < 0.01
        };
    }, [lines]);

    if (variant === 'horizontal') {
        return (
            <div className={`px-8 lg:px-10 py-6 grid grid-cols-1 md:grid-cols-3 items-center gap-6 border-t border-slate-800/40 transition-all ${totals.debit === 0 && totals.credit === 0 ? 'bg-slate-900/10' : totals.isBalanced ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
                {/* Left - Debit */}
                <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Voucher Total Debit</span>
                    <span className="text-xl lg:text-2xl font-display font-black text-white tracking-widest">{formatNumber(totals.debit)}</span>
                </div>

                {/* Center - Credit */}
                <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Voucher Total Credit</span>
                    <span className="text-xl lg:text-2xl font-display font-black text-white tracking-widest">{formatNumber(totals.credit)}</span>
                </div>

                {/* Right - Status */}
                <div className="flex justify-center md:justify-end">
                    <div className={`flex items-center gap-5 px-6 py-3 rounded-[1.5rem] border transition-all min-w-[300px] ${totals.debit === 0 && totals.credit === 0
                            ? 'bg-slate-500/5 text-slate-500 border-slate-500/10'
                            : totals.isBalanced
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-glow shadow-emerald-500/5'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                        }`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${totals.debit === 0 && totals.credit === 0
                                ? 'bg-slate-500/10 border-slate-500/20'
                                : totals.isBalanced
                                    ? 'bg-emerald-500/20 border-emerald-500/30'
                                    : 'bg-rose-500/20 border-rose-500/30'
                            }`}>
                            {totals.debit === 0 && totals.credit === 0 ? (
                                <AlertCircle size={18} className="opacity-50" />
                            ) : totals.isBalanced ? (
                                <CheckCircle2 size={18} />
                            ) : (
                                <AlertCircle size={18} />
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                                {totals.debit === 0 && totals.credit === 0 ? 'Wait Engine' : 'Entry Integrity'}
                            </span>
                            <span className="text-lg font-display font-black tracking-widest">
                                {totals.debit === 0 && totals.credit === 0
                                    ? 'AWAITING...'
                                    : totals.isBalanced
                                        ? 'BALANCED'
                                        : `DIFF: +₹${formatNumber(totals.difference)}`}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="surface-card p-10 space-y-10 bg-[#0f172a]/20 overflow-hidden h-full">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 font-display border-b border-slate-800/30 pb-6 text-center">Protocol Verification</h3>

            <div className="space-y-8">
                <div className="flex justify-between items-baseline group px-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total DR</span>
                    <span className="text-2xl font-display font-black text-white tracking-widest transition-all group-hover:scale-110 uppercase">
                        {formatNumber(totals.debit)}
                    </span>
                </div>
                <div className="flex justify-between items-baseline group px-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total CR</span>
                    <span className="text-2xl font-display font-black text-white tracking-widest transition-all group-hover:scale-110 uppercase">
                        {formatNumber(totals.credit)}
                    </span>
                </div>

                {/* Rule 3: Balance Display */}
                <div className="pt-2">
                    {totals.debit === 0 && totals.credit === 0 ? (
                        <div className="p-8 rounded-[2.5rem] flex flex-col items-center text-center gap-4 border bg-slate-500/5 text-slate-400 border-slate-500/10">
                            <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                                <AlertCircle size={24} strokeWidth={3} className="opacity-50" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-80">Ledger Integrity</p>
                                <p className="text-3xl font-display font-black tracking-widest text-slate-500">NO ENTRIES</p>
                            </div>
                        </div>
                    ) : (
                        <div className={`p-8 rounded-[2.5rem] flex flex-col items-center text-center gap-4 transition-all duration-500 border ${totals.isBalanced
                            ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20 shadow-glow shadow-emerald-500/5'
                            : 'bg-rose-500/5 text-rose-400 border-rose-500/10 shadow-glow shadow-rose-500/5'
                            } `}>
                            <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                                {totals.isBalanced ? <CheckCircle2 size={24} strokeWidth={3} /> : <AlertCircle size={24} strokeWidth={3} />}
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-80">Ledger Integrity</p>
                                <p className="text-3xl font-display font-black tracking-widest">
                                    {totals.isBalanced ? 'BALANCED' : `+₹${formatNumber(totals.difference)} `}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {!totals.isBalanced && (
                    <div className="flex justify-center animate-pulse">
                        <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                            Difference Detected
                        </span>
                    </div>
                )}

                {totals.isBalanced && (
                    <div className="flex justify-center animate-fade-in">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                            Perfectly Balanced
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
