import { useState, useEffect } from 'react';
import { X, Search, Trash2, ArrowRight, FileText, Calendar, Wallet } from 'lucide-react';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import { supabase } from '../lib/supabase';
import type { Voucher } from '../types/accounting';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface DraftsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (voucher: Voucher) => void;
}

export default function DraftsModal({ isOpen, onClose, onSelect }: DraftsModalProps) {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [itemToDelete, setItemToDelete] = useState<{ id: string; isSession: boolean } | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchDrafts();
        }
    }, [isOpen]);

    async function fetchDrafts() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('vouchers')
                .select(`
                    *,
                    voucher_type:voucher_types(*),
                    party:parties(id, party_name, party_type),
                    lines:voucher_lines(*, ledger:ledgers(*)),
                    session:transaction_sessions(*)
                `)
                .eq('status', 'DRAFT')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setVouchers(data || []);
        } catch (error) {
            console.error('Error fetching drafts:', error);
            toast.error('Failed to load drafts');
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteClick(id: string, isSession: boolean, e: React.MouseEvent) {
        e.stopPropagation();
        setItemToDelete({ id, isSession });
        setIsDeleteDialogOpen(true);
    }

    async function confirmDelete() {
        if (!itemToDelete) return;

        try {
            if (itemToDelete.isSession) {
                // Delete all vouchers in the session
                const { error: vError } = await supabase
                    .from('vouchers')
                    .delete()
                    .eq('session_id', itemToDelete.id);
                if (vError) throw vError;

                // Delete the session header
                const { error: sError } = await supabase
                    .from('transaction_sessions')
                    .delete()
                    .eq('id', itemToDelete.id);
                if (sError) throw sError;

                setVouchers(prev => prev.filter(v => v.session_id !== itemToDelete.id));
            } else {
                const { error } = await supabase
                    .from('vouchers')
                    .delete()
                    .eq('id', itemToDelete.id);
                if (error) throw error;
                setVouchers(prev => prev.filter(v => v.id !== itemToDelete.id));
            }
            toast.success('Draft discarded');
        } catch (error) {
            console.error('Error deleting draft:', error);
            toast.error('Failed to delete draft');
        } finally {
            setIsDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    }

    // Group vouchers by session
    const groupedDrafts = vouchers.reduce((acc, v) => {
        const key = v.session_id || `standalone-${v.id}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(v);
        return acc;
    }, {} as Record<string, Voucher[]>);

    const sortedGroups = Object.values(groupedDrafts).sort((a, b) => {
        const dateA = new Date(a[0].updated_at).getTime();
        const dateB = new Date(b[0].updated_at).getTime();
        return dateB - dateA;
    });

    const filteredGroups = sortedGroups.filter(group => {
        const search = searchTerm.toLowerCase();
        return group.some(v =>
            v.narration?.toLowerCase().includes(search) ||
            v.voucher_type?.type_name.toLowerCase().includes(search) ||
            v.party?.party_name.toLowerCase().includes(search) ||
            (v.reference_no && v.reference_no.toLowerCase().includes(search)) ||
            (v.session?.session_ref && v.session.session_ref.toLowerCase().includes(search))
        );
    });

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose}>
                <div className="w-full max-w-2xl h-[70vh] bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10 animate-scale-in">

                    {/* Header */}
                    <div className="px-6 py-5 border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-800/50 rounded-xl text-slate-400">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-white uppercase tracking-wider">Saved Drafts</h2>
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">{sortedGroups.length} Pending Sessions</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="p-4 border-b border-slate-800/30 bg-slate-950/30">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                                type="text"
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500/50 transition-all uppercase tracking-wide"
                                placeholder="SEARCH BY NARRATION, TYPE OR CUSTOMER..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/20">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-3">
                                <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Loading Drafts...</span>
                            </div>
                        ) : filteredGroups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-60 text-center space-y-4 opacity-50">
                                <FileText size={48} className="text-slate-700" />
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">No Drafts Found</p>
                            </div>
                        ) : (
                            filteredGroups.map(group => {
                                const primary = group[0];
                                const isSession = !!primary.session_id;
                                const sessionRef = primary.session?.session_ref;
                                const totalAmount = group.reduce((sum, v) => sum + v.total_debit, 0);

                                return (
                                    <div
                                        key={isSession ? primary.session_id : primary.id}
                                        onClick={() => onSelect(primary)}
                                        className="group bg-slate-800/20 border border-slate-800/50 hover:bg-slate-800/60 hover:border-brand-500/30 rounded-2xl p-4 cursor-pointer transition-all relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                                        <div className="flex items-start justify-between relative z-10">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    {isSession ? (
                                                        <span className="px-2 py-1 rounded bg-brand-500/10 text-[9px] font-black text-brand-400 uppercase tracking-wider border border-brand-500/20">
                                                            SESSION • {group.length} ENTRIES
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded bg-slate-800 text-[9px] font-black text-slate-400 uppercase tracking-wider border border-slate-700">
                                                            {primary.voucher_type?.type_name || 'STANDALONE'}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wide">
                                                        <Calendar size={10} />
                                                        {format(new Date(primary.voucher_date), 'dd MMM yyyy')}
                                                    </span>
                                                </div>

                                                {primary.party && (
                                                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                                        <Wallet size={10} />
                                                        {primary.party.party_name}
                                                        {sessionRef && <span className="text-slate-500 ml-1">({sessionRef})</span>}
                                                    </div>
                                                )}

                                                <h3 className="text-xs font-black text-white uppercase tracking-tight truncate pr-4">
                                                    {isSession
                                                        ? group.map(v => v.voucher_type?.type_name).filter(Boolean).join(', ')
                                                        : (primary.narration || 'NO NARRATION')}
                                                </h3>

                                                <div className="flex items-center gap-4 mt-3">
                                                    <div className="flex items-center gap-1.5 text-slate-500">
                                                        <Wallet size={12} />
                                                        <span className="text-[10px] font-black font-mono">
                                                            ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    {isSession && (
                                                        <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                                                            {group.reduce((acc, v) => acc + (v.lines?.length || 0), 0)} Total Lines
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col items-end justify-between self-stretch pl-4">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteClick(isSession ? primary.session_id! : primary.id, isSession, e)}
                                                    className="p-2 hover:bg-rose-500/10 hover:text-rose-400 text-slate-600 rounded-lg transition-colors"
                                                    title="Delete Draft"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-brand-500 group-hover:text-white transition-all transform group-hover:scale-110 shadow-lg mt-auto">
                                                    <ArrowRight size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={isDeleteDialogOpen}
                title="Discard Draft"
                message="Are you sure you want to discard this draft? This action cannot be undone."
                confirmLabel="Discard"
                cancelLabel="Keep Draft"
                onConfirm={confirmDelete}
                onCancel={() => {
                    setIsDeleteDialogOpen(false);
                    setItemToDelete(null);
                }}
                isDestructive
            />
        </>
    );
}
