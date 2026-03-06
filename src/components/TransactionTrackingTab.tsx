import { useState } from 'react';
import {
    Activity, Clock, ShieldCheck, CheckCircle2, XCircle, FileSpreadsheet, Calendar, ChevronLeft, ChevronRight
} from 'lucide-react';
import type { Voucher, LedgerTag } from '../types/accounting';
import { formatDate, formatNumber } from '../lib/validation';
import { getBusinessDate } from '../lib/businessDate';
import { getBankAmount } from './BankTransactions'; // Reusing amount logic for consistency

interface TransactionTrackingTabProps {
    vouchers: Voucher[];
    tags: LedgerTag[];
    onViewHistory: (id: string) => void; // Keeping prop interface for potential future use, but removing unused vars if possible
}

export default function TransactionTrackingTab({ vouchers, tags }: TransactionTrackingTabProps) {
    const [viewMode, setViewMode] = useState<'today' | 'history'>('today');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const filteredVouchers = vouchers.filter(v => {
        if (viewMode === 'history') return true;
        const today = new Date(getBusinessDate());
        const vDate = new Date(v.created_at);
        return vDate.getDate() === today.getDate() &&
            vDate.getMonth() === today.getMonth() &&
            vDate.getFullYear() === today.getFullYear();
    });

    const sortedVouchers = [...filteredVouchers].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Pagination Logic
    const totalPages = Math.ceil(sortedVouchers.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = sortedVouchers.slice(indexOfFirstItem, indexOfLastItem);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Reset pagination when view mode changes
    const handleViewModeChange = (mode: 'today' | 'history') => {
        setViewMode(mode);
        setCurrentPage(1);
    };

    const getStatusDetails = (v: Voucher) => {
        if (v.bank_status === 'REJECTED') {
            const base = {
                label: 'Rejected',
                color: 'text-rose-500',
                bg: 'bg-rose-500/10',
                border: 'border-rose-500/20',
                icon: XCircle
            };
            if (v.bank_validation_status === 'VALIDATED') return { ...base, stage: 3 };
            if (v.bank_validation_status === 'REJECTED') return { ...base, stage: 2 };
            return { ...base, stage: 1 };
        }
        if (v.bank_status === 'FINAL_APPROVED') {
            return {
                label: 'Success',
                color: 'text-emerald-500',
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/20',
                icon: CheckCircle2,
                stage: 4
            };
        }
        if (v.bank_status === 'SENT_FOR_APPROVAL') {
            return {
                label: 'Final Approval',
                color: 'text-violet-500',
                bg: 'bg-violet-500/10',
                border: 'border-violet-500/20',
                icon: ShieldCheck,
                stage: 4
            };
        }
        if (v.bank_status === 'APPROVED') {
            if (v.bank_validation_status === 'VALIDATED') {
                return {
                    label: 'Checker Approval',
                    color: 'text-blue-500',
                    bg: 'bg-blue-500/10',
                    border: 'border-blue-500/20',
                    icon: ShieldCheck,
                    stage: 3
                };
            }
            return {
                label: 'Maker Validation',
                color: 'text-cyan-500',
                bg: 'bg-cyan-500/10',
                border: 'border-cyan-500/20',
                icon: FileSpreadsheet,
                stage: 2
            };
        }
        return {
            label: 'Pending Request',
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
            icon: Clock,
            stage: 1
        };
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 p-1 bg-slate-900/40 rounded-lg w-fit border border-slate-800">
                <button
                    onClick={() => handleViewModeChange('today')}
                    className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'today' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
                        }`}
                >
                    Today
                </button>
                <button
                    onClick={() => handleViewModeChange('history')}
                    className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'history' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
                        }`}
                >
                    <Calendar size={12} /> Last 3 Days
                </button>
            </div>

            {sortedVouchers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center surface-card bg-slate-950/20">
                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                        <Activity size={24} className="text-slate-700" />
                    </div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No Activity Found</h3>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">No transactions to track yet</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="surface-card bg-slate-950/20 backdrop-blur-sm overflow-hidden p-0 border border-slate-800">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-800/50 bg-slate-900/20">
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Execution Date</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Counterparty</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount to Send</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Voucher Type</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/30">
                                    {currentItems.map(v => {
                                        const status = getStatusDetails(v);
                                        const StatusIcon = status.icon;
                                        const amount = getBankAmount(v, tags);

                                        // Find any bank-related ledger in the lines
                                        const bankLine = (v.lines || []).find(l => {
                                            const ledger = l.ledger;
                                            if (!ledger) return false;
                                            const name = ledger.ledger_name?.toLowerCase() || '';
                                            const group = ledger.ledger_group?.group_name?.toLowerCase() || '';
                                            const isBank = (
                                                ledger.bank_name ||
                                                ledger.bank_account_no ||
                                                name.includes('bank') ||
                                                group.includes('bank') ||
                                                (ledger.is_cash_bank && !name.includes('cash'))
                                            );
                                            return isBank;
                                        });
                                        const senderBank = bankLine?.ledger?.ledger_name || bankLine?.ledger?.bank_name || 'System Default';

                                        return (
                                            <tr key={v.id} className="group hover:bg-brand-500/5 transition-all duration-300">
                                                {/* Date & Ref */}
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-white">{formatDate(v.voucher_date)}</span>
                                                        <span className="text-[9px] font-mono text-slate-600 mt-1 uppercase tracking-wide">
                                                            {v.voucher_no}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Counterparty */}
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/50">
                                                            <Activity size={14} className="text-slate-400" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-slate-200 uppercase tracking-tight group-hover:text-white transition-colors">
                                                                {v.party?.party_name || 'Individual'}
                                                            </span>
                                                            <div className="flex flex-col gap-0.5 mt-1">
                                                                {v.party?.customer_id && (
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                                                                        ID: {v.party.customer_id}
                                                                    </span>
                                                                )}
                                                                {v.party?.phone && (
                                                                    <span className="text-[9px] font-bold text-slate-500 mono">
                                                                        {v.party.phone}
                                                                    </span>
                                                                )}
                                                                {!v.party?.customer_id && !v.party?.phone && (
                                                                    <span className="text-[9px] font-bold text-slate-600">No contact info</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Amount */}
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-mono font-black text-white tracking-tight">
                                                            ₹{formatNumber(amount)}
                                                        </span>
                                                        <span className="text-[9px] font-black text-brand-500/80 uppercase tracking-widest mt-1">
                                                            {senderBank}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Voucher Type */}
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-2">
                                                        <div className="px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 rounded-md">
                                                            <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">
                                                                {v.voucher_type?.type_name || 'Voucher'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Status Badge */}
                                                <td className="px-8 py-6">
                                                    <div className={`px-3 py-1.5 rounded-lg border ${status.bg} ${status.border} flex items-center gap-2 w-fit shrink-0`}>
                                                        <StatusIcon size={12} className={status.color} />
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${status.color}`}>
                                                            {status.label} {status.stage}/4
                                                        </span>
                                                    </div>
                                                </td>

                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-2 py-4">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, sortedVouchers.length)} of {sortedVouchers.length} records
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => handlePageChange(page)}
                                            className={`w-8 h-8 rounded-lg text-[10px] font-black border transition-all ${currentPage === page
                                                ? 'bg-brand-500 border-brand-500 text-white shadow-glow shadow-brand-500/20'
                                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
