import React, { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Check, X, Undo2, Pencil, Loader2 } from 'lucide-react';
import { getBusinessDateOverride, setBusinessDateOverride, formatBusinessDateDisplay, onBusinessDateChange, getRealToday } from '../../lib/businessDate';
import { updateBusinessDate } from '../../lib/supabase';
import { getTodayDate } from '../../lib/validation';
import { toast } from 'react-hot-toast';
import Modal from './Modal';

interface SidebarDateIndicatorProps {
    onDateChange?: (newDate: string | null) => void;
}

const SidebarDateIndicator: React.FC<SidebarDateIndicatorProps> = ({ onDateChange }) => {
    const [override, setOverride] = useState<string | null>(getBusinessDateOverride());
    const [isEditing, setIsEditing] = useState(false);
    const [editedDate, setEditedDate] = useState(override || getTodayDate());
    const [reason, setReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // Sync with external changes (e.g. from System Settings) via subscription
    useEffect(() => {
        const unsubscribe = onBusinessDateChange((newDate) => {
            setOverride(newDate);
            if (!isEditing) setEditedDate(newDate || getTodayDate());
        });
        return () => unsubscribe();
    }, [isEditing]);

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!editedDate) {
            toast.error('Please select a date');
            return;
        }

        if (editedDate === override && override !== null) {
            setIsEditing(false);
            return;
        }

        if (!reason.trim()) {
            toast.error('Please provide a reason for the audit log');
            return;
        }

        // If the user tries to save today's date as an override, just reset it instead
        const today = getTodayDate();
        if (editedDate === today) {
            handleReset();
            return;
        }

        setIsSaving(true);
        try {
            await updateBusinessDate(editedDate, reason);
            setBusinessDateOverride(editedDate);
            setOverride(editedDate);
            setIsEditing(false);
            setReason('');
            toast.success('System date updated. Refreshing...');
            if (onDateChange) onDateChange(editedDate);
            setTimeout(() => window.location.reload(), 500);
        } catch (error: any) {
            console.error('Failed to update business date:', error);
            toast.error(error.message || 'Failed to update system date');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (!override) return;

        setIsSaving(true);
        try {
            await updateBusinessDate(null, 'Restored to current date via sidebar');
            setBusinessDateOverride(null);
            setOverride(null);
            setEditedDate(getTodayDate());
            setIsEditing(false);
            setReason('');
            toast.success('System date restored to today. Refreshing...');
            if (onDateChange) onDateChange(null);
            setTimeout(() => window.location.reload(), 500);
        } catch (error: any) {
            console.error('Failed to reset business date:', error);
            toast.error('Failed to restore system date');
        } finally {
            setIsSaving(false);
        }
    };

    const display = formatBusinessDateDisplay(override || getTodayDate());

    if (isEditing) {
        return (
            <div className="mt-4 animate-in zoom-in-95 duration-300">
                <form
                    onSubmit={handleSave}
                    className="p-4 bg-slate-900 border-2 border-brand-500/50 rounded-2xl shadow-glow shadow-brand-500/10 space-y-3"
                >
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-brand-400">Override System</span>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <div className="relative">
                            <Calendar size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="date"
                                value={editedDate}
                                onChange={(e) => setEditedDate(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-[10px] font-bold text-white outline-none focus:border-brand-500 transition-all"
                            />
                        </div>

                        <input
                            type="text"
                            placeholder="Reason for change..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[10px] font-medium text-slate-300 placeholder:text-slate-600 outline-none focus:border-brand-500 transition-all"
                            autoFocus
                        />
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl py-2 flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            {isSaving ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <>
                                    <Check size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Confirm</span>
                                </>
                            )}
                        </button>
                        {override && (
                            <button
                                type="button"
                                onClick={handleReset}
                                disabled={isSaving}
                                className="px-3 bg-slate-800 hover:bg-red-950/30 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-xl transition-all active:scale-95"
                                title="Reset to today"
                            >
                                <Undo2 size={12} />
                            </button>
                        )}
                    </div>
                </form>
            </div>
        );
    }

    // Detect if we have an active override
    const realToday = getRealToday();
    const isOverridden = override && override !== realToday;

    return (
        <div className="mt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="relative group">
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className={`w-full p-3 rounded-2xl border-2 transition-all duration-500 flex flex-col gap-1.5 relative overflow-hidden group text-left ${isOverridden
                        ? 'bg-red-950/20 border-red-500 animate-blink-red shadow-glow shadow-red-500/20 hover:bg-red-950/40'
                        : 'bg-slate-800/20 border-slate-800/50 hover:border-brand-500/30'}
                        `}
                >
                    {/* Active Override Effects */}
                    {isOverridden && (
                        <div className="absolute inset-0 border border-red-500 animate-ping opacity-20 pointer-events-none" />
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar size={12} className={isOverridden ? 'text-red-500' : 'text-slate-500 group-hover:text-brand-500'} />
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isOverridden ? 'text-red-500' : 'text-slate-500 group-hover:text-brand-500'
                                }`}>
                                System Date
                            </span>
                        </div>
                        {isOverridden ? (
                            <AlertTriangle size={10} className="text-red-500 animate-bounce" />
                        ) : (
                            <Pencil size={10} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                    </div>

                    <div className="flex flex-col">
                        <span className="text-xs font-black text-white tracking-tighter">
                            {display.day} {display.month}
                        </span>
                        <span className={`text-[10px] font-black tracking-widest uppercase ${isOverridden ? 'text-red-400' : 'text-slate-500 group-hover:text-slate-400'
                            }`}>
                            {display.year} &bull; {display.weekday.substring(0, 3)}
                        </span>
                    </div>
                </button>

                {isOverridden && (

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowResetConfirm(true);
                        }}
                        className="absolute -top-1 -right-1 p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-lg z-10 transition-transform active:scale-90 flex items-center justify-center border border-red-400/50"
                        title="Clear Override"
                    >
                        <X size={10} strokeWidth={4} />
                    </button>
                )}
            </div>

            {/* Custom Reset Confirmation Modal */}
            <Modal
                isOpen={showResetConfirm}
                onClose={() => setShowResetConfirm(false)}
            >
                <div className="surface-card p-10 max-w-sm w-full mx-auto space-y-8 animate-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-6">
                        <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500">
                            <AlertTriangle size={32} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black uppercase tracking-widest text-white">Restore Date?</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Consistency Check</p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Are you sure you want to restore the system date to today? This will clear the active override and sync across all sessions.
                    </p>

                    <div className="flex gap-4 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowResetConfirm(false)}
                            className="flex-1 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                handleReset();
                                setShowResetConfirm(false);
                            }}
                            className="flex-1 px-6 py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-glow shadow-brand-500/10 active:scale-95"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default SidebarDateIndicator;
