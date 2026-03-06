import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, AlertCircle, X, Edit2, Search, ArrowRight, Loader2, RotateCcw, Eye } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { getNextCustomerId, fetchPartyGroups, deleteParty, fetchPartiesPaginated, fetchPartyById } from '../lib/supabase';
import type { Party, PartyGroup } from '../types/accounting';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { VirtuosoGrid } from 'react-virtuoso';
import { useAuth } from '../lib/auth';

interface PartyModalProps {
    isOpen: boolean;
    onClose: () => void;
    party: Partial<Party> | null;
    onSave: (party: Party) => Promise<void>;
    onDelete?: () => void;
    showDirectoryTab?: boolean;
    onSelect?: (party: Party) => void;
}

export default function PartyModal({ isOpen, onClose, party, onSave, onDelete, showDirectoryTab = false, onSelect }: PartyModalProps) {
    const { } = useAuth();
    const [view, setView] = useState<'form' | 'directory'>('form');
    const [editingParty, setEditingParty] = useState<Partial<Party>>({});
    const [saving, setSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [groups, setGroups] = useState<PartyGroup[]>([]);


    // Directory State
    const [directoryParties, setDirectoryParties] = useState<Party[]>([]);
    const [dirLoading, setDirLoading] = useState(false);
    const [dirSearchTerm, setDirSearchTerm] = useState('');
    const [dirFilterType, setDirFilterType] = useState<string>('ALL');
    const [dirFilterGroup, setDirFilterGroup] = useState<string>('');
    const [dirPage, setDirPage] = useState(0);
    const [dirHasMore, setDirHasMore] = useState(true);
    const searchRef = useRef<NodeJS.Timeout>(null);

    useEffect(() => {
        if (isOpen) {
            loadGroups();
            setDirSearchTerm('');
            setDirFilterType('ALL');
            setDirFilterGroup('');

            if (party?.id) {
                // Scenario 1: Existing Party (View Mode)
                setIsReadOnly(true);
                setEditingParty(party);
                setView('form');

                // Fetch full details
                fetchPartyById(party.id)
                    .then(full => setEditingParty(full))
                    .catch(() => toast.error('Failed to load details'));


            } else if (party?.party_name || party?.phone) {
                // Scenario 2: New Party with Pre-fill
                setIsReadOnly(false);
                setEditingParty(party);
                setView('form');
            } else {
                // Scenario 3: New Party / Directory
                setIsReadOnly(false);
                setEditingParty({});
                if (showDirectoryTab) {
                    setView('directory');
                } else {
                    setView('form');
                }
            }
        }
    }, [isOpen, party]);

    // Fetch Directory Data
    const loadDirectoryData = useCallback(async (reset = false) => {
        if (reset) {
            setDirLoading(true);
            setDirPage(0);
        }

        try {
            const currentPage = reset ? 0 : dirPage;
            const result = await fetchPartiesPaginated({
                searchTerm: dirSearchTerm,
                type: dirFilterType,
                groupId: dirFilterGroup || undefined,
                page: currentPage,
                pageSize: 20
            });

            if (reset) {
                setDirectoryParties(result.data);
            } else {
                setDirectoryParties(prev => [...prev, ...result.data]);
            }

            setDirHasMore(result.hasMore);
            if (!reset) setDirPage(p => p + 1);
        } catch (error) {
            console.error('Error loading directory:', error);
        } finally {
            setDirLoading(false);
        }
    }, [dirSearchTerm, dirPage, dirFilterType, dirFilterGroup]);

    // Handle Directory Search debounce
    useEffect(() => {
        if (view === 'directory') {
            if (searchRef.current) clearTimeout(searchRef.current);
            searchRef.current = setTimeout(() => {
                loadDirectoryData(true);
            }, 400);
            return () => { if (searchRef.current) clearTimeout(searchRef.current); };
        }
    }, [dirSearchTerm, dirFilterType, dirFilterGroup, view]);

    // Initial Directory Load
    useEffect(() => {
        if (view === 'directory' && directoryParties.length === 0) {
            loadDirectoryData(true);
        }
    }, [view]);

    async function loadGroups() {
        try {
            const data = await fetchPartyGroups();
            setGroups(data);
        } catch (err) {
            console.error('Error loading party groups:', err);
        }
    }

    useEffect(() => {
        if (party) {
            setEditingParty({
                ...party,
                bank_accounts: party.bank_accounts && party.bank_accounts.length > 0
                    ? party.bank_accounts
                    : [{ id: uuidv4(), bank_name: '', bank_account_no: '', bank_ifsc: '' }]
            });
        } else {
            setEditingParty({
                party_name: '',
                // party_type is removed to force selection
                phone_country_code: '+91',
                phone: '',
                whatsapp_active: true,
                customer_id: '',
                pincode: '',
                address: '',
                gender: 'MALE',
                dob: '',
                religion: '',
                occupation: '',
                aadhar_no: '',
                bank_accounts: [{ id: uuidv4(), bank_name: '', bank_account_no: '', bank_ifsc: '' }],
                is_active: true,
                email: '',
                gstin: '',
                opening_balance: 0,
                opening_balance_side: 'DR',
                group_id: null
            });

        }
        setError(null);
    }, [party, isOpen]);

    // Rule: Auto-generate Customer ID starting with CU0001
    useEffect(() => {
        if (isOpen && !party?.id && !editingParty.customer_id) {
            const fetchId = async () => {
                try {
                    const nextId = await getNextCustomerId();
                    setEditingParty(prev => ({ ...prev, customer_id: nextId }));
                } catch (error) {
                    console.error('Error generating customer ID:', error);
                }
            };
            fetchId();
        }
    }, [isOpen, party?.id]);


    async function handleSave() {
        if (!editingParty.party_name || !editingParty.phone || !editingParty.address) {
            setError('Party name, Phone number, and Address are required.');
            return;
        }

        if (!editingParty.party_type) {
            setError('Please select a Party Type.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            await onSave(editingParty as Party);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save party');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!editingParty.id) return;

        setIsDeleting(true);
        try {
            await deleteParty(editingParty.id);
            toast.success(`Profile "${editingParty.party_name}" removed`);
            onDelete?.();
            onClose();
        } catch (error: any) {
            console.error('Delete error:', error);
            toast.error(error.message || 'Failed to delete profile');
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl flex flex-col max-h-[90vh] rounded-[2.5rem] shadow-2xl animate-scale-in overflow-hidden">
                {/* Header */}
                {/* Header */}
                <div className="flex flex-col border-b border-white/5 bg-slate-900/50">
                    <div className="p-10 pb-0 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            {showDirectoryTab ? (
                                <div className="flex bg-slate-950/50 p-1 rounded-xl border border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setView('form')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'form' ? 'bg-brand-500 text-slate-950 shadow-glow' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        {editingParty.id ? 'Profile Details' : 'New Counterparty'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setView('directory')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === 'directory' ? 'bg-brand-500 text-slate-950 shadow-glow' : 'text-slate-500 hover:text-white'}`}
                                    >
                                        Directory
                                    </button>
                                </div>
                            ) : (
                                <h3 className="text-sm font-black uppercase tracking-[0.4em] text-brand-500">
                                    {editingParty.id ? (isReadOnly ? 'View Profile' : 'Edit Profile') : 'New Counterparty'}
                                </h3>
                            )}

                            {view === 'form' && editingParty.id && (
                                <div className="flex items-center gap-2">
                                    {isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => setIsReadOnly(false)}
                                            className="p-2.5 bg-brand-500/10 border border-brand-500/20 rounded-xl text-brand-500 hover:bg-brand-500 hover:text-white transition-all group"
                                            title="Edit Profile"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    )}
                                    {/* Only show delete if onDelete prop is provided AND we are not in directory tab mode (implied safety) */}
                                    {onDelete && (
                                        <button
                                            type="button"
                                            onClick={() => setShowDeleteConfirm(true)}
                                            className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white transition-all group"
                                            title="Delete Profile"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-all">
                            <X size={24} />
                        </button>
                    </div>
                    {/* Directory Search Bar & Filters in Header */}
                    {view === 'directory' && (
                        <div className="px-10 py-6">
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search by Name or Mobile..."
                                        className="input-field !pl-12 !h-10 !bg-slate-900 text-white border-white/10 text-sm placeholder:text-slate-400"
                                        value={dirSearchTerm}
                                        onChange={(e) => setDirSearchTerm(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <select
                                    className="h-10 w-40 bg-slate-900 text-white border border-white/10 rounded-lg px-3 outline-none focus:border-brand-500 transition-all font-bold text-sm"
                                    value={dirFilterType}
                                    onChange={(e) => setDirFilterType(e.target.value)}
                                >
                                    <option value="ALL" className="bg-slate-900 text-white">All Types</option>
                                    <option value="CUSTOMER" className="bg-slate-900 text-white">Customer</option>
                                    <option value="VENDOR" className="bg-slate-900 text-white">Vendor</option>
                                </select>

                                <select
                                    className="h-10 w-40 bg-slate-900 text-white border border-white/10 rounded-lg px-3 outline-none focus:border-brand-500 transition-all font-bold text-sm"
                                    value={dirFilterGroup}
                                    onChange={(e) => setDirFilterGroup(e.target.value)}
                                >
                                    <option value="" className="bg-slate-900 text-white">All Groups</option>
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.group_name}</option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setDirSearchTerm('');
                                        setDirFilterType('ALL');
                                        setDirFilterGroup('');
                                    }}
                                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-white/5"
                                    title="Reset Filters"
                                >
                                    <RotateCcw size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Body */}
                <form noValidate onSubmit={(e) => e.preventDefault()} className="flex-1 overflow-hidden relative flex flex-col">
                    {view === 'directory' ? (
                        <div className="h-[55vh] p-6 bg-slate-950/30">
                            {dirLoading && directoryParties.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-4">
                                    <Loader2 className="animate-spin text-brand-500" size={32} />
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Loading Directory...</p>
                                </div>
                            ) : (
                                <VirtuosoGrid
                                    data={directoryParties}
                                    style={{ height: '100%' }}
                                    useWindowScroll={false}
                                    endReached={() => {
                                        if (dirHasMore && !dirLoading) {
                                            loadDirectoryData(false);
                                        }
                                    }}
                                    components={{
                                        List: ({ children, ...props }) => (
                                            <div {...props} className="flex flex-col space-y-2 pb-20">
                                                {children}
                                            </div>
                                        )
                                    }}
                                    itemContent={(_index, p) => (
                                        <div
                                            key={p.id}
                                            onClick={async () => {
                                                if (onSelect) {
                                                    onSelect(p);
                                                } else {
                                                    const loadToast = toast.loading('Loading profile...');
                                                    try {
                                                        const fullParty = await fetchPartyById(p.id);
                                                        setEditingParty(fullParty);
                                                        setIsReadOnly(true);
                                                        setView('form');
                                                        toast.dismiss(loadToast);
                                                    } catch (err) {
                                                        toast.dismiss(loadToast);
                                                        toast.error('Failed to load details');
                                                    }
                                                }
                                            }}
                                            className="group flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-brand-500/30 hover:bg-brand-500/5 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                                                <div>
                                                    <div className="text-[13px] font-bold text-white uppercase group-hover:text-brand-400 transition-colors">
                                                        {p.party_name}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[9px] font-black uppercase tracking-wider ${p.party_type === 'CUSTOMER' ? 'text-blue-400' : 'text-orange-400'}`}>
                                                            {p.party_type}
                                                        </span>
                                                        {p.phone && (
                                                            <span className="text-[9px] font-mono text-slate-500">{p.phone}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const loadToast = toast.loading('Loading profile...');
                                                        try {
                                                            const fullParty = await fetchPartyById(p.id);
                                                            setEditingParty(fullParty);
                                                            setIsReadOnly(true);
                                                            setView('form');
                                                            toast.dismiss(loadToast);
                                                        } catch (err) {
                                                            toast.dismiss(loadToast);
                                                            toast.error('Failed to load details');
                                                        }
                                                    }}
                                                    className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100"
                                                    title="View Profile Details"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <ArrowRight size={16} className="text-slate-600 group-hover:text-brand-400 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                            </div>
                                        </div>
                                    )}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            {/* Sticky error banner — always visible above the scrollable area */}
                            {error && (
                                <div className="mx-10 mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 animate-shake shrink-0">
                                    <AlertCircle size={18} className="text-rose-500 shrink-0" />
                                    <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">{error}</span>
                                </div>
                            )}
                            <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar flex-1">

                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 gap-6">
                                        {/* 1) Full Name */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">1) Full Name *</label>
                                            <input
                                                type="text"
                                                className="input-field !h-14 w-full uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="Enter full legal name"
                                                value={editingParty.party_name || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, party_name: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                    </div>

                                    {/* 2) Phone Number */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">2) Phone Number *</label>
                                        <div className="flex gap-3">
                                            <input
                                                type="text"
                                                className="input-field !h-14 w-20 text-center uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="+91"
                                                value={editingParty.phone_country_code || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, phone_country_code: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                            <input
                                                type="tel"
                                                className="input-field !h-14 flex-1 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="Mobile Number"
                                                value={editingParty.phone || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, phone: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                            <div className="flex items-center gap-3 bg-slate-950/30 px-5 rounded-2xl border border-white/5">
                                                <input
                                                    type="checkbox"
                                                    id="whatsapp_opt_modal"
                                                    className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                                                    checked={editingParty.whatsapp_active ?? true}
                                                    onChange={e => setEditingParty(prev => ({ ...prev, whatsapp_active: e.target.checked }))}
                                                    disabled={isReadOnly}
                                                />
                                                <label htmlFor="whatsapp_opt_modal" className="text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer">WhatsApp</label>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">3) ID / Customer Code</label>
                                            <input
                                                type="text"
                                                className="input-field !h-14 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="Ex: CUST-001"
                                                value={editingParty.customer_id || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, customer_id: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">5) Pincode</label>
                                            <input
                                                type="text"
                                                className="input-field !h-14 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="6-digit PIN code"
                                                value={editingParty.pincode || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, pincode: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Party Type *</label>
                                            <select
                                                className="select-field !h-14 disabled:opacity-50 disabled:cursor-not-allowed"
                                                value={editingParty.party_type || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, party_type: e.target.value as any }))}
                                                disabled={isReadOnly}
                                            >
                                                <option value="" className="bg-slate-900 text-white">Select Party Type</option>
                                                <option value="CUSTOMER" className="bg-slate-900 text-white">Customer</option>
                                                <option value="VENDOR" className="bg-slate-900 text-white">Vendor</option>
                                                <option value="BOTH" className="bg-slate-900 text-white">Both</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Secondary Mobile Number</label>
                                            <input
                                                type="tel"
                                                className="input-field !h-14 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="Alternate Mobile Number"
                                                value={editingParty.gstin || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">4) Address *</label>
                                        <textarea
                                            className="input-field !h-20 resize-none py-3 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                            placeholder="Street, Locality, City, State"
                                            value={editingParty.address || ''}
                                            onChange={e => setEditingParty(prev => ({ ...prev, address: e.target.value.toUpperCase() }))}
                                            disabled={isReadOnly}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">6) Gender</label>
                                            <select
                                                className="select-field !h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                                                value={editingParty.gender || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, gender: e.target.value as any }))}
                                                disabled={isReadOnly}
                                            >
                                                <option value="" className="bg-slate-900 text-white">Select</option>
                                                <option value="MALE" className="bg-slate-900 text-white">Male</option>
                                                <option value="FEMALE" className="bg-slate-900 text-white">Female</option>
                                                <option value="OTHER" className="bg-slate-900 text-white">Other</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">7) DOB</label>
                                            <input
                                                type="date"
                                                className="input-field !h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                                                value={editingParty.dob || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, dob: e.target.value }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">8) Religion</label>
                                            <div className="space-y-2">
                                                <select
                                                    className="select-field !h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    value={(['CHRISTIAN', 'MUSLIM', 'HINDU'].includes(editingParty.religion || '')) ? (editingParty.religion || '') : (editingParty.religion ? 'CUSTOM' : '')}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (val === 'CUSTOM') {
                                                            setEditingParty(prev => ({ ...prev, religion: '' }));
                                                        } else {
                                                            setEditingParty(prev => ({ ...prev, religion: val }));
                                                        }
                                                    }}
                                                    disabled={isReadOnly}
                                                >
                                                    <option value="" className="bg-slate-900 text-white">Select</option>
                                                    <option value="HINDU" className="bg-slate-900 text-white">Hindu</option>
                                                    <option value="MUSLIM" className="bg-slate-900 text-white">Muslim</option>
                                                    <option value="CHRISTIAN" className="bg-slate-900 text-white">Christian</option>
                                                    <option value="CUSTOM" className="bg-slate-900 text-white">Custom / Other</option>
                                                </select>

                                                {(editingParty.religion !== undefined && editingParty.religion !== null && !['HINDU', 'MUSLIM', 'CHRISTIAN'].includes(editingParty.religion) || (document.activeElement?.tagName === 'SELECT' && (document.activeElement as HTMLSelectElement).value === 'CUSTOM')) && (
                                                    <input
                                                        type="text"
                                                        className="input-field !h-12 uppercase animate-fade-in"
                                                        placeholder="Specify Religion"
                                                        value={editingParty.religion || ''}
                                                        onChange={e => setEditingParty(prev => ({ ...prev, religion: e.target.value.toUpperCase() }))}
                                                        disabled={isReadOnly}
                                                        autoFocus
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">9) Occupation</label>
                                            <input
                                                type="text"
                                                className="input-field !h-12 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="Current Occupation"
                                                value={editingParty.occupation || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, occupation: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">10) Aadhar Number</label>
                                            <input
                                                type="text"
                                                className="input-field !h-12 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="12-digit Aadhar No"
                                                value={editingParty.aadhar_no || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, aadhar_no: e.target.value.toUpperCase() }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-8 bg-slate-950/20 rounded-3xl border border-white/5 space-y-6">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                            <div className="flex items-center gap-3">
                                                <label className="text-[10px] font-black text-brand-500 uppercase tracking-[0.3em]">11) Bank Accounts</label>
                                                <span className="px-2 py-0.5 bg-brand-500/10 text-brand-500 text-[9px] font-black rounded-full border border-brand-500/20">{(editingParty.bank_accounts || []).length}</span>
                                            </div>
                                            {!isReadOnly && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingParty(prev => ({
                                                        ...prev,
                                                        bank_accounts: [...(prev.bank_accounts || []), { id: uuidv4(), bank_name: '', bank_account_no: '', bank_ifsc: '' }]
                                                    }))}
                                                    className="p-1 px-3 bg-brand-500 hover:bg-brand-400 text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all active:scale-95 flex items-center gap-1"
                                                >
                                                    <Plus size={14} /> Add Account
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-6">
                                            {(editingParty.bank_accounts || []).map((acc, index) => (
                                                <div key={acc.id} className="relative p-6 bg-slate-900/50 border border-white/5 rounded-2xl group animate-slide-up">
                                                    {(editingParty.bank_accounts || []).length > 1 && !isReadOnly && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingParty(prev => ({
                                                                ...prev,
                                                                bank_accounts: (prev.bank_accounts || []).filter(b => b.id !== acc.id)
                                                            }))}
                                                            className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-400 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}

                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">Account No</label>
                                                            <input
                                                                type="text"
                                                                className="input-field !h-10 text-[12px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                                value={acc.bank_account_no}
                                                                onChange={e => {
                                                                    const updated = [...(editingParty.bank_accounts || [])];
                                                                    updated[index].bank_account_no = e.target.value.toUpperCase();
                                                                    setEditingParty(prev => ({ ...prev, bank_accounts: updated }));
                                                                }}
                                                                disabled={isReadOnly}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">IFSC Code</label>
                                                            <input
                                                                type="text"
                                                                className="input-field !h-10 text-[12px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                                value={acc.bank_ifsc}
                                                                onChange={e => {
                                                                    const updated = [...(editingParty.bank_accounts || [])];
                                                                    updated[index].bank_ifsc = e.target.value.toUpperCase();
                                                                    setEditingParty(prev => ({ ...prev, bank_accounts: updated }));
                                                                }}
                                                                disabled={isReadOnly}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">Bank Name</label>
                                                            <input
                                                                type="text"
                                                                className="input-field !h-10 text-[12px] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                                                                value={acc.bank_name}
                                                                onChange={e => {
                                                                    const updated = [...(editingParty.bank_accounts || [])];
                                                                    updated[index].bank_name = e.target.value.toUpperCase();
                                                                    setEditingParty(prev => ({ ...prev, bank_accounts: updated }));
                                                                }}
                                                                disabled={isReadOnly}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Email Address</label>
                                            <input
                                                type="email"
                                                className="input-field !h-14 disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="Ex: office@acme.com"
                                                value={editingParty.email || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, email: e.target.value }))}
                                                disabled={isReadOnly}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Business Group (CRM)</label>
                                            <select
                                                className="select-field !h-14 disabled:opacity-50 disabled:cursor-not-allowed"
                                                value={editingParty.group_id || ''}
                                                onChange={e => setEditingParty(prev => ({ ...prev, group_id: e.target.value || null }))}
                                                disabled={isReadOnly}
                                            >
                                                <option value="" className="bg-slate-900 text-white">Uncategorized</option>
                                                {groups.map(g => (
                                                    <option key={g.id} value={g.id} className="bg-slate-900 text-white">{g.group_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>


                                    <div className="flex items-center gap-4 pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={editingParty.is_active ?? true}
                                                    onChange={e => setEditingParty(prev => ({ ...prev!, is_active: e.target.checked }))}
                                                    disabled={isReadOnly}
                                                />
                                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                            </div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Active</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Footer - Only show in Form View */}
                            {!isReadOnly && view === 'form' && (
                                <div className="p-10 bg-slate-900 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={saving || isDeleting}
                                        className="btn-primary w-full h-14 uppercase tracking-[0.3em] font-black shadow-glow rounded-3xl disabled:opacity-50"
                                    >
                                        {saving ? 'Processing...' : (editingParty.id ? 'Save Profile Changes' : 'Initialize Counterparty')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </form>
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title="Delete Profile"
                message={`Are you sure you want to delete "${editingParty.party_name}"? This action cannot be undone and will remove all associated data.`}
                confirmLabel={isDeleting ? "Deleting..." : "Delete Profile"}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteConfirm(false)}
                isDestructive={true}
            />
        </Modal>
    );
}
