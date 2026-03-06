import { useState, useEffect } from 'react';
import {
    CheckCircle2, XCircle, Clock,
    ArrowRight, Building2, Landmark, ChevronDown,
    Filter, RefreshCw, Eye, ShieldCheck,
    Settings2, FileSpreadsheet, ExternalLink, Activity
} from 'lucide-react';
import {
    supabase,
    fetchReferencePrefixes,
    generateNextBankRefNo,
    logBankTxnExport,
    fetchLedgers,
    fetchLedgerTags,
    upsertReferencePrefix,
    fetchVouchersCompact,
    fetchVoucherLines,
    fetchPartiesWithBank
} from '../lib/supabase';
import type { Voucher, ReferencePrefix, Ledger, LedgerTag } from '../types/accounting';
import { formatDate, formatNumber } from '../lib/validation';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import ValidatedTab from './ValidatedTab';
import BankApprovalTab from './BankApprovalTab';
import TransactionTrackingTab from './TransactionTrackingTab';

export function getBankAmount(v: Voucher, tags: LedgerTag[] = []) {
    if (!v.lines) return 0; // Avoid fallback to magnitude if lines are missing

    // Sum only CR lines that are positively identified as Bank
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

    // If no bank lines found, we might be in a legacy voucher or misidentified
    // Return magnitude as ultimate fallback if sum is 0
    return bankSum || v.total_debit;
}

type BankTab = 'tracking' | 'requests' | 'validate' | 'validated' | 'approvals';

export default function BankTransactions() {
    const [activeTab, setActiveTab] = useState<BankTab>('requests');
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Validate Tab State
    const [prefixes, setPrefixes] = useState<ReferencePrefix[]>([]);
    const [selectedPrefixId, setSelectedPrefixId] = useState<string>('');
    const [banks, setBanks] = useState<Ledger[]>([]);
    const [selectedBankId, setSelectedBankId] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'NEFT' | 'IMPS' | 'RTGS' | 'SIB'>('NEFT');
    const [showAddPrefix, setShowAddPrefix] = useState(false);
    const [newPrefix, setNewPrefix] = useState({ prefix: '', description: '' });
    const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [pendingTabChange, setPendingTabChange] = useState<BankTab | null>(null);

    useEffect(() => {
        loadVouchers();
        if (activeTab === 'validate') {
            loadValidateData();
        }
    }, [activeTab]);

    // Auto-select prefix when bank changes
    useEffect(() => {
        const autoSelect = async () => {
            if (!selectedBankId || banks.length === 0) return;

            const bank = banks.find(b => b.id === selectedBankId);
            if (bank?.sib_rap_prefix) {
                // Remove trailing dash for comparison and storage
                const rawPrefix = bank.sib_rap_prefix.toUpperCase();
                const cleanPrefix = rawPrefix.replace(/-+$/, ''); // Remove existing dashes

                // Check if we have a match
                let match = prefixes.find(p =>
                    p.prefix.toUpperCase().replace(/-+$/, '') === cleanPrefix
                );

                if (match) {
                    setSelectedPrefixId(match.id);
                } else {
                    // Create it without trailing dash
                    try {
                        const newPrefix = await upsertReferencePrefix({
                            prefix: cleanPrefix,
                            description: `Auto-generated for ${bank.bank_name}`,
                            is_active: true
                        });
                        setPrefixes(prev => [...prev, newPrefix]);
                        setSelectedPrefixId(newPrefix.id);
                        toast.success(`Auto-created prefix: ${newPrefix.prefix}`);
                    } catch (error) {
                        console.error('Failed to auto-create prefix', error);
                    }
                }
            }
        };

        autoSelect();
    }, [selectedBankId, banks]);

    // One-time cleanup for dirty prefixes in database
    useEffect(() => {
        const cleanupPrefixes = async () => {
            const dirty = prefixes.filter(p => p.prefix.endsWith('-'));
            if (dirty.length === 0) return;

            console.log('Cleaning redundant hyphens from database...', dirty.length);
            for (const p of dirty) {
                try {
                    const clean = p.prefix.replace(/-+$/, '');
                    await upsertReferencePrefix({ ...p, prefix: clean });
                } catch (e) {
                    console.error('Failed to clean prefix:', p.prefix, e);
                }
            }
            // Refresh local state
            loadValidateData();
        };

        if (prefixes.length > 0) cleanupPrefixes();
    }, [prefixes.length]); // Run when prefixes load or change

    async function loadValidateData() {
        try {
            const [prefixList, ledgerList] = await Promise.all([
                fetchReferencePrefixes(),
                fetchLedgers(true)
            ]);
            setPrefixes(prefixList);
            // Default to the is_default prefix or the first one
            const defaultPrefix = prefixList.find(p => p.is_default) || prefixList[0];
            if (defaultPrefix) setSelectedPrefixId(defaultPrefix.id);

            // Filter for bank ledgers that have export prefixes defined
            const bankLedgers = ledgerList.filter(l =>
                l.is_cash_bank && (
                    l.ledger_name.toLowerCase().includes('bank') ||
                    l.ledger_group?.group_name.toLowerCase().includes('bank')
                )
            );
            setBanks(bankLedgers);

            // Only auto-select a bank that is actually in the export list (has a prefix)
            const exportableBank = bankLedgers.find(b => b.sib_rap_prefix);
            if (exportableBank) {
                setSelectedBankId(exportableBank.id);
            } else {
                setSelectedBankId('');
            }
        } catch (error) {
            console.error('Error loading validation data:', error);
            toast.error('Failed to load settings');
        }
    }

    async function handleAddPrefix() {
        const cleanPrefix = newPrefix.prefix.toUpperCase().replace(/-+$/, '');
        try {
            const created = await upsertReferencePrefix({
                prefix: cleanPrefix,
                description: newPrefix.description,
                is_active: true
            });
            setPrefixes([...prefixes, created]);
            setSelectedPrefixId(created.id);
            setShowAddPrefix(false);
            setNewPrefix({ prefix: '', description: '' });
            toast.success('Prefix added');
        } catch (error: any) {
            toast.error(error.message);
        }
    }
    async function loadVouchers() {
        setLoading(true);
        try {
            const data = await fetchVouchersCompact((query: any) => {
                let q = query;

                if (activeTab === 'tracking') {
                    // Fetch all bank-related vouchers, ordered by recent, limited to last 3 days
                    const threeDaysAgo = new Date();
                    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                    q = q.eq('status', 'POSTED').neq('bank_status', 'NONE').gte('created_at', threeDaysAgo.toISOString());
                } else if (activeTab === 'requests') {
                    // Only show POSTED vouchers in the bank processing queue.
                    // If approvals are enabled, vouchers stay in DRAFT until authorized.
                    q = q.eq('status', 'POSTED')
                        .or('bank_status.eq.PENDING,bank_validation_status.eq.REJECTED');
                } else if (activeTab === 'validate') {
                    q = q.eq('status', 'POSTED').eq('bank_status', 'APPROVED').or('bank_validation_status.neq.VALIDATED,bank_validation_status.is.null');
                } else if (activeTab === 'validated') {
                    q = q.eq('status', 'POSTED').eq('bank_status', 'APPROVED').eq('bank_validation_status', 'VALIDATED');
                } else if (activeTab === 'approvals') {
                    q = q.eq('status', 'POSTED').eq('bank_status', 'SENT_FOR_APPROVAL');
                } else {
                    q = q.eq('status', 'POSTED').neq('bank_status', 'NONE');
                }
                return q;
            });

            const tagList = await fetchLedgerTags();
            setTags(tagList);

            setVouchers(data || []);
            setSelectedVoucherIds([]);

            // Trigger lazy loading of lines and party bank info if we have vouchers
            if (data && data.length > 0) {
                loadVoucherDetailsBatch(data);
            }
        } catch (error: any) {
            console.error('Error loading bank vouchers:', error);
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

            setVouchers(prev => prev.map(v => {
                if (!ids.includes(v.id)) return v;

                const voucherLines = lines.filter((l: any) => l.voucher_id === v.id);
                const updatedParty = partiesWithBank.find(p => p.id === v.party_id);

                let updatedVoucher = { ...v, lines: voucherLines }; // Always update lines (to stop "VERIFYING..." loading state)
                if (updatedParty) {
                    updatedVoucher.party = { ...v.party, ...updatedParty };
                }

                return updatedVoucher;
            }));
        } catch (error) {
            console.warn('Failure loading voucher details:', error);
            // On failure, stop the loading state for these IDs to prevent infinite spinner
            setVouchers(prev => prev.map(v =>
                ids.includes(v.id) && !v.lines ? { ...v, lines: [] } : v
            ));
        }
    }

    async function revertApprovedToPending() {
        const approvedIds = vouchers
            .filter(v => v.bank_status === 'APPROVED' && v.bank_validation_status !== 'VALIDATED')
            .map(v => v.id);

        if (approvedIds.length === 0) return;

        try {
            const { error } = await supabase
                .from('vouchers')
                .update({ bank_status: 'PENDING' })
                .in('id', approvedIds);

            if (error) throw error;
            console.log('Reverted vouchers to pending:', approvedIds);
        } catch (error) {
            console.error('Failed to revert vouchers:', error);
        }
    }

    const handleTabChange = async (tab: BankTab) => {
        if (activeTab === 'validate' && tab !== 'validate') {
            const hasApproved = vouchers.some(v => v.bank_status === 'APPROVED' && v.bank_validation_status !== 'VALIDATED');
            if (hasApproved) {
                setPendingTabChange(tab);
                return;
            }
        }
        setActiveTab(tab);
    };

    const confirmTabChange = async () => {
        if (pendingTabChange) {
            setLoading(true);
            await revertApprovedToPending();
            setActiveTab(pendingTabChange);
            setPendingTabChange(null);
            await loadVouchers();
            setLoading(false);
        }
    };

    async function handleValidationUpdate(id: string, status: 'VALIDATED' | 'NONE') {
        setProcessingId(id);
        try {
            const updateData: any = { bank_validation_status: status };
            if (status === 'VALIDATED' && selectedBankId) {
                updateData.sender_bank_account_id = selectedBankId;
            }

            const { error } = await supabase
                .from('vouchers')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;
            toast.success(status === 'VALIDATED' ? 'Marked as Validated' : 'Validation Removed');
            loadVouchers();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setProcessingId(null);
        }
    }

    async function handleStatusUpdate(id: string, status: 'APPROVED' | 'REJECTED' | 'FINAL_APPROVED', validationStatus?: 'REJECTED' | 'NONE') {
        if (status === 'APPROVED') {
            const hasApproved = vouchers.some(v => v.bank_status === 'APPROVED' && v.bank_validation_status !== 'VALIDATED');
            if (hasApproved) {
                return toast.error('Only one entry can be handled at a time. Please export the current item first.');
            }
        }

        setProcessingId(id);
        try {
            const updateData: any = { bank_status: status };
            if (validationStatus) {
                updateData.bank_validation_status = validationStatus;
            }

            const { error } = await supabase
                .from('vouchers')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;
            toast.success(`Transaction ${status.toLowerCase()} successfully`);
            loadVouchers();
            if (status === 'APPROVED') {
                setActiveTab('validate');
            }
            if (selectedVoucher?.id === id) setShowDetails(false);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update status');
        } finally {
            setProcessingId(null);
        }
    }

    async function handleSendForApproval() {
        if (selectedVoucherIds.length === 0) return toast.error('Select items to send for approval');
        setLoading(true);
        try {
            const { error } = await supabase
                .from('vouchers')
                .update({ bank_status: 'SENT_FOR_APPROVAL' })
                .in('id', selectedVoucherIds);

            if (error) throw error;
            toast.success('Items marked as Maker Approved');
            setSelectedVoucherIds([]);
            setActiveTab('approvals');
            loadVouchers();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleFinalApprovals(status: 'FINAL_APPROVED' | 'REJECTED', ids: string[]) {
        if (ids.length === 0) return;
        setLoading(true);
        try {
            const updateData: any = { bank_status: status };
            // Removed: Overriding validation status to 'REJECTED' for Final Approvals.
            // This preserves the 'VALIDATED' status so we can show it reached Stage 3/4.
            const { error } = await supabase
                .from('vouchers')
                .update(updateData)
                .in('id', ids);

            if (error) throw error;
            toast.success(`Items ${status.toLowerCase()} successfully`);
            setSelectedVoucherIds(prev => prev.filter(id => !ids.includes(id)));
            loadVouchers();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleRevertToPending(id: string) {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('vouchers')
                .update({
                    bank_status: 'PENDING',
                    bank_validation_status: 'REJECTED'
                }) // Setting validation to REJECTED ensures it shows up in 'Pending Requests' tab based on current filters logic: q.or('bank_status.eq.PENDING,bank_validation_status.eq.REJECTED')
                .eq('id', id);

            if (error) throw error;
            toast.success('Transaction returned to Pending Requests');
            setSelectedVoucherIds(prev => prev.filter(vId => vId !== id));
            loadVouchers();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleGenerateXLS() {
        if (selectedVoucherIds.length === 0) return toast.error('Select transactions to export');
        if (!selectedPrefixId) return toast.error('Select a prefix');
        if (!selectedBankId) return toast.error('Select sender bank');

        setLoading(true);
        try {
            const selectedItems = vouchers.filter(v => selectedVoucherIds.includes(v.id));
            const refData = await generateNextBankRefNo(selectedPrefixId, selectedItems.length);

            const XLSX = await import('xlsx');
            const senderBank = banks.find(b => b.id === selectedBankId);
            const today = new Date();
            const paymentMethodCode = paymentMethod === 'IMPS' ? 'I' :
                paymentMethod === 'NEFT' ? 'N' :
                    paymentMethod === 'RTGS' ? 'R' :
                        paymentMethod === 'SIB' ? 'S' : 'N';

            const excelData = selectedItems.map((v, index) => {
                const currentCounter = refData.start_counter + index;
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                const datePrefix = `${year}${month}${day}`;
                const refNumber = `${datePrefix}${String(currentCounter).padStart(3, '0')}`;

                return {
                    'Header': paymentMethodCode,
                    'Reference Number': refNumber,
                    'Amount': getBankAmount(v, tags),
                    'Transaction date': `${year}-${month}-${day}`,
                    'Sender IFSC': senderBank?.bank_ifsc || '',
                    'Sender Account Type': '11',
                    'SenderA/c Number': senderBank?.bank_account_no || '',
                    'Sender Name': senderBank?.bank_name || '',
                    'Ack Mode SMS/EML': 'SMS',
                    'Mob/Email': Math.floor(1000000000 + Math.random() * 9000000000).toString(),
                    'Send Ad1': 'INDIA',
                    'Send Ad2': 'INDIA',
                    'Send Ad3': 'INDIA',
                    'Send Ad4': 'INDIA',
                    'Benef IFSC': v.party?.bank_accounts?.[0]?.bank_ifsc || '',
                    'Benef Ac/Type': '10',
                    'BenefA/C No': v.party?.bank_accounts?.[0]?.bank_account_no || '',
                    'Benf A/c Name': v.party?.party_name || '',
                    'Benef Ad1': 'INDIA',
                    'Benef Ad2': 'INDIA',
                    'Benef Ad3': 'INDIA',
                    'Benef Ad4': 'INDIA',
                    'Remarks': 'ALOOKARAN',
                    'Purpose code': 'A1234',
                    'Country code': 'IN'
                };
            });

            const ws = XLSX.utils.json_to_sheet(excelData);
            ws['!cols'] = Array(25).fill({ wch: 20 });

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Bank Transactions');

            // User requested format: PREFIX-YYYYMMDD001.xlsx
            const prefixStr = prefixes.find(p => p.id === selectedPrefixId)?.prefix.replace(/-+$/, '') || '';
            const fileDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            const fileCounter = String(refData.start_counter).padStart(3, '0');
            const safeFileName = `${prefixStr}-${fileDate}${fileCounter}.xls`;

            XLSX.writeFile(wb, safeFileName, { bookType: 'biff8' });

            const prefix = prefixes.find(p => p.id === selectedPrefixId)?.prefix.replace(/-+$/, '') || '';
            const finalRefNo = refData.reference_no.startsWith(prefix)
                ? refData.reference_no
                : `${prefix}${refData.reference_no}`;

            await logBankTxnExport({
                voucher_ids: selectedVoucherIds,
                prefix_id: selectedPrefixId,
                reference_no: finalRefNo.replace('--', '-'),
                file_name: safeFileName,
                sender_bank_account_id: selectedBankId,
                payment_method: paymentMethod,
                payload_json: selectedItems
            });

            if (selectedVoucherIds.length > 0) {
                await supabase
                    .from('vouchers')
                    .update({
                        bank_validation_status: 'VALIDATED',
                        sender_bank_account_id: selectedBankId
                    })
                    .in('id', selectedVoucherIds);
            }

            loadVouchers();
            toast.success(`Downloaded ${safeFileName}`);
        } catch (error: any) {
            console.error('XLS Generation Error:', error);
            toast.error(error.message || 'Failed to generate export');
        } finally {
            setLoading(false);
        }
    }

    const toggleSelection = (id: string) => {
        setSelectedVoucherIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };


    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-black text-white leading-tight uppercase tracking-tight">Bank Transactions</h1>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1">Cross-Border & Domestic Settlement Workflow</p>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={loadVouchers} className="p-3 bg-slate-800/40 rounded-xl text-slate-400 hover:text-white border border-slate-700/50 transition-all">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-900/60 border border-slate-800 rounded-2xl w-fit">
                {[
                    { id: 'tracking', label: 'Status Tracking', icon: Activity },
                    { id: 'requests', label: 'Pending Requests', icon: Clock },
                    { id: 'validate', label: 'Maker Validation', icon: ShieldCheck },
                    { id: 'validated', label: 'Checker Approval', icon: CheckCircle2 },
                    { id: 'approvals', label: 'Final Approval', icon: CheckCircle2 }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            type="button"
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id as BankTab)}
                            className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-300 ${isActive
                                ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                }`}
                        >
                            <Icon size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                            {tab.id === 'requests' && vouchers.filter(v => v.bank_status === 'PENDING').length > 0 && activeTab !== 'requests' && (
                                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                                    {vouchers.filter(v => v.bank_status === 'PENDING').length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'tracking' && (
                <TransactionTrackingTab
                    vouchers={vouchers}
                    tags={tags}
                    onViewHistory={() => { }}
                />
            )}


            {activeTab === 'validate' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-scale-up">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="surface-card p-6 space-y-6">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Settings2 size={14} className="text-brand-500" /> Export Configuration
                            </h3>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">Sender Bank</label>
                                    <select
                                        value={selectedBankId}
                                        onChange={(e) => setSelectedBankId(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-500"
                                    >
                                        <option value="">Select Bank (Required for grouping)</option>
                                        {banks.filter(b => b.sib_rap_prefix).map(b => (
                                            <option key={b.id} value={b.id}>{b.bank_name || b.ledger_name}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedBankId && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">Reference Prefix</label>
                                        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl">
                                            <ShieldCheck size={14} className="text-emerald-500" />
                                            <span className="text-xs font-black text-white uppercase tracking-widest">
                                                {prefixes.find(p => p.id === selectedPrefixId)?.prefix.replace(/-+$/, '') || '—'}
                                            </span>
                                        </div>
                                        {selectedBankId && banks.find(b => b.id === selectedBankId)?.sib_rap_prefix && (
                                            <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-wide mt-1">
                                                Auto-matched from Bank Settings
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">Payment Method</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['NEFT', 'IMPS', 'RTGS', 'SIB'].map(m => (
                                            <button
                                                type="button"
                                                key={m}
                                                onClick={() => setPaymentMethod(m as any)}
                                                className={`p-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${paymentMethod === m
                                                    ? 'bg-brand-500 border-brand-500 text-white'
                                                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                                                    }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={handleGenerateXLS}
                                    disabled={loading || selectedVoucherIds.length === 0}
                                    className="col-span-2 btn-primary h-14 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group w-full"
                                >
                                    <FileSpreadsheet size={20} className="group-hover:animate-bounce" />
                                    <span className="text-xs font-black uppercase tracking-widest">
                                        Validate & Export
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.open('https://rap.southindianbank.bank.in/paymenthub/login', '_blank')}
                                    className="col-span-2 btn-secondary h-12 flex items-center justify-center gap-2 group w-full border-slate-700 hover:border-brand-500 hover:bg-brand-500/10"
                                >
                                    <ExternalLink size={16} className="text-slate-400 group-hover:text-brand-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-brand-400">
                                        Open SIB Payment Hub
                                    </span>
                                </button>
                            </div>
                            <p className="text-[9px] font-bold text-slate-600 text-center uppercase tracking-widest leading-relaxed">
                                {selectedVoucherIds.length} transactions selected
                            </p>
                        </div>
                    </div>

                    <div className="lg:col-span-3">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-32 gap-4 surface-card bg-slate-950/20">
                                <div className="spinner !w-8 !h-8 border-4 border-brand-500/30 border-t-brand-500"></div>
                                <p className="text-[10px] font-bold text-slate-600 animate-pulse uppercase tracking-widest">Synchronizing records...</p>
                            </div>
                        ) : vouchers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-32 text-center surface-card bg-slate-950/20">
                                <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                                    <Filter size={24} className="text-slate-700" />
                                </div>
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No matching records</h3>
                                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">All transactions are validated</p>
                            </div>
                        ) : (
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
                                            {vouchers.map(v => (
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
                                                    <td className="px-8 py-6">
                                                        <div className="flex items-center justify-center gap-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedVoucherIds.includes(v.id)}
                                                                onChange={() => toggleSelection(v.id)}
                                                                className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-900 checked:bg-brand-500 checked:border-brand-500 cursor-pointer transition-all"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusUpdate(v.id, 'REJECTED', 'REJECTED')}
                                                                disabled={processingId === v.id}
                                                                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg border border-rose-500/20 transition-all active:scale-95"
                                                                title="Reject and Hide"
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
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'validated' && (
                <div className="w-full animate-scale-up">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4 surface-card bg-slate-950/20">
                            <div className="spinner !w-8 !h-8 border-4 border-brand-500/30 border-t-brand-500"></div>
                            <p className="text-[10px] font-bold text-slate-600 animate-pulse uppercase tracking-widest">Synchronizing records...</p>
                        </div>
                    ) : (
                        <ValidatedTab
                            vouchers={vouchers}
                            banks={banks}
                            tags={tags}
                            selectedVoucherIds={selectedVoucherIds}
                            onToggleSelection={toggleSelection}
                            onReject={(id) => handleStatusUpdate(id, 'REJECTED')}
                            onValidate={(id) => handleValidationUpdate(id, 'NONE')}
                            onSendForApproval={handleSendForApproval}
                        />
                    )}
                </div>
            )}

            {activeTab === 'approvals' && (
                <div className="w-full animate-scale-up">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4 surface-card bg-slate-950/20">
                            <div className="spinner !w-8 !h-8 border-4 border-brand-500/30 border-t-brand-500"></div>
                            <p className="text-[10px] font-bold text-slate-600 animate-pulse uppercase tracking-widest">Synchronizing records...</p>
                        </div>
                    ) : (
                        <BankApprovalTab
                            vouchers={vouchers}
                            banks={banks}
                            tags={tags}
                            selectedVoucherIds={selectedVoucherIds}
                            onToggleSelection={toggleSelection}
                            onFinalApprove={(id: string) => handleFinalApprovals('FINAL_APPROVED', [id])}
                            onReject={(id: string) => handleRevertToPending(id)}
                        />
                    )}
                </div>
            )}

            {activeTab !== 'validate' && activeTab !== 'validated' && activeTab !== 'approvals' && activeTab !== 'tracking' && (
                <div className="surface-card bg-slate-950/20 backdrop-blur-sm">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-4">
                            <div className="spinner !w-8 !h-8 border-4 border-brand-500/30 border-t-brand-500"></div>
                            <p className="text-[10px] font-bold text-slate-600 animate-pulse uppercase tracking-widest">Scanning blockchain records...</p>
                        </div>
                    ) : vouchers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
                                <Filter size={24} className="text-slate-700" />
                            </div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No matching records</h3>
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mt-2">All transactions are up to date</p>
                        </div>
                    ) : (
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
                                    {vouchers.map(v => (
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
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-slate-200 uppercase tracking-tight">{v.party?.party_name || 'Individual'}</span>
                                                            {v.bank_status === 'REJECTED' && (
                                                                <span className="px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded text-[8px] font-black text-rose-500 uppercase tracking-widest">
                                                                    Rejected
                                                                </span>
                                                            )}
                                                        </div>
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
                                            <td className="px-8 py-6">
                                                <div className="flex items-center justify-center gap-2">
                                                    {activeTab === 'requests' ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusUpdate(v.id, 'APPROVED', 'NONE')}
                                                                disabled={processingId === v.id}
                                                                className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-xl border border-emerald-500/20 transition-all active:scale-95"
                                                            >
                                                                <CheckCircle2 size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusUpdate(v.id, 'REJECTED', 'NONE')}
                                                                disabled={processingId === v.id}
                                                                className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl border border-rose-500/20 transition-all active:scale-95"
                                                                title="Reject and Hide"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedVoucher(v);
                                                                setShowDetails(true);
                                                            }}
                                                            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all"
                                                        >
                                                            <Eye size={16} />
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
            )}

            {/* Modal for Details (Reusable from DayBook style) */}
            <Modal isOpen={showDetails} onClose={() => setShowDetails(false)}>
                {selectedVoucher && (
                    <div className="surface-card !p-0 w-full max-w-2xl bg-slate-900 border-slate-800 animate-scale-up">
                        <div className="p-8 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-black text-white uppercase tracking-tight">Voucher Details</h2>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Audit Log ID: {selectedVoucher.id}</p>
                            </div>
                            <button type="button" onClick={() => setShowDetails(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-500">
                                <ChevronDown size={20} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Narration</span>
                                    <p className="text-xs text-slate-300 italic">"{selectedVoucher.narration}"</p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Net Payable</span>
                                    <p className="text-lg font-mono font-black text-emerald-400">₹ {formatNumber(selectedVoucher.total_debit)}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bank Route Information</h4>
                                <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-3xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                <Building2 size={16} className="text-emerald-400" />
                                            </div>
                                            <span className="text-xs font-black text-slate-300 uppercase leading-none">Business Source</span>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-white uppercase">{selectedVoucher.lines?.[0]?.ledger?.bank_name}</span>
                                    </div>
                                    <div className="flex items-center justify-center py-2">
                                        <ArrowRight className="text-slate-700 animate-pulse" size={20} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-brand-500/10 rounded-lg">
                                                <Landmark size={16} className="text-brand-400" />
                                            </div>
                                            <span className="text-xs font-black text-slate-300 uppercase leading-none">Recipient Bank</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-mono font-bold text-white uppercase">A/C: **** {selectedVoucher.party?.bank_accounts?.[0]?.bank_account_no?.slice(-4) || 'N/A'}</p>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{selectedVoucher.party?.bank_accounts?.[0]?.bank_name || 'Default Route'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {activeTab === 'requests' && (
                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => handleStatusUpdate(selectedVoucher.id, 'APPROVED', 'NONE')}
                                        className="flex-1 btn-primary !h-14 text-[11px] font-black uppercase tracking-[0.2em]"
                                    >
                                        Approve Execution
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleStatusUpdate(selectedVoucher.id, 'REJECTED', 'NONE')}
                                        className="flex-1 btn-secondary !h-14 text-[11px] font-black uppercase tracking-[0.2em] !border-rose-500/30 !text-rose-400 hover:!bg-rose-500/10"
                                    >
                                        Reject Request
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Add Prefix Modal */}
            <Modal isOpen={showAddPrefix} onClose={() => setShowAddPrefix(false)}>
                <div className="surface-card !p-0 w-full max-w-md bg-slate-900 border-slate-800 animate-scale-up">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center">
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-tight">Configure New Prefix</h2>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Add to Global Namespace</p>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">Prefix String (e.g. AFS)</label>
                            <input
                                type="text"
                                value={newPrefix.prefix}
                                onChange={(e) => setNewPrefix({ ...newPrefix, prefix: e.target.value })}
                                maxLength={6}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-brand-500 uppercase"
                                placeholder="..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">Institutional Name</label>
                            <input
                                type="text"
                                value={newPrefix.description}
                                onChange={(e) => setNewPrefix({ ...newPrefix, description: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-brand-500"
                                placeholder="Alookaran Finserv"
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddPrefix(false)} className="flex-1 btn-secondary text-[10px] h-12 uppercase font-black tracking-widest">Cancel</button>
                            <button type="button" onClick={handleAddPrefix} className="flex-1 btn-primary text-[10px] h-12 uppercase font-black tracking-widest shadow-glow shadow-brand-500/20">Commit Prefix</button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Exit Validation Guard Modal */}
            <Modal isOpen={!!pendingTabChange} onClose={() => setPendingTabChange(null)}>
                <div className="surface-card !p-0 w-full max-w-sm bg-slate-900 border-slate-800 animate-scale-up">
                    <div className="p-6 border-b border-white/5">
                        <h2 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <XCircle className="text-rose-500" size={18} /> Please Export First
                        </h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 leading-relaxed">
                            Moving away will return this transaction to <span className="text-white">Pending Requests</span>. Do you want to proceed?
                        </p>
                    </div>
                    <div className="p-6 flex gap-3">
                        <button type="button" onClick={() => setPendingTabChange(null)} className="flex-1 btn-secondary text-[10px] h-12 uppercase font-black tracking-widest">Cancel</button>
                        <button type="button" onClick={confirmTabChange} className="flex-1 btn-primary !bg-rose-600 border-rose-600 text-[10px] h-12 uppercase font-black tracking-widest">Move Anyway</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
