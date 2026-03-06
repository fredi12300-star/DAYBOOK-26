import React, { useState, useEffect } from 'react';
import {
    CheckCircle2, XCircle, Clock,
    ChevronRight, User, Calendar,
    Building2, ShieldCheck, UserMinus
} from 'lucide-react';
import {
    fetchApprovalRequests, updateApprovalRequestStatus,
    approveLeaveRequest, updateExitCaseStatus, supabase // Added for domain sync
} from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { ApprovalRequest } from '../../types/accounting';
import Modal from '../ui/Modal';
import { formatDateDMY } from '../../lib/validation';
import { MessageSquare, Calculator, UserCheck } from 'lucide-react'; // Added icons for beautification

const ApprovalRequestsHub: React.FC = () => {
    const { user, staff } = useAuth();
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
    const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
    const [decisionComments, setDecisionComments] = useState('');

    useEffect(() => {
        loadRequests();
    }, [filterStatus]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const data = await fetchApprovalRequests({
                status: filterStatus === 'ALL' ? undefined : filterStatus
            });
            setRequests(data);
        } catch (error) {
            console.error('Error loading approval requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDecision = async (status: 'APPROVED' | 'REJECTED') => {
        if (!selectedRequest || !user) return;

        // Use linked staff ID if available, otherwise fallback to auth user ID (SuperAdmin scenario)
        const approverId = staff?.id || user.id;

        try {
            await updateApprovalRequestStatus(
                selectedRequest.id,
                status,
                approverId,
                decisionComments
            );

            // Domain Sync: If it's a LEAVE_REQUEST, update the leave_requests table too
            if (selectedRequest.request_type === 'LEAVE_REQUEST' && selectedRequest.target_scope_id) {
                if (status === 'APPROVED') {
                    await approveLeaveRequest(selectedRequest.target_scope_id, approverId);
                } else if (status === 'REJECTED') {
                    await supabase.from('leave_requests').update({
                        status: 'REJECTED',
                        approved_by: approverId,
                        updated_at: new Date().toISOString()
                    }).eq('id', selectedRequest.target_scope_id);
                }
            }

            // Domain Sync: Exit Management
            if ((selectedRequest.request_type === 'EXIT_INITIATED' || selectedRequest.request_type === 'EXIT_STATUS_UPDATE') && selectedRequest.target_scope_id) {
                if (status === 'APPROVED') {
                    // Advance status
                    const nextStatus = selectedRequest.request_type === 'EXIT_INITIATED'
                        ? 'MANAGER_APPROVED'
                        : selectedRequest.payload.to_status;

                    await updateExitCaseStatus(selectedRequest.target_scope_id, nextStatus);
                } else if (status === 'REJECTED') {
                    // Mark as withdrawn or handle rejection (simplified for now as is_withdrawn)
                    await supabase.from('exit_cases').update({
                        is_withdrawn: true,
                        notes: (selectedRequest.payload.notes || '') + `\nRejected by ${approverId} in Hub: ${decisionComments || 'No reason provided'}`,
                        updated_at: new Date().toISOString()
                    }).eq('id', selectedRequest.target_scope_id);
                }
            }

            setSelectedRequest(null);
            setDecisionComments('');
            loadRequests();
        } catch (error: any) {
            console.error('Approval execution error:', error);
            alert(`Execution Failure: ${error.message || 'Error updating request status'}`);
        }
    };

    const statusColors: Record<string, string> = {
        PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        APPROVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        REJECTED: 'bg-rose-500/10 text-rose-500 border-rose-500/20'
    };

    const statusIcons: Record<string, React.ReactNode> = {
        PENDING: <Clock className="w-5 h-5" />,
        APPROVED: <CheckCircle2 className="w-5 h-5" />,
        REJECTED: <XCircle className="w-5 h-5" />
    };

    return (
        <div className="space-y-12 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
                <div className="space-y-2">
                    <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none flex items-center gap-4">
                        <ShieldCheck className="w-10 h-10 text-brand-500" />
                        Approval Hub
                    </h1>
                    <p className="text-slate-500 font-medium text-sm max-w-xl">
                        Monitor and orchestrate high-privilege operations requiring senior officer authorization across the enterprise network.
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-slate-950/50 p-1.5 rounded-2xl border border-slate-800/50 backdrop-blur-sm self-start md:self-auto">
                    {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === status
                                ? 'bg-brand-600 text-white shadow-glow shadow-brand-600/20'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <div className="spinner !w-8 !h-8 border-brand-500"></div>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Scanning Dispatch Queue...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {requests.map(req => (
                        <div
                            key={req.id}
                            onClick={() => setSelectedRequest(req)}
                            className="surface-card flex flex-col md:flex-row md:items-center gap-6 p-6 border border-slate-800/10 hover:shadow-glow shadow-brand-500/5 transition-all group cursor-pointer"
                        >
                            <div className={`shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center border transition-all ${req.status === 'PENDING' ? 'bg-amber-500/5 text-amber-500 border-amber-500/20 group-hover:border-amber-500/40' :
                                req.status === 'APPROVED' ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20 group-hover:border-emerald-500/40' : 'bg-rose-500/5 text-rose-500 border-rose-500/20 group-hover:border-rose-500/40'
                                }`}>
                                {req.request_type.includes('EXIT') ? <UserMinus className="w-6 h-6" /> : req.request_type === 'LEAVE_REQUEST' ? <Calendar className="w-6 h-6" /> : statusIcons[req.status as keyof typeof statusIcons]}
                            </div>

                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{req.request_type.split('_').join(' ')}</span>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{formatDateDMY(req.created_at)}</span>
                                </div>
                                <h3 className="text-xl font-display font-black text-white uppercase tracking-tight truncate">
                                    {(req.request_type === 'EXIT_INITIATED' || req.request_type === 'EXIT_STATUS_UPDATE')
                                        ? `${req.payload.staff_name || 'Employee'} - ${req.request_type === 'EXIT_INITIATED' ? 'Relieve & Exit' : 'Status Update'}`
                                        : req.payload.staff_name ? `${req.payload.staff_name} - Leave Request`
                                            : req.reason || `Operational Protocol: ${req.request_type}`}
                                </h3>
                                <div className="flex items-center gap-6 text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                                    <div className="flex items-center gap-2">
                                        <User className="w-3.5 h-3.5 text-slate-700" />
                                        <span className="text-slate-400">Officer:</span>
                                        <span className="text-slate-300 font-bold">{req.requested_by_name || req.requested_by}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Building2 className="w-3.5 h-3.5 text-slate-700" />
                                        <span className="text-slate-400">Node:</span>
                                        <span className="text-slate-300 font-bold">Global Core</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8 shrink-0">
                                <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border shadow-lg ${statusColors[req.status] || ''}`}>
                                    {req.status}
                                </div>
                                <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-600 group-hover:text-brand-500 group-hover:border-brand-500/30 transition-all">
                                    <ChevronRight className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                    ))}

                    {requests.length === 0 && (
                        <div className="py-24 text-center surface-card border-dashed border-slate-800/50">
                            <div className="w-20 h-20 bg-slate-950/50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-800 border border-slate-800/30">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">Queue Terminal Cleared</h3>
                            <p className="text-slate-600 font-bold text-xs mt-2 italic lowercase text-center">all operational signals have been processed.</p>
                        </div>
                    )}
                </div>
            )}

            <Modal
                isOpen={!!selectedRequest}
                onClose={() => { setSelectedRequest(null); setDecisionComments(''); }}
            >
                <div className="mb-10 px-1">
                    <h2 className="text-3xl font-display font-black text-white uppercase tracking-tight flex items-center gap-4">
                        <ShieldCheck className="w-8 h-8 text-brand-500" />
                        Operational Review
                    </h2>
                    <p className="text-slate-500 font-medium text-xs mt-2 uppercase tracking-widest">Protocol Authorization & Dispatch Validation</p>
                </div>
                {selectedRequest && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-slate-950/40 rounded-[2.5rem] border border-slate-800/50">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Dispatch Type</span>
                                <h2 className="text-2xl font-display font-black text-white leading-tight uppercase tracking-tight">{selectedRequest.request_type.split('_').join(' ')}</h2>
                            </div>
                            <div className={`px-5 py-2 rounded-2xl border flex items-center gap-3 text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${statusColors[selectedRequest.status] || ''}`}>
                                {statusIcons[selectedRequest.status]}
                                {selectedRequest.status}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 px-1">
                            <div className="space-y-2">
                                <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] ml-1">Initiating Officer</span>
                                <div className="flex items-center gap-3 font-bold text-white uppercase tracking-tight text-sm">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                                        <User className="w-5 h-5" />
                                    </div>
                                    {selectedRequest.requested_by_name || 'System Process'}
                                </div>
                            </div>
                            <div className="space-y-2 text-right">
                                <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] mr-1">Signal Timestamp</span>
                                <div className="font-bold text-white uppercase tracking-tight text-sm flex items-center gap-3 justify-end">
                                    {formatDateDMY(selectedRequest.created_at)}
                                    <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Operational Payload</h4>
                            {selectedRequest.request_type === 'LEAVE_REQUEST' ? (
                                <div className="p-8 bg-slate-950/60 rounded-[2.5rem] border border-slate-800/50 shadow-inner space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
                                                    <UserCheck className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Applicant</div>
                                                    <div className="text-sm font-black text-white uppercase">{selectedRequest.payload.staff_name} ({selectedRequest.payload.staff_code})</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Period</div>
                                                    <div className="text-sm font-black text-white uppercase">{selectedRequest.payload.from_date} — {selectedRequest.payload.to_date}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                                                    <Calculator className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Duration</div>
                                                    <div className="text-sm font-black text-white uppercase">{selectedRequest.payload.days_count} Days ({selectedRequest.payload.start_day_type === 'HALF' ? 'Half-Start' : 'Full'}/{selectedRequest.payload.end_day_type === 'HALF' ? 'Half-End' : 'Full'})</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                                                    <MessageSquare className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Reason / Justification</div>
                                                    <div className="text-sm font-bold text-slate-300 italic">"{selectedRequest.payload.reason || 'No reason provided'}"</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-800/50">
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
                                            <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                                            Reference Protocol: {selectedRequest.target_scope_id}
                                        </div>
                                    </div>
                                </div>
                            ) : (selectedRequest.request_type === 'EXIT_INITIATED' || selectedRequest.request_type === 'EXIT_STATUS_UPDATE') ? (
                                <div className="p-8 bg-slate-950/60 rounded-[2.5rem] border border-slate-800/50 shadow-inner space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Staff Info */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
                                                    <UserCheck className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Employee</div>
                                                    <div className="text-sm font-black text-white uppercase">
                                                        {selectedRequest.payload.staff_name || 'Unknown'}{selectedRequest.payload.staff_code ? ` (${selectedRequest.payload.staff_code})` : ''}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Exit Type (only for EXIT_INITIATED) */}
                                            {selectedRequest.request_type === 'EXIT_INITIATED' && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                                                        <User className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Exit Type</div>
                                                        <div className="text-sm font-black text-white uppercase">
                                                            {(selectedRequest.payload.exit_type || '—').replace(/_/g, ' ')}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Status Transition (only for EXIT_STATUS_UPDATE) */}
                                            {selectedRequest.request_type === 'EXIT_STATUS_UPDATE' && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                                        <ChevronRight className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Status Transition</div>
                                                        <div className="text-sm font-black text-white uppercase flex items-center gap-2">
                                                            <span className="text-slate-400">{(selectedRequest.payload.from_status || '—').replace(/_/g, ' ')}</span>
                                                            <ChevronRight className="w-4 h-4 text-brand-500 shrink-0" />
                                                            <span className="text-emerald-400">{(selectedRequest.payload.to_status || '—').replace(/_/g, ' ')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            {/* Proposed LWD (only for EXIT_INITIATED) */}
                                            {selectedRequest.request_type === 'EXIT_INITIATED' && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                                        <Calendar className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Proposed Last Working Day</div>
                                                        <div className="text-sm font-black text-emerald-400 uppercase">
                                                            {selectedRequest.payload.proposed_lwd ? new Date(selectedRequest.payload.proposed_lwd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'TBD'}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Notes / Reason */}
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                                                    <MessageSquare className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Notes / Reason</div>
                                                    <div className="text-sm font-bold text-slate-300 italic">
                                                        "{selectedRequest.payload.notes || selectedRequest.reason || 'No notes provided'}"
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-800/50">
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
                                            <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                                            Reference Protocol: {selectedRequest.target_scope_id}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 bg-slate-950/60 rounded-[2.5rem] border border-slate-800/50 shadow-inner font-mono text-[11px] text-brand-400 group overflow-x-auto scrollbar-hidden">
                                    <pre className="leading-relaxed">{JSON.stringify(selectedRequest.payload, null, 4)}</pre>
                                </div>
                            )}
                        </div>

                        {selectedRequest.status === 'PENDING' ? (
                            <div className="space-y-8 pt-8 border-t border-white/5">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Decision Directive</label>
                                    <textarea
                                        className="input-field min-h-[120px]"
                                        placeholder="Formulate administrative rationale for this decision..."
                                        value={decisionComments}
                                        onChange={(e) => setDecisionComments(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleDecision('REJECTED')}
                                        className="btn-ghost !text-rose-500 border-rose-500/20 hover:bg-rose-500/10 flex-1 py-4"
                                    >
                                        Reject Protocol
                                    </button>
                                    <button
                                        onClick={() => handleDecision('APPROVED')}
                                        className="btn-primary flex-1 py-4"
                                    >
                                        Authorize Dispatch
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 bg-slate-950/40 border border-slate-800/50 rounded-[2.5rem] space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Validated Directive Outcome</h4>
                                <p className="text-[13px] font-medium text-slate-300 leading-relaxed italic">
                                    "{(selectedRequest as any).decision_reason || 'No specific rationale archived for this sequence.'}"
                                </p>
                                <div className="pt-4 border-t border-white/5 text-[9px] font-black text-slate-600 uppercase tracking-tight flex flex-wrap gap-x-4 gap-y-2">
                                    <span>Officer: {selectedRequest.approved_by_name || 'Automated Protocol'}</span>
                                    <span className="text-slate-800">•</span>
                                    <span>Archived: {selectedRequest.closed_at ? formatDateDMY(selectedRequest.closed_at) : 'N/A'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ApprovalRequestsHub;
