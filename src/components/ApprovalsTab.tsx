import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, XCircle, Building2, CheckCircle2, ChevronDown, ChevronUp, Banknote, ChevronLeft, ChevronRight, X, Zap } from 'lucide-react';
import type { Voucher, LedgerTag } from '../types/accounting';
import { formatDate, formatNumber } from '../lib/validation';


interface ApprovalsTabProps {
    vouchers: Voucher[];
    tags: LedgerTag[];
    onApplyAdjustment: (sessionId: string, partyId: string, type: 'CREDIT' | 'DISCOUNT' | 'ROUND_PLUS' | 'ROUND_MINUS', amount: number) => void;
    onFinalApprove: (ids: string[]) => void;
    onReject: (ids: string[]) => void;
    processingId?: string | null;
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
    activeVoucherTab: string | null;
    setActiveVoucherTab: (id: string | null) => void;
    onDeleteVoucher: (id: string, group: Voucher[]) => void;
}

export default function ApprovalsTab({
    vouchers,
    tags,
    onApplyAdjustment,
    onFinalApprove,
    onReject,
    processingId,
    expandedId,
    setExpandedId,
    activeVoucherTab,
    setActiveVoucherTab,
    onDeleteVoucher
}: ApprovalsTabProps) {
    const tabsRef = useRef<Record<string, HTMLDivElement | null>>({});
    const [canScrollMap, setCanScrollMap] = useState<Record<string, { left: boolean; right: boolean }>>({});
    const [activeActionMap, setActiveActionMap] = useState<Record<string, 'CREDIT' | 'DISCOUNT' | 'ROUND_PLUS' | 'ROUND_MINUS' | null>>({});
    const [amountMap, setAmountMap] = useState<Record<string, string>>({});

    const checkScroll = (key: string) => {
        const el = tabsRef.current[key];
        if (el) {
            const canScrollLeft = el.scrollLeft > 5;
            const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 5;
            setCanScrollMap(prev => {
                if (prev[key]?.left === canScrollLeft && prev[key]?.right === canScrollRight) return prev;
                return { ...prev, [key]: { left: canScrollLeft, right: canScrollRight } };
            });
        }
    };

    const handleScroll = (key: string, direction: 'left' | 'right') => {
        const el = tabsRef.current[key];
        if (el) {
            const scrollAmount = 200;
            el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
        }
    };

    // Auto-collapse if the expanded item is removed (e.g., after approval/rejection)
    useEffect(() => {
        if (expandedId) {
            const stillExists = vouchers.some(v => (v.session_id || v.session?.id || v.party_id || v.id) === expandedId);
            if (!stillExists) {
                setExpandedId(null);
                setActiveVoucherTab(null);
            }
        }
    }, [vouchers, expandedId]);

    // Group vouchers by Session (session_id)
    // Fallback to customer (party_id) if no session exists (legacy)
    const groupedBySession = vouchers.reduce((acc, voucher) => {
        // Use session_id as primary key, or party_id/voucher_id as fallback
        const key = voucher.session_id || voucher.session?.id || voucher.party_id || voucher.id;

        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(voucher);
        return acc;
    }, {} as Record<string, Voucher[]>);

    // Convert to array of groups for rendering and sort by date
    const sessionGroups = Object.values(groupedBySession).sort((a, b) => {
        // Sort by the latest voucher date in the group
        const dateA = new Date(a[0].session?.created_at || a[0].created_at).getTime();
        const dateB = new Date(b[0].session?.created_at || b[0].created_at).getTime();
        return dateB - dateA; // Newest first
    });

    // If an item is expanded, ONLY show that group
    const filtered = expandedId
        ? sessionGroups.filter(group => {
            const primary = group[0];
            const sessionKey = primary.session?.id || primary.party_id || primary.id;
            return sessionKey === expandedId || group.some(v => v.id === expandedId);
        })
        : sessionGroups;

    if (filtered.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center surface-card bg-slate-950/20">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No Pending Authorizations</h3>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">All checker-approved items have been authorized</p>
            </div>
        );
    }

    // Reuse settlement logic from DayBook/VoucherSessionEntry
    function calculateAggregatedSettlement(vouchersList: Voucher[]) {
        const SETTLEMENT_CASH_TAG = 'PHYSICAL CASH';
        const SETTLEMENT_BANK_TAG = 'BANK ACCOUNT';
        const cashTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_CASH_TAG))?.id;
        const bankTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_BANK_TAG))?.id;

        let businessReceive = 0;
        let businessPay = 0;
        let totalCashIn = 0;
        let totalCashOut = 0;
        let totalBankIn = 0;
        let totalBankOut = 0;

        // Micro-metrics for CFO view
        let principal = 0;
        let interest = 0;
        let charges = 0;

        const bankBreakdown: Record<string, number> = {};

        vouchersList.forEach(voucher => {
            if (!voucher.lines) return;

            voucher.lines.forEach((l: any) => {
                const ledger = l.ledger;
                const isCashBankLedger = ledger?.is_cash_bank || false;
                const hasBankTag = bankTagId && ledger?.business_tags?.includes(bankTagId);
                const hasCashTag = cashTagId && ledger?.business_tags?.includes(cashTagId);

                const isBankFallback = !hasCashTag && (
                    ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                    ledger?.ledger_name?.toLowerCase().includes('bank')
                );
                const isBankLine = isCashBankLedger && (hasBankTag || isBankFallback);
                const isCashLine = isCashBankLedger && !isBankLine;

                const amount = Number(l.amount) || 0;
                const side = l.side;

                if (isBankLine) {
                    const bankName = ledger?.ledger_name || 'Bank Account';
                    if (!bankBreakdown[bankName]) bankBreakdown[bankName] = 0;
                    if (side === 'DR') {
                        totalBankIn += amount;
                        bankBreakdown[bankName] += amount;
                    } else {
                        totalBankOut += amount;
                        bankBreakdown[bankName] -= amount;
                    }
                } else if (isCashLine) {
                    if (side === 'DR') totalCashIn += amount;
                    else totalCashOut += amount;
                } else {
                    if (side === 'DR') businessPay += amount;
                    else businessReceive += amount;

                    // CFO categorization logic (heuristic based on ledger name)
                    const name = (ledger?.ledger_name || '').toLowerCase();
                    if (name.includes('principal') || name.includes('receivable')) {
                        principal += (side === 'CR' ? amount : -amount);
                    } else if (name.includes('interest')) {
                        interest += (side === 'CR' ? amount : -amount);
                    } else if (name.includes('charge') || name.includes('fee')) {
                        charges += (side === 'CR' ? amount : -amount);
                    }
                }
            });
        });

        const netBusinessPosition = businessReceive - businessPay;

        return {
            totalReceivable: businessReceive,
            totalPayable: businessPay,
            netPosition: Math.abs(netBusinessPosition),
            positionType: netBusinessPosition > 0.01 ? 'RECEIVE' : netBusinessPosition < -0.01 ? 'PAY' : 'BALANCED',
            recvCash: totalCashIn,
            recvBank: totalBankIn,
            paidCash: totalCashOut,
            paidBank: totalBankOut,
            bankBreakdown,
            metrics: {
                principal: Math.abs(principal),
                interest: Math.abs(interest),
                charges: Math.abs(charges)
            }
        };
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <ShieldCheck size={20} className="text-amber-400" />
                </div>
                <div>
                    <h2 className="text-xs font-black text-white uppercase tracking-widest">Awaiting Authorization</h2>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Click to review and authorize</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {filtered.map(group => {
                    // Each group contains all vouchers for a single customer
                    // Use the first voucher as the representative for the group
                    const primaryVoucher = group[0];
                    const sessionKey = primaryVoucher.session_id || primaryVoucher.session?.id || primaryVoucher.party_id || primaryVoucher.id;
                    const isExpanded = expandedId === sessionKey || group.some(v => v.id === expandedId);

                    // All vouchers in this group are for the same customer
                    // Sort vouchers chronologically (older first, adjustments last)
                    const partyVouchers = [...group].sort((a, b) =>
                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );

                    // Calculate aggregated settlement for all vouchers in this group
                    const aggregatedSettlement = calculateAggregatedSettlement(partyVouchers);

                    // Determine which voucher to display (either the selected tab or the primary one)
                    const displayVoucher = isExpanded && activeVoucherTab
                        ? partyVouchers.find(pv => pv.id === activeVoucherTab) || primaryVoucher
                        : primaryVoucher;

                    const mode = (aggregatedSettlement?.recvBank || 0) + (aggregatedSettlement?.paidBank || 0) > 0 ? 'BANK' : 'CASH';

                    return (
                        <div
                            key={primaryVoucher.id}
                            className={`surface-card bg-slate-950/40 border border-slate-800 rounded-2xl transition-all duration-300 ${isExpanded ? 'ring-1 ring-brand-500/50 bg-slate-900/80 shadow-2xl overflow-visible' : 'hover:bg-slate-900/60 hover:border-slate-700 overflow-hidden'
                                }`}
                        >
                            {/* Summary Header */}
                            <div
                                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => {
                                    if (isExpanded) {
                                        setExpandedId(null);
                                        setActiveVoucherTab(null);
                                    } else {
                                        setExpandedId(sessionKey);
                                        setActiveVoucherTab(primaryVoucher.id);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-6">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${aggregatedSettlement?.positionType === 'RECEIVE'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : aggregatedSettlement?.positionType === 'PAY'
                                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                        }`}>
                                        {mode === 'BANK' ? <Building2 size={18} /> : <Banknote size={18} />}
                                    </div>

                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">
                                                {primaryVoucher.party?.party_name || 'Multiple/Other'}
                                            </span>
                                            {partyVouchers.length > 1 && (
                                                <span className="text-[10px] font-mono text-brand-400 uppercase tracking-wider bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                                                    {partyVouchers.length} Vouchers
                                                </span>
                                            )}
                                            {partyVouchers.length === 1 && (
                                                <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                                    {primaryVoucher.voucher_no}
                                                </span>
                                            )}
                                        </div>
                                        {primaryVoucher.party?.address && (
                                            <span className="text-[10px] font-medium text-slate-500 mt-0.5 truncate max-w-[300px]">
                                                {primaryVoucher.party.address}
                                            </span>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${aggregatedSettlement?.positionType === 'RECEIVE' ? 'text-emerald-500' :
                                                aggregatedSettlement?.positionType === 'PAY' ? 'text-rose-500' : 'text-brand-500'
                                                }`}>
                                                {aggregatedSettlement?.positionType === 'RECEIVE' ? 'Receiving' :
                                                    aggregatedSettlement?.positionType === 'PAY' ? 'Paying' : 'Balanced / Internal'}
                                            </span>
                                            <span className="text-[10px] font-black text-slate-600">•</span>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                {primaryVoucher.session?.created_at
                                                    ? formatDate(primaryVoucher.session.created_at) // Show session timestamp if available
                                                    : formatDate(primaryVoucher.voucher_date)}      // Fallback to voucher date
                                            </span>
                                            {primaryVoucher.session?.created_at && (
                                                <>
                                                    <span className="text-[10px] font-black text-slate-600">•</span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                        Session: {new Date(primaryVoucher.session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <span className={`text-lg font-mono font-black ${aggregatedSettlement?.positionType === 'RECEIVE' ? 'text-emerald-400' :
                                            aggregatedSettlement?.positionType === 'PAY' ? 'text-rose-400' : 'text-white'
                                            }`}>
                                            {formatNumber(aggregatedSettlement?.netPosition || primaryVoucher.total_debit)}
                                        </span>
                                    </div>
                                    <div className="text-slate-600">
                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="animate-in slide-in-from-top-2 duration-200">
                                    {/* Voucher heading/tabs */}
                                    <div className="px-6 pt-4 border-b border-slate-800/50 relative group/tabs-container">
                                        {/* Left Arrow */}
                                        {canScrollMap[sessionKey]?.left && (
                                            <button
                                                onClick={() => handleScroll(sessionKey, 'left')}
                                                className="absolute left-0 top-4 bottom-0 z-20 px-1 bg-gradient-to-r from-slate-950 to-transparent flex items-center text-slate-400 hover:text-white transition-opacity"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                        )}

                                        <div
                                            ref={(el) => {
                                                if (el) tabsRef.current[sessionKey] = el;
                                                if (el && !canScrollMap[sessionKey]) checkScroll(sessionKey);
                                            }}
                                            onScroll={() => checkScroll(sessionKey)}
                                            className="flex gap-2 -mb-px overflow-x-auto scrollbar-hide scroll-smooth scroll-px-4"
                                        >
                                            {partyVouchers.map((pv) => {
                                                const isActive = activeVoucherTab ? pv.id === activeVoucherTab : pv.id === primaryVoucher.id;
                                                const isAdjustment = pv.narration?.startsWith('Adjustment:');

                                                return (
                                                    <div key={pv.id} className="relative flex-shrink-0 group/tab">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveVoucherTab(pv.id);
                                                            }}
                                                            disabled={partyVouchers.length === 1}
                                                            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center h-full ${isActive
                                                                ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                                                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                                                } ${partyVouchers.length === 1 ? 'cursor-default' : 'cursor-pointer'}`}
                                                        >
                                                            <div className="flex flex-col items-start">
                                                                <span className="font-mono">{pv.voucher_type?.type_name || pv.voucher_no}</span>
                                                                <span className="text-[10px] opacity-70 border-t border-slate-700/50 mt-1 pt-1 w-full">{formatNumber(pv.total_debit)}</span>
                                                            </div>
                                                        </button>

                                                        {isAdjustment && partyVouchers.length > 1 && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onDeleteVoucher(pv.id, partyVouchers);
                                                                }}
                                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 border border-slate-700 text-slate-500 hover:text-rose-500 hover:border-rose-500/50 flex items-center justify-center opacity-0 group-hover/tab:opacity-100 transition-opacity z-30 shadow-xl"
                                                            >
                                                                <X size={10} strokeWidth={3} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Right Arrow */}
                                        {canScrollMap[sessionKey]?.right && (
                                            <button
                                                onClick={() => handleScroll(sessionKey, 'right')}
                                                className="absolute right-0 top-4 bottom-0 z-20 px-1 bg-gradient-to-l from-slate-950 to-transparent flex items-center text-slate-400 hover:text-white transition-opacity"
                                            >
                                                <ChevronRight size={20} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="px-6 pb-6 pt-6">
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                            {/* Left: Ledger Lines */}
                                            <div className="space-y-4">
                                                <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    <Building2 size={12} /> Transaction Breakdown
                                                </h4>
                                                <div className="space-y-2">
                                                    {displayVoucher.lines?.map((line: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/20 border border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${line.side === 'DR' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                                    {line.side}
                                                                </span>
                                                                <span className="text-xs font-bold text-slate-300">{line.ledger?.ledger_name}</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-slate-200 text-sm">{formatNumber(line.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="pt-3 flex justify-between items-center text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                                                    <span>Execution Date: {formatDate(displayVoucher.voucher_date)}</span>
                                                    {displayVoucher.party?.phone && <span>Contact: {displayVoucher.party.phone}</span>}
                                                </div>
                                            </div>

                                            {/* Right: Settlement & Actions */}
                                            <div className="flex flex-col gap-6">
                                                {/* Settlement Summary */}
                                                {aggregatedSettlement && (
                                                    <div className="bg-slate-950/40 rounded-2xl border border-slate-800 relative flex flex-col">
                                                        {/* Header */}
                                                        <div className="px-6 py-4 border-b border-slate-800/50 bg-slate-900/30 flex items-center justify-between overflow-visible">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Customer Settlement (Total)</span>

                                                            {/* Actions Dropdown Removed - Redesigned as direct buttons below */}
                                                        </div>

                                                        {/* ZONE 1: SESSION SUMMARY (Top Row) */}
                                                        <div className="p-6 border-b border-slate-800/30">
                                                            <div className="grid grid-cols-2 gap-px bg-slate-800/50">
                                                                <div className="bg-slate-900/40 pb-2 pr-4">
                                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">You Receive</div>
                                                                    <div className="text-xl font-mono font-black text-white">
                                                                        ₹ {formatNumber(aggregatedSettlement.totalReceivable)}
                                                                    </div>
                                                                </div>
                                                                <div className="bg-slate-900/40 pb-2 pl-4 text-right">
                                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">You Pay</div>
                                                                    <div className="text-xl font-mono font-black text-white">
                                                                        ₹ {formatNumber(aggregatedSettlement.totalPayable)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* ZONE 2: NET POSITION (Center Focus Block) */}
                                                        <div className="px-6 py-10 flex flex-col items-center justify-center text-center bg-brand-500/5 relative">
                                                            <div className="absolute top-4 left-6">
                                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Net Position</span>
                                                            </div>

                                                            <div className="flex flex-col items-center gap-4">
                                                                <div className={`text-5xl font-mono font-black tracking-tight ${aggregatedSettlement.positionType === 'RECEIVE' ? 'text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.2)]' :
                                                                    aggregatedSettlement.positionType === 'PAY' ? 'text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.2)]' :
                                                                        'text-slate-400'
                                                                    }`}>
                                                                    ₹ {formatNumber(aggregatedSettlement.netPosition)}
                                                                </div>

                                                                <div className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border inline-flex items-center gap-2 ${aggregatedSettlement.positionType === 'RECEIVE' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                                    aggregatedSettlement.positionType === 'PAY' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                                                        'bg-brand-500/10 border-brand-500/20 text-brand-400'
                                                                    }`}>
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${aggregatedSettlement.positionType === 'RECEIVE' ? 'bg-emerald-500 animate-pulse' :
                                                                        aggregatedSettlement.positionType === 'PAY' ? 'bg-rose-500 animate-pulse' :
                                                                            'bg-brand-500 animate-pulse'
                                                                        }`} />
                                                                    {aggregatedSettlement.positionType === 'RECEIVE' ? 'Receive from Customer' :
                                                                        aggregatedSettlement.positionType === 'PAY' ? 'Pay to Customer' : 'Balanced (Internal movement)'}
                                                                </div>

                                                                {/* Adjustment Quick Actions */}
                                                                <div className="flex flex-col gap-2 w-full max-w-lg mt-2">
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                                        {(!activeActionMap[sessionKey] || activeActionMap[sessionKey] === 'CREDIT') && (
                                                                            <button
                                                                                onClick={() => setActiveActionMap(prev => ({ ...prev, [sessionKey]: 'CREDIT' }))}
                                                                                disabled={!!processingId}
                                                                                className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all group disabled:opacity-50 ${activeActionMap[sessionKey] === 'CREDIT'
                                                                                    ? 'bg-brand-500 border-brand-500 border ring-2 ring-brand-500/20'
                                                                                    : 'bg-slate-900 border border-slate-800 hover:border-brand-500/50 hover:bg-brand-500/5'
                                                                                    }`}
                                                                            >
                                                                                <div className={`w-1.5 h-1.5 rounded-full ${activeActionMap[sessionKey] === 'CREDIT' ? 'bg-white' : 'bg-brand-500/20 group-hover:bg-brand-500'}`} />
                                                                                <span className={`text-[9px] font-black uppercase tracking-widest ${activeActionMap[sessionKey] === 'CREDIT' ? 'text-white' : 'text-slate-500 group-hover:text-brand-400'}`}>Credit</span>
                                                                            </button>
                                                                        )}

                                                                        {(!activeActionMap[sessionKey] || activeActionMap[sessionKey] === 'DISCOUNT') && (
                                                                            <button
                                                                                onClick={() => setActiveActionMap(prev => ({ ...prev, [sessionKey]: 'DISCOUNT' }))}
                                                                                disabled={!!processingId}
                                                                                className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all group disabled:opacity-50 ${activeActionMap[sessionKey] === 'DISCOUNT'
                                                                                    ? 'bg-brand-500 border-brand-500 border ring-2 ring-brand-500/20'
                                                                                    : 'bg-slate-900 border border-slate-800 hover:border-brand-500/50 hover:bg-brand-500/5'
                                                                                    }`}
                                                                            >
                                                                                <div className={`w-1.5 h-1.5 rounded-full ${activeActionMap[sessionKey] === 'DISCOUNT' ? 'bg-white' : 'bg-brand-500/20 group-hover:bg-brand-500'}`} />
                                                                                <span className={`text-[9px] font-black uppercase tracking-widest ${activeActionMap[sessionKey] === 'DISCOUNT' ? 'text-white' : 'text-slate-500 group-hover:text-brand-400'}`}>Discount</span>
                                                                            </button>
                                                                        )}

                                                                        {(!activeActionMap[sessionKey] || activeActionMap[sessionKey] === 'ROUND_PLUS') && (
                                                                            <button
                                                                                onClick={() => setActiveActionMap(prev => ({ ...prev, [sessionKey]: 'ROUND_PLUS' }))}
                                                                                disabled={!!processingId}
                                                                                className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all group disabled:opacity-50 ${activeActionMap[sessionKey] === 'ROUND_PLUS'
                                                                                    ? 'bg-emerald-500 border-emerald-500 border ring-2 ring-emerald-500/20'
                                                                                    : 'bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5'
                                                                                    }`}
                                                                            >
                                                                                <div className={`w-1.5 h-1.5 rounded-full ${activeActionMap[sessionKey] === 'ROUND_PLUS' ? 'bg-white' : 'bg-emerald-500/20 group-hover:bg-emerald-500'}`} />
                                                                                <span className={`text-[9px] font-black uppercase tracking-widest ${activeActionMap[sessionKey] === 'ROUND_PLUS' ? 'text-white' : 'text-slate-500 group-hover:text-emerald-400'}`}>Round [+]</span>
                                                                            </button>
                                                                        )}

                                                                        {(!activeActionMap[sessionKey] || activeActionMap[sessionKey] === 'ROUND_MINUS') && (
                                                                            <button
                                                                                onClick={() => setActiveActionMap(prev => ({ ...prev, [sessionKey]: 'ROUND_MINUS' }))}
                                                                                disabled={!!processingId}
                                                                                className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all group disabled:opacity-50 ${activeActionMap[sessionKey] === 'ROUND_MINUS'
                                                                                    ? 'bg-rose-500 border-rose-500 border ring-2 ring-rose-500/20'
                                                                                    : 'bg-slate-900 border border-slate-800 hover:border-rose-500/50 hover:bg-rose-500/5'
                                                                                    }`}
                                                                            >
                                                                                <div className={`w-1.5 h-1.5 rounded-full ${activeActionMap[sessionKey] === 'ROUND_MINUS' ? 'bg-white' : 'bg-rose-500/20 group-hover:bg-rose-500'}`} />
                                                                                <span className={`text-[9px] font-black uppercase tracking-widest ${activeActionMap[sessionKey] === 'ROUND_MINUS' ? 'text-white' : 'text-slate-500 group-hover:text-rose-400'}`}>Round [-]</span>
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* Amount Input & Confirmation */}
                                                                    {activeActionMap[sessionKey] && (
                                                                        <div className="flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
                                                                            <div className="relative flex-1">
                                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">₹</span>
                                                                                <input
                                                                                    type="number"
                                                                                    value={amountMap[sessionKey] || ''}
                                                                                    onChange={(e) => setAmountMap(prev => ({ ...prev, [sessionKey]: e.target.value }))}
                                                                                    placeholder="Enter amount..."
                                                                                    autoFocus
                                                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-7 pr-4 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-brand-500/50 transition-all"
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') {
                                                                                            const val = parseFloat(amountMap[sessionKey]);
                                                                                            if (val > 0) {
                                                                                                onApplyAdjustment(sessionKey, primaryVoucher.party_id!, activeActionMap[sessionKey]!, val);
                                                                                                setActiveActionMap(prev => ({ ...prev, [sessionKey]: null }));
                                                                                                setAmountMap(prev => ({ ...prev, [sessionKey]: '' }));
                                                                                            }
                                                                                        } else if (e.key === 'Escape') {
                                                                                            setActiveActionMap(prev => ({ ...prev, [sessionKey]: null }));
                                                                                        }
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => {
                                                                                    const val = parseFloat(amountMap[sessionKey]);
                                                                                    if (val > 0) {
                                                                                        onApplyAdjustment(sessionKey, primaryVoucher.party_id!, activeActionMap[sessionKey]!, val);
                                                                                        setActiveActionMap(prev => ({ ...prev, [sessionKey]: null }));
                                                                                        setAmountMap(prev => ({ ...prev, [sessionKey]: '' }));
                                                                                    }
                                                                                }}
                                                                                className="p-2.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/10"
                                                                            >
                                                                                <CheckCircle2 size={16} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setActiveActionMap(prev => ({ ...prev, [sessionKey]: null }))}
                                                                                className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all border border-slate-700"
                                                                            >
                                                                                <X size={16} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* ZONE 3: CASH FLOW BREAKDOWN (Bottom Section) */}
                                                        <div className="p-6 bg-slate-900/40 border-t border-slate-800/50">
                                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Cash Flow Movement</div>

                                                            <div className="space-y-3">
                                                                {(() => {
                                                                    const netCash = aggregatedSettlement.recvCash - aggregatedSettlement.paidCash;
                                                                    const flows: any[] = [];

                                                                    if (netCash !== 0) {
                                                                        flows.push({
                                                                            label: netCash > 0 ? 'Cash Received' : 'Cash Paid',
                                                                            amount: Math.abs(netCash),
                                                                            type: netCash > 0 ? 'IN' : 'OUT'
                                                                        });
                                                                    }

                                                                    Object.entries(aggregatedSettlement.bankBreakdown || {}).forEach(([bankName, netAmount]) => {
                                                                        if (netAmount !== 0) {
                                                                            flows.push({
                                                                                label: netAmount > 0 ? `Bank Received (${bankName})` : `Bank Paid (${bankName})`,
                                                                                amount: Math.abs(netAmount),
                                                                                type: netAmount > 0 ? 'IN' : 'OUT'
                                                                            });
                                                                        }
                                                                    });

                                                                    // Add Adjustments to flows
                                                                    partyVouchers.forEach(pv => {
                                                                        if (pv.narration?.startsWith('Adjustment:')) {
                                                                            const type = pv.narration.split(':')[1].trim();
                                                                            flows.push({
                                                                                label: `Adjustment: ${type}`,
                                                                                amount: pv.total_debit,
                                                                                type: 'ADJUSTMENT',
                                                                                icon: <Zap size={10} className="text-brand-400" />
                                                                            });
                                                                        }
                                                                    });

                                                                    if (flows.length === 0) {
                                                                        return <div className="text-[10px] font-bold text-slate-700 uppercase italic">No cash flow recorded</div>;
                                                                    }

                                                                    return flows.map((flow, i) => (
                                                                        <div key={i} className={`flex justify-between items-center py-2.5 px-3 rounded-lg border last:border-0 group transition-all ${flow.type === 'ADJUSTMENT'
                                                                            ? 'bg-brand-500/10 border-brand-500/30 mb-1'
                                                                            : 'border-transparent border-b-slate-800/30'
                                                                            }`}>
                                                                            <div className="flex items-center gap-3">
                                                                                {flow.type === 'ADJUSTMENT' ? (
                                                                                    <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center border border-brand-500/40">
                                                                                        {flow.icon}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className={`w-1 h-1 rounded-full ${flow.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                                                )}
                                                                                <span className={`text-[11px] font-bold transition-colors ${flow.type === 'ADJUSTMENT' ? 'text-brand-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                                                    {flow.label}
                                                                                </span>
                                                                            </div>
                                                                            <span className={`text-[13px] font-mono font-black ${flow.type === 'ADJUSTMENT' ? 'text-brand-400 px-2 py-0.5 rounded bg-brand-500/20 border border-brand-500/30' :
                                                                                flow.type === 'IN' ? 'text-emerald-400' : 'text-rose-400'
                                                                                }`}>
                                                                                ₹ {formatNumber(flow.amount)}
                                                                            </span>
                                                                        </div>
                                                                    ));
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-4 mt-auto">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onReject(group.map(v => v.id));
                                                        }}
                                                        disabled={!!processingId}
                                                        className="h-12 flex items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-500 font-bold text-xs uppercase tracking-wider hover:bg-rose-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <XCircle size={16} /> {processingId && group.some(v => v.id === processingId) ? 'Rejecting...' : 'Reject Session'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onFinalApprove(group.map(v => v.id));
                                                        }}
                                                        disabled={!!processingId}
                                                        className="h-12 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-slate-900 font-black text-xs uppercase tracking-wider hover:bg-emerald-400 shadow-glow shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <CheckCircle2 size={16} /> {processingId && group.some(v => v.id === processingId) ? 'Authorizing...' : 'Authorize Session'}
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedId(null);
                                                        setActiveVoucherTab(null);
                                                    }}
                                                    className="w-full py-2 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
                                                >
                                                    Collapse Details
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                            }
                        </div>
                    );
                })}
            </div>
        </div >
    );
}
