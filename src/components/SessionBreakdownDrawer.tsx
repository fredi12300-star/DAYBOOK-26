import { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatNumber } from '../lib/validation';
import type { VoucherFormData, Ledger, LedgerTag } from '../types/accounting';

interface SessionBreakdownDrawerProps {
    vouchers: VoucherFormData[];
    isOpen: boolean;
    onClose: () => void;
    onSelectVoucher: (index: number) => void;
    activeTabIndex: number;
    initialView?: 'audit' | 'flow';
    ledgers: Ledger[];
    tags: LedgerTag[];
}

export default function SessionBreakdownDrawer({
    vouchers,
    isOpen,
    onClose,
    onSelectVoucher,
    activeTabIndex,
    initialView = 'audit',
    ledgers,
    tags
}: SessionBreakdownDrawerProps) {
    const [expandedIndices, setExpandedIndices] = useState<number[]>([]);
    const [viewMode, setViewMode] = useState<'audit' | 'flow'>(initialView);

    // Sync viewMode when drawer opens
    useMemo(() => {
        if (isOpen) setViewMode(initialView);
    }, [isOpen, initialView]);

    const toggleExpand = (index: number) => {
        setExpandedIndices(prev =>
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
    };

    const voucherStats = useMemo(() => {
        return vouchers.map((v, idx) => {
            let dr = 0;
            let cr = 0;
            v.lines.forEach(l => {
                if (l.side === 'DR') dr += Number(l.amount) || 0;
                else cr += Number(l.amount) || 0;
            });
            const diff = dr - cr;
            const isBalanced = Math.abs(diff) < 0.01;

            return {
                index: idx,
                type: v.voucher_type_name || `Entry #${idx + 1}`,
                narration: v.narration,
                dr,
                cr,
                diff,
                isBalanced,
                lines: v.lines
            };
        });
    }, [vouchers]);

    const sessionStats = useMemo(() => {
        const totalDR = voucherStats.reduce((sum, v) => sum + v.dr, 0);
        const totalCR = voucherStats.reduce((sum, v) => sum + v.cr, 0);
        const netImpact = totalDR - totalCR;
        const isBalanced = Math.abs(netImpact) < 0.01;
        return { totalDR, totalCR, netImpact, isBalanced };
    }, [voucherStats]);

    // Business Flow Calculation (Robust Identification VERSION)
    const businessFlow = useMemo(() => {
        const SETTLEMENT_CASH_TAG = 'PHYSICAL CASH';
        const SETTLEMENT_BANK_TAG = 'BANK ACCOUNT';
        const cashTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_CASH_TAG))?.id;
        const bankTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_BANK_TAG))?.id;

        const receiveLines: { ledgerName: string, narration: string, amount: number, mode: 'CASH' | 'BANK' | 'NET', isSettlement: boolean }[] = [];
        const payLines: { ledgerName: string, narration: string, amount: number, mode: 'CASH' | 'BANK' | 'NET', isSettlement: boolean }[] = [];

        vouchers.forEach((v) => {
            v.lines.forEach(l => {
                const ledger = ledgers.find(lg => lg.id === l.ledger_id);
                const isCashBankLedger = ledger?.is_cash_bank || l.ledger_is_cash || l.ledger_is_bank;
                const hasBankTag = bankTagId && ledger?.business_tags?.includes(bankTagId);
                const hasCashTag = cashTagId && ledger?.business_tags?.includes(cashTagId);

                const isBankFallback = !hasCashTag && (
                    ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                    ledger?.ledger_name?.toLowerCase().includes('bank')
                );
                const isBankLine = isCashBankLedger && (hasBankTag || isBankFallback);
                const isCashLine = isCashBankLedger && !isBankLine;
                const isBusiness = !isCashBankLedger;

                // Identification logic for layout: Relevant if voucher or line has ANY party (session context)
                const isRelevant = !!l.party_id || !!v.party_id;

                if (isRelevant) {
                    const mode = (isBankLine ? 'BANK' : (isCashLine ? 'CASH' : 'NET')) as 'CASH' | 'BANK' | 'NET';

                    const data = {
                        ledgerName: ledger?.ledger_name || l.ledger_name || 'Unspecified Account',
                        narration: l.line_narration || v.narration || 'Unspecified',
                        amount: Number(l.amount) || 0,
                        mode,
                        isSettlement: !isBusiness
                    };

                    // Skip zero amount entries
                    if (Math.abs(data.amount) < 0.01) return;

                    if (isBusiness) {
                        // Business Item: DR = YOU PAY (Value OUT), CR = YOU RECEIVE (Value IN)
                        if (l.side === 'DR') payLines.push(data);
                        else receiveLines.push(data);
                    } else {
                        // Settlement Item: DR = Value IN (Receipt), CR = Value OUT (Payment)
                        if (l.side === 'DR') receiveLines.push(data);
                        else payLines.push(data);
                    }
                }
            });
        });

        // Totals for columns match the Summary Panel Logic
        const totalReceive = receiveLines.filter(l => !l.isSettlement).reduce((sum, l) => sum + l.amount, 0);
        const totalPay = payLines.filter(l => !l.isSettlement).reduce((sum, l) => sum + l.amount, 0);

        // Final Net also match the Summary Panel Formula (Business Net + Bank Net)
        const businessNet = totalReceive - totalPay;

        // CORRECTION: Business Net Position should NOT include bank execution.
        // It should strictly be the Business Position (Recv - Pay).
        const net = businessNet;

        return { receiveLines, payLines, totalReceive, totalPay, net };
    }, [vouchers, ledgers, tags]);

    const filteredVouchers = voucherStats;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex justify-end animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Drawer Content */}
            <div className="relative w-full max-w-md bg-[#020617] border-l border-slate-800 shadow-2xl flex flex-col animate-slide-left">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Session Breakdown</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                            {vouchers.length} {vouchers.length === 1 ? 'Voucher' : 'Vouchers'} Active
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-800 hover:text-white transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* View Switcher */}
                <div className="flex border-b border-slate-800">
                    <button
                        onClick={() => setViewMode('audit')}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${viewMode === 'audit' ? 'text-white border-brand-500 bg-brand-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                    >
                        Audit Breakdown
                    </button>
                    <button
                        onClick={() => setViewMode('flow')}
                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${viewMode === 'flow' ? 'text-white border-brand-500 bg-brand-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                    >
                        Business Flow
                    </button>
                </div>

                {/* Session Summary Sticky */}
                <div className="px-6 py-6 bg-slate-900/20 border-b border-slate-800/60">
                    {viewMode === 'audit' ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total DR</span>
                                    <p className="text-xs font-mono font-bold text-white">{formatNumber(sessionStats.totalDR)}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total CR</span>
                                    <p className="text-xs font-mono font-bold text-white">{formatNumber(sessionStats.totalCR)}</p>
                                </div>
                            </div>
                            <div className={`mt-3 p-3 rounded-xl border flex items-center justify-between ${sessionStats.isBalanced ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                <span className="text-[10px] font-black uppercase tracking-widest">Accounting Net Impact</span>
                                <span className="text-xs font-mono font-black">{formatNumber(sessionStats.netImpact)}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Total You Receive</span>
                                    <p className="text-xs font-mono font-bold text-white">{formatNumber(businessFlow.totalReceive)}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <span className="text-[9px] font-black text-brand-400 uppercase tracking-widest">Total You Pay</span>
                                    <p className="text-xs font-mono font-bold text-white">{formatNumber(businessFlow.totalPay)}</p>
                                </div>
                            </div>
                            <div className={`mt-3 p-3 rounded-xl border flex items-center justify-between ${businessFlow.net > 0.01 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                businessFlow.net < -0.01 ? 'bg-brand-500/10 border-brand-500/20 text-brand-400' :
                                    'bg-slate-800 border-slate-700 text-slate-400'
                                }`}>
                                <span className="text-[10px] font-black uppercase tracking-widest">Business Net Position</span>
                                <span className="text-xs font-mono font-black">{formatNumber(Math.abs(businessFlow.net))}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                    {viewMode === 'audit' ? (
                        <div className="space-y-3">
                            {filteredVouchers.map((v) => (
                                <div
                                    key={v.index}
                                    className={`rounded-2xl border transition-all ${v.index === activeTabIndex
                                        ? 'bg-brand-500/5 border-brand-500/40 ring-1 ring-brand-500/20'
                                        : 'bg-slate-900/20 border-slate-800/60 hover:border-slate-700'
                                        }`}
                                >
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div
                                                className="cursor-pointer flex-1"
                                                onClick={() => onSelectVoucher(v.index)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${v.isBalanced ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                    <h3 className={`text-[11px] font-black uppercase tracking-wider ${v.index === activeTabIndex ? 'text-brand-400' : 'text-slate-200'}`}>
                                                        Entry #{v.index + 1}: {v.type}
                                                    </h3>
                                                </div>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 line-clamp-1">
                                                    {v.narration || 'No Narration Provided'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => onSelectVoucher(v.index)}
                                                    className="p-2 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all"
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                                <button
                                                    onClick={() => toggleExpand(v.index)}
                                                    className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
                                                >
                                                    {expandedIndices.includes(v.index) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-800/40">
                                            <div>
                                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">DR</span>
                                                <p className="text-[10px] font-mono font-bold text-slate-300">{formatNumber(v.dr)}</p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">CR</span>
                                                <p className="text-[10px] font-mono font-bold text-slate-300">{formatNumber(v.cr)}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">DIFF</span>
                                                <p className={`text-[10px] font-mono font-bold ${v.isBalanced ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {formatNumber(v.diff)}
                                                </p>
                                            </div>
                                        </div>

                                        {expandedIndices.includes(v.index) && (
                                            <div className="space-y-2 animate-fade-in pt-1">
                                                {v.lines.map((l, lIdx) => (
                                                    <div key={lIdx} className="flex items-center justify-between text-[10px] py-1 px-2 rounded-lg bg-slate-800/30">
                                                        <div className="flex items-center gap-2 max-w-[65%]">
                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${l.side === 'DR' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                                {l.side}
                                                            </span>
                                                            <span className="font-bold text-slate-300 truncate">{l.ledger_name || 'Unspecified Account'}</span>
                                                        </div>
                                                        <span className="font-mono font-bold text-slate-400">{formatNumber(l.amount || 0)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 h-full">
                            {/* You Receive Column */}
                            <div className="space-y-3">
                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] block pl-2">You Receive</span>
                                {businessFlow.receiveLines.length === 0 ? (
                                    <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center">
                                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">No entries</p>
                                    </div>
                                ) : (
                                    businessFlow.receiveLines.map((l, i) => (
                                        <div key={i} className={`p-3 rounded-2xl border space-y-1 relative group/fline ${l.isSettlement ? 'bg-slate-800/40 border-slate-800/60 opacity-80' : 'bg-emerald-500/5 border-emerald-500/10'
                                            }`}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${l.isSettlement ? 'text-slate-500' : 'text-emerald-400'}`}>
                                                        {l.ledgerName}
                                                    </span>
                                                    {l.isSettlement && (
                                                        <span className="text-[6px] font-black px-1 rounded-sm bg-slate-700 text-slate-400 uppercase tracking-tighter">
                                                            Settlement
                                                        </span>
                                                    )}
                                                    {l.mode !== 'NET' && (
                                                        <span className={`text-[6px] font-black px-1 rounded-sm uppercase tracking-tighter ${l.mode === 'BANK' ? 'bg-brand-500/20 text-brand-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                            {l.mode === 'BANK' ? 'BANK' : 'CASH'}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-mono font-bold ${l.isSettlement ? 'text-slate-500' : 'text-emerald-300'}`}>
                                                    {formatNumber(l.amount)}
                                                </span>
                                            </div>
                                            <p className={`text-[10px] font-bold uppercase tracking-tight line-clamp-1 ${l.isSettlement ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {l.narration}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* You Pay Column */}
                            <div className="space-y-3">
                                <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.2em] block pl-2">You Give</span>
                                {businessFlow.payLines.length === 0 ? (
                                    <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center">
                                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">No entries</p>
                                    </div>
                                ) : (
                                    businessFlow.payLines.map((l, i) => (
                                        <div key={i} className={`p-3 rounded-2xl border space-y-1 ${l.isSettlement ? 'bg-slate-800/40 border-slate-800/60 opacity-80' : 'bg-brand-500/5 border-brand-500/10'
                                            }`}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${l.isSettlement ? 'text-slate-500' : 'text-brand-300'}`}>
                                                        {l.ledgerName}
                                                    </span>
                                                    {l.isSettlement && (
                                                        <span className="text-[6px] font-black px-1 rounded-sm bg-slate-700 text-slate-400 uppercase tracking-tighter">
                                                            Settlement
                                                        </span>
                                                    )}
                                                    {l.mode !== 'NET' && (
                                                        <span className={`text-[6px] font-black px-1 rounded-sm uppercase tracking-tighter ${l.mode === 'BANK' ? 'bg-brand-500/20 text-brand-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                            {l.mode === 'BANK' ? 'BANK' : 'CASH'}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-mono font-bold ${l.isSettlement ? 'text-slate-500' : 'text-brand-300'}`}>
                                                    {formatNumber(l.amount)}
                                                </span>
                                            </div>
                                            <p className={`text-[10px] font-bold uppercase tracking-tight line-clamp-1 ${l.isSettlement ? 'text-slate-600' : 'text-slate-400'}`}>
                                                {l.narration}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-6 border-t border-slate-800 bg-slate-900/40">
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-2xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-slate-700/50"
                    >
                        Close Breakdown
                    </button>
                </div>
            </div>
        </div>
    );
}
