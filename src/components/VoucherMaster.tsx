import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Ticket, X, Trash2, Settings, Save } from 'lucide-react';
import {
    fetchVoucherTypes,
    upsertVoucherType,
    deleteVoucherType,
    fetchVoucherGroups,
    upsertVoucherGroup,
    deleteVoucherGroup,
    reassignVoucherTypes
} from '../lib/supabase';
import type { VoucherType, VoucherNature, CashBankFlow, PartyRule, VoucherGroup } from '../types/accounting';
import { toast } from 'react-hot-toast';
import Modal from './ui/Modal';

export default function VoucherMaster() {
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeGroupId, setActiveGroupId] = useState<string>('ALL'); // 'ALL', 'UNCATEGORIZED', or group UUID
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingType, setEditingType] = useState<Partial<VoucherType> | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [vtData, vgData] = await Promise.all([
                fetchVoucherTypes(),
                fetchVoucherGroups()
            ]);
            setVoucherTypes(vtData);
            setVoucherGroups(vgData);
        } catch (error) {
            console.error('Error loading Master Data:', error);
            toast.error('Failed to load voucher data');
        } finally {
            setLoading(false);
        }
    };

    function handleOpenModal(type: Partial<VoucherType> | null = null) {
        setEditingType(type || {
            type_code: '',
            type_name: '',
            prefix: '',
            voucher_nature: 'JOURNAL',
            cash_bank_flow: 'NEUTRAL',
            party_rule: 'OPTIONAL',
            is_active: true,
            group_id: activeGroupId !== 'ALL' && activeGroupId !== 'UNCATEGORIZED' ? activeGroupId : null
        });
        setIsModalOpen(true);
    }

    async function handleSave() {
        if (!editingType?.type_code || !editingType?.type_name || !editingType?.prefix) {
            toast.error('Please fill in all required fields.');
            return;
        }

        setSaving(true);
        try {
            await upsertVoucherType(editingType as VoucherType);
            toast.success(`Voucher Type "${editingType.type_name}" saved successfully.`);
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save voucher type');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!deletingId) return;

        setSaving(true);
        try {
            await deleteVoucherType(deletingId);
            toast.success('Voucher Type deleted successfully.');
            setDeletingId(null);
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete voucher type. It may be in use.');
        } finally {
            setSaving(false);
        }
    }

    const filteredTypes = voucherTypes.filter(t => {
        const matchesSearch = t.type_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.type_code.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesGroup = true;
        if (activeGroupId === 'UNCATEGORIZED') {
            matchesGroup = !t.group_id;
        } else if (activeGroupId !== 'ALL') {
            matchesGroup = t.group_id === activeGroupId;
        }

        return matchesSearch && matchesGroup;
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="spinner !w-8 !h-8"></div>
                <p className="text-[10px] font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">Loading Voucher Master...</p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6 animate-fade-in">
            {/* LEFT SIDEBAR: Voucher Categories */}
            <div className="w-1/4 flex flex-col border-r border-slate-800/30 overflow-hidden bg-slate-900/5 rounded-2xl">
                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Voucher Groups</h2>
                        <button
                            type="button"
                            onClick={() => setIsCategoryModalOpen(true)}
                            className="p-1.5 bg-slate-800/50 hover:bg-slate-800 text-slate-400 rounded-lg transition-all border border-slate-700/30"
                            title="Manage Groups"
                        >
                            <Settings size={14} />
                        </button>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search categories..."
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-[11px] font-bold text-slate-300 focus:outline-none focus:border-brand-500/50"
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
                    <button
                        type="button"
                        onClick={() => setActiveGroupId('ALL')}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeGroupId === 'ALL'
                            ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                    >
                        <span className="text-[11px] font-black uppercase tracking-widest">All Types</span>
                        <span className="text-[10px] opacity-70">{voucherTypes.length}</span>
                    </button>

                    {voucherGroups.map(group => (
                        <button
                            key={group.id}
                            type="button"
                            onClick={() => setActiveGroupId(group.id)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeGroupId === group.id
                                ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                }`}
                        >
                            <span className="text-[11px] font-black uppercase tracking-widest truncate mr-2">{group.group_name}</span>
                            <span className="text-[10px] opacity-70">{voucherTypes.filter(t => t.group_id === group.id).length}</span>
                        </button>
                    ))}

                    <button
                        type="button"
                        onClick={() => setActiveGroupId('UNCATEGORIZED')}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeGroupId === 'UNCATEGORIZED'
                            ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                    >
                        <span className="text-[11px] font-black uppercase tracking-widest">Uncategorized</span>
                        <span className="text-[10px] opacity-70">{voucherTypes.filter(t => !t.group_id).length}</span>
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT: Voucher Types List */}
            <div className="flex-1 flex flex-col surface-card overflow-hidden">
                <div className="p-6 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/10">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-brand-600 text-white rounded-xl shadow-glow shadow-brand-500/20">
                            <Ticket size={20} />
                        </div>
                        <div>
                            <h1 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                                {activeGroupId === 'ALL' ? 'All Voucher Types' :
                                    activeGroupId === 'UNCATEGORIZED' ? 'Uncategorized Vouchers' :
                                        voucherGroups.find(g => g.id === activeGroupId)?.group_name}
                            </h1>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Configure transaction behavior & prefixes</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleOpenModal()}
                        className="btn-primary !h-10 !px-5 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                    >
                        <Plus size={16} /> New Voucher Type
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 scroll-smooth custom-scrollbar">
                    {filteredTypes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <Ticket size={48} strokeWidth={1} className="mb-4" />
                            <p className="text-xs font-black uppercase tracking-widest">No voucher types found</p>
                        </div>
                    ) : (
                        <div className="flex flex-col space-y-1 animate-fade-in">
                            {filteredTypes.map(type => (
                                <div
                                    key={type.id}
                                    className="group flex items-center justify-between p-3 rounded-2xl hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all duration-200"
                                >
                                    {/* LEFT: Identifying Info */}
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        {/* Prefix Box */}
                                        <div className="w-10 h-10 rounded-xl bg-brand-600/10 border border-brand-500/20 text-brand-600 flex items-center justify-center shrink-0 font-black font-mono text-xs">
                                            {type.prefix}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                                                    {type.type_name}
                                                </h3>
                                                <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 uppercase tracking-widest">
                                                    {type.type_code}
                                                </span>
                                                {!type.is_active && (
                                                    <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-widest">Inactive</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] font-black px-1.5 py-0 rounded border uppercase tracking-tighter bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700">
                                                    {type.voucher_nature}
                                                </span>
                                                {type.group && (
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">
                                                        {type.group.group_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT: Values & Actions */}
                                    <div className="flex items-center gap-6 pl-4">
                                        {/* Status Indicators */}
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest border uppercase ${type.cash_bank_flow === 'INFLOW' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                type.cash_bank_flow === 'OUTFLOW' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                                    'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                                                }`}>
                                                {type.cash_bank_flow}
                                            </span>
                                            {type.party_rule !== 'NOT_ALLOWED' && (
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest border uppercase ${type.party_rule === 'MANDATORY' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                                                    'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                                    }`}>
                                                    Party: {type.party_rule}
                                                </span>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenModal(type)}
                                                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand-500 rounded-xl hover:shadow-lg transition-all"
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeletingId(type.id)}
                                                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-xl hover:shadow-lg transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Voucher Type Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingType && (
                    <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-up">
                        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <div>
                                <h2 className="text-lg font-black uppercase tracking-widest text-white">
                                    {editingType.id ? 'Edit Voucher' : 'New Voucher'}
                                </h2>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Transaction Behavior Definition</p>
                            </div>
                            <button type="button" onClick={() => setIsModalOpen(false)} className="p-2.5 rounded-xl hover:bg-slate-800 transition-colors text-slate-500 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Voucher Name *</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50 transition-colors"
                                        placeholder="e.g. Retail Sales"
                                        value={editingType.type_name}
                                        onChange={(e) => setEditingType({ ...editingType, type_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">System Code *</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50 transition-colors uppercase font-mono"
                                        placeholder="e.g. SALES_RETAIL"
                                        value={editingType.type_code}
                                        onChange={(e) => setEditingType({ ...editingType, type_code: e.target.value.toUpperCase() })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Number Prefix *</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-brand-400 outline-none focus:border-brand-500/50 transition-colors uppercase font-mono"
                                        placeholder="e.g. RET"
                                        value={editingType.prefix}
                                        onChange={(e) => setEditingType({ ...editingType, prefix: e.target.value.toUpperCase() })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Voucher Group</label>
                                    <select
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50 transition-colors"
                                        value={editingType.group_id || ''}
                                        onChange={(e) => setEditingType({ ...editingType, group_id: e.target.value || null })}
                                    >
                                        <option value="">-- Uncategorized --</option>
                                        {voucherGroups.map(g => (
                                            <option key={g.id} value={g.id}>{g.group_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nature</label>
                                    <select
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50 transition-colors"
                                        value={editingType.voucher_nature}
                                        onChange={(e) => {
                                            const nature = e.target.value as VoucherNature;
                                            const defaults: Record<VoucherNature, { flow: CashBankFlow; party: PartyRule }> = {
                                                RECEIPT: { flow: 'INFLOW', party: 'OPTIONAL' },
                                                PAYMENT: { flow: 'OUTFLOW', party: 'OPTIONAL' },
                                                CONTRA: { flow: 'NEUTRAL', party: 'NOT_ALLOWED' },
                                                JOURNAL: { flow: 'NEUTRAL', party: 'OPTIONAL' },
                                                SALE: { flow: 'INFLOW', party: 'OPTIONAL' },
                                                PURCHASE: { flow: 'OUTFLOW', party: 'OPTIONAL' }
                                            };
                                            setEditingType({
                                                ...editingType,
                                                voucher_nature: nature,
                                                cash_bank_flow: defaults[nature].flow,
                                                party_rule: defaults[nature].party
                                            });
                                        }}
                                    >
                                        <option value="RECEIPT">RECEIPT</option>
                                        <option value="PAYMENT">PAYMENT</option>
                                        <option value="CONTRA">CONTRA</option>
                                        <option value="JOURNAL">JOURNAL</option>
                                        <option value="SALE">SALE</option>
                                        <option value="PURCHASE">PURCHASE</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Flow</label>
                                    <select
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50 transition-colors"
                                        value={editingType.cash_bank_flow}
                                        onChange={(e) => setEditingType({ ...editingType, cash_bank_flow: e.target.value as CashBankFlow })}
                                    >
                                        <option value="INFLOW">INFLOW</option>
                                        <option value="OUTFLOW">OUTFLOW</option>
                                        <option value="NEUTRAL">NEUTRAL</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Party Rule</label>
                                    <select
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50 transition-colors"
                                        value={editingType.party_rule}
                                        onChange={(e) => setEditingType({ ...editingType, party_rule: e.target.value as PartyRule })}
                                    >
                                        <option value="MANDATORY">MANDATORY</option>
                                        <option value="OPTIONAL">OPTIONAL</option>
                                        <option value="NOT_ALLOWED">NOT ALLOWED</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-6 bg-slate-950 border border-slate-800 rounded-2xl">
                                <div className="space-y-0.5">
                                    <p className="text-xs font-black uppercase tracking-widest text-white">Active Status</p>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Enable for transaction entry</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditingType({ ...editingType, is_active: !editingType.is_active })}
                                    className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${editingType.is_active ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-slate-800 border border-slate-700'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full shadow-sm transition-all duration-300 ${editingType.is_active ? 'translate-x-6 bg-emerald-500' : 'translate-x-0 bg-slate-500'}`} />
                                </button>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-800 flex justify-end items-center gap-4 bg-slate-900/50">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="px-8 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-glow shadow-brand-500/20 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Commit Voucher Type'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Voucher Category Manager Modal */}
            {isCategoryModalOpen && (
                <VoucherCategoryManagerModal
                    groups={voucherGroups}
                    onClose={() => setIsCategoryModalOpen(false)}
                    onRefresh={loadData}
                />
            )}

            {/* Deletion Confirmation */}
            <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)}>
                <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl animate-scale-up overflow-hidden">
                    <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-rose-500/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-600 rounded-xl">
                                <Trash2 size={18} className="text-white" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">Confirm Deletion</h3>
                        </div>
                    </div>
                    <div className="p-10 text-center space-y-8">
                        <p className="text-slate-400 text-xs font-bold leading-relaxed uppercase tracking-wider">
                            Are you sure you want to delete <br />
                            <span className="text-white font-black">"{voucherTypes.find(t => t.id === deletingId)?.type_name}"</span>?
                            <br /><br />
                            <span className="text-[10px] text-rose-500/70 lowercase italic font-normal">This action is permanent and only works if no transactions exist.</span>
                        </p>
                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => setDeletingId(null)}
                                className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-glow shadow-rose-500/20"
                            >
                                Delete Type
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

// ----------------------------------------------------------------------
// Sub-component: Voucher Category Manager Modal
// ----------------------------------------------------------------------

interface CategoryManagerProps {
    groups: VoucherGroup[];
    onClose: () => void;
    onRefresh: () => void;
}

function VoucherCategoryManagerModal({ groups, onClose, onRefresh }: CategoryManagerProps) {
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
    const [migrationTargetId, setMigrationTargetId] = useState<string>('');

    const handleCreate = async () => {
        if (!newName.trim()) return;
        try {
            await upsertVoucherGroup({ group_name: newName.trim() });
            setNewName('');
            onRefresh();
            toast.success("Voucher Group created");
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleUpdate = async () => {
        if (!editingId || !editingName.trim()) return;
        try {
            await upsertVoucherGroup({ id: editingId, group_name: editingName.trim() });
            setEditingId(null);
            onRefresh();
            toast.success("Voucher Group updated");
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleDelete = async () => {
        if (!isDeletingId) return;
        try {
            await reassignVoucherTypes(isDeletingId, migrationTargetId || null);
            await deleteVoucherGroup(isDeletingId);
            setIsDeletingId(null);
            onRefresh();
            toast.success("Group removed and types migrated");
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} className="modal-backdrop-blur-xl"> {/* Custom backdrop for this manager */}
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden relative">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <Settings size={18} className="text-brand-500" />
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Voucher Category Manager</h3>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">New Voucher Group</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. Sales Vouchers, Service Entries..."
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50"
                            />
                            <button type="button" onClick={handleCreate} className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Existing Groups</label>
                        <div className="space-y-2">
                            {groups.map(g => (
                                <div key={g.id} className="p-3 bg-slate-950 border border-slate-800/50 rounded-xl flex items-center justify-between group">
                                    {editingId === g.id ? (
                                        <div className="flex-1 flex gap-2">
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                className="flex-1 bg-slate-900 border border-brand-500/30 rounded-lg py-1 px-3 text-xs font-bold text-white"
                                                autoFocus
                                            />
                                            <button type="button" onClick={handleUpdate} className="text-emerald-500"><Save size={16} /></button>
                                            <button type="button" onClick={() => setEditingId(null)} className="text-slate-500"><X size={16} /></button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-xs font-bold text-slate-200 uppercase tracking-tight">{g.group_name}</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button type="button" onClick={() => { setEditingId(g.id); setEditingName(g.group_name); }} className="p-1.5 text-slate-400 hover:text-brand-400"><Edit2 size={14} /></button>
                                                <button type="button" onClick={() => setIsDeletingId(g.id)} className="p-1.5 text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sub-modal: Migration */}
                {isDeletingId && (
                    <div className="absolute inset-0 bg-slate-950/98 flex items-center justify-center p-8 z-[130] animate-fade-in">
                        <div className="w-full max-w-xs space-y-8 text-center animate-scale-up">
                            <div className="space-y-2">
                                <h4 className="text-sm font-black uppercase tracking-widest text-white">Migration Target</h4>
                                <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed tracking-wider">
                                    Move vouchers from <span className="text-rose-400 font-black">"{groups.find(g => g.id === isDeletingId)?.group_name}"</span> to:
                                </p>
                            </div>
                            <select
                                value={migrationTargetId}
                                onChange={e => setMigrationTargetId(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white"
                            >
                                <option value="">( Uncategorized )</option>
                                {groups.filter(g => g.id !== isDeletingId).map(g => (
                                    <option key={g.id} value={g.id}>{g.group_name}</option>
                                ))}
                            </select>
                            <div className="flex gap-4">
                                <button type="button" onClick={() => setIsDeletingId(null)} className="flex-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Cancel</button>
                                <button type="button" onClick={handleDelete} className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Migrate & Delete</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
