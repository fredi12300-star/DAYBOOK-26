import { useState, useEffect } from 'react';
import {
    Search, Plus, Filter, Tag, Edit2, Trash2,
    Wallet, Landmark, UserCheck, Lock,
    X, Settings, Save, Activity, ChevronRight, Info
} from 'lucide-react';
import {
    fetchLedgers,
    fetchLedgerGroups,
    fetchLedgerTags,
    upsertLedger,
    deleteLedger,
    upsertLedgerTag,
    deleteLedgerTag,
    fetchUOMs
} from '../lib/supabase';
import type { Ledger, LedgerGroup, LedgerTag, AccountNature, UOM } from '../types/accounting';
import Modal from './ui/Modal';
import toast from 'react-hot-toast';

const NATURE_TITLES: Record<AccountNature | 'ALL', string> = {
    ALL: 'All Accounts',
    ASSET: 'Assets',
    LIABILITY: 'Liabilities',
    INCOME: 'Income',
    EXPENSE: 'Expenses',
    EQUITY: 'Equity'
};

export default function LedgerMaster() {
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [groups, setGroups] = useState<LedgerGroup[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [uoms, setUoms] = useState<UOM[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filtering State
    const [activeNature, setActiveNature] = useState<AccountNature | 'ALL'>('ALL');
    const [activeTagId, setActiveTagId] = useState<string | 'ALL'>('ALL');

    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTagModalOpen, setIsTagModalOpen] = useState(false);
    const [editingLedger, setEditingLedger] = useState<Partial<Ledger> | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showBalanceInfo, setShowBalanceInfo] = useState(false);
    const [showCashInfo, setShowCashInfo] = useState(false);
    const [showPartyInfo, setShowPartyInfo] = useState(false);
    const [isOpeningLocked, setIsOpeningLocked] = useState(true);

    // Reserved Tag Names for Robust Identification
    const SETTLEMENT_CASH_TAG = 'PHYSICAL CASH';
    const SETTLEMENT_BANK_TAG = 'BANK ACCOUNT';

    useEffect(() => {
        loadData();
    }, []);

    // Reset Tooltips when Modal closes
    useEffect(() => {
        if (!isModalOpen) {
            setShowBalanceInfo(false);
            setShowCashInfo(false);
            setShowPartyInfo(false);
            setIsOpeningLocked(true); // Re-lock on close
        }
    }, [isModalOpen]);

    async function loadData() {
        setLoading(true);
        try {
            const [ledgersData, groupsData, tagsData, uomsData] = await Promise.all([
                fetchLedgers(false),
                fetchLedgerGroups(),
                fetchLedgerTags(false),
                fetchUOMs(false)
            ]);
            setLedgers(ledgersData);
            setGroups(groupsData);
            setTags(tagsData);
            setUoms(uomsData);
        } catch (error) {
            console.error('Error loading Master Data:', error);
            toast.error('Failed to load ledger data');
        } finally {
            setLoading(false);
        }
    }

    function handleOpenModal(ledger: Partial<Ledger> | null = null) {
        setIsOpeningLocked(!!ledger?.id); // Lock if it's an existing ledger
        setEditingLedger(ledger || {
            ledger_name: '',
            ledger_group_id: '',
            business_tags: [],
            nature: 'ASSET',
            normal_side: 'DR',
            opening_balance: 0,
            opening_balance_side: 'DR',
            is_active: true,
            allow_party: false,
            is_cash_bank: false,
            allow_quantity: false,
            quantity_required: false,
            default_uom_id: uoms.find(u => u.code === 'INR')?.id || ''
        });
        setIsModalOpen(true);
    }

    async function handleSave() {
        if (!editingLedger) return;

        // Validation
        if (!editingLedger.ledger_name?.trim() || !editingLedger.ledger_group_id) {
            toast.error('Account Name and Group are required fields.');
            return;
        }

        setSaving(true);
        console.log('[LedgerMaster] Starting save for:', editingLedger);

        let finalLedger = { ...editingLedger } as any;

        // Pre-save cleanup for nested objects that might have come from a join
        const fieldsToDelete = ['ledger_group', 'group', 'default_uom', 'branch', 'rapid_templates', 'lines'];
        fieldsToDelete.forEach(field => delete finalLedger[field]);

        // Guarantee opening_balance_side if balance exists
        // Use normal_side as fallback if side is missing
        if (!finalLedger.opening_balance_side || finalLedger.opening_balance_side === null) {
            finalLedger.opening_balance_side = finalLedger.normal_side || 'DR';
        }

        // Ensure balance is numeric
        finalLedger.opening_balance = parseFloat(String(finalLedger.opening_balance || 0));

        // If it's a Cash/Bank ledger, it MUST have a settlement mode (CASH or BANK tag)
        if (finalLedger.is_cash_bank) {
            console.log('[LedgerMaster] Checking Settlement Mode for Cash/Bank...');
            const currentTagIds = finalLedger.business_tags || [];

            // Check for tags containing "BANK ACCOUNT" or "PHYSICAL CASH" (inclusive matching)
            const settlementTags = tags.filter(t =>
                t.tag_name.toUpperCase().includes('BANK ACCOUNT') ||
                t.tag_name.toUpperCase().includes('PHYSICAL CASH')
            );

            console.log('[LedgerMaster] Found settlement system tags:', settlementTags);

            let hasMode = settlementTags.some(t => currentTagIds.includes(t.id));

            if (!hasMode) {
                console.log('[LedgerMaster] No mode detected, attempting auto-assignment...');
                const isBank = (finalLedger.ledger_name || '').toLowerCase().includes('bank') ||
                    (groups.find(g => g.id === finalLedger.ledger_group_id)?.group_name || '').toLowerCase().includes('bank');

                const targetTag = tags.find(t =>
                    t.tag_name.toUpperCase().includes(isBank ? 'BANK ACCOUNT' : 'PHYSICAL CASH')
                );

                if (targetTag) {
                    finalLedger.business_tags = [...currentTagIds, targetTag.id];
                    hasMode = true;
                    console.log('[LedgerMaster] Auto-assigned tag:', targetTag.tag_name);
                }
            }

            // MODERATION: Only block if not a well-known system ledger. 
            // We'd rather have a saved ledger with a missing tag than a stuck user.
            if (!hasMode && !finalLedger.is_system && finalLedger.ledger_name?.toUpperCase() !== 'CASH IN HAND') {
                toast.error('Please select a Settlement Mode (Physical Cash or Bank).');
                setSaving(false);
                return;
            }
        }

        try {
            const result = await upsertLedger(finalLedger);
            console.log('[LedgerMaster] Save successful:', result);
            toast.success(`Ledger "${finalLedger.ledger_name}" saved successfully.`);
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            console.error('[LedgerMaster] Save Failure:', error);
            toast.error(error.message || 'Failed to save ledger. Check console for details.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!deletingId) return;

        setSaving(true);
        try {
            await deleteLedger(deletingId);
            toast.success('Ledger deleted successfully.');
            setDeletingId(null);
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete ledger. It may be in use.');
        } finally {
            setSaving(false);
        }
    }

    const filteredLedgers = ledgers.filter(l => {
        const matchesSearch = l.ledger_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.ledger_group?.group_name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesNature = activeNature === 'ALL' || l.nature === activeNature;
        const matchesTag = activeTagId === 'ALL' || (l.business_tags && l.business_tags.includes(activeTagId));

        return matchesSearch && matchesNature && matchesTag;
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="spinner !w-8 !h-8"></div>
                <p className="text-[10px] font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">Loading Chart of Accounts...</p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50 dark:bg-slate-950/20">
            {/* LEFT SIDEBAR: Accounting & Business Structure */}
            <div className="w-80 border-r border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl flex flex-col pt-6">
                <div className="px-6 mb-8 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Landmark size={20} className="text-brand-500" />
                            Chart of Accounts
                        </h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Hybrid Structure</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsTagModalOpen(true)}
                        className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-brand-500 transition-all"
                        title="Manage Business Tags"
                    >
                        <Settings size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 custom-scrollbar space-y-8 pb-32">
                    {/* Layer 1: Accounting Nature (Structure) */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-4 block">
                            Layer 1: Accounting Structure
                        </label>
                        {(['ALL', 'ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'] as const).map(nature => {
                            const count = nature === 'ALL' ? ledgers.length : ledgers.filter(l => l.nature === nature).length;
                            return (
                                <button
                                    type="button"
                                    key={nature}
                                    onClick={() => setActiveNature(nature)}
                                    className={`w-full group px-4 py-3 rounded-xl flex items-center justify-between transition-all duration-300 ${activeNature === nature
                                        ? 'bg-brand-600 text-white shadow-xl shadow-brand-500/20 ring-1 ring-white/10'
                                        : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                        }`}
                                >
                                    <span className="text-xs font-bold uppercase tracking-widest">{NATURE_TITLES[nature]}</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${activeNature === nature ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Layer 2: Business Groups (UI Filters) */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-4 block">
                            Layer 2: Business Filters
                        </label>
                        <button
                            type="button"
                            onClick={() => setActiveTagId('ALL')}
                            className={`w-full group px-4 py-3 rounded-xl flex items-center justify-between transition-all duration-300 ${activeTagId === 'ALL'
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl'
                                : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                        >
                            <span className="text-xs font-bold uppercase tracking-widest">All Tags</span>
                            <Filter size={14} className={activeTagId === 'ALL' ? 'opacity-100' : 'opacity-30'} />
                        </button>
                        {tags.filter(t => t.is_active && !t.tag_name.startsWith('SETTLEMENT:')).map(tag => {
                            const count = ledgers.filter(l => l.business_tags?.includes(tag.id)).length;
                            return (
                                <button
                                    type="button"
                                    key={tag.id}
                                    onClick={() => setActiveTagId(tag.id)}
                                    className={`w-full group px-4 py-3 rounded-xl flex items-center justify-between transition-all duration-300 ${activeTagId === tag.id
                                        ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 ring-1 ring-white/10'
                                        : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeTagId === tag.id ? 'bg-white' : 'bg-emerald-500'}`} />
                                        <span className="text-xs font-bold tracking-tight">{tag.tag_name}</span>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${activeTagId === tag.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* MAIN PANEL */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-8 pb-4 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/30 dark:bg-slate-900/30 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-8 flex-1 max-w-2xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                            <input
                                type="text"
                                placeholder={`Search in ${NATURE_TITLES[activeNature]}...`}
                                className="input-field !pl-12 !h-12 !bg-white/50 dark:!bg-slate-800/50 hover:ring-2 focus:ring-brand-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleOpenModal()}
                        className="btn-primary !h-12 !px-8 text-xs uppercase font-bold tracking-widest flex items-center gap-2 shadow-2xl shadow-brand-500/30"
                    >
                        <Plus size={18} /> New Account
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="flex flex-col space-y-1 animate-fade-in">
                        {filteredLedgers.map(ledger => (
                            <div
                                key={ledger.id}
                                className="group flex items-center justify-between p-3 rounded-2xl hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all duration-200"
                            >
                                {/* LEFT: Identifying Info */}
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    {/* Nature Icon Box */}
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ledger.nature === 'ASSET' ? 'bg-emerald-500/10 text-emerald-600' :
                                        ledger.nature === 'LIABILITY' ? 'bg-orange-500/10 text-orange-600' :
                                            ledger.nature === 'INCOME' ? 'bg-blue-500/10 text-blue-600' :
                                                ledger.nature === 'EXPENSE' ? 'bg-rose-500/10 text-rose-600' :
                                                    'bg-slate-500/10 text-slate-600'
                                        }`}>
                                        <Wallet size={18} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                                                {ledger.ledger_name}
                                            </h3>
                                            {!ledger.is_active && (
                                                <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-widest">Inactive</span>
                                            )}
                                            {ledger.is_cash_bank && (() => {
                                                const hasBankTag = tags.find(t => t.tag_name === SETTLEMENT_BANK_TAG && ledger.business_tags?.includes(t.id));
                                                const hasCashTag = tags.find(t => t.tag_name === SETTLEMENT_CASH_TAG && ledger.business_tags?.includes(t.id));

                                                const isBankFallback = !hasCashTag && (
                                                    ledger.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                                                    ledger.ledger_name?.toLowerCase().includes('bank')
                                                );

                                                const isBank = hasBankTag || isBankFallback;

                                                return (
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border transition-all ${isBank
                                                        ? 'bg-brand-500/10 text-brand-600 border-brand-500/20'
                                                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                                        }`}>
                                                        {isBank ? 'Bank Account' : 'Physical Cash'}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={`text-[9px] font-black px-1.5 py-0 rounded border uppercase tracking-tighter ${ledger.nature === 'ASSET' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                ledger.nature === 'LIABILITY' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                                    ledger.nature === 'INCOME' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                        ledger.nature === 'EXPENSE' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                                            'bg-slate-50 text-slate-700 border-slate-100'
                                                }`}>
                                                {ledger.nature}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">
                                                {ledger.ledger_group?.group_name}
                                            </span>
                                            {ledger.business_tags && ledger.business_tags.length > 0 && (
                                                <div className="flex items-center gap-1 pl-2 border-l border-slate-700/30 ml-1">
                                                    {ledger.business_tags
                                                        .filter(tagId => {
                                                            const tag = tags.find(t => t.id === tagId);
                                                            return tag && !tag.tag_name.startsWith('SETTLEMENT:');
                                                        })
                                                        .slice(0, 2).map(tagId => {
                                                            const tag = tags.find(t => t.id === tagId);
                                                            return tag ? (
                                                                <span key={tagId} className="text-[8px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 rounded uppercase">
                                                                    {tag.tag_name}
                                                                </span>
                                                            ) : null;
                                                        })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: Values & Actions */}
                                <div className="flex items-center gap-6 pl-4">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Opening Balance</p>
                                        <p className="text-sm font-mono font-black text-slate-900 dark:text-white">
                                            ₹{ledger.opening_balance?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            <span className={`ml-1 text-[10px] ${ledger.opening_balance_side === 'DR' ? 'text-emerald-500' : 'text-orange-500'}`}>
                                                {ledger.opening_balance_side}
                                            </span>
                                        </p>
                                    </div>

                                    {/* Indicators Column */}
                                    <div className="flex flex-col items-end gap-1 w-16">
                                        {ledger.is_system && (
                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1" title="System Critical Ledger">
                                                <Lock size={10} className="text-slate-400" /> System
                                            </span>
                                        )}
                                        {ledger.allow_party && (
                                            <span className="text-[8px] font-black text-brand-600 uppercase tracking-widest flex items-center gap-1" title="Party Required">
                                                <UserCheck size={10} /> Party
                                            </span>
                                        )}
                                        {ledger.allow_quantity && (
                                            <span className="text-[8px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-1" title="Quantity Enabled">
                                                <Tag size={10} /> Qty
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity w-20 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenModal(ledger)}
                                            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand-500 rounded-xl hover:shadow-lg transition-all"
                                            title="Edit"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        {!ledger.is_system && (
                                            <button
                                                type="button"
                                                onClick={() => setDeletingId(ledger.id)}
                                                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl hover:shadow-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredLedgers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center mb-4">
                                <Search size={24} className="text-slate-300" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">No matching accounts found</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-2">Adjust your filters or search terms</p>
                        </div>
                    )}
                </div>
            </div>

            {/* LEDGER EDITOR MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingLedger && (
                    <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 animate-scale-in">
                        {/* Modal Header */}
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
                            <div>
                                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                                    {editingLedger.id ? 'Refine Ledger Configuration' : 'Establish New Account'}
                                </h2>
                                <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mt-1 italic flex items-center gap-1">
                                    <ChevronRight size={10} /> Accounting Structural Primitive
                                </p>
                            </div>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar">
                            {/* SECTION 1: IDENTITY */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Activity size={16} className="text-brand-500" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Section 1: Identity & Structure</h3>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Ledger Display Name *</label>
                                    <input
                                        type="text"
                                        className="input-field font-black uppercase text-sm tracking-tight"
                                        placeholder="ENTER ACCOUNT NAME..."
                                        value={editingLedger.ledger_name}
                                        onChange={(e) => setEditingLedger({ ...editingLedger, ledger_name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Accounting Group *</label>
                                        <select
                                            className="select-field font-bold text-sm"
                                            value={editingLedger.ledger_group_id}
                                            onChange={(e) => {
                                                const group = groups.find(g => g.id === e.target.value);
                                                setEditingLedger({
                                                    ...editingLedger,
                                                    ledger_group_id: e.target.value,
                                                    nature: group?.nature as AccountNature || 'ASSET'
                                                });
                                            }}
                                        >
                                            <option value="">Select Group...</option>
                                            {groups.map(g => (
                                                <option key={g.id} value={g.id}>{g.group_name} ({g.nature})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 mt-6">
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Active Status</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEditingLedger({ ...editingLedger, is_active: !editingLedger.is_active })}
                                            className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${editingLedger.is_active ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                        >
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${editingLedger.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: BUSINESS CLASSIFICATION */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Tag size={16} className="text-emerald-500" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Section 2: Business Classification (UI Tags)</h3>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 block">Assign to Business Service Groups (Multi-select)</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {tags.filter(t => t.is_active && !t.tag_name.startsWith('SETTLEMENT:')).map(tag => {
                                            const isSelected = editingLedger.business_tags?.includes(tag.id);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = editingLedger.business_tags || [];
                                                        const fresh = isSelected
                                                            ? current.filter(id => id !== tag.id)
                                                            : [...current, tag.id];
                                                        setEditingLedger({ ...editingLedger, business_tags: fresh });
                                                    }}
                                                    className={`px-4 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${isSelected
                                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-lg shadow-emerald-500/10'
                                                        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                                                        }`}
                                                >
                                                    {tag.tag_name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2 italic px-1 text-center">
                                        👉 Business tags drive search filters and automated templates but DO NOT affect reports.
                                    </p>
                                </div>
                            </div>

                            {/* SECTION 3: BEHAVIOUR */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Settings size={16} className="text-orange-500" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Section 3: Accounting Behaviour</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between ml-1 mb-1">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Opening Balance</label>
                                            {isOpeningLocked && editingLedger?.id && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirm("WARNING: Changing the opening balance will alter all historical running balances for this account. Proceed only if correcting an error.")) {
                                                            setIsOpeningLocked(false);
                                                        }
                                                    }}
                                                    className="text-[9px] font-black text-brand-500 hover:text-brand-600 flex items-center gap-1 uppercase tracking-tighter transition-all"
                                                >
                                                    <Edit2 size={10} /> Unlock to Fix
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative group">
                                            <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-bold text-xs transition-colors ${isOpeningLocked && editingLedger?.id ? 'text-slate-300' : 'text-slate-400'}`}>₹</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                disabled={isOpeningLocked && !!editingLedger?.id}
                                                className={`input-field !pl-10 font-mono font-black transition-all ${isOpeningLocked && editingLedger?.id ? 'bg-slate-50/50 text-slate-300 border-slate-100 cursor-not-allowed opacity-60' : ''}`}
                                                placeholder="0"
                                                value={editingLedger.opening_balance === 0 ? '' : editingLedger.opening_balance}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        const numVal = val === '' ? 0 : val;
                                                        setEditingLedger({ ...editingLedger, opening_balance: numVal as any });
                                                    }
                                                }}
                                                onBlur={() => {
                                                    const finalVal = parseFloat(String(editingLedger.opening_balance || 0));
                                                    setEditingLedger({ ...editingLedger, opening_balance: finalVal });
                                                }}
                                                onFocus={(e) => e.target.select()}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 relative">
                                        <div className="flex items-center justify-between ml-1 mb-1">
                                            <label className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isOpeningLocked && editingLedger?.id ? 'text-slate-300' : 'text-slate-500'}`}>Balance side</label>
                                            <button
                                                type="button"
                                                onClick={() => setShowBalanceInfo(!showBalanceInfo)}
                                                className="text-slate-400 hover:text-brand-500 transition-colors"
                                                title="Accounting Rules Help"
                                            >
                                                <Info size={12} />
                                            </button>
                                        </div>
                                        <div className="flex bg-slate-100/50 dark:bg-slate-800 p-1 rounded-xl h-10">
                                            <button
                                                type="button"
                                                disabled={isOpeningLocked && !!editingLedger?.id}
                                                onClick={() => setEditingLedger({ ...editingLedger, opening_balance_side: 'DR' })}
                                                className={`flex-1 flex items-center justify-center rounded-lg text-xs font-black uppercase tracking-widest transition-all ${isOpeningLocked && editingLedger?.id ? 'opacity-40 cursor-not-allowed' : ''} ${editingLedger.opening_balance_side === 'DR'
                                                    ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm border border-emerald-100 dark:border-emerald-900/30'
                                                    : 'text-slate-400 hover:text-slate-600'
                                                    }`}
                                            >
                                                Debit (DR)
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isOpeningLocked && !!editingLedger?.id}
                                                onClick={() => setEditingLedger({ ...editingLedger, opening_balance_side: 'CR' })}
                                                className={`flex-1 flex items-center justify-center rounded-lg text-xs font-black uppercase tracking-widest transition-all ${isOpeningLocked && editingLedger?.id ? 'opacity-40 cursor-not-allowed' : ''} ${editingLedger.opening_balance_side === 'CR'
                                                    ? 'bg-white dark:bg-slate-700 text-rose-600 shadow-sm border border-rose-100 dark:border-rose-900/30'
                                                    : 'text-slate-400 hover:text-slate-600'
                                                    }`}
                                            >
                                                Credit (CR)
                                            </button>
                                        </div>

                                        {showBalanceInfo && (
                                            <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50 animate-scale-up">
                                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Accounting Rules</span>
                                                    <button type="button" onClick={() => setShowBalanceInfo(false)} className="text-slate-500 hover:text-white">
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                                <table className="w-full text-[8px] text-slate-400 uppercase font-black tracking-tighter">
                                                    <thead>
                                                        <tr className="text-slate-500 mb-2">
                                                            <th className="text-left py-1">Type</th>
                                                            <th className="text-center py-1">Debit</th>
                                                            <th className="text-right py-1">Credit</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800">
                                                        {[
                                                            { type: 'Asset', dr: 'Increase', cr: 'Decrease' },
                                                            { type: 'Expense', dr: 'Increase', cr: 'Decrease' },
                                                            { type: 'Liability', dr: 'Decrease', cr: 'Increase' },
                                                            { type: 'Income', dr: 'Decrease', cr: 'Increase' },
                                                            { type: 'Capital', dr: 'Decrease', cr: 'Increase' },
                                                        ].map((row, i) => (
                                                            <tr key={i} className="hover:text-brand-400 transition-colors">
                                                                <td className="py-2 text-white">{row.type}</td>
                                                                <td className="py-2 text-center">{row.dr}</td>
                                                                <td className="py-2 text-right">{row.cr}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 relative">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Party Tracking</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPartyInfo(!showPartyInfo)}
                                                    className="text-slate-400 hover:text-brand-500 transition-colors"
                                                >
                                                    <Info size={12} />
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditingLedger({ ...editingLedger, allow_party: !editingLedger.allow_party })}
                                                className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${editingLedger.allow_party ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${editingLedger.allow_party ? 'translate-x-6' : 'translate-x-0'}`} />
                                            </button>
                                        </div>

                                        {showPartyInfo && (
                                            <div className="absolute bottom-full left-0 mb-3 w-[280px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 z-50 animate-scale-up">
                                                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">💡 Party Tracking Guide</span>
                                                    <button type="button" onClick={() => setShowPartyInfo(false)} className="text-slate-500 hover:text-white">
                                                        <X size={10} />
                                                    </button>
                                                </div>

                                                <div className="space-y-4 text-[10px] leading-relaxed">
                                                    <p className="text-slate-400 font-bold uppercase tracking-tight">Turn this <span className="text-emerald-400">ON</span> only if this account must be linked to a specific person or company.</p>

                                                    <div className="space-y-2">
                                                        <div className="text-emerald-400 font-black uppercase tracking-widest flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-emerald-400 rounded-full" /> ✔ Turn ON if:
                                                        </div>
                                                        <ul className="pl-3 space-y-1 text-slate-300 font-medium list-disc list-outside">
                                                            <li>Must know who amount belongs to</li>
                                                            <li>Need customer/supplier statements</li>
                                                            <li>Need name attached to txn</li>
                                                        </ul>
                                                        <p className="text-[9px] text-slate-500 italic mt-1 pl-3">e.g. Customers, Suppliers, Gold/Mortgage Loans</p>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="text-rose-400 font-black uppercase tracking-widest flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-rose-400 rounded-full" /> ❌ Turn OFF if:
                                                        </div>
                                                        <ul className="pl-3 space-y-1 text-slate-300 font-medium list-disc list-outside">
                                                            <li>Account is general, not specific</li>
                                                            <li>Only care about total amount</li>
                                                            <li>No individual statement needed</li>
                                                        </ul>
                                                        <p className="text-[9px] text-slate-500 italic mt-1 pl-3">e.g. Rent, Salary, Electricity, Expenses, Taxes</p>
                                                    </div>

                                                    <div className="pt-2 border-t border-slate-800">
                                                        <p className="text-brand-400 font-black uppercase tracking-widest mb-1 text-center">🧠 Simple Rule:</p>
                                                        <p className="text-center text-slate-200 font-black bg-brand-500/10 py-2 rounded-lg">
                                                            "Do I need to know who this amount is for?"
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 relative">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Cash / Bank Flow</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCashInfo(!showCashInfo)}
                                                    className="text-slate-400 hover:text-brand-500 transition-colors"
                                                >
                                                    <Info size={12} />
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditingLedger({ ...editingLedger, is_cash_bank: !editingLedger.is_cash_bank })}
                                                className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${editingLedger.is_cash_bank ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${editingLedger.is_cash_bank ? 'translate-x-6' : 'translate-x-0'}`} />
                                            </button>
                                        </div>

                                        {showCashInfo && (
                                            <div className="absolute bottom-full right-0 mb-3 w-[280px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 z-50 animate-scale-up">
                                                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">💡 Cash / Bank Flow Guide</span>
                                                    <button type="button" onClick={() => setShowCashInfo(false)} className="text-slate-500 hover:text-white">
                                                        <X size={10} />
                                                    </button>
                                                </div>

                                                <div className="space-y-4 text-[10px] leading-relaxed">
                                                    <p className="text-slate-400 font-bold uppercase tracking-tight">Turn this <span className="text-emerald-400">ON</span> only for accounts that hold real money.</p>

                                                    <div className="space-y-2">
                                                        <div className="text-emerald-400 font-black uppercase tracking-widest flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-emerald-400 rounded-full" /> ✔ Turn ON if:
                                                        </div>
                                                        <ul className="pl-3 space-y-1 text-slate-300 font-medium list-disc list-outside">
                                                            <li>Money physically moves in/out</li>
                                                            <li>You can count it today</li>
                                                            <li>Affects daily cash balance</li>
                                                        </ul>
                                                        <p className="text-[9px] text-slate-500 italic mt-1 pl-3">e.g. Cash in Hand, Bank, UPI, Petty Cash</p>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="text-rose-400 font-black uppercase tracking-widest flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-rose-400 rounded-full" /> ❌ Turn OFF if:
                                                        </div>
                                                        <ul className="pl-3 space-y-1 text-slate-300 font-medium list-disc list-outside">
                                                            <li>Only shows value or profit</li>
                                                            <li>Money is owed/payable, not held</li>
                                                            <li>No immediate cash impact</li>
                                                        </ul>
                                                        <p className="text-[9px] text-slate-500 italic mt-1 pl-3">e.g. Sales, Loans, Customer Dues, Taxes</p>
                                                    </div>

                                                    <div className="pt-2 border-t border-slate-800">
                                                        <p className="text-brand-400 font-black uppercase tracking-widest mb-1 text-center">🧠 Simple Rule:</p>
                                                        <p className="text-center text-slate-200 font-black bg-brand-500/10 py-2 rounded-lg">
                                                            "Can this account physically hold money?"
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {editingLedger.is_cash_bank && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-fade-in">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Settlement Mode *</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        { label: 'Physical Cash', tagName: SETTLEMENT_CASH_TAG },
                                                        { label: 'Bank Account', tagName: SETTLEMENT_BANK_TAG }
                                                    ].map(mode => {
                                                        const targetTag = tags.find(t => t.tag_name === mode.tagName);
                                                        const hasExplicitTag = targetTag && editingLedger.business_tags?.includes(targetTag.id);

                                                        // FALLBACK: If no explicit settlement tags are found, presume based on name
                                                        const anySettlementTags = tags.some(t =>
                                                            (t.tag_name === SETTLEMENT_CASH_TAG || t.tag_name === SETTLEMENT_BANK_TAG) &&
                                                            editingLedger.business_tags?.includes(t.id)
                                                        );

                                                        const isBankPresumed = (editingLedger.ledger_name || '').toLowerCase().includes('bank') ||
                                                            (groups.find(g => g.id === editingLedger.ledger_group_id)?.group_name || '').toLowerCase().includes('bank');

                                                        const isSelected = hasExplicitTag || (!anySettlementTags && (
                                                            (mode.tagName === SETTLEMENT_BANK_TAG && isBankPresumed) ||
                                                            (mode.tagName === SETTLEMENT_CASH_TAG && !isBankPresumed)
                                                        ));

                                                        return (
                                                            <button
                                                                key={mode.tagName}
                                                                type="button"
                                                                onClick={async () => {
                                                                    let tagId = targetTag?.id;

                                                                    // If tag doesn't exist yet, create it on the fly
                                                                    if (!tagId) {
                                                                        try {
                                                                            const newTag = await upsertLedgerTag({ tag_name: mode.tagName, is_active: true });
                                                                            tagId = newTag.id;
                                                                            await loadData(); // Refresh tags
                                                                        } catch (err) {
                                                                            toast.error("Failed to initialize system tag");
                                                                            return;
                                                                        }
                                                                    }

                                                                    const systemTagIds = tags
                                                                        .filter(t => t.tag_name === SETTLEMENT_CASH_TAG || t.tag_name === SETTLEMENT_BANK_TAG)
                                                                        .map(t => t.id);

                                                                    const others = (editingLedger.business_tags || []).filter(t => !systemTagIds.includes(t));
                                                                    setEditingLedger({ ...editingLedger, business_tags: [...others, tagId] });
                                                                }}
                                                                className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${isSelected
                                                                    ? 'bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-500/20'
                                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                                                                    }`}
                                                            >
                                                                {mode.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* SECTION 4: UNITS & QUANTITY TRACKING */}
                                <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Activity size={16} className="text-brand-500" />
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Section 4: Units & Quantity Tracking</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="flex flex-col p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Track Quantity / weight</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingLedger({ ...editingLedger, allow_quantity: !editingLedger.allow_quantity })}
                                                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${editingLedger.allow_quantity ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                >
                                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${editingLedger.allow_quantity ? 'translate-x-6' : 'translate-x-0'}`} />
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight leading-relaxed">
                                                Enable to track grams, pieces, or other physical units alongside ₹ amounts.
                                            </p>
                                        </div>

                                        {editingLedger.allow_quantity && (
                                            <div className="space-y-4 animate-scale-in">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Default Unit</label>
                                                    <select
                                                        className="select-field font-bold text-sm"
                                                        value={editingLedger.default_uom_id || ''}
                                                        onChange={(e) => setEditingLedger({ ...editingLedger, default_uom_id: e.target.value })}
                                                    >
                                                        <option value="">Select Unit...</option>
                                                        {uoms.map(u => (
                                                            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                                                    <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Quantity Required</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingLedger({ ...editingLedger, quantity_required: !editingLedger.quantity_required })}
                                                        className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 flex items-center ${editingLedger.quantity_required ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                    >
                                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${editingLedger.quantity_required ? 'translate-x-6' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2 italic px-1 text-center">
                                        👉 Quantity tracking is ideal for Gold Weight (Grams) or Stock Items (Pieces).
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 border-t border-slate-100 dark:border-slate-800 flex justify-end items-center gap-4 bg-slate-50/50 dark:bg-slate-800/40">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary h-12 px-8 text-[10px] font-black uppercase tracking-widest">Cancel</button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="btn-primary h-12 px-10 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-brand-500/20"
                            >
                                {saving ? <><div className="spinner !w-3 !h-3"></div> Syncing...</> : <><Save size={16} /> Finalize Account</>}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* TAG MANAGER MODAL */}
            <Modal isOpen={isTagModalOpen} onClose={() => setIsTagModalOpen(false)}>
                <LedgerTagManagerModal
                    onClose={() => setIsTagModalOpen(false)}
                    tags={tags}
                    onRefresh={loadData}
                />
            </Modal>

            {/* DELETE CONFIRMATION */}
            <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)}>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-[2.5rem] shadow-2xl animate-scale-in overflow-hidden">
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-rose-50/50 dark:bg-rose-950/10">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-rose-500 rounded-2xl shadow-lg shadow-rose-500/20">
                                <Trash2 size={24} className="text-white" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-rose-600 dark:text-rose-500">Atomic Deletion</h3>
                                <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Dangerous Operation</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-10 space-y-8 text-center">
                        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                            Are you sure you want to delete <span className="font-black text-slate-900 dark:text-white uppercase tracking-tight">"{ledgers.find(l => l.id === deletingId)?.ledger_name}"</span>?
                            <br /><br />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">⚠️ This will fail if transaction history exists.</span>
                        </p>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => setDeletingId(null)} className="btn-secondary flex-1 h-14 uppercase tracking-widest text-[10px] font-black">Hold On</button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={saving}
                                className="btn-primary flex-1 h-14 !bg-rose-600 hover:!bg-rose-700 !border-rose-600 uppercase tracking-widest text-[10px] font-black shadow-rose-500/20"
                            >
                                {saving ? 'Processing...' : 'Delete Forever'}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div >
    );
}

// Sub-component: Ledger Tag Manager
function LedgerTagManagerModal({ onClose, tags, onRefresh }: { onClose: () => void, tags: LedgerTag[], onRefresh: () => void }) {
    const [editingTag, setEditingTag] = useState<Partial<LedgerTag> | null>(null);
    const [saving, setSaving] = useState(false);

    async function handleSaveTag() {
        if (!editingTag?.tag_name) return;
        setSaving(true);
        try {
            await upsertLedgerTag(editingTag);
            toast.success('Tag updated');
            setEditingTag(null);
            onRefresh();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteTag(id: string) {
        if (!confirm('Remove this tag from business classification?')) return;
        try {
            await deleteLedgerTag(id);
            toast.success('Tag removed');
            onRefresh();
        } catch (error: any) {
            toast.error(error.message);
        }
    }

    return (
        <Modal isOpen={true} onClose={onClose}>
            <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-3xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 animate-scale-in">
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
                    <div>
                        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white uppercase tracking-tight">Business Tag Manager</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Secondary Classification Filters</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                    {/* Add Tag */}
                    <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 group hover:border-brand-500/50 transition-all">
                        <div className="flex gap-4">
                            <input
                                type="text"
                                placeholder="New Tag Name (e.g. JEWELLERY)"
                                className="input-field flex-1 font-black uppercase text-xs"
                                value={editingTag?.id ? '' : (editingTag?.tag_name || '')}
                                onChange={(e) => setEditingTag({ ...editingTag, tag_name: e.target.value })}
                            />
                            <button
                                type="button"
                                onClick={handleSaveTag}
                                disabled={saving || !editingTag?.tag_name || !!editingTag.id}
                                className="btn-primary !h-12 !px-6 text-[10px] uppercase font-black tracking-widest"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {tags.map(tag => (
                            <div key={tag.id} className="group p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between hover:shadow-lg transition-all">
                                <div className="flex items-center gap-4">
                                    <Tag size={16} className="text-emerald-500 opacity-50" />
                                    {editingTag?.id === tag.id ? (
                                        <input
                                            autoFocus
                                            className="bg-transparent font-black uppercase text-xs focus:outline-none"
                                            value={editingTag.tag_name}
                                            onChange={(e) => setEditingTag({ ...editingTag, tag_name: e.target.value })}
                                            onBlur={handleSaveTag}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
                                        />
                                    ) : (
                                        <span className="text-xs font-black uppercase tracking-tight text-slate-700 dark:text-slate-300">
                                            {tag.tag_name}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => setEditingTag(tag)}
                                        className="btn-icon !w-8 !h-8"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteTag(tag.id)}
                                        className="btn-icon !w-8 !h-8 !text-rose-500 hover:!bg-rose-500/10"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                        Note: Removing a tag cleans up your filters but doesn't delete accounts.
                    </p>
                </div>
            </div>
        </Modal>
    );
}
