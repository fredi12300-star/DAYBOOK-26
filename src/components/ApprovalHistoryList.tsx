import { useState } from 'react';
import { History, CheckCircle2, XCircle, Building2, ChevronDown, ChevronUp, Banknote } from 'lucide-react';
import type { Voucher, LedgerTag } from '../types/accounting';
import { formatDate, formatNumber } from '../lib/validation';

interface ApprovalHistoryListProps {
    vouchers: Voucher[];
    tags: LedgerTag[];
}

export default function ApprovalHistoryList({
    vouchers,
    tags
}: ApprovalHistoryListProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activeVoucherTab, setActiveVoucherTab] = useState<string | null>(null);

    // Group vouchers by Session (session_id)
    const groupedBySession = vouchers.reduce((acc, voucher) => {
        const key = voucher.session?.id || voucher.party_id || 'no-party';
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(voucher);
        return acc;
    }, {} as Record<string, Voucher[]>);

    // Convert to array of groups for rendering
    const sessionGroups = Object.values(groupedBySession).sort((a, b) => {
        // Sort by the latest voucher date in the group
        const dateA = new Date(a[0].session?.created_at || a[0].created_at).getTime();
        const dateB = new Date(b[0].session?.created_at || b[0].created_at).getTime();
        return dateB - dateA; // Newest first
    });

    // If an item is expanded, ONLY show that group
    const filtered = expandedId
        ? sessionGroups.filter(group => group.some(v => v.id === expandedId))
        : sessionGroups;

    if (filtered.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center surface-card bg-slate-950/20">
                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                    <History size={24} className="text-slate-600" />
                </div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No History Found</h3>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">No approved or rejected transactions in this period</p>
            </div>
        );
    }

    // Calculate settlement for multiple vouchers (aggregated)
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
            bankBreakdown
        };
    }

    return (
        <div className="space-y-4">
            {filtered.map(group => {
                // Each group contains all vouchers for a single customer
                const primaryVoucher = group[0];
                const isExpanded = expandedId === primaryVoucher.id || group.some(v => v.id === expandedId);

                // All vouchers in this group are for the same customer
                const partyVouchers = group;

                // Calculate aggregated settlement for all vouchers in this group
                const aggregatedSettlement = calculateAggregatedSettlement(partyVouchers);

                // Determine which voucher to display (either the selected tab or the primary one)
                const displayVoucher = isExpanded && activeVoucherTab
                    ? partyVouchers.find(pv => pv.id === activeVoucherTab) || primaryVoucher
                    : primaryVoucher;

                const mode = (aggregatedSettlement?.recvBank || 0) + (aggregatedSettlement?.paidBank || 0) > 0 ? 'BANK' : 'CASH';

                // Check if ALL vouchers in the group have the same approval status
                const allApproved = partyVouchers.every(v => v.approval_status === 'APPROVED');
                const allRejected = partyVouchers.every(v => v.approval_status === 'REJECTED');

                return (
                    <div
                        key={primaryVoucher.id}
                        className={`surface-card border rounded-2xl transition-all duration-300 ${isExpanded ? 'ring-1 ring-brand-500/50 bg-slate-900/80 shadow-2xl overflow-visible' :
                            allApproved ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-900/60 hover:border-slate-700 overflow-hidden' :
                                allRejected ? 'bg-rose-950/5 border-rose-900/20 hover:border-rose-500/20 overflow-hidden' :
                                    'bg-amber-950/5 border-amber-900/20 hover:border-amber-500/20 overflow-hidden'
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
                                    setExpandedId(primaryVoucher.id);
                                    setActiveVoucherTab(primaryVoucher.id);
                                }
                            }}
                        >
                            <div className="flex items-center gap-6">
                                <div className="flex flex-col gap-2">
                                    <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${allApproved ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                        allRejected ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                            'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                        }`}>
                                        {allApproved ? <CheckCircle2 size={12} /> : allRejected ? <XCircle size={12} /> : <History size={12} />}
                                        <span className="text-[10px] font-black uppercase tracking-wider">
                                            {allApproved ? 'Authorized' : allRejected ? 'Rejected' : 'Mixed'}
                                        </span>
                                    </div>
                                    {mode === 'BANK' ? <Building2 size={18} className="text-slate-500 ml-2" /> : <Banknote size={18} className="text-slate-500 ml-2" />}
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
                                            aggregatedSettlement?.positionType === 'PAY' ? 'text-rose-500' : 'text-slate-500'
                                            }`}>
                                            {aggregatedSettlement?.positionType === 'RECEIVE' ? 'Received' :
                                                aggregatedSettlement?.positionType === 'PAY' ? 'Paid' : 'Balanced / Internal'}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-600">•</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            {primaryVoucher.session?.created_at
                                                ? formatDate(primaryVoucher.session.created_at)
                                                : formatDate(primaryVoucher.voucher_date)}
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
                                <div className="px-6 pt-4 border-b border-slate-800/50">
                                    <div className="flex gap-2 -mb-px overflow-x-auto">
                                        {partyVouchers.map((pv) => {
                                            const isActive = activeVoucherTab ? pv.id === activeVoucherTab : pv.id === primaryVoucher.id;
                                            const voucherApproved = pv.approval_status === 'APPROVED';
                                            return (
                                                <button
                                                    key={pv.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveVoucherTab(pv.id);
                                                    }}
                                                    disabled={partyVouchers.length === 1}
                                                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${isActive
                                                        ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                                                        : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                                        } ${partyVouchers.length === 1 ? 'cursor-default' : 'cursor-pointer'}`}
                                                >
                                                    {voucherApproved ? <CheckCircle2 size={10} className="text-emerald-500" /> : <XCircle size={10} className="text-rose-500" />}
                                                    <span className="font-mono">{pv.voucher_type?.type_name || pv.voucher_no}</span>
                                                    <span className="ml-2 text-[10px]">•</span>
                                                    <span className="ml-2">{formatNumber(pv.total_debit)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
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

                                        {/* Right: Settlement Summary */}
                                        <div className="flex flex-col gap-6">
                                            {aggregatedSettlement && (
                                                <div className="bg-slate-950/40 rounded-xl border border-slate-800 relative">
                                                    {/* Header */}
                                                    <div className="px-5 py-3 border-b border-slate-800/50 bg-slate-900/30">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Customer Settlement (Total)</span>
                                                    </div>

                                                    {/* Content Grid */}
                                                    <div className="p-5 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-x-12 gap-y-6 items-center">
                                                        {/* Left: Gross Totals */}
                                                        <div className="space-y-3 border-r border-slate-800/50 pr-8 hidden md:block">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">You Receive</span>
                                                                <span className="font-mono font-bold text-white text-sm tracking-wide">
                                                                    {formatNumber(aggregatedSettlement.totalReceivable)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">You Pay</span>
                                                                <span className="font-mono font-bold text-white text-sm tracking-wide">
                                                                    {formatNumber(aggregatedSettlement.totalPayable)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Center: Net Position & Breakdown */}
                                                        <div className="flex flex-col items-center justify-center text-center">
                                                            <div className="flex flex-col items-center space-y-3 mb-6">
                                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Net Position</span>
                                                                <span className={`font-mono text-3xl font-black tracking-tight ${aggregatedSettlement.positionType === 'RECEIVE' ? 'text-emerald-400' :
                                                                    aggregatedSettlement.positionType === 'PAY' ? 'text-rose-400' : 'text-slate-400'
                                                                    }`}>
                                                                    {formatNumber(aggregatedSettlement.netPosition)}
                                                                </span>
                                                                <div className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border ${aggregatedSettlement.positionType === 'RECEIVE' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                                    aggregatedSettlement.positionType === 'PAY' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                                                        'bg-slate-800 border-slate-700 text-slate-400'
                                                                    }`}>
                                                                    {aggregatedSettlement.positionType === 'RECEIVE' ? 'Recv from Customer' :
                                                                        aggregatedSettlement.positionType === 'PAY' ? 'Pay to Customer' : 'Balanced (Internal movement)'}
                                                                </div>
                                                            </div>

                                                            {/* Horizontal Mode Breakdown - Integrated underneath */}
                                                            <div className="flex flex-wrap justify-center gap-3 pt-6 border-t border-slate-800/50 w-full">
                                                                {(() => {
                                                                    const netCash = aggregatedSettlement.recvCash - aggregatedSettlement.paidCash;

                                                                    return (
                                                                        <>
                                                                            <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${netCash > 0 ? 'bg-emerald-500/5 border-emerald-500/10' : netCash < 0 ? 'bg-rose-500/5 border-rose-500/10' : 'bg-slate-900/50 border-slate-800'}`}>
                                                                                <div className="flex flex-col items-start min-w-0">
                                                                                    <span className={`text-[8px] font-black uppercase tracking-widest ${netCash > 0 ? 'text-emerald-500/80' : netCash < 0 ? 'text-rose-500/80' : 'text-slate-500'}`}>
                                                                                        {netCash >= 0 ? 'Cash Recv' : 'Cash Paid'}
                                                                                    </span>
                                                                                    <span className={`font-mono font-black text-sm whitespace-nowrap ${(netCash !== 0)
                                                                                        ? (netCash > 0 ? 'text-emerald-400' : 'text-rose-400')
                                                                                        : 'text-slate-600'
                                                                                        }`}>
                                                                                        {formatNumber(Math.abs(netCash))}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            {Object.entries(aggregatedSettlement.bankBreakdown || {}).map(([bankName, netAmount]) => {
                                                                                if (netAmount === 0) return null;
                                                                                const isInflow = netAmount >= 0;
                                                                                return (
                                                                                    <div key={bankName} className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${isInflow ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10'}`}>
                                                                                        <div className="flex flex-col items-start min-w-0">
                                                                                            <span className={`text-[8px] font-black uppercase tracking-widest ${isInflow ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                                                                                {isInflow ? `Recv ${bankName}` : `Pay ${bankName}`}
                                                                                            </span>
                                                                                            <span className={`font-mono font-black text-sm whitespace-nowrap ${isInflow ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                                {formatNumber(Math.abs(netAmount))}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedId(null);
                                                    setActiveVoucherTab(null);
                                                }}
                                                className="w-full py-2 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors mt-auto"
                                            >
                                                Collapse Details
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
