import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    X, Users, Search, UserCheck,
    AlertCircle, Send, Loader2, Building2
} from 'lucide-react';
import { StaffMaster } from '../types/accounting';

interface StaffPostingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedStaffIds: string[], responsibleStaffId: string | null, exceptionReason?: string) => void;
    staff: StaffMaster[];
    loading?: boolean;
    isApprovalRequired?: boolean;
    isAdmin?: boolean;
    sessionDetails?: {
        partyName: string;
        date: string;
        sessionRef: string;
    } | null;
}

export default function StaffPostingModal({
    isOpen,
    onClose,
    onConfirm,
    staff,
    loading = false,
    isApprovalRequired = false,
    isAdmin = false,
    sessionDetails = null
}: StaffPostingModalProps) {

    const [searchTerm, setSearchTerm] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // The staff member assigned as responsible for this transaction
    const [responsibleStaffId, setResponsibleStaffId] = useState<string | null>(null);
    const [exceptionReason, setExceptionReason] = useState('');

    const searchRef = useRef<HTMLDivElement>(null);

    // Search suggestions: searches ALL eligible staff passed to modal
    const searchSuggestions = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const term = searchTerm.toLowerCase();
        return staff.filter(s =>
            s.full_name.toLowerCase().includes(term) ||
            s.staff_code.toLowerCase().includes(term)
        );
    }, [searchTerm, staff]);

    const responsibleStaff = useMemo(
        () => responsibleStaffId ? staff.find(s => s.id === responsibleStaffId) : null,
        [responsibleStaffId, staff]
    );

    // Initialize select all staff when modal opens
    const initializeSelection = React.useCallback(() => {
        // Admin starts with everyone pre-selected, Non-admin starts with EMPTY list
        setSelectedIds(isAdmin ? new Set(staff.map(s => s.id)) : new Set());
        setResponsibleStaffId(null);
        setSearchTerm('');
        setExceptionReason('');
        setShowSuggestions(false);
    }, [staff, isAdmin]);

    useEffect(() => {
        if (isOpen) initializeSelection();
    }, [isOpen, initializeSelection]);

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleStaff = (staffId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(staffId)) {
                next.delete(staffId);
                // If we deselect the responsible staff, clear them
                if (responsibleStaffId === staffId) setResponsibleStaffId(null);
            } else {
                next.add(staffId);
            }
            return next;
        });
    };

    const handleSelectResponsible = (s: StaffMaster) => {
        // Enable them if not already enabled
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.add(s.id);
            return next;
        });
        setResponsibleStaffId(s.id);
        setSearchTerm('');
        setShowSuggestions(false);
    };

    const clearResponsible = (e: React.MouseEvent) => {
        e.stopPropagation();
        setResponsibleStaffId(null);
    };

    if (!isOpen) return null;

    const totalSelected = selectedIds.size;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-2xl" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-[#020617] border border-slate-800 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[85vh]">

                {/* Header */}
                <div className="px-10 py-8 border-b border-slate-800/50 bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-brand-500/10 rounded-2xl flex items-center justify-center border border-brand-500/20 shadow-glow-sm shadow-brand-500/10">
                            <Users className="text-brand-500" size={28} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-display font-black text-white uppercase tracking-tight">Post Session Audit</h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1 opacity-60">Verified Personnel Distribution Architecture</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-all active:scale-95">
                        <X size={20} />
                    </button>
                </div>

                {/* Session Summary */}
                {sessionDetails && (
                    <div className="px-10 py-5 bg-slate-900/60 border-b border-slate-800/50 flex flex-wrap items-center gap-y-3 gap-x-8">
                        <div className="flex items-center gap-3">
                            <Building2 className="text-brand-400" size={16} />
                            <div>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Selected Customer/Party</p>
                                <p className="text-[11px] font-black text-white uppercase tracking-tight">{sessionDetails.partyName || 'CASH/WALK-IN'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Send className="text-brand-400" size={16} />
                            <div>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Session Reference</p>
                                <p className="text-[11px] font-black text-white uppercase tracking-tight">{sessionDetails.sessionRef || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Search className="text-brand-400" size={16} />
                            <div>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Entry Date</p>
                                <p className="text-[11px] font-black text-white uppercase tracking-tight">{sessionDetails.date}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Responsible Staff Search */}
                <div className="px-10 py-5 bg-slate-900/40 border-b border-slate-800/30 space-y-3">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        {isAdmin ? 'Assign Transaction Responsible' : 'Search & Add Personnel on Duty'}
                        {!isAdmin && (
                            <span className="ml-2 text-slate-600 normal-case">
                                ({staff.length} eligible personnel)
                            </span>
                        )}
                    </p>

                    {/* Responsible badge */}
                    {responsibleStaff && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                            <div className="w-8 h-8 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 flex-shrink-0">
                                <UserCheck size={14} className="text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Transaction Responsible</p>
                                <p className="text-[11px] font-black text-white uppercase truncate">{responsibleStaff.full_name}</p>
                            </div>
                            <button
                                onClick={clearResponsible}
                                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {/* Search input with dropdown */}
                    <div ref={searchRef} className="relative">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-brand-400 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder={isAdmin ? "Type name to assign responsibility..." : "Type name to add to duty list..."}
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-11 pr-6 py-3 text-sm font-medium text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/50 transition-all"
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                                onFocus={() => setShowSuggestions(true)}
                            />
                        </div>

                        {/* Dropdown suggestions */}
                        {showSuggestions && searchTerm.trim() && (
                            <div className="absolute top-full mt-2 left-0 right-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-20 overflow-hidden">
                                {searchSuggestions.length === 0 ? (
                                    <div className="px-5 py-4 flex items-center gap-3 text-slate-500">
                                        <AlertCircle size={14} className="text-slate-600 flex-shrink-0" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">
                                            No eligible staff match "{searchTerm}"
                                        </p>
                                    </div>
                                ) : (
                                    <div className="py-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {searchSuggestions.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => handleSelectResponsible(s)}
                                                className="w-full px-5 py-3 flex items-center gap-4 hover:bg-slate-800 transition-colors text-left group/suggestion"
                                            >
                                                <div className="w-8 h-8 bg-brand-500/10 rounded-xl flex items-center justify-center border border-brand-500/20 flex-shrink-0 group-hover/suggestion:bg-brand-500/20 transition-colors">
                                                    <UserCheck size={14} className="text-brand-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{s.full_name}</p>
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{s.staff_code}</p>
                                                </div>
                                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest flex-shrink-0">Eligible</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto px-10 py-6 space-y-6 no-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest animate-pulse">Synchronizing Personnel Ledger...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {selectedIds.size > 0 ? (
                                <div className="space-y-3">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Selected Personnel on Duty</p>
                                    <div className="grid grid-cols-1 gap-3">
                                        {Array.from(selectedIds).map(id => {
                                            const s = staff.find(x => x.id === id);
                                            if (!s) return null;
                                            const isRes = responsibleStaffId === s.id;
                                            return (
                                                <div key={id} className={`p-4 rounded-2xl flex items-center justify-between border transition-all ${isRes ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-900 border-slate-800'}`}>
                                                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => setResponsibleStaffId(isRes ? null : s.id)}>
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isRes ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800 border-slate-700'}`}>
                                                            {isRes ? <UserCheck size={14} className="text-amber-400" /> : <div className="w-2 h-2 rounded-full bg-slate-600" />}
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-black text-white uppercase tracking-tight">{s.full_name}</p>
                                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{s.staff_code} {isRes && '· Responsible'}</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={(e) => toggleStaff(s.id, e)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-rose-400 transition-colors">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-10 text-center space-y-3 opacity-50">
                                    <Users className="mx-auto text-slate-700" size={32} />
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No personnel added to duty report</p>
                                </div>
                            )}

                            {/* Exception Reason Logic */}
                            {selectedIds.size === 0 && (
                                <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-[1.5rem] space-y-4">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle className="text-rose-500" size={16} />
                                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Mandatory Audit Exception</p>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed italic">
                                        You are proceeding without selecting any on-duty personnel. Please provide a brief reason for this exception (e.g., "Manual Entry", "Self service session").
                                    </p>
                                    <textarea
                                        className="w-full bg-slate-950/50 border border-rose-500/30 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder:text-slate-700 h-24 resize-none"
                                        placeholder="Reason for zero-staff selection..."
                                        value={exceptionReason}
                                        onChange={(e) => setExceptionReason(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-10 py-8 bg-white/[0.01] border-t border-slate-800/50 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Session Verification</p>
                        <p className="text-xs font-medium text-slate-400 mt-1 italic">
                            {totalSelected} personnel marked on duty
                            {responsibleStaff && (
                                <span className="text-amber-400 ml-2">· {responsibleStaff.full_name} responsible</span>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={() => onConfirm(Array.from(selectedIds), responsibleStaffId, exceptionReason)}
                        disabled={(selectedIds.size === 0 && !exceptionReason.trim()) || loading}
                        className="btn-primary px-10 py-4 flex items-center gap-3 shadow-glow shadow-brand-500/20 group/post disabled:opacity-50 disabled:grayscale disabled:shadow-none"
                    >
                        <span className="text-xs font-black uppercase tracking-[0.2em]">
                            {isApprovalRequired ? 'Confirm & Send for Approval' : 'Confirm & Post'}
                        </span>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="group-hover/post:translate-x-1 group-hover/post:-translate-y-1 transition-transform" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
