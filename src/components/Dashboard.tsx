import { useState, useEffect } from 'react';
import {
    BookOpen, TrendingUp, DollarSign, FileText,
    Calendar, Landmark, TrendingDown,
    Plus, User, BarChart3, Database
} from 'lucide-react';
import { fetchVouchers, fetchTrialBalance } from '../lib/supabase';
import { formatNumber, getTodayDate } from '../lib/validation';
import { getBusinessDate } from '../lib/businessDate';
import type { Voucher, TrialBalanceRow } from '../types/accounting';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalVouchers: 0,
        postedToday: 0,
        draftVouchers: 0,
        totalDebit: 0,
        sales: 0,
        expenses: 0,
        netProfit: 0
    });
    const [recentVouchers, setRecentVouchers] = useState<Voucher[]>([]);
    const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        loadDashboardData();
    }, []);

    async function loadDashboardData() {
        setLoading(true);
        try {
            const today = getTodayDate();
            const [allVouchers, trial] = await Promise.all([
                fetchVouchers({}),
                fetchTrialBalance(today, today, false)
            ]);

            const draftCount = allVouchers.filter(v => v.status === 'DRAFT').length;

            const cashBank = trial.filter(r => r.node_type === 'LEDGER' && (r.node_name.toUpperCase().includes('CASH') || r.node_name.toUpperCase().includes('BANK')))
                .reduce((sum, r) => sum + (r.closing_dr - r.closing_cr), 0);

            const sales = trial.filter(r => r.node_type === 'LEDGER' && r.nature === 'INCOME')
                .reduce((sum, r) => sum + (r.closing_cr - r.closing_dr), 0);

            const expenses = trial.filter(r => r.node_type === 'LEDGER' && r.nature === 'EXPENSE')
                .reduce((sum, r) => sum + (r.closing_dr - r.closing_cr), 0);

            setStats({
                totalVouchers: allVouchers.length,
                postedToday: allVouchers.filter(v => v.voucher_date === today && v.status === 'POSTED').length,
                draftVouchers: draftCount,
                totalDebit: cashBank,
                sales,
                expenses,
                netProfit: sales - expenses
            });

            setRecentVouchers(allVouchers.slice(0, 8));
            setTrialBalance(trial.slice(0, 8));
            setError(null);
        } catch (error: any) {
            console.error('Error loading dashboard:', error);
            const message = error.message === 'Failed to fetch'
                ? 'Network connection error. Please check your internet connection.'
                : error.message || 'Failed to load dashboard data';
            setError(message);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="spinner !w-8 !h-8 border-brand-500"></div>
                <p className="text-[10px] font-black text-slate-500 animate-pulse uppercase tracking-[0.3em]">
                    Synchronizing Enterprise Ledger...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center border border-rose-500/20 animate-in zoom-in duration-300">
                    <TrendingDown size={32} className="text-rose-500" />
                </div>
                <div className="text-center space-y-2">
                    <h3 className="text-lg font-black text-rose-500 uppercase tracking-widest">Connection Failed</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide max-w-md mx-auto">{error}</p>
                </div>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-black text-white uppercase tracking-widest transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                    Retry Connection
                </button>
                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800 max-w-sm w-full mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-slate-500 border-b border-slate-800 pb-1 uppercase tracking-widest">Diagnostics</p>
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    </div>
                    <div className="space-y-1 font-mono text-[9px] text-slate-400">
                        <p className="flex justify-between"><span>Endpoint:</span> <span className="text-rose-400">Unreachable</span></p>
                        <p className="border-t border-slate-800/50 pt-1 mt-1 break-all opacity-50">{import.meta.env.VITE_SUPABASE_URL}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
                <div className="space-y-2">
                    <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none">
                        Executive Overview
                    </h1>
                    <p className="text-slate-500 font-medium text-sm max-w-xl">
                        Real-time liquidity monitoring and operating performance across all mapped cost centers.
                    </p>
                </div>
                <div className="flex items-center gap-3 px-5 py-2.5 bg-[#0f172a] border border-slate-800 rounded-2xl shadow-sm">
                    <Calendar size={14} className="text-brand-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        Period: {new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(getBusinessDate() ? new Date(getBusinessDate()!) : new Date())}
                    </span>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Available Liquidity', value: stats.totalDebit, icon: Landmark, color: 'text-brand-400', bg: 'bg-brand-500/10', border: 'border-brand-500/10' },
                    { label: 'Net Sales Revenue', value: stats.sales, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/10' },
                    { label: 'Operating Expenses', value: stats.expenses, icon: TrendingDown, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/10' },
                    { label: 'Net Retained Profit', value: stats.netProfit, icon: DollarSign, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/10' },
                ].map((stat, i) => (
                    <div key={i} className={`surface-card p-10 border ${stat.border} group hover:shadow-glow shadow-brand-500/5 transition-all duration-500`}>
                        <div className="flex items-center justify-between mb-8">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] font-display opacity-80">
                                {stat.label}
                            </span>
                            <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} transition-transform group-hover:scale-110`}>
                                <stat.icon size={20} strokeWidth={2.5} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="text-3xl font-display font-black text-white tracking-tighter">
                                {formatNumber(stat.value)}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${stat.value >= 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Aggregate INR</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tactical Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                {/* Left: Alerts & Quick Access */}
                <div className="lg:col-span-4 space-y-10">
                    {/* Alerts */}
                    <div className="space-y-5">
                        <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] px-2 font-display">Status Alerts</h2>
                        <div className="space-y-3">
                            {stats.draftVouchers > 0 && (
                                <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-[2rem] flex items-center gap-6">
                                    <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-lg">
                                        <FileText size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">Attention Required</p>
                                        <p className="text-[11px] font-bold text-slate-400 leading-relaxed">{stats.draftVouchers} vouchers pending final post action.</p>
                                    </div>
                                </div>
                            )}
                            {trialBalance.length === 0 && (
                                <div className="p-6 bg-brand-500/5 border border-brand-500/10 rounded-[2rem] flex items-center gap-6">
                                    <div className="w-12 h-12 bg-brand-500/10 rounded-2xl flex items-center justify-center text-brand-500 border border-brand-500/20 shadow-lg">
                                        <TrendingUp size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-brand-500 uppercase tracking-[0.2em] mb-1">Onboarding Active</p>
                                        <p className="text-[11px] font-bold text-slate-400 leading-relaxed">No active balances detected. Record your first voucher or generate sample data in settings to populate this overview.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Access */}
                    <div className="surface-card p-8 rounded-[2.5rem]">
                        <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-8 text-center font-display">Primary Pathways</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { name: 'Debit/Credit', icon: Plus },
                                { name: 'Accounts', icon: BookOpen },
                                { name: 'Directory', icon: User },
                                { name: 'Analytics', icon: BarChart3 },
                                { name: 'Data Import', icon: Database }
                            ].map((s, i) => (
                                <button type="button" key={i} className="group p-6 bg-slate-900 border border-slate-800/50 rounded-3xl flex flex-col items-center gap-4 transition-all hover:bg-slate-800 hover:border-brand-500/30 hover:shadow-glow shadow-brand-500/5 active:scale-95">
                                    <s.icon size={20} className="text-slate-600 group-hover:text-brand-500 transition-colors" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-200 transition-colors">{s.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Activity Table */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] font-display">Recent Activity Log</h2>
                        <button type="button" className="text-[10px] font-black text-brand-500 uppercase tracking-widest hover:text-brand-400 transition-all">
                            Full Journal Exploration &rarr;
                        </button>
                    </div>

                    <div className="table-container bg-[#0f172a]/20 p-2 rounded-[2.5rem] border border-slate-800/10">
                        {recentVouchers.length === 0 ? (
                            <div className="text-center py-32 bg-slate-950/20 rounded-[2.2rem] border border-dashed border-slate-800/50">
                                <BookOpen size={40} className="text-slate-800 mx-auto mb-6 opacity-20" />
                                <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">No transactional activity detected.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-950/40 rounded-t-3xl overflow-hidden">
                                            <th className="table-head-cell font-black uppercase tracking-widest !py-5 px-8 rounded-tl-[2rem]">Journal Ref</th>
                                            <th className="table-head-cell font-black uppercase tracking-widest !py-5">Description</th>
                                            <th className="table-head-cell font-black uppercase tracking-widest !py-5 text-right">Magnitude</th>
                                            <th className="table-head-cell font-black uppercase tracking-widest !py-5 text-center px-8 rounded-tr-[2rem]">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/10">
                                        {recentVouchers.map(voucher => (
                                            <tr key={voucher.id} className="group hover:bg-[#0f172a]/40 transition-all border-b border-slate-800/5 last:border-0 hover:shadow-lg">
                                                <td className="px-8 py-5 font-mono text-[11px] font-black text-brand-500">
                                                    {voucher.voucher_no}
                                                </td>
                                                <td className="px-5 py-5">
                                                    <p className="text-slate-200 text-[13px] font-bold truncate max-w-[320px] mb-1">
                                                        {voucher.narration}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1 h-1 bg-slate-700 rounded-full" />
                                                        <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest">
                                                            {voucher.voucher_type?.type_name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-5 text-right font-mono font-black text-white text-[13px]">
                                                    {formatNumber(voucher.total_debit)}
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black tracking-[0.2em] uppercase border ${voucher.status === 'POSTED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/5' :
                                                        voucher.status === 'DRAFT' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-sm shadow-amber-500/5' :
                                                            'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-sm shadow-rose-500/5'
                                                        }`}>
                                                        {voucher.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
