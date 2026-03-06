import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, User, AlignLeft, RefreshCw, ZoomIn, Search } from 'lucide-react';
import { fetchSystemAuditLogs, fetchStaffMasters } from '../../lib/supabase';
import { SystemAuditLog, StaffMaster } from '../../types/accounting';

export default function AuditLogViewer() {
    const [logs, setLogs] = useState<SystemAuditLog[]>([]);
    const [staff, setStaff] = useState<StaffMaster[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        staffId: '',
        actionType: '',
        startDate: '',
        endDate: ''
    });
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    useEffect(() => {
        const initData = async () => {
            try {
                const s = await fetchStaffMasters();
                setStaff(s);
            } catch (err) {
                console.error("Failed to load filter lookups", err);
            }
        };
        initData();
        handleSearch();
    }, []);

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setLoading(true);
        try {
            const data = await fetchSystemAuditLogs({
                staffId: filters.staffId || undefined,
                actionType: filters.actionType || undefined,
                startDate: filters.startDate || undefined,
                endDate: filters.endDate || undefined,
                limit: 500
            });
            setLogs(data);
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
            alert('Error fetching audit logs');
        } finally {
            setLoading(false);
        }
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'INSERT': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            case 'UPDATE': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'DELETE': return 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-lg shadow-rose-500/5';
            case 'REVERSE': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
            default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
        }
    };

    return (
        <div className="space-y-12 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
                <div className="space-y-2">
                    <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none flex items-center gap-4">
                        <ShieldCheck className="w-10 h-10 text-brand-500" />
                        Audit Protocols
                    </h1>
                    <p className="text-slate-500 font-medium text-sm max-w-xl">
                        A definitive, cryptographic chain of custody recording every architectural mutation within the enterprise ledger ecosystem.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleSearch()}
                        className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="surface-card p-6 border border-slate-800/10">
                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-1.5 block">Operator</label>
                        <select
                            value={filters.staffId}
                            onChange={e => setFilters(f => ({ ...f, staffId: e.target.value }))}
                            className="select-field"
                        >
                            <option value="" className="bg-slate-900">All Actors</option>
                            {staff.map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.full_name}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-1.5 block">Mutation Type</label>
                        <select
                            value={filters.actionType}
                            onChange={e => setFilters(f => ({ ...f, actionType: e.target.value }))}
                            className="select-field"
                        >
                            <option value="" className="bg-slate-900">All Actions</option>
                            <option value="INSERT" className="bg-slate-900">INSERT</option>
                            <option value="UPDATE" className="bg-slate-900">UPDATE</option>
                            <option value="DELETE" className="bg-slate-900">DELETE</option>
                            <option value="REVERSE" className="bg-slate-900">REVERSE</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-1.5 block">Timeline Start</label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 mb-1.5 block">Timeline End</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div className="md:col-span-2 flex items-end">
                        <button type="submit" className="btn-primary w-full h-[46px] justify-center">
                            <Search className="w-5 h-5" />
                            Filter Chain
                        </button>
                    </div>
                </form>
            </div>

            <div className="table-container shadow-brand-500/5">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="spinner !w-8 !h-8 border-brand-500"></div>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Compiling Secure Audit Chain...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-24 text-center">
                        <ShieldCheck className="w-16 h-16 text-slate-800 mx-auto mb-6" />
                        <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">No mutations archived for current query.</p>
                        <p className="text-slate-600 font-bold text-xs mt-2 italic lowercase">try adjusting your temporal or nodal isolation parameters.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="px-8 py-5">Sequence Entry</th>
                                <th className="px-8 py-5">Mutation</th>
                                <th className="px-8 py-5">Nodal Entity</th>
                                <th className="px-8 py-5">Primary Actor</th>
                                <th className="px-8 py-5">System Context</th>
                                <th className="px-8 py-5 text-right">Inspection</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {logs.map((log) => {
                                const isExpanded = expandedLogId === log.id;
                                return (
                                    <React.Fragment key={log.id}>
                                        <tr className={`group hover:bg-white/[0.02] transition-colors ${isExpanded ? 'bg-white/[0.03]' : ''}`}>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <Calendar className="w-4 h-4 text-slate-600" />
                                                    <span className="text-[12px] font-mono font-black text-slate-300 uppercase tracking-tight">
                                                        {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black tracking-widest border uppercase ${getActionColor(log.action_type)}`}>
                                                    {log.action_type}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="text-[13px] font-bold text-white tracking-tight uppercase group-hover:text-brand-400 transition-colors">{log.table_name}</div>
                                                <div className="text-[9px] text-slate-600 font-black mt-1 uppercase tracking-[0.2em]" title={log.record_id || ''}>
                                                    ID: {log.record_id ? `${log.record_id.substring(0, 8)}...` : '-'}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center group-hover:border-brand-500/30 transition-all">
                                                        <User className="w-4 h-4 text-slate-400 group-hover:text-brand-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] font-black text-slate-300 uppercase tracking-tight">
                                                            {log.staff_profile ? log.staff_profile.full_name : 'System Protocol'}
                                                        </div>
                                                        {log.user_id && <div className="text-[9px] text-slate-600 font-black uppercase tracking-widest leading-none mt-1">UID: {log.user_id.substring(0, 8)}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                                                    Global Core
                                                </div>
                                                {log.client_ip && <div className="text-[9px] text-slate-600 font-black mt-1 uppercase tracking-widest">IP: {log.client_ip}</div>}
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <button
                                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                                    className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-700 transition-all active:scale-95"
                                                >
                                                    {isExpanded ? <AlignLeft className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                                                </button>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={6} className="px-8 py-10 bg-slate-950/40 border-b border-white/5">
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                                        {(log.action_type === 'UPDATE' || log.action_type === 'DELETE' || log.action_type === 'REVERSE') && (
                                                            <div className="space-y-4">
                                                                <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                                    <div className="w-2 h-2 rounded-full bg-rose-500 shadow-glow shadow-rose-500/50" />
                                                                    Archived State Pre-Mutation
                                                                </h4>
                                                                <div className="p-8 bg-slate-950/60 rounded-[2.5rem] border border-slate-800/50 shadow-inner font-mono text-[11px] text-rose-400/80 group overflow-x-auto scrollbar-hidden">
                                                                    <pre className="leading-relaxed">{JSON.stringify(log.old_data, null, 4)}</pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {(log.action_type === 'INSERT' || log.action_type === 'UPDATE' || log.action_type === 'REVERSE') && (
                                                            <div className="space-y-4">
                                                                <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow shadow-emerald-500/50" />
                                                                    Validated State Post-Mutation
                                                                </h4>
                                                                <div className="p-8 bg-slate-950/60 rounded-[2.5rem] border border-slate-800/50 shadow-inner font-mono text-[11px] text-emerald-400/80 group overflow-x-auto scrollbar-hidden">
                                                                    <pre className="leading-relaxed">{JSON.stringify(log.new_data, null, 4)}</pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {log.reason && (
                                                            <div className="lg:col-span-2 p-8 bg-brand-500/5 border border-brand-500/20 rounded-[2.5rem] shadow-glow shadow-brand-500/5 space-y-3">
                                                                <div className="text-[10px] font-black text-brand-500 uppercase tracking-[0.3em]">Operational Rationale</div>
                                                                <div className="text-[13px] font-medium text-slate-300 leading-relaxed italic lowercase">
                                                                    "{log.reason}"
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
