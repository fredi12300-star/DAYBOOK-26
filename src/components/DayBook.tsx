import { useState, useEffect } from 'react';
import { Download, Eye, RotateCcw, X, Search, FileText, CheckCircle2, AlertCircle, Landmark, Building2, UserPlus, ArrowRight } from 'lucide-react';
import type { Voucher, VoucherType, LedgerTag, Ledger, SystemConfiguration, VoucherLine } from '../types/accounting';
import { fetchVouchers, fetchVoucherTypes, reverseVoucher, fetchVoucherById, fetchSystemConfig } from '../lib/supabase';
import { formatDate, formatNumber, getTodayDate, formatTime } from '../lib/validation';
import Modal from './ui/Modal';
import ReversalModal from './ReversalModal';
import { exportVouchersToExcel } from '../lib/excel';
import VoucherPickerModal from './VoucherPickerModal';

export default function DayBook() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [showReversalModal, setShowReversalModal] = useState(false);
    const [reversingVoucher, setReversingVoucher] = useState<Voucher | null>(null);
    const [reversalLoading, setReversalLoading] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Auto-clear notification
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const [filters, setFilters] = useState({
        startDate: getTodayDate(),
        endDate: getTodayDate(),
        voucherTypeId: '',

        status: 'POSTED',
        search: ''
    });

    const [dateMode, setDateMode] = useState<'today' | 'single' | 'range'>('today');
    const [selectedDate, setSelectedDate] = useState(getTodayDate());

    const [showVoucherPicker, setShowVoucherPicker] = useState(false);
    const [voucherGroups, setVoucherGroups] = useState<import('../types/accounting').VoucherGroup[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [systemConfig, setSystemConfig] = useState<SystemConfiguration | null>(null);
    const [showBankFlowModal, setShowBankFlowModal] = useState(false);

    useEffect(() => {
        loadMasterData();
        loadVouchers();
    }, []);

    async function loadMasterData() {
        try {
            const [types, groups, fetchedTags, config] = await Promise.all([
                fetchVoucherTypes(),
                import('../lib/supabase').then(m => m.fetchVoucherGroups()),
                import('../lib/supabase').then(m => m.fetchLedgerTags()),
                fetchSystemConfig()
            ]);
            setVoucherTypes(types);
            setVoucherGroups(groups);
            setTags(fetchedTags);
            setSystemConfig(config);
        } catch (error) {
            console.error('Error loading master data:', error);
        }
    }

    async function loadVouchers(overrideFilters?: typeof filters) {
        setLoading(true);
        const activeFilters = overrideFilters || filters;
        try {
            const data = await fetchVouchers({
                startDate: activeFilters.startDate,
                endDate: activeFilters.endDate,
                voucherTypeId: activeFilters.voucherTypeId || undefined,
                status: activeFilters.status || undefined,
                search: activeFilters.search || undefined
            });
            setVouchers(data);
        } catch (error) {
            console.error('Error loading vouchers:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleViewDetails(voucherId: string) {
        try {
            const voucher = await fetchVoucherById(voucherId);
            setSelectedVoucher(voucher);
            setShowDetails(true);
        } catch (error) {
            console.error('Error fetching voucher details:', error);
        }
    }

    async function handleReverse(voucherId: string) {
        const voucher = vouchers.find(v => v.id === voucherId);
        if (!voucher) return;
        setReversingVoucher(voucher);
        setShowReversalModal(true);
    }

    async function processReversal(reason: string) {
        if (!reversingVoucher) return;

        setReversalLoading(true);
        try {
            await reverseVoucher(reversingVoucher.id, reason);
            setNotification({ type: 'success', message: 'Voucher reversal executed successfully.' });
            setShowReversalModal(false);
            setReversingVoucher(null);
            loadVouchers();
            setShowDetails(false);
        } catch (error: any) {
            setNotification({ type: 'error', message: error.message || 'Authorization error: Reversal failed' });
            throw error;
        } finally {
            setReversalLoading(false);
        }
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'POSTED':
                return <span className="badge badge-success">Posted</span>;
            case 'DRAFT':
                return <span className="badge badge-warning">Draft</span>;
            case 'REVERSED':
                return <span className="badge badge-danger">Reversed</span>;
            default:
                return <span className="badge badge-neutral">{status}</span>;
        }
    }

    function resetFilters() {
        const defaults = {
            startDate: getTodayDate(),
            endDate: getTodayDate(),
            voucherTypeId: '',
            status: 'POSTED',
            search: ''
        };
        setFilters(defaults);
        setDateMode('today');
        setSelectedDate(getTodayDate());
        loadVouchers(defaults);
    }

    function handleExport() {
        exportVouchersToExcel(vouchers);
    }

    // Customer Settlement Lens (Logic ported from VoucherSessionEntry)
    function calculateSettlement(voucher: Voucher) {
        if (!voucher.lines) return null;

        const SETTLEMENT_CASH_TAG = 'PHYSICAL CASH';
        const SETTLEMENT_BANK_TAG = 'BANK ACCOUNT';
        const cashTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_CASH_TAG))?.id;
        const bankTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_BANK_TAG))?.id;

        let businessReceive = 0; // CR on Business Ledgers (Value IN)
        let businessPay = 0;     // DR on Business Ledgers (Value OUT)

        let totalCashIn = 0;
        let totalCashOut = 0;
        let totalBankIn = 0;
        let totalBankOut = 0;

        const bankLedgerAnalysis: Record<string, { ledger: Ledger, net: number }> = {};

        voucher.lines.forEach((l: VoucherLine) => {
            // Ledger object is already joined in fetchVoucherById
            // typecast needed because VoucherLine in types might not strictly match the joined structure 100% in all contexts, but here it does
            const ledger = l.ledger as Ledger | undefined;

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
                if (side === 'DR') totalBankIn += amount;
                else totalBankOut += amount;

                // Per-ledger tracking
                if (ledger) {
                    if (!bankLedgerAnalysis[ledger.id]) {
                        bankLedgerAnalysis[ledger.id] = { ledger, net: 0 };
                    }
                    bankLedgerAnalysis[ledger.id].net += (side === 'DR' ? amount : -amount);
                }
            } else if (isCashLine) {
                if (side === 'DR') totalCashIn += amount;
                else totalCashOut += amount;
            } else {
                // Business Item (Non-Cash/Bank Flow)
                if (side === 'DR') businessPay += amount;
                else businessReceive += amount;
            }
        });

        const netBusinessPosition = businessReceive - businessPay; // Negative means PAY, Positive means RECEIVE

        return {
            totalReceivable: businessReceive,
            totalPayable: businessPay,
            netPosition: Math.abs(netBusinessPosition),
            positionType: netBusinessPosition > 0.01 ? 'RECEIVE' : netBusinessPosition < -0.01 ? 'PAY' : 'NEUTRAL',
            recvCash: totalCashIn,
            recvBank: totalBankIn,
            paidCash: totalCashOut,
            paidBank: totalBankOut,
            bank: {
                in: totalBankIn,
                out: totalBankOut,
                net: totalBankIn - totalBankOut,
                ledgers: Object.values(bankLedgerAnalysis)
            }
        };
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 animate-fade-in">
            {/* Notifications */}
            {notification && (
                <div className={`p-4 rounded-xl border animate-slide-up flex items-center gap-3 ${notification.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40 text-rose-800 dark:text-rose-400'
                    }`}>
                    {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span className="text-sm font-bold uppercase tracking-widest">{notification.message}</span>
                </div>
            )}

            {/* Header & Filter Controls */}
            <div className="surface-card">
                <div className="card-header flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-600 rounded-lg shadow-sm">
                            <FileText className="text-white" size={18} />
                        </div>
                        <div>
                            <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white leading-tight">Day Book Journal</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chronological Ledger Records</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={resetFilters} className="btn-secondary !h-10 !px-4 text-[10px] uppercase font-bold tracking-widest hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors">
                            <RotateCcw size={14} className="mr-2" /> Reset
                        </button>
                        <button
                            type="button"
                            onClick={handleExport}
                            className="btn-secondary !h-10 !px-4 text-[10px] uppercase font-bold tracking-widest"
                            disabled={vouchers.length === 0}
                        >
                            <Download size={14} className="mr-2" /> Export XLSX
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-slate-50/30 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800/50">
                    {/* Primary Filter: Date */}
                    <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-200/50 dark:border-slate-700/50">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setDateMode('today');
                                    const today = getTodayDate();
                                    setFilters(prev => ({ ...prev, startDate: today, endDate: today }));
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${dateMode === 'today'
                                    ? 'bg-brand-600 text-white shadow-glow'
                                    : 'bg-slate-800/40 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`}
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateMode('single')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${dateMode === 'single'
                                    ? 'bg-brand-600 text-white shadow-glow'
                                    : 'bg-slate-800/40 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`}
                            >
                                Select Date
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateMode('range')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${dateMode === 'range'
                                    ? 'bg-brand-600 text-white shadow-glow'
                                    : 'bg-slate-800/40 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`}
                            >
                                Select Range
                            </button>
                        </div>

                        {dateMode === 'single' && (
                            <input
                                type="date"
                                className="input-field !w-40"
                                value={selectedDate}
                                onChange={e => {
                                    setSelectedDate(e.target.value);
                                    setFilters(prev => ({ ...prev, startDate: e.target.value, endDate: e.target.value }));
                                }}
                            />
                        )}

                        {dateMode === 'range' && (
                            <>
                                <input
                                    type="date"
                                    className="input-field !w-40"
                                    value={filters.startDate}
                                    onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                                <span className="text-slate-400 font-bold">→</span>
                                <input
                                    type="date"
                                    className="input-field !w-40"
                                    value={filters.endDate}
                                    onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                />
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => loadVouchers()}
                            className="btn-primary !h-9 !px-5 text-[10px] uppercase font-black tracking-widest shadow-glow"
                        >
                            Apply
                        </button>
                    </div>

                    {/* Secondary Filters: Search, Category & Status */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Search Voucher / Invoice No</label>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                                <input
                                    type="text"
                                    className="input-field !pl-10 !h-14"
                                    placeholder="TYPE TO SEARCH..."
                                    value={filters.search}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setFilters(prev => ({ ...prev, search: val }));
                                        loadVouchers({ ...filters, search: val });
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Voucher Category</label>
                            <button
                                type="button"
                                onClick={() => setShowVoucherPicker(true)}
                                className="w-full flex items-center justify-between px-4 h-14 bg-slate-950/40 border border-slate-800 rounded-xl hover:border-brand-500/50 hover:bg-slate-900/60 transition-all text-left group"
                            >
                                {filters.voucherTypeId ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded bg-brand-500 flex items-center justify-center text-[9px] font-black text-white">
                                            {voucherTypes.find(v => v.id === filters.voucherTypeId)?.prefix}
                                        </div>
                                        <span className="text-xs font-bold text-white uppercase tracking-tight truncate">
                                            {voucherTypes.find(v => v.id === filters.voucherTypeId)?.type_name}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">All Categories</span>
                                )}
                                {filters.voucherTypeId ? (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFilters(prev => ({ ...prev, voucherTypeId: '' }));
                                            loadVouchers({ ...filters, voucherTypeId: '' });
                                        }}
                                        className="p-1 hover:bg-slate-700 rounded-full text-slate-500 hover:text-rose-400 transition-colors"
                                    >
                                        <X size={14} />
                                    </div>
                                ) : (
                                    <div className="p-1 rounded-full bg-slate-800/50 text-slate-500">
                                        <Search size={12} />
                                    </div>
                                )}
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Audit Status</label>
                            <select
                                className="select-field"
                                value={filters.status}
                                onChange={e => {
                                    setFilters(prev => ({ ...prev, status: e.target.value }));
                                    loadVouchers({ ...filters, status: e.target.value });
                                }}
                            >
                                <option value="">Full Audit Trail</option>
                                <option value="POSTED">Finalized (Posted)</option>
                                <option value="DRAFT">Pending (Draft)</option>
                                <option value="REVERSED">Corrected (Reversed)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="table-container shadow-premium">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <div className="spinner !w-8 !h-8"></div>
                        <p className="text-[10px] font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">Retrieving Journal Entries...</p>
                    </div>
                ) : vouchers.length === 0 ? (
                    <div className="text-center py-24 bg-slate-50/30 dark:bg-slate-800/10">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Search size={24} className="text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm font-semibold text-slate-500">No transactions found for this selection</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th className="table-head-cell !py-5 text-center w-12">SI No</th>
                                    <th className="table-head-cell !py-5">Date and Time</th>
                                    <th className="table-head-cell !py-5">Voucher No</th>

                                    <th className="table-head-cell !py-5">Transaction Type</th>
                                    <th className="table-head-cell !py-5">Counterparty Details</th>
                                    <th className="table-head-cell !py-5">Narration</th>

                                    <th className="table-head-cell !py-5 text-right">Business Impact</th>
                                    <th className="table-head-cell !py-5 text-center">Audit</th>
                                    <th className="table-head-cell !py-5 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {vouchers.map((voucher, index) => (
                                    <tr key={voucher.id} className="table-row group">
                                        <td className="table-cell text-center">
                                            <span className="text-[10px] font-black text-slate-500">{index + 1}</span>
                                        </td>
                                        <td className="table-cell">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-900 dark:text-slate-200">{formatDate(voucher.voucher_date)}</span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{formatTime(voucher.created_at)}</span>
                                            </div>
                                        </td>
                                        <td className="table-cell">
                                            <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded">
                                                {voucher.voucher_no}
                                            </span>
                                        </td>

                                        <td className="table-cell">
                                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                {voucher.voucher_type?.type_name}
                                            </span>
                                        </td>
                                        <td className="table-cell">
                                            {voucher.party ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-xs font-black text-slate-900 dark:text-slate-200 uppercase tracking-tight">
                                                        {voucher.party.party_name}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                        {voucher.party.phone || 'No Mobile'}
                                                    </span>
                                                    {voucher.party.customer_id && (
                                                        <span className="text-[9px] font-mono font-black text-brand-500 uppercase tracking-widest mt-0.5">
                                                            ID: {voucher.party.customer_id}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">
                                                    Internal Adjustment
                                                </span>
                                            )}
                                        </td>

                                        <td className="table-cell">
                                            <p className="text-[10px] font-bold text-slate-500 italic line-clamp-2 max-w-[200px] leading-relaxed">
                                                {voucher.narration}
                                            </p>
                                        </td>

                                        <td className="table-cell text-right">
                                            <div className="flex flex-col items-end">
                                                {voucher.voucher_type?.cash_bank_flow === 'INFLOW' ? (
                                                    <>
                                                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                            + {formatNumber(voucher.total_debit)}
                                                        </span>
                                                        <span className="text-[8px] font-black uppercase text-emerald-500/70 tracking-tighter">Inflow</span>
                                                    </>
                                                ) : voucher.voucher_type?.cash_bank_flow === 'OUTFLOW' ? (
                                                    <>
                                                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                                                            - {formatNumber(voucher.total_debit)}
                                                        </span>
                                                        <span className="text-[8px] font-black uppercase text-rose-500/70 tracking-tighter">Outflow</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                                                            {formatNumber(voucher.total_debit)}
                                                        </span>
                                                        <span className="text-[8px] font-black uppercase text-slate-500/70 tracking-tighter">Transfer</span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="table-cell text-center whitespace-nowrap">
                                            {getStatusBadge(voucher.status)}
                                        </td>
                                        <td className="table-cell text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewDetails(voucher.id)}
                                                    className="btn-icon"
                                                    title="Detailed Analysis"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                {voucher.status === 'POSTED' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReverse(voucher.id)}
                                                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all"
                                                        title="Issue Reversal"
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Detail Analysis Modal */}
            <Modal isOpen={showDetails} onClose={() => setShowDetails(false)}>
                {selectedVoucher && (
                    <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-up border border-slate-200 dark:border-slate-800">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="font-mono text-lg font-bold text-brand-600 dark:text-brand-400">{selectedVoucher.voucher_no}</span>
                                    {getStatusBadge(selectedVoucher.status)}
                                </div>
                                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mt-1">
                                    {selectedVoucher.voucher_type?.type_name}
                                </h2>
                                {selectedVoucher.party && (
                                    <div className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                        <div className="w-1 h-4 bg-brand-500 rounded-full"></div>
                                        {selectedVoucher.party.party_name}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDetails(false)}
                                className="p-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-10 space-y-10 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Entry Value Date</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(selectedVoucher.voucher_date)}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Invoice ID</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedVoucher.reference_no || "N/A"}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Creation Timestamp</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                        {new Date(selectedVoucher.created_at || "").toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'medium' })}
                                    </span>
                                </div>
                            </div>

                            {/* Customer Settlement Compact Box */}
                            {(() => {
                                const settlement = calculateSettlement(selectedVoucher);
                                if (!settlement) return null;

                                return (
                                    <div className="bg-slate-950 rounded-xl p-6 shadow-2xl border border-slate-800 relative overflow-hidden group">
                                        {/* Background Effects */}
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-brand-500/20 transition-all duration-700"></div>

                                        <div className="relative z-10">
                                            <div className="flex items-start justify-between mb-6">
                                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                                    Customer Settlement
                                                </h3>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                                                {/* Left: Input/Output */}
                                                <div className="space-y-3 border-r border-slate-800/50 pr-8">
                                                    <div className="flex justify-between items-center group/item hover:bg-white/5 p-2 rounded-lg transition-colors -mx-2">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">You Receive</span>
                                                        <span className="font-mono font-bold text-white tracking-tight">{formatNumber(settlement.totalReceivable)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center group/item hover:bg-white/5 p-2 rounded-lg transition-colors -mx-2">
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">You Pay</span>
                                                        <span className="font-mono font-bold text-white tracking-tight">{formatNumber(settlement.totalPayable)}</span>
                                                    </div>
                                                </div>

                                                {/* Center: Net Position */}
                                                <div className="flex flex-col items-center justify-center relative">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Net Position</span>
                                                    <span className={`font-mono text-3xl font-black tracking-tight ${settlement.positionType === 'RECEIVE' ? 'text-emerald-400' :
                                                        settlement.positionType === 'PAY' ? 'text-rose-400' : 'text-slate-400'
                                                        }`}>
                                                        {formatNumber(settlement.netPosition)}
                                                    </span>

                                                    <div className={`mt-3 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${settlement.positionType === 'RECEIVE'
                                                        ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
                                                        : settlement.positionType === 'PAY'
                                                            ? 'bg-rose-950/30 border-rose-900/50 text-rose-400'
                                                            : 'bg-slate-800/50 border-slate-700 text-slate-400'
                                                        }`}>
                                                        {settlement.positionType === 'RECEIVE' ? 'Recv from Customer' :
                                                            settlement.positionType === 'PAY' ? 'Pay to Customer' : 'Settled'}
                                                    </div>
                                                </div>

                                                {/* Right: Settlement Execution */}
                                                <div className="space-y-4 border-l border-slate-800/50 pl-8">
                                                    {settlement.recvCash > 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-0.5">Recv Cash</span>
                                                            <span className="font-mono font-bold text-emerald-400 text-lg">{formatNumber(settlement.recvCash)}</span>
                                                        </div>
                                                    )}
                                                    {settlement.paidCash > 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-0.5">Paid Cash</span>
                                                            <span className="font-mono font-bold text-rose-400 text-lg">{formatNumber(settlement.paidCash)}</span>
                                                        </div>
                                                    )}

                                                    {settlement.recvBank > 0 && (
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center group cursor-pointer" onClick={() => setShowBankFlowModal(true)}>
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-0.5 group-hover:text-brand-400 transition-colors">Recv Bank</span>
                                                                <span className="font-mono font-bold text-indigo-400 text-lg group-hover:text-brand-400 transition-colors">{formatNumber(settlement.recvBank)}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {settlement.paidBank > 0 && (
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center group cursor-pointer" onClick={() => setShowBankFlowModal(true)}>
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-0.5 group-hover:text-rose-400 transition-colors">Paid Bank</span>
                                                                <span className="font-mono font-bold text-rose-400 text-lg group-hover:text-rose-300 transition-colors">{formatNumber(settlement.paidBank)}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {settlement.recvCash === 0 && settlement.paidCash === 0 && settlement.recvBank === 0 && settlement.paidBank === 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700 pb-0.5">No Settlement</span>
                                                            <span className="font-mono font-bold text-slate-600 text-lg">-</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">System Narration Record</span>
                                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium italic">
                                    "{selectedVoucher.narration}"
                                </p>
                            </div>

                            <div className="space-y-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Financial Component Breakdown</span>
                                <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/30 dark:bg-slate-800/10">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50/80 dark:bg-slate-800/50">
                                                <th className="px-6 py-4 text-left font-bold text-slate-500">Ledger Account</th>
                                                <th className="px-6 py-4 text-center font-bold text-slate-500">Quantity</th>
                                                <th className="px-6 py-4 text-center font-bold text-slate-500">Position</th>
                                                <th className="px-6 py-4 text-right font-bold text-slate-500">Magnitude</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                            {selectedVoucher.lines?.map((line, index) => (
                                                <tr key={index} className="group hover:bg-white dark:hover:bg-slate-800 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{line.ledger?.ledger_name}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {line.quantity ? (
                                                            <span className="font-mono font-bold text-slate-600 dark:text-slate-400 text-xs">
                                                                {line.quantity} <span className="text-[10px] uppercase">{line.uom?.code}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-2.5 py-1 rounded text-[10px] font-black tracking-widest ${line.side === 'DR'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40'
                                                            : 'bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/40'
                                                            }`}>
                                                            {line.side}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="font-mono font-bold text-slate-900 dark:text-white">{formatNumber(line.amount)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-100/50 dark:bg-slate-800/80">
                                            <tr>
                                                <td className="px-6 py-6 font-bold text-slate-900 dark:text-white uppercase tracking-widest text-[10px]">Net Balance Verification</td>
                                                <td></td>
                                                <td></td>
                                                <td className="px-6 py-6 text-right">
                                                    <span className="font-mono text-lg font-black text-brand-600 dark:text-brand-400">{formatNumber(selectedVoucher.total_debit)}</span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-100 dark:border-slate-800 flex justify-end items-center gap-4 bg-slate-50/50 dark:bg-slate-800/40">
                            <button type="button" onClick={() => setShowDetails(false)} className="btn-secondary h-12 uppercase tracking-widest text-[10px] font-black px-8">
                                Dismiss Record
                            </button>
                            {selectedVoucher.status === 'POSTED' && (
                                <button type="button" onClick={() => handleReverse(selectedVoucher.id)} className="btn-danger h-12 flex items-center gap-3 px-8 uppercase tracking-widest text-[10px] font-black">
                                    <RotateCcw size={14} /> Corrective Reversal
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Bank Flow Modal - Ported from VoucherSessionEntry */}
            <Modal isOpen={showBankFlowModal} onClose={() => setShowBankFlowModal(false)}>
                {selectedVoucher && (() => {
                    const settlement = calculateSettlement(selectedVoucher);
                    if (!settlement || !settlement.bank || (settlement.bank.ledgers as any[]).length === 0) return null;

                    return (
                        <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                            {/* Modal Header */}
                            <div className="px-10 py-8 border-b border-slate-800/50 flex items-center justify-between bg-white/[0.02]">
                                <div>
                                    <h3 className="text-xl font-display font-black uppercase tracking-tight text-white flex items-center gap-3">
                                        <Landmark className="text-brand-500" size={24} />
                                        Settlement Transfer Route
                                    </h3>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1.5 opacity-60">Electronic Fund Movement Architecture</p>
                                </div>
                                <button type="button" onClick={() => setShowBankFlowModal(false)} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {(settlement.bank.ledgers as any[]).map((entry, i) => {
                                    const isGive = entry.net < 0; // Owner gives to Party
                                    return (
                                        <div key={i} className={`p-8 rounded-[2.5rem] border transition-all duration-300 group ${isGive ? 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10' : 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'}`}>
                                            <div className="grid grid-cols-[1fr,auto,1fr] gap-10 items-center">
                                                {/* Column 1: Sender */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${isGive ? 'bg-rose-500 shadow-glow-sm' : 'bg-emerald-500 shadow-glow-sm'}`} />
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sender</span>
                                                    </div>

                                                    {isGive ? (
                                                        /* Owner Bank as Sender */
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-rose-500/10 rounded-2xl">
                                                                <Building2 size={24} className="text-rose-400" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight truncate">{systemConfig?.business_name || 'Our Company'}</h4>
                                                                <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1">
                                                                    <p className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest">
                                                                        {entry.ledger.bank_name && entry.ledger.bank_name !== entry.ledger.ledger_name
                                                                            ? `${entry.ledger.bank_name} (${entry.ledger.ledger_name})`
                                                                            : entry.ledger.ledger_name}
                                                                    </p>
                                                                    {entry.ledger.bank_ifsc && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {entry.ledger.bank_ifsc}</p>
                                                                    )}
                                                                    {entry.ledger.bank_account_no && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {entry.ledger.bank_account_no}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Party as Sender */
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                                                <UserPlus size={24} className="text-emerald-400" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight">{selectedVoucher.party?.party_name || 'Counterparty'}</h4>
                                                                {selectedVoucher.party?.bank_accounts?.[0] ? (
                                                                    <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1">
                                                                        <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest leading-tight">{selectedVoucher.party.bank_accounts[0].bank_name}</p>
                                                                        {selectedVoucher.party.bank_accounts[0].bank_ifsc && (
                                                                            <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {selectedVoucher.party.bank_accounts[0].bank_ifsc}</p>
                                                                        )}
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {selectedVoucher.party.bank_accounts[0].bank_account_no}</p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-3 mt-2">
                                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                                                            <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] mb-2">⚠️ No Bank Account</p>
                                                                            <div className="space-y-1.5">
                                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Type:</span> {selectedVoucher.party?.party_type || 'N/A'}</p>
                                                                                {selectedVoucher.party?.phone && (
                                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Phone:</span> {selectedVoucher.party.phone}</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Column 2: Flow Indicator & Amount */}
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className={`px-6 py-3 rounded-2xl ${isGive ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'} border shadow-glow-sm`}>
                                                        <p className={`text-xl font-mono font-black ${isGive ? 'text-rose-400' : 'text-emerald-400'} tracking-tight`}>₹ {formatNumber(Math.abs(entry.net))}</p>
                                                    </div>
                                                    <div className={`w-12 h-12 rounded-full ${isGive ? 'bg-rose-500 shadow-rose-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} flex items-center justify-center shadow-glow border-4 border-slate-900 transition-transform group-hover:scale-110`}>
                                                        <ArrowRight size={24} className="text-white" />
                                                    </div>
                                                </div>

                                                {/* Column 3: Recipient */}
                                                <div className="space-y-4 text-right">
                                                    <div className="flex items-center gap-3 justify-end">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recipient</span>
                                                        <div className={`w-2 h-2 rounded-full ${isGive ? 'bg-emerald-500 shadow-glow-sm' : 'bg-brand-500 shadow-glow-sm'}`} />
                                                    </div>

                                                    {!isGive ? (
                                                        /* Owner Bank as Recipient */
                                                        <div className="flex items-center gap-4 justify-end">
                                                            <div className="flex-1 min-w-0 text-right">
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight truncate">{systemConfig?.business_name || 'Our Company'}</h4>
                                                                <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1 text-right">
                                                                    <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">
                                                                        {entry.ledger.bank_name && entry.ledger.bank_name !== entry.ledger.ledger_name
                                                                            ? `${entry.ledger.bank_name} (${entry.ledger.ledger_name})`
                                                                            : entry.ledger.ledger_name}
                                                                    </p>
                                                                    {entry.ledger.bank_ifsc && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {entry.ledger.bank_ifsc}</p>
                                                                    )}
                                                                    {entry.ledger.bank_account_no && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {entry.ledger.bank_account_no}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                                                <Building2 size={24} className="text-emerald-400" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Party as Recipient */
                                                        <div className="flex items-center gap-4 justify-end">
                                                            <div>
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight">{selectedVoucher.party?.party_name || 'Counterparty'}</h4>
                                                                {selectedVoucher.party?.bank_accounts?.[0] ? (
                                                                    <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1 text-right">
                                                                        <p className="text-[10px] font-black text-brand-500/60 uppercase tracking-widest leading-tight">{selectedVoucher.party.bank_accounts[0].bank_name}</p>
                                                                        {selectedVoucher.party.bank_accounts[0].bank_ifsc && (
                                                                            <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {selectedVoucher.party.bank_accounts[0].bank_ifsc}</p>
                                                                        )}
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {selectedVoucher.party.bank_accounts[0].bank_account_no}</p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-3 mt-2 flex justify-end">
                                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-right">
                                                                            <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] mb-2">⚠️ No Bank Account</p>
                                                                            <div className="space-y-1.5">
                                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                                                                    {selectedVoucher.party?.party_type || 'N/A'} <span className="text-slate-600">:Type</span>
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="p-3 bg-brand-500/10 rounded-2xl">
                                                                <UserPlus size={14} className="text-brand-400" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            <ReversalModal
                isOpen={showReversalModal}
                onClose={() => {
                    setShowReversalModal(false);
                    setReversingVoucher(null);
                }}
                onConfirm={processReversal}
                loading={reversalLoading}
                voucherNo={reversingVoucher?.voucher_no}
            />
            <VoucherPickerModal
                isOpen={showVoucherPicker}
                onClose={() => setShowVoucherPicker(false)}
                onSelect={(voucherType) => {
                    setFilters(prev => ({ ...prev, voucherTypeId: voucherType.id }));
                    loadVouchers({ ...filters, voucherTypeId: voucherType.id });
                    setShowVoucherPicker(false);
                }}
                voucherTypes={voucherTypes}
                groups={voucherGroups}
                selectedVoucherId={filters.voucherTypeId}
                skipTemplateSelection={true}
            />
        </div>
    );
}
