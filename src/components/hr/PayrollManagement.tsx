import { useState, useEffect } from 'react';
import {
    Calculator,
    Activity,
    Lock,
    Unlock,
    ShieldAlert,
    CheckCircle2,
    Plus,
    X,
    Save
} from 'lucide-react';
import {
    StaffMaster
} from '../../types/accounting';
import {
    fetchStaffMasters,
    fetchMonthlySnapshots,
    generateMonthlySnapshotRPC,
    recomputeMonthlySnapshotsRPC,
    lockPayrollPeriodRPC,
    fetchPayrollReconciliation,
    recordPayrollAdjustmentRPC
} from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

// Helper for timezone-safe local month string (YYYY-MM)
const getLocalMonthString = (date: Date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

export default function PayrollManagement() {
    const { user, isSuperAdmin } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(getLocalMonthString());
    const [staff, setStaff] = useState<StaffMaster[]>([]);

    // Payroll State
    const [monthlySnapshots, setMonthlySnapshots] = useState<any[]>([]);
    const [reconData, setReconData] = useState<any[]>([]);
    const [isProcessingPayroll, setIsProcessingPayroll] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [isPayAdjustmentModalOpen, setIsPayAdjustmentModalOpen] = useState(false);
    const [payAdjustmentData, setPayAdjustmentData] = useState<any>({
        staff_id: '',
        adjustment_type: 'PAYABLE_DAYS',
        delta_value: 0,
        reason: ''
    });

    const [isPeriodLocked, setIsPeriodLocked] = useState(false);

    useEffect(() => {
        loadBaseData();
    }, []);

    useEffect(() => {
        fetchPayrollData();
        checkLockStatus();
    }, [selectedMonth]);

    async function loadBaseData() {
        try {
            const staffData = await fetchStaffMasters();
            setStaff(staffData);
        } catch (error) {
            console.error('Error loading staff for payroll:', error);
        }
    }

    async function checkLockStatus() {
        try {
            const [year, month] = selectedMonth.split('-').map(Number);
            const snapshots = await fetchMonthlySnapshots(year, month);
            setIsPeriodLocked(snapshots.some(s => s.is_locked));
        } catch (err) {
            console.error('Failed to check lock status:', err);
        }
    }

    async function fetchPayrollData() {
        if (!selectedMonth) return;
        try {
            const [year, month] = selectedMonth.split('-').map(Number);
            const snapshots = await fetchMonthlySnapshots(year, month);
            const reconciliation = await fetchPayrollReconciliation(year, month);

            setMonthlySnapshots(snapshots || []);
            setReconData(reconciliation || []);
        } catch (error) {
            console.error('Error fetching payroll data:', error);
        }
    }

    async function handleGenerateSnapshots() {
        if (!selectedMonth) return;
        try {
            setIsProcessingPayroll(true);
            const [year, month] = selectedMonth.split('-').map(Number);
            await recomputeMonthlySnapshotsRPC(year, month);
            await fetchPayrollData();
            alert('Monthly snapshots generated successfully');
        } catch (error: any) {
            alert(error.message || 'Error generating snapshots');
        } finally {
            setIsProcessingPayroll(false);
        }
    }

    async function handleLockPeriod() {
        if (!selectedMonth) return;
        if (!confirm('Are you sure you want to LOCK this payroll period? This will freeze daily records and only allow recorded adjustments.')) return;
        try {
            setIsProcessingPayroll(true);
            const [year, month] = selectedMonth.split('-').map(Number);
            await lockPayrollPeriodRPC({
                p_year: year,
                p_month: month,
                p_locked_by: user?.id || ''
            });
            await fetchPayrollData();
            alert('Payroll period locked successfully');
        } catch (error: any) {
            alert(error.message || 'Error locking period');
        } finally {
            setIsProcessingPayroll(false);
        }
    }

    async function handleSubmitAdjustment() {
        if (!payAdjustmentData.staff_id || !payAdjustmentData.reason) {
            alert('Please fill all required fields');
            return;
        }
        try {
            setIsSaving(true);
            const [year, month] = selectedMonth.split('-').map(Number);
            const now = new Date();
            await recordPayrollAdjustmentRPC({
                p_staff_id: payAdjustmentData.staff_id,
                p_target_year: year,
                p_target_month: month,
                p_adj_type: payAdjustmentData.adjustment_type,
                p_delta: parseFloat(payAdjustmentData.delta_value),
                p_reason: payAdjustmentData.reason,
                p_cur_year: now.getFullYear(),
                p_cur_month: now.getMonth() + 1,
                p_created_by: user?.id || ''
            });
            await fetchPayrollData();
            setIsPayAdjustmentModalOpen(false);
            setPayAdjustmentData({ staff_id: '', adjustment_type: 'PAYABLE_DAYS', delta_value: 0, reason: '' });
            alert('Adjustment recorded successfully');
        } catch (error: any) {
            alert(error.message || 'Error recording adjustment');
        } finally {
            setIsSaving(false);
        }
    }

    async function handleRegenerateSingleSnapshot(staffId: string) {
        if (!selectedMonth) return;
        try {
            setIsProcessingPayroll(true);
            const [year, month] = selectedMonth.split('-').map(Number);
            await generateMonthlySnapshotRPC(year, month, staffId);
            await fetchPayrollData();
        } catch (error: any) {
            console.error('Error re-aggregating snapshot:', error);
            alert(error.message || 'Error re-aggregating snapshot');
        } finally {
            setIsProcessingPayroll(false);
        }
    }

    const isLocked = reconData.some(r => r.status === 'LOCKED');

    return (
        <div className="p-8 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar h-full pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[1.5rem] bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 shadow-glow shadow-brand-500/5">
                        <Calculator className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none">
                            Payroll Hub
                        </h1>
                        <p className="text-slate-500 font-medium text-sm mt-1">
                            Monthly Reconciliation, Audit Trails & Governance.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-black text-white uppercase tracking-widest outline-none focus:border-brand-500 transition-all shadow-xl"
                    />
                    <button
                        onClick={handleGenerateSnapshots}
                        disabled={isProcessingPayroll || isLocked}
                        className="flex items-center gap-2 px-6 py-3.5 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all disabled:opacity-30 shadow-lg shadow-brand-500/5 group"
                    >
                        <Activity className={isProcessingPayroll ? "w-4 h-4 animate-spin" : "w-4 h-4 group-hover:scale-110 transition-transform"} />
                        {isProcessingPayroll ? 'Processing...' : 'Recompute All'}
                    </button>
                    <button
                        onClick={handleLockPeriod}
                        disabled={isProcessingPayroll || isLocked || (isPeriodLocked && !isSuperAdmin)}
                        className={`flex items-center gap-2 px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 shadow-lg ${isLocked ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white'}`}
                    >
                        {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        {isLocked ? 'Period Locked' : 'Lock Period'}
                    </button>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="surface-card p-6 border border-slate-800/50 flex flex-col gap-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Calculator size={48} className="text-white" />
                    </div>
                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Total Staff Assets</div>
                    <div className="text-4xl font-display font-black text-white">{monthlySnapshots.length}</div>
                </div>
                <div className="surface-card p-6 border border-emerald-500/20 bg-emerald-500/5 flex flex-col gap-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-emerald-500">
                        <CheckCircle2 size={48} />
                    </div>
                    <div className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">Reconciled</div>
                    <div className="text-4xl font-display font-black text-emerald-400">
                        {reconData.filter(r => r.recon_status === 'RECONCILED').length}
                    </div>
                </div>
                <div className="surface-card p-6 border border-amber-500/20 bg-amber-500/5 flex flex-col gap-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity text-amber-500">
                        <ShieldAlert size={48} />
                    </div>
                    <div className="text-[8px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2">With Drift/Issues</div>
                    <div className="text-4xl font-display font-black text-amber-400">
                        {reconData.filter(r => r.recon_status !== 'RECONCILED').length}
                    </div>
                </div>
                <div className="surface-card p-6 border border-slate-800/50 flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        {isLocked ? <Lock size={48} /> : <Unlock size={48} />}
                    </div>
                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Control Status</div>
                    <div className="flex items-center gap-3">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isLocked ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-glow shadow-rose-500/5' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-glow shadow-emerald-500/5'}`}>
                            {isLocked ? 'LOCKED' : 'OPEN'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Reconciliation Table */}
            <div className="surface-card border border-slate-800/50 overflow-hidden shadow-2xl">
                <div className="px-8 py-6 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                            <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">
                                Policy Reconciliation Ledger
                            </h3>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 italic">Comparing calculated snapshots vs live operational truths</p>
                        </div>
                    </div>
                    {!isLocked && (
                        <button
                            onClick={() => setIsPayAdjustmentModalOpen(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-glow shadow-indigo-500/5"
                        >
                            <Plus className="w-4 h-4" /> Add Adjustment
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#0f172a]/50 text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] border-b border-slate-800/50">
                            <tr>
                                <th className="px-8 py-5">Staff Member</th>
                                <th className="px-8 py-5 text-center">Snapshot (Days)</th>
                                <th className="px-8 py-5 text-center text-brand-400">Live Truth (Days)</th>
                                <th className="px-8 py-5 text-center">Calculated Drift</th>
                                <th className="px-8 py-5">Workflow Flags</th>
                                <th className="px-8 py-5">Action Status</th>
                                <th className="px-8 py-5 text-right">Re-Aggregate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                            {reconData.map((item) => {
                                const drift = (parseFloat(item.live_payable_days) - parseFloat(item.snapshot_payable_days)).toFixed(2);
                                const hasDrift = parseFloat(drift) !== 0;

                                return (
                                    <tr key={item.staff_code} className="hover:bg-slate-900/40 transition-colors group">
                                        <td className="px-8 py-5">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-[11px] font-black text-white uppercase tracking-tight">{item.full_name}</div>
                                                <div className="text-[9px] text-slate-500 font-bold">{item.staff_code}</div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className="text-[12px] font-mono font-black text-slate-400">
                                                {parseFloat(item.snapshot_payable_days).toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center bg-brand-500/5 border-x border-brand-500/5">
                                            <span className="text-[12px] font-mono font-black text-brand-400">
                                                {parseFloat(item.live_payable_days).toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`text-[12px] font-mono font-black ${hasDrift ? 'text-rose-400' : 'text-slate-600'}`}>
                                                {parseFloat(drift) > 0 ? '+' : ''}{drift}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="flex gap-2">
                                                {item.recon_status !== 'RECONCILED' && (
                                                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded text-[8px] font-black uppercase tracking-tighter">
                                                        Out of Sync
                                                    </span>
                                                )}
                                                {item.recon_status === 'RECONCILED' && !hasDrift && (
                                                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[8px] font-black uppercase tracking-tighter">
                                                        Perfect Match
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className={`px-3 py-1 bg-slate-800/50 rounded-lg text-[9px] font-black uppercase tracking-widest ${item.status === 'LOCKED' ? 'text-rose-500' : 'text-slate-400'}`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <button
                                                onClick={() => handleRegenerateSingleSnapshot(item.staff_id)}
                                                disabled={isLocked || isProcessingPayroll}
                                                className="p-2.5 bg-slate-800/50 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-slate-800"
                                                title="Re-aggregate this staff's truth"
                                            >
                                                <Activity className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pay Adjustment Modal */}
            {isPayAdjustmentModalOpen && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="surface-card w-full max-w-md border border-slate-800 shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-3">
                                <Plus className="w-5 h-5 text-indigo-500 shadow-glow shadow-indigo-500/50" /> Record Post-Lock Adjustment
                            </h3>
                            <button onClick={() => setIsPayAdjustmentModalOpen(false)} className="p-2 bg-slate-800/50 text-slate-500 hover:text-white rounded-xl transition-all"><X className="w-6 h-6" /></button>
                        </div>

                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Staff Member</label>
                                <select
                                    value={payAdjustmentData.staff_id}
                                    onChange={e => setPayAdjustmentData({ ...payAdjustmentData, staff_id: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23475569\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                                >
                                    <option value="">Select Staff Asset</option>
                                    {staff.map(s => <option key={s.id} value={s.id} className="bg-[#0f172a]">{s.full_name} ({s.staff_code})</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Adjustment Type</label>
                                    <select
                                        value={payAdjustmentData.adjustment_type}
                                        onChange={e => setPayAdjustmentData({ ...payAdjustmentData, adjustment_type: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-brand-500 transition-all appearance-none cursor-pointer"
                                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23475569\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                                    >
                                        <option value="PAYABLE_DAYS" className="bg-[#0f172a]">Payable Days</option>
                                        <option value="OVERTIME_HOURS" className="bg-[#0f172a]">Overtime Hours</option>
                                        <option value="PENALTY_AMOUNT" className="bg-[#0f172a]">Penalty Amount</option>
                                        <option value="BONUS_ADJUSTMENT" className="bg-[#0f172a]">Bonus Adjustment</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Delta Value (+/-)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={payAdjustmentData.delta_value}
                                        onChange={e => setPayAdjustmentData({ ...payAdjustmentData, delta_value: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-brand-500 transition-all placeholder:text-slate-700 hover:border-slate-700"
                                        placeholder="e.g. 0.5 or -1"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Governance Reason / Audit Note</label>
                                <textarea
                                    value={payAdjustmentData.reason}
                                    onChange={e => setPayAdjustmentData({ ...payAdjustmentData, reason: e.target.value })}
                                    placeholder="Explain this post-lock adjustment for audit trails..."
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-bold text-white h-24 outline-none focus:ring-1 focus:ring-brand-500 transition-all resize-none placeholder:text-slate-700 hover:border-slate-700"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 pt-6 border-t border-slate-800/50">
                            <button
                                onClick={handleSubmitAdjustment}
                                disabled={isSaving || !payAdjustmentData.staff_id || !payAdjustmentData.reason}
                                className="w-full btn-primary !py-4 shadow-xl shadow-brand-500/20 disabled:opacity-30 flex items-center justify-center gap-3 active:scale-95 transition-all"
                            >
                                {isSaving ? <Activity className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Record Adjustment
                            </button>
                            <p className="text-[8px] text-slate-500 font-black uppercase text-center tracking-widest mt-2">
                                This action is immutable and will be logged for audit.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
