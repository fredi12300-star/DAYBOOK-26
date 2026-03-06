import { useState, useEffect } from 'react';
import { RefreshCw, ShieldCheck, History, ListFilter, ArrowRight } from 'lucide-react';
import {
    supabase,
    fetchVouchersCompact,
    fetchVoucherLines,
    fetchPartiesWithBank,
    fetchLedgerTags,
    fetchLedgers,
    fetchVoucherTypes,
    createVoucher
} from '../lib/supabase';
import type { Voucher, LedgerTag, Ledger, VoucherType } from '../types/accounting';
import { getTodayDate } from '../lib/validation';
import { getBusinessDate } from '../lib/businessDate';
import toast from 'react-hot-toast';
import ApprovalsTab from './ApprovalsTab';
import ApprovalHistoryList from './ApprovalHistoryList';

export default function TransactionApprovals() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activeVoucherTab, setActiveVoucherTab] = useState<string | null>(null);

    // Tabs & Filters
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [historyFilter, setHistoryFilter] = useState<'today' | 'last3days'>('today');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const ITEMS_PER_PAGE = 15;

    useEffect(() => {
        loadVouchers(true);
    }, [activeTab, historyFilter]);

    async function loadVouchers(reset = false, silent = false) {
        if (reset && !silent) {
            setPage(0);
            setVouchers([]);
            setHasMore(true);
        }

        setLoading(true);
        try {
            const requestedPage = reset ? 0 : page;
            const from = requestedPage * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const data = await fetchVouchersCompact((query: any) => {
                let q = query;
                if (activeTab === 'pending') {
                    q = q.eq('approval_status', 'PENDING');
                } else {
                    // History: Approved or Rejected
                    q = q.in('approval_status', ['APPROVED', 'REJECTED']);

                    // Date Filter
                    const bDate = getBusinessDate();
                    const today = bDate ? new Date(bDate) : new Date();
                    today.setHours(0, 0, 0, 0);

                    if (historyFilter === 'today') {
                        // For history, we filter by the accounting voucher_date to align with system date
                        q = q.gte('voucher_date', today.toISOString().split('T')[0]);
                    } else if (historyFilter === 'last3days') {
                        const threeDaysAgo = new Date(today);
                        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                        threeDaysAgo.setHours(0, 0, 0, 0);
                        q = q.gte('voucher_date', threeDaysAgo.toISOString().split('T')[0]);
                    }

                    // Pagination
                    q = q.range(from, to);
                }

                return q;
            });

            const tagList = await fetchLedgerTags();
            setTags(tagList);

            // Fetch ledgers and types for adjustments
            const [ledgerList, typeList] = await Promise.all([
                fetchLedgers(true),
                fetchVoucherTypes()
            ]);
            setLedgers(ledgerList);
            setVoucherTypes(typeList);

            if (data) {
                if (data.length < ITEMS_PER_PAGE) {
                    setHasMore(false);
                }

                setVouchers(prev => reset ? data : [...prev, ...data]);
                setPage(requestedPage + 1);

                if (data.length > 0) {
                    loadVoucherDetailsBatch(data);
                }
            } else {
                setHasMore(false);
            }
        } catch (error: any) {
            console.error('Error loading approvals:', error);
            toast.error('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    }

    async function loadVoucherDetailsBatch(voucherBatch: Voucher[]) {
        if (voucherBatch.length === 0) return;
        const ids = voucherBatch.map(v => v.id);
        const partyIds = Array.from(new Set(voucherBatch.map(v => v.party_id).filter(Boolean))) as string[];

        try {
            const [lines, partiesWithBank] = await Promise.all([
                fetchVoucherLines(ids),
                partyIds.length > 0 ? fetchPartiesWithBank(partyIds) : Promise.resolve([])
            ]);

            console.log('[Approvals] Loaded lines:', lines.length, 'for vouchers:', ids);
            setVouchers(prev => prev.map(v => {
                if (!ids.includes(v.id)) return v;

                const voucherLines = lines.filter((l: any) => l.voucher_id === v.id);
                console.log(`[Approvals] Voucher ${v.voucher_no} (${v.id}) lines:`, voucherLines.length);
                const updatedParty = partiesWithBank.find(p => p.id === v.party_id);

                let updatedVoucher = { ...v, lines: voucherLines };
                if (updatedParty) {
                    updatedVoucher.party = { ...v.party, ...updatedParty };
                }

                return updatedVoucher;
            }));
        } catch (error) {
            console.warn('Failure loading voucher details:', error);
            setVouchers(prev => prev.map(v =>
                ids.includes(v.id) && !v.lines ? { ...v, lines: [] } : v
            ));
        }
    }

    async function handleFinalApprovals(status: 'APPROVED' | 'REJECTED', ids: string | string[]) {
        const idArray = Array.isArray(ids) ? ids : [ids];
        const primaryId = idArray[0];
        setProcessingId(primaryId);

        try {
            const updates: any = {
                approval_status: status
            };

            if (status === 'APPROVED') {
                updates.status = 'POSTED';
                updates.posted_at = new Date().toISOString();
            } else if (status === 'REJECTED') {
                updates.status = 'DRAFT';
            }

            const { error } = await supabase
                .from('vouchers')
                .update(updates)
                .in('id', idArray);

            if (error) throw error;
            toast.success(`${idArray.length > 1 ? 'Transactions' : 'Transaction'} ${status === 'APPROVED' ? 'authorized' : 'sent back to drafts'} successfully`);
            setVouchers(prev => prev.filter(v => !idArray.includes(v.id)));
        } catch (error: any) {
            console.error('Approval Error:', error);
            toast.error(`Failed to ${status === 'APPROVED' ? 'authorize' : 'reject'}`);
        } finally {
            setProcessingId(null);
        }
    }

    async function handleApplyAdjustment(sessionKey: string, partyId: string, type: 'CREDIT' | 'DISCOUNT' | 'ROUND_PLUS' | 'ROUND_MINUS', amount: number) {
        const actualSessionId = sessionKey.length > 20 ? sessionKey : null;
        setProcessingId(sessionKey); // Visual lock

        try {
            let drLedgerName = '';
            let crLedgerName = 'Cash in Hand';
            let targetTypeCode = '';

            if (type === 'CREDIT') {
                drLedgerName = 'Customer Receivables';
                targetTypeCode = 'APPLY_CREDIT';
            } else if (type === 'DISCOUNT') {
                drLedgerName = 'Discount Allowed';
                targetTypeCode = 'APPLY_DISCOUNT';
            } else if (type === 'ROUND_MINUS') {
                drLedgerName = 'Round off -';
                targetTypeCode = 'ROUND_OFF_MINUS';
            } else if (type === 'ROUND_PLUS') {
                drLedgerName = 'Cash in Hand';
                crLedgerName = 'Round Off +';
                targetTypeCode = 'ROUND_OFF_PLUS';
            }

            const findLedger = (name: string) => ledgers.find(l =>
                l.ledger_name.toLowerCase() === name.toLowerCase()
            );

            const drLedger = findLedger(drLedgerName);
            const crLedger = findLedger(crLedgerName);

            let vType = voucherTypes.find(vt => vt.type_code === targetTypeCode);
            if (!vType) vType = voucherTypes.find(vt => vt.type_code === 'JOURNAL');

            if (!drLedger || !crLedger) {
                console.error('Ledgers available:', ledgers.map(l => l.ledger_name));
                throw new Error(`Master Ledger "${!drLedger ? drLedgerName : crLedgerName}" not found for ${type}`);
            }

            // 1 & 2. Create Voucher and Lines via higher-level helper
            // This ensures voucher_no is generated and totals are calculated
            const voucher = await createVoucher({
                session_id: actualSessionId,
                party_id: partyId,
                voucher_type_id: vType?.id || '',
                voucher_date: getTodayDate(),
                status: 'DRAFT',
                approval_status: 'PENDING',
                narration: `Adjustment: ${type.replace('_', ' ')}`,
                lines: [
                    {
                        ledger_id: drLedger.id,
                        side: 'DR',
                        amount: amount,
                        line_narration: type === 'CREDIT' ? 'Credit Adjustment' : undefined
                    },
                    {
                        ledger_id: crLedger.id,
                        side: 'CR',
                        amount: amount
                    }
                ]
            });

            toast.success(`Adjustment added to session`);

            // Auto-focus the new tab
            setActiveVoucherTab(voucher.id);
            setExpandedId(sessionKey);

            await loadVouchers(true, true); // Silent refresh
        } catch (error: any) {
            console.error('Adjustment Error:', error);
            toast.error(error.message || 'Failed to apply adjustment');
        } finally {
            setProcessingId(null);
        }
    }

    async function handleDeleteVoucher(voucherId: string, groupVouchers: Voucher[]) {
        setProcessingId(voucherId);
        try {
            // Delete voucher lines first due to FK constraints
            await supabase.from('voucher_lines').delete().eq('voucher_id', voucherId);
            // Delete voucher header
            const { error: vError } = await supabase.from('vouchers').delete().eq('id', voucherId);
            if (vError) throw vError;

            toast.success('Adjustment removed');

            // If we deleted the active tab, switch to another one
            if (activeVoucherTab === voucherId) {
                const remaining = groupVouchers.filter(v => v.id !== voucherId);
                setActiveVoucherTab(remaining.length > 0 ? remaining[0].id : null);
            }

            await loadVouchers(true, true); // Silent refresh
        } catch (error: any) {
            console.error('Delete Error:', error);
            toast.error(error.message || 'Failed to remove adjustment');
        } finally {
            setProcessingId(null);
        }
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shadow-glow shadow-brand-500/5">
                        <ShieldCheck size={24} className="text-brand-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-display font-black text-white leading-tight uppercase tracking-tight">TXN Approvals</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1">Final Authorization Queue</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-800">
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'pending' ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'
                                }`}
                        >
                            Pending
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-white'
                                }`}
                        >
                            <History size={14} /> History
                        </button>
                    </div>
                    <button
                        onClick={() => loadVouchers(true)}
                        disabled={loading || !!processingId}
                        className="p-3 bg-slate-800/40 rounded-xl text-slate-400 hover:text-white border border-slate-700/50 transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* History Filters */}
            {activeTab === 'history' && (
                <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2">
                        <ListFilter size={16} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filter Period:</span>
                        <div className="flex gap-2 ml-2">
                            <button
                                onClick={() => setHistoryFilter('today')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${historyFilter === 'today'
                                    ? 'bg-slate-800 border-slate-700 text-white'
                                    : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-900'
                                    }`}
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setHistoryFilter('last3days')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${historyFilter === 'last3days'
                                    ? 'bg-slate-800 border-slate-700 text-white'
                                    : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-900'
                                    }`}
                            >
                                Last 3 Days
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading && vouchers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4 surface-card bg-slate-950/20">
                    <div className="spinner !w-8 !h-8 border-4 border-brand-500/30 border-t-brand-500"></div>
                    <p className="text-[10px] font-bold text-slate-600 animate-pulse uppercase tracking-widest">Synchronizing records...</p>
                </div>
            ) : (
                <div className="animate-scale-up space-y-6">
                    {activeTab === 'pending' ? (
                        <ApprovalsTab
                            vouchers={vouchers}
                            tags={tags}
                            onApplyAdjustment={handleApplyAdjustment}
                            onFinalApprove={(id) => handleFinalApprovals('APPROVED', id)}
                            onReject={(id) => handleFinalApprovals('REJECTED', id)}
                            onDeleteVoucher={handleDeleteVoucher}
                            processingId={processingId}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            activeVoucherTab={activeVoucherTab}
                            setActiveVoucherTab={setActiveVoucherTab}
                        />
                    ) : (
                        <div className="space-y-6">
                            <ApprovalHistoryList vouchers={vouchers} tags={tags} />

                            {hasMore && (
                                <button
                                    onClick={() => loadVouchers(false)}
                                    disabled={loading}
                                    className="w-full py-4 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-900 font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                                >
                                    {loading ? (
                                        <div className="spinner !w-4 !h-4" />
                                    ) : (
                                        <>
                                            Load Next 15 Records <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
