import { useState, useEffect } from 'react';
import {
    Calendar,
    Plus,
    History,
    FileText,
    X,
    Loader2
} from 'lucide-react';
import { StaffMaster, LeaveRequest } from '../../../types/accounting';
import { fetchLeaveBalances, fetchLeaveRequests, upsertLeaveRequest } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';

interface StaffLeaveProps {
    staff: StaffMaster;
}

export default function StaffLeave({ staff }: StaffLeaveProps) {
    const [balances, setBalances] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplying, setIsApplying] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        from_date: new Date().toISOString().split('T')[0],
        to_date: new Date().toISOString().split('T')[0],
        leave_type: 'PAID' as 'PAID' | 'UNPAID',
        reason: ''
    });

    const loadLeaveData = async () => {
        setIsLoading(true);
        try {
            const year = new Date().getFullYear();
            const [balanceData, requestData] = await Promise.all([
                fetchLeaveBalances(year),
                fetchLeaveRequests({ staffId: staff.id })
            ]);

            setBalances(balanceData.filter((b: any) => b.staff_id === staff.id));
            setRequests(requestData);
        } catch (error) {
            console.error('Failed to load leave data:', error);
            toast.error('Failed to load leave data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadLeaveData();
    }, [staff.id]);

    const handleApply = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const startDate = new Date(formData.from_date);
            const endDate = new Date(formData.to_date);

            if (endDate < startDate) {
                toast.error('End date cannot be before start date');
                setIsSubmitting(false);
                return;
            }

            // Calculate days (inclusive)
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const request: Partial<LeaveRequest> = {
                staff_id: staff.id,
                from_date: formData.from_date,
                to_date: formData.to_date,
                days_count: daysCount,
                leave_type: formData.leave_type,
                reason: formData.reason,
                status: 'PENDING'
            };

            await upsertLeaveRequest(request);
            toast.success('Leave request submitted successfully');
            setIsApplying(false);
            setFormData({
                from_date: new Date().toISOString().split('T')[0],
                to_date: new Date().toISOString().split('T')[0],
                leave_type: 'PAID',
                reason: ''
            });
            await loadLeaveData();
        } catch (error) {
            console.error('Failed to submit leave request:', error);
            toast.error('Failed to submit leave request');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'APPROVED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            case 'REJECTED': return 'text-red-400 bg-red-500/10 border-red-500/20';
            case 'PENDING': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            case 'CANCELLED': return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
            default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {/* Balance Overview */}
            <div>
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-2 mb-4">Leave Balances</h3>
                <div className="grid grid-cols-2 gap-4">
                    {isLoading ? (
                        [1, 2].map(i => (
                            <div key={i} className="h-32 bg-slate-800/20 rounded-3xl border border-slate-800 animate-pulse" />
                        ))
                    ) : balances.length === 0 ? (
                        <div className="col-span-2 p-6 bg-slate-800/20 rounded-3xl border border-dashed border-slate-800 text-center">
                            <p className="text-xs font-bold text-slate-500">No leave policies assigned</p>
                        </div>
                    ) : (
                        balances.map((b) => (
                            <div key={b.id} className="contents">
                                <div className="bg-[#0f172a]/50 p-5 rounded-3xl border border-slate-800/50 relative overflow-hidden group">
                                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                                            <FileText size={14} className="text-emerald-400" />
                                        </div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">Paid Balance</p>
                                    </div>
                                    <p className="text-2xl font-black text-white">{b.paid_balance}</p>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Days Remaining</p>
                                </div>
                                <div className="bg-[#0f172a]/50 p-5 rounded-3xl border border-slate-800/50 relative overflow-hidden group">
                                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-amber-500/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="p-1.5 bg-amber-500/20 rounded-lg">
                                            <FileText size={14} className="text-amber-400" />
                                        </div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">Unpaid Taken</p>
                                    </div>
                                    <p className="text-2xl font-black text-white">{b.unpaid_balance}</p>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Days Used</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <button
                onClick={() => setIsApplying(true)}
                className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-glow shadow-brand-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
                <Plus size={18} /> Apply for Leave
            </button>

            {/* Request History */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Request History</h3>
                    <History size={14} className="text-slate-600" />
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-slate-800/20 rounded-3xl animate-pulse" />
                        ))}
                    </div>
                ) : requests.length === 0 ? (
                    <div className="py-10 text-center bg-slate-800/20 rounded-3xl border border-dashed border-slate-800">
                        <Calendar size={24} className="mx-auto text-slate-700 mb-3" />
                        <p className="text-xs font-bold text-slate-500">No recent requests</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {requests.map((req) => (
                            <div key={req.id} className="bg-[#0f172a]/50 p-4 rounded-3xl border border-slate-800/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="text-center min-w-[50px]">
                                        <p className="text-[10px] font-black text-slate-500 uppercase">
                                            {req.days_count} {req.days_count === 1 ? 'day' : 'days'}
                                        </p>
                                        <p className="text-[10px] font-black text-white uppercase mt-1">
                                            {new Date(req.from_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                    <div className="h-8 w-px bg-slate-800" />
                                    <div>
                                        <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">
                                            {req.leave_type} LEAVE
                                        </p>
                                        <p className="text-[9px] text-slate-500 font-bold truncate max-w-[120px]">
                                            {req.reason || 'No reason provided'}
                                        </p>
                                    </div>
                                </div>

                                <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${getStatusStyles(req.status)}`}>
                                    {req.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Application Modal */}
            {isApplying && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4" onClick={() => !isSubmitting && setIsApplying(false)}>
                    <div
                        className="bg-[#0f172a] w-full max-w-sm rounded-[2rem] border border-slate-800 p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl font-black text-white uppercase tracking-widest">Enroll Leave</h2>
                            <button onClick={() => setIsApplying(false)} className="p-2 text-slate-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleApply} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Leave Type</label>
                                <div className="flex gap-2 p-1 bg-slate-900/50 border border-slate-800 rounded-2xl">
                                    {(['PAID', 'UNPAID'] as const).map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, leave_type: type }))}
                                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.leave_type === type ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">From Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.from_date}
                                        onChange={e => setFormData(prev => ({ ...prev, from_date: e.target.value }))}
                                        className="w-full bg-slate-900/50 border border-slate-800 text-white rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">To Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.to_date}
                                        onChange={e => setFormData(prev => ({ ...prev, to_date: e.target.value }))}
                                        className="w-full bg-slate-900/50 border border-slate-800 text-white rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Reason / Notes</label>
                                <textarea
                                    required
                                    rows={3}
                                    value={formData.reason}
                                    onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                                    className="w-full bg-slate-900/50 border border-slate-800 text-white rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-brand-500/20 outline-none transition-all resize-none"
                                    placeholder="e.g. Family function"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-4 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-600/50 text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-glow shadow-brand-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 mt-4"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Processing...
                                    </>
                                ) : 'Submit Request'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
