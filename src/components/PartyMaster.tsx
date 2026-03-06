import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search, Plus, Phone, Settings,
    Eye, Briefcase, Hash,
    PanelLeftClose, PanelLeftOpen, User, Users, Smartphone
} from 'lucide-react';
import { fetchPartiesPaginated, upsertParty, getPartyStats, fetchPartyById } from '../lib/supabase';
import type { Party } from '../types/accounting';
import toast from 'react-hot-toast';
import PartyModal from './PartyModal';
import PartyGroupManagerModal from './PartyGroupManagerModal';
import { useAuth } from '../lib/auth';
import { VirtuosoGrid } from 'react-virtuoso';

type FilterType = 'ALL' | 'CUSTOMER' | 'VENDOR' | 'BOTH' | 'OTHER';

export default function PartyMaster() {
    const [parties, setParties] = useState<Party[]>([]);
    const [stats, setStats] = useState({ all: 0, customers: 0, vendors: 0, dual: 0, groups: [] as any[] });
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState<FilterType>('ALL');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const { } = useAuth();

    // Smart Filters
    const [smartFilters] = useState({
        whatsapp: false,
        gstin: false,
        active: true
    });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
    const [editingParty, setEditingParty] = useState<Partial<Party> | null>(null);

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const searchRef = useRef<NodeJS.Timeout>(null);

    // Initial Load
    useEffect(() => {
        loadData(true);
        loadStats();
    }, []);

    // Load Stats (Categories and Groups)
    async function loadStats() {
        try {
            const data = await getPartyStats();
            setStats(data);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    // Main Data Fetcher
    async function loadData(reset = false) {
        if (reset) {
            if (parties.length === 0) setLoading(true);
            setPage(0);
        } else {
            setLoadingMore(true);
        }

        try {
            const currentPage = reset ? 0 : page;
            const result = await fetchPartiesPaginated({
                searchTerm,
                type: selectedType,
                groupId: selectedGroupId || undefined,
                smartFilters,
                page: currentPage,
                pageSize: 30 // Smaller pages for faster initial render
            });

            if (reset) {
                setParties(result.data);
            } else {
                setParties(prev => [...prev, ...result.data]);
            }

            setHasMore(result.hasMore);
            if (!reset) setPage(p => p + 1);
        } catch (error) {
            console.error('Error loading parties:', error);
            toast.error('Sync failed');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }

    // Infinite Scroll trigger
    const loadMore = useCallback(() => {
        if (!loadingMore && hasMore && !loading) {
            loadData(false);
        }
    }, [loadingMore, hasMore, loading, page, searchTerm, selectedType, selectedGroupId, smartFilters]);

    // Handle Selective Changes (Filters)
    useEffect(() => {
        loadData(true);
    }, [selectedType, selectedGroupId, smartFilters]);

    // Handle debounced search
    useEffect(() => {
        if (searchRef.current) clearTimeout(searchRef.current);
        searchRef.current = setTimeout(() => {
            loadData(true);
        }, 400);
        return () => { if (searchRef.current) clearTimeout(searchRef.current); };
    }, [searchTerm]);

    // Open profile modal
    async function handleSelectParty(party: Party) {
        const loadToast = toast.loading('Retrieving full profile...');
        try {
            const fullParty = await fetchPartyById(party.id);
            handleOpenModal(fullParty);
            toast.dismiss(loadToast);
        } catch (error) {
            console.error('Error fetching party details:', error);
            toast.error('Failed to load profile details');
            toast.dismiss(loadToast);
        }
    }

    function handleOpenModal(party: Partial<Party> | null = null) {
        setEditingParty(party);
        setIsModalOpen(true);
    }

    async function handleSave(partyData: Party) {
        try {
            await upsertParty(partyData);
            toast.success(`Profile "${partyData.party_name}" synchronized`);
            setIsModalOpen(false);
            loadData(true);
            loadStats();
        } catch (error: any) {
            throw error;
        }
    }

    return (
        <div className="relative flex h-[calc(100vh-100px)] overflow-hidden animate-fade-in">
            {/* 1) LEFT SIDEBAR: Party Groups & Filters */}
            <div className={`${isSidebarCollapsed ? 'w-16' : 'w-80'} border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0 transition-all duration-300 ease-in-out relative group/sidebar`}>
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all z-10 shadow-xl opacity-0 group-hover/sidebar:opacity-100 active:scale-95"
                >
                    {isSidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
                </button>

                <div className={`p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1 ${isSidebarCollapsed ? 'px-3' : ''}`}>
                    {/* Search */}
                    <div className="relative">
                        <Search className={`absolute ${isSidebarCollapsed ? 'left-1/2 -translate-x-1/2' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-500`} size={16} />
                        {!isSidebarCollapsed && (
                            <input
                                type="text"
                                placeholder="Find profile..."
                                className="input-field !pl-12 !h-12 !text-[11px] !rounded-2xl bg-slate-950/40"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        )}
                    </div>

                    {/* Standard Categories */}
                    <div className="space-y-3">
                        {!isSidebarCollapsed && <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Directory</label>}
                        <div className="space-y-1">
                            {[
                                { id: 'ALL', label: 'All', icon: Users, count: stats.all },
                                { id: 'CUSTOMER', label: 'Customers', icon: User, count: stats.customers },
                                { id: 'VENDOR', label: 'Vendors', icon: Briefcase, count: stats.vendors },
                                { id: 'BOTH', label: 'Dual', icon: Smartphone, count: stats.dual }
                            ].map(filter => (
                                <button
                                    key={filter.id}
                                    onClick={() => { setSelectedType(filter.id as FilterType); setSelectedGroupId(null); }}
                                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between p-3'} rounded-2xl transition-all ${selectedType === filter.id && !selectedGroupId ? 'bg-brand-500/10 border border-brand-500/20 text-brand-500' : 'text-slate-400 hover:bg-white/5 border border-transparent'}`}
                                    title={filter.label}
                                >
                                    <div className="flex items-center gap-3">
                                        <filter.icon size={16} />
                                        {!isSidebarCollapsed && <span className="text-[11px] font-bold uppercase tracking-widest">{filter.label}</span>}
                                    </div>
                                    {!isSidebarCollapsed && (
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${selectedType === filter.id && !selectedGroupId ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
                                            {filter.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* CRM Groups */}
                    <div className="space-y-3 pt-4 border-t border-white/5">
                        {!isSidebarCollapsed && (
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Groups</label>
                                <button onClick={() => setIsGroupManagerOpen(true)} className="p-1 text-slate-500 hover:text-white transition-colors">
                                    <Settings size={14} />
                                </button>
                            </div>
                        )}
                        <div className="space-y-1">
                            {stats.groups.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => { setSelectedGroupId(group.id); setSelectedType('ALL'); }}
                                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3' : 'justify-between p-3'} rounded-2xl transition-all ${selectedGroupId === group.id ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' : 'text-slate-400 hover:bg-white/5 border border-transparent'}`}
                                    title={group.group_name}
                                >
                                    {isSidebarCollapsed ? <Hash size={16} /> : <span className="text-[11px] font-bold uppercase tracking-widest truncate">{group.group_name}</span>}
                                </button>
                            ))}
                            {!isSidebarCollapsed && stats.groups.length === 0 && (
                                <div className="p-4 text-center border border-dashed border-slate-800 rounded-3xl">
                                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">No groups</p>
                                </div>
                            )}
                        </div>
                    </div>


                </div>

                <div className={`p-6 border-t border-slate-800 bg-slate-950/20 ${isSidebarCollapsed ? 'px-2' : ''}`}>
                    <button
                        onClick={() => handleOpenModal()}
                        className={`btn-primary w-full !rounded-2xl flex items-center justify-center gap-3 shadow-glow transition-all ${isSidebarCollapsed ? '!h-12 !p-0' : '!h-14'}`}
                        title="New Account"
                    >
                        <Plus size={18} />
                        {!isSidebarCollapsed && <span className="text-[11px] font-black uppercase tracking-[0.3em]">New Account</span>}
                    </button>
                </div>
            </div>

            {/* 2) MAIN PANEL: Card Grid */}
            <div className="flex-1 flex flex-col bg-slate-950">
                {/* Header Area */}
                <div className="p-8 border-b border-white/5 bg-slate-900/40 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-display font-black text-white tracking-widest uppercase">
                                {selectedGroupId ? stats.groups.find(g => g.id === selectedGroupId)?.group_name : selectedType === 'ALL' ? 'Global Directory' : `${selectedType}S`}
                            </h2>
                            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-slate-400 tracking-widest">
                                {loading ? 'Checking...' : `${parties.length} Records`}
                            </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Manage profiles, KYC details and banking parameters</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => handleOpenModal()}
                            className="h-10 px-4 bg-brand-500 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.05] transition-all active:scale-95 shadow-glow"
                        >
                            + New Profile
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col relative">
                    {loading && parties.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
                            <div className="spinner !w-8 !h-8"></div>
                            <p className="text-[10px] font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">Synchronizing Profile Directory...</p>
                        </div>
                    ) : (
                        <VirtuosoGrid
                            data={parties}
                            style={{ height: '100%' }}
                            useWindowScroll={false}
                            endReached={loadMore}
                            increaseViewportBy={300}
                            components={{
                                List: ({ children, ...props }) => (
                                    <div {...props} className="flex flex-col p-4 space-y-1">
                                        {children}
                                    </div>
                                ),
                                Footer: () => loadingMore ? (
                                    <div className="p-8 flex justify-center w-full">
                                        <div className="spinner !w-6 !h-6"></div>
                                    </div>
                                ) : parties.length > 0 && !hasMore ? (
                                    <div className="p-12 text-center opacity-30">
                                        <p className="text-[9px] font-black uppercase tracking-[0.3em]">End of Directory</p>
                                    </div>
                                ) : parties.length === 0 ? (
                                    <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                                        <Users size={48} className="text-slate-600" />
                                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No matches found</p>
                                    </div>
                                ) : null
                            }}
                            itemContent={(_index, party) => (
                                <div
                                    key={party.id}
                                    className={`group flex items-center justify-between p-4 rounded-2xl transition-all border border-transparent hover:bg-white/5 hover:border-white/5`}
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${party.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />

                                        <div className="flex-1 min-w-0">
                                            <button
                                                onClick={() => handleSelectParty(party)}
                                                className="text-[13px] font-bold text-white uppercase tracking-wide truncate hover:text-brand-400 transition-colors block text-left w-full"
                                            >
                                                {party.party_name}
                                            </button>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className={`text-[8px] font-black tracking-[0.1em] uppercase ${party.party_type === 'CUSTOMER' ? 'text-blue-400' : party.party_type === 'VENDOR' ? 'text-orange-400' : 'text-purple-400'}`}>
                                                    {party.party_type}
                                                </span>
                                                {party.phone && (
                                                    <div className="flex items-center gap-1.5 opacity-40">
                                                        <Phone size={10} />
                                                        <span className="text-[9px] font-bold tracking-tight">{party.phone}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {party.customer_id && (
                                            <div className="hidden md:flex flex-col items-end px-4 border-r border-white/5">
                                                <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">ID</span>
                                                <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tighter">{party.customer_id}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-4">

                                            <button
                                                onClick={() => handleSelectParty(party)}
                                                className="p-2 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-xl transition-all"
                                                title="View Profile"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </div>

                                    </div>
                                </div>
                            )}
                        />
                    )}
                </div>
            </div>

            <PartyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                party={editingParty}
                onSave={handleSave}
                onDelete={() => {
                    loadData(true);
                    loadStats();
                }}
            />

            <PartyGroupManagerModal
                isOpen={isGroupManagerOpen}
                onClose={() => setIsGroupManagerOpen(false)}
                onGroupsChange={() => { loadData(true); loadStats(); }}
            />
        </div>
    );
}
