import React, { useState, useEffect } from 'react';
import { Plus, Check, X, DollarSign, UserMinus, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
    ExitCase,
    ExitPolicy,
    StaffProfile,
} from '../../types/accounting';
import Modal from '../ui/Modal';
import { useAuth } from '../../lib/auth';
import {
    fetchExitCases,
    fetchActiveExitPolicy,
    updateExitPolicy,
    initiateExitCase,
    updateExitCaseStatus,
    fetchExitChecklistTemplates,
    createExitChecklistTemplate,
    deleteExitChecklistTemplate,
    createExitChecklistItem,
    deleteExitChecklistItem,
    fetchStaffProfiles
} from '../../lib/supabase';

import {
    ExitChecklistTemplate,
    ExitChecklistItem
} from '../../types/accounting';

// Helper to define Exit Tabs
type TabType = 'requests' | 'checklists' | 'fnf' | 'policy';

export function ExitManagement() {
    const { isSuperAdmin, access, user: authUser, staff: authStaff } = useAuth();
    const isAdmin = isSuperAdmin || access?.some(a => {
        const r = a.role;
        if (Array.isArray(r)) {
            return r[0]?.role_name === 'ADMIN';
        }
        return (r as any)?.role_name === 'ADMIN';
    });

    // State bindings
    const [activeTab, setActiveTab] = useState<TabType>('requests');
    const [cases, setCases] = useState<ExitCase[]>([]);
    const [policy, setPolicy] = useState<ExitPolicy | null>(null);
    const [staff, setStaff] = useState<StaffProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Checklist State
    const [templates, setTemplates] = useState<(ExitChecklistTemplate & { items: ExitChecklistItem[] })[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemForm, setNewItemForm] = useState<Partial<ExitChecklistItem>>({
        task_name: '',
        category: 'OTHER',
        owner_role: 'HR'
    });

    // Modal state
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

    // Initiation Form State
    const [formData, setFormData] = useState({
        staff_id: '',
        exit_type: 'RESIGNATION',
        proposed_lwd: '',
        reason_category: '',
        notes: ''
    });

    // Policy Edit State
    const [isEditingPolicy, setIsEditingPolicy] = useState(false);
    const [policyForm, setPolicyForm] = useState<Partial<ExitPolicy>>({});

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'requests') {
                const fetchedCases = await fetchExitCases();
                setCases(fetchedCases);

                // Fetch staff for dropdown
                const staffData = await fetchStaffProfiles(true);
                setStaff(staffData);
            } else if (activeTab === 'checklists') {
                const templatesData = await fetchExitChecklistTemplates();
                setTemplates(templatesData);
                if (templatesData.length > 0 && !selectedTemplateId) {
                    setSelectedTemplateId(templatesData[0].id);
                }
            } else if (activeTab === 'policy') {
                const pol = await fetchActiveExitPolicy();
                if (pol) {
                    setPolicy(pol);
                    setPolicyForm(pol);
                }
            }
        } catch (error) {
            console.error("Error loading exit records:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateTemplate = async () => {
        if (!newTemplateName.trim()) return;
        try {
            const newTpl = await createExitChecklistTemplate(newTemplateName);
            setTemplates(prev => [...prev, { ...newTpl, items: [] }]);
            setSelectedTemplateId(newTpl.id);
            setNewTemplateName('');
            setIsCreatingTemplate(false);
        } catch (error) {
            console.error("Error creating template:", error);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm("Are you sure you want to delete this template and all its items?")) return;
        try {
            await deleteExitChecklistTemplate(id);
            setTemplates(prev => prev.filter(t => t.id !== id));
            if (selectedTemplateId === id) setSelectedTemplateId(null);
        } catch (error) {
            console.error("Error deleting template:", error);
        }
    };

    const handleAddItem = async () => {
        if (!selectedTemplateId || !newItemForm.task_name) return;
        try {
            const newItem = await createExitChecklistItem({
                ...newItemForm,
                template_id: selectedTemplateId
            });
            setTemplates(prev => prev.map(t =>
                t.id === selectedTemplateId ? { ...t, items: [...t.items, newItem] } : t
            ));
            setNewItemForm({ task_name: '', category: 'OTHER', owner_role: 'HR' });
            setIsAddingItem(false);
        } catch (error) {
            console.error("Error adding item:", error);
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        try {
            await deleteExitChecklistItem(itemId);
            setTemplates(prev => prev.map(t =>
                t.id === selectedTemplateId ? { ...t, items: t.items.filter(i => i.id !== itemId) } : t
            ));
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    const handleInitiateExit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newCase = await initiateExitCase({
                staff_id: formData.staff_id,
                exit_type: formData.exit_type as any,
                proposed_lwd: formData.proposed_lwd || undefined,
                reason_category: formData.reason_category,
                notes: formData.notes,
                status: 'INITIATED',
            });

            // Send approval request to Approval Hub
            const selectedStaffMember = staff.find(s => s.id === formData.staff_id);
            const requesterId = authUser?.id ?? formData.staff_id;
            await supabase.from('approval_requests').insert({
                request_type: 'EXIT_INITIATED',
                status: 'PENDING',
                requested_by: requesterId,
                target_scope_id: newCase?.id ?? null,
                reason: formData.notes || `Exit initiated for ${selectedStaffMember?.full_name}`,
                payload: {
                    exit_case_id: newCase?.id ?? null,
                    staff_id: formData.staff_id,
                    staff_name: selectedStaffMember?.full_name ?? '',
                    staff_code: selectedStaffMember?.staff_code ?? '',
                    exit_type: formData.exit_type,
                    proposed_lwd: formData.proposed_lwd || null,
                    notes: formData.notes,
                    action: 'INITIATE',
                }
            });

            setIsRequestModalOpen(false);
            loadData();
            alert('Exit process initiated and submitted to Approval Hub for review.');
        } catch (err: any) {
            alert('Failed to initiate exit: ' + err.message);
        }
    };

    const handleApproveStatus = async (caseId: string, currentStatus: ExitCase['status']) => {
        try {
            let nextStatus: ExitCase['status'] = 'MANAGER_APPROVED';
            if (currentStatus === 'MANAGER_APPROVED') nextStatus = 'EXIT_SCHEDULED';
            else if (currentStatus === 'EXIT_SCHEDULED') nextStatus = 'CLEARANCE_IN_PROGRESS';
            else if (currentStatus === 'CLEARANCE_IN_PROGRESS') nextStatus = 'CLOSED';

            await updateExitCaseStatus(caseId, nextStatus);

            // Send approval request to Approval Hub for the status transition
            const exitCase = cases.find(c => c.id === caseId);
            const requesterId = authUser?.id ?? (authStaff?.id ?? caseId);
            await supabase.from('approval_requests').insert({
                request_type: 'EXIT_STATUS_UPDATE',
                status: 'PENDING',
                requested_by: requesterId,
                target_scope_id: caseId,
                reason: `Exit status moved to ${nextStatus.replace(/_/g, ' ')} for ${exitCase?.staff?.full_name ?? 'staff member'}`,
                payload: {
                    exit_case_id: caseId,
                    staff_id: exitCase?.staff_id ?? null,
                    staff_name: exitCase?.staff?.full_name ?? '',
                    staff_code: exitCase?.staff?.staff_code ?? '',
                    from_status: currentStatus,
                    to_status: nextStatus,
                    action: 'STATUS_UPDATE',
                }
            });

            loadData();
        } catch (error: any) {
            alert('Error updating status: ' + error.message);
        }
    };

    const handleSavePolicy = async () => {
        try {
            await updateExitPolicy(policyForm);
            setIsEditingPolicy(false);
            loadData();
            alert('Exit policy updated successfully.');
        } catch (error: any) {
            alert('Error saving policy: ' + error.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-display font-black text-white uppercase tracking-tight">Relieving & Exit</h2>
                    <p className="text-sm text-slate-400 mt-1">Manage employee resignations, clearances, and full & final settlements.</p>
                </div>
                <button
                    onClick={() => setIsRequestModalOpen(true)}
                    className="btn-primary"
                >
                    <Plus className="w-4 h-4" />
                    Initiate Exit
                </button>
            </div>

            {/* Sub-Navigation */}
            <div className="flex space-x-2 border-b border-slate-800">
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'requests' ? 'border-brand-500 text-brand-500 bg-brand-500/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                >
                    Exit Cases
                </button>
                <button
                    onClick={() => setActiveTab('checklists')}
                    className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'checklists' ? 'border-brand-500 text-brand-500 bg-brand-500/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                >
                    Clearance Checklists
                </button>
                {isAdmin && (
                    <>
                        <button
                            onClick={() => setActiveTab('fnf')}
                            className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'fnf' ? 'border-brand-500 text-brand-500 bg-brand-500/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                }`}
                        >
                            F&F Settlements
                        </button>
                        <button
                            onClick={() => setActiveTab('policy')}
                            className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'policy' ? 'border-brand-500 text-brand-500 bg-brand-500/5' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                }`}
                        >
                            Exit Policies
                        </button>
                    </>
                )}
            </div>

            {/* Main Content Area */}
            {isLoading ? (
                <div className="flex justify-center p-12">
                    <div className="w-8 h-8 rounded-full border-t-2 border-b-2 border-brand-500 animate-spin"></div>
                </div>
            ) : (
                <div className="animate-fade-in shadow-xl bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
                    {activeTab === 'requests' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-950 border-b border-slate-800">
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Case ID</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Employee</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">LWD</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cases.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-slate-500 text-sm">
                                                No exit cases found.
                                            </td>
                                        </tr>
                                    ) : (
                                        cases.map(c => {
                                            const noticePeriod = policy?.notice_period_days || 30;
                                            const initiated = new Date(c.initiated_date);
                                            const today = new Date();
                                            // Diff in days
                                            const diffTime = today.getTime() - initiated.getTime();
                                            const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
                                            const daysServed = Math.min(diffDays, noticePeriod);
                                            const isNoticeCompleted = diffDays >= noticePeriod || c.exit_type === 'TERMINATION';

                                            return (
                                                <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs font-mono text-slate-400">{c.id.split('-')[0]}</div>
                                                        <div className="text-[10px] text-slate-500">{new Date(c.initiated_date).toLocaleDateString()}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm font-bold text-white">{c.staff?.full_name}</div>
                                                        <div className="text-[10px] text-slate-500">{c.staff?.staff_code}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs font-bold text-slate-300">{c.exit_type}</div>
                                                        {c.exit_type !== 'DEATH' && c.exit_type !== 'ABSCONDING' && c.exit_type !== 'TERMINATION' && c.status !== 'CLOSED' && (
                                                            <div className="text-[10px] font-medium text-slate-500 mt-1">
                                                                Notice: {daysServed}/{noticePeriod} days
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs font-bold text-brand-500">
                                                            {c.final_lwd ? new Date(c.final_lwd).toLocaleDateString() : (c.proposed_lwd ? new Date(c.proposed_lwd).toLocaleDateString() + ' (Prop)' : 'TBD')}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${c.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                            c.status === 'INITIATED' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                                c.status === 'EXIT_SCHEDULED' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                                    'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                                            }`}>
                                                            {c.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {isAdmin && c.status !== 'CLOSED' && (
                                                            <button
                                                                onClick={() => handleApproveStatus(c.id, c.status)}
                                                                disabled={!isNoticeCompleted}
                                                                title={!isNoticeCompleted ? "Notice period not yet completed" : "Move to next state"}
                                                                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border rounded-lg transition-all ${isNoticeCompleted
                                                                    ? "text-emerald-500 hover:text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                                                                    : "text-slate-500 border-slate-700 bg-slate-800/50 cursor-not-allowed opacity-50"
                                                                    }`}
                                                            >
                                                                Move Next
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'checklists' && (
                        <div className="grid grid-cols-12 min-h-[500px]">
                            {/* Templates Sidebar */}
                            <div className="col-span-12 md:col-span-4 border-r border-slate-800 bg-slate-900/50 p-6 space-y-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Checklist Templates</h4>
                                    <button
                                        onClick={() => setIsCreatingTemplate(true)}
                                        className="p-1 hover:bg-white/10 rounded transition-colors text-brand-500"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {isCreatingTemplate && (
                                    <div className="p-3 bg-slate-800 rounded-xl border border-brand-500/20 space-y-2 animate-fade-in">
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Template Name..."
                                            value={newTemplateName}
                                            onChange={e => setNewTemplateName(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                                            onKeyDown={e => e.key === 'Enter' && handleCreateTemplate()}
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={handleCreateTemplate} className="flex-1 bg-brand-500 text-white text-[10px] font-bold py-1.5 rounded-lg hover:bg-brand-400 transition-colors">Create</button>
                                            <button onClick={() => setIsCreatingTemplate(false)} className="px-2 py-1.5 text-slate-400 hover:text-white text-[10px] font-bold">Cancel</button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    {templates.length === 0 ? (
                                        <div className="text-center py-8 text-slate-600 text-[10px] uppercase tracking-widest">No templates found</div>
                                    ) : (
                                        templates.map(t => (
                                            <div
                                                key={t.id}
                                                onClick={() => setSelectedTemplateId(t.id)}
                                                className={`group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${selectedTemplateId === t.id
                                                    ? 'bg-brand-500/10 border border-brand-500/20'
                                                    : 'hover:bg-white/5 border border-transparent'
                                                    }`}
                                            >
                                                <div>
                                                    <div className={`text-xs font-bold ${selectedTemplateId === t.id ? 'text-brand-500' : 'text-slate-300'}`}>{t.name}</div>
                                                    <div className="text-[9px] text-slate-500">{t.items.length} items</div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Items Editor */}
                            <div className="col-span-12 md:col-span-8 p-8 space-y-6">
                                {selectedTemplateId ? (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-white">
                                                    {templates.find(t => t.id === selectedTemplateId)?.name}
                                                </h3>
                                                <p className="text-xs text-slate-500 uppercase tracking-widest font-black">Manage checklist items</p>
                                            </div>
                                            <button
                                                onClick={() => setIsAddingItem(true)}
                                                className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 border border-brand-500/30 rounded-xl text-brand-500 hover:bg-brand-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add Item
                                            </button>
                                        </div>

                                        {isAddingItem && (
                                            <div className="p-6 bg-slate-900 border border-brand-500/30 rounded-2xl space-y-4 animate-slide-up">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="col-span-2">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Task / Asset Name</label>
                                                        <input
                                                            type="text"
                                                            value={newItemForm.task_name}
                                                            onChange={e => setNewItemForm({ ...newItemForm, task_name: e.target.value })}
                                                            placeholder="e.g. Return Laptop & Charger"
                                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors shadow-inner"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Category</label>
                                                        <select
                                                            value={newItemForm.category}
                                                            onChange={e => setNewItemForm({ ...newItemForm, category: e.target.value as any })}
                                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors shadow-inner appearance-none"
                                                        >
                                                            <option value="ASSETS">Assets Recovery</option>
                                                            <option value="SECURITY">Security / Logic Access</option>
                                                            <option value="MONEY">Financial / Pending Loans</option>
                                                            <option value="HANDOVER">Knowledge Handover</option>
                                                            <option value="OTHER">General / Other</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Responsible Role</label>
                                                        <select
                                                            value={newItemForm.owner_role}
                                                            onChange={e => setNewItemForm({ ...newItemForm, owner_role: e.target.value as any })}
                                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors shadow-inner appearance-none"
                                                        >
                                                            <option value="HR">HR Dept</option>
                                                            <option value="IT">IT / Systems</option>
                                                            <option value="FINANCE">Finance Dept</option>
                                                            <option value="MANAGER">Reporting Manager</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex justify-end gap-3 pt-2">
                                                    <button onClick={() => setIsAddingItem(false)} className="px-6 py-2.5 text-xs font-black text-slate-500 uppercase tracking-widest hover:text-white hover:bg-white/5 rounded-xl transition-all">Cancel</button>
                                                    <button onClick={handleAddItem} className="px-8 py-2.5 bg-brand-500 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/20">Add Task</button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="overflow-hidden border border-slate-800 rounded-2xl bg-slate-950/30">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-slate-900/50 border-b border-slate-800">
                                                        <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Task / Asset</th>
                                                        <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Category</th>
                                                        <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Owner</th>
                                                        <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800/50">
                                                    {templates.find(t => t.id === selectedTemplateId)?.items.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-600 text-xs italic">
                                                                No items in this template yet. Click "Add Item" to begin.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        templates.find(t => t.id === selectedTemplateId)?.items.map(item => (
                                                            <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                                                <td className="px-6 py-4">
                                                                    <div className="text-xs font-bold text-white">{item.task_name}</div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-tighter">
                                                                        {item.category}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="text-[10px] font-bold text-slate-400">{item.owner_role}</div>
                                                                </td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <button
                                                                        onClick={() => handleDeleteItem(item.id)}
                                                                        className="p-2 hover:bg-red-500/10 hover:text-red-500 text-slate-600 rounded-lg transition-all"
                                                                        title="Remove Item"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                                        <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center">
                                            <ShieldCheck className="w-10 h-10 text-slate-600" />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold">Select a Template</h4>
                                            <p className="text-sm text-slate-500">Pick an exit checklist template from the left to manage its items.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'fnf' && (
                        <div className="p-12 text-center space-y-4">
                            <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto">
                                <DollarSign className="w-8 h-8 text-slate-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white">Final Settlements (Coming Soon)</h3>
                            <p className="text-sm text-slate-400 max-w-sm mx-auto">
                                Calculate accumulated earnings, process leave encashments, and deduct pending advances.
                            </p>
                        </div>
                    )}

                    {activeTab === 'policy' && (
                        <div className="p-8 space-y-8">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-white">Exit Policy Settings</h3>
                                {isAdmin && !isEditingPolicy && (
                                    <button
                                        onClick={() => setIsEditingPolicy(true)}
                                        className="btn-primary"
                                    >
                                        Edit Policies
                                    </button>
                                )}
                            </div>

                            {policy ? (
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Notice Period (Days)</div>
                                        {isEditingPolicy ? (
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={policyForm.notice_period_days ?? ''}
                                                onChange={e => setPolicyForm({ ...policyForm, notice_period_days: parseInt(e.target.value) || 0 })}
                                            />
                                        ) : (
                                            <div className="p-4 bg-slate-800/30 rounded-xl text-white font-bold">{policy.notice_period_days}</div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Leave Encashment Enabled</div>
                                        {isEditingPolicy ? (
                                            <select
                                                className="select-field"
                                                value={policyForm.encash_leave_enabled ? 'true' : 'false'}
                                                onChange={e => setPolicyForm({ ...policyForm, encash_leave_enabled: e.target.value === 'true' })}
                                            >
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        ) : (
                                            <div className="p-4 bg-slate-800/30 rounded-xl text-white font-bold">{policy.encash_leave_enabled ? 'Yes' : 'No'}</div>
                                        )}
                                    </div>
                                    {isEditingPolicy && policyForm.encash_leave_enabled && (
                                        <div className="space-y-2">
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Max Encashment Days</div>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={policyForm.encash_leave_max_days ?? ''}
                                                onChange={e => setPolicyForm({ ...policyForm, encash_leave_max_days: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                    )}
                                    {(policy.encash_leave_enabled && !isEditingPolicy) && (
                                        <div className="space-y-2">
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Max Encashment Days</div>
                                            <div className="p-4 bg-slate-800/30 rounded-xl text-white font-bold">{policy.encash_leave_max_days}</div>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Absconding Treated as Unpaid</div>
                                        {isEditingPolicy ? (
                                            <select
                                                className="select-field"
                                                value={policyForm.absconding_unpaid_rule ? 'true' : 'false'}
                                                onChange={e => setPolicyForm({ ...policyForm, absconding_unpaid_rule: e.target.value === 'true' })}
                                            >
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        ) : (
                                            <div className="p-4 bg-slate-800/30 rounded-xl text-white font-bold">{policy.absconding_unpaid_rule ? 'Yes' : 'No'}</div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Allow Withdrawal</div>
                                        {isEditingPolicy ? (
                                            <select
                                                className="select-field"
                                                value={policyForm.allow_withdrawal ? 'true' : 'false'}
                                                onChange={e => setPolicyForm({ ...policyForm, allow_withdrawal: e.target.value === 'true' })}
                                            >
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        ) : (
                                            <div className="p-4 bg-slate-800/30 rounded-xl text-white font-bold">{policy.allow_withdrawal ? 'Yes' : 'No'}</div>
                                        )}
                                    </div>
                                    {isEditingPolicy && policyForm.allow_withdrawal && (
                                        <div className="space-y-2">
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Withdrawal Cutoff (Days before LWD)</div>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={policyForm.withdrawal_cutoff_days ?? ''}
                                                onChange={e => setPolicyForm({ ...policyForm, withdrawal_cutoff_days: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                    )}
                                    {(policy.allow_withdrawal && !isEditingPolicy) && (
                                        <div className="space-y-2">
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Withdrawal Cutoff (Days before LWD)</div>
                                            <div className="p-4 bg-slate-800/30 rounded-xl text-white font-bold">{policy.withdrawal_cutoff_days}</div>
                                        </div>
                                    )}

                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">No active exit policy configuration found.</p>
                            )}

                            {isEditingPolicy && (
                                <div className="flex items-center gap-4 mt-8 pt-6 border-t border-slate-800/50">
                                    <button
                                        onClick={handleSavePolicy}
                                        className="btn-primary"
                                    >
                                        <Check className="w-4 h-4 mr-2" />
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsEditingPolicy(false);
                                            if (policy) setPolicyForm(policy);
                                        }}
                                        className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Initiate Exit Modal */}
            <Modal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)}>
                <div
                    className="relative w-full max-w-xl bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden rounded-[2.5rem] animate-slide-down mx-auto mt-[10vh]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-brand-500/10 rounded-xl flex items-center justify-center border border-brand-500/20">
                                <UserMinus className="w-4.5 h-4.5 text-brand-500" />
                            </div>
                            <h2 className="text-2xl font-display font-black text-white uppercase tracking-tight">Initiate Exit</h2>
                        </div>
                        <button onClick={() => setIsRequestModalOpen(false)} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleInitiateExit} className="p-8 space-y-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Employee *</label>
                            <select
                                required
                                className="select-field"
                                value={formData.staff_id}
                                onChange={e => setFormData({ ...formData, staff_id: e.target.value })}
                            >
                                <option value="">Select Employee...</option>
                                {staff
                                    .filter(s => !cases.some(c => c.staff_id === s.id && c.status !== 'CLOSED'))
                                    .map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.staff_code})</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Exit Type *</label>
                                <select
                                    required
                                    className="select-field"
                                    value={formData.exit_type}
                                    onChange={e => setFormData({ ...formData, exit_type: e.target.value })}
                                >
                                    <option value="RESIGNATION">Resignation</option>
                                    <option value="TERMINATION">Termination</option>
                                    <option value="ABSCONDING">Absconding</option>
                                    <option value="CONTRACT_END">Contract End</option>
                                    <option value="TRANSFER">Transfer</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Proposed LWD</label>
                                <input
                                    type="date"
                                    className="input-field"
                                    value={formData.proposed_lwd}
                                    onChange={e => setFormData({ ...formData, proposed_lwd: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Reason / Notes</label>
                            <textarea
                                rows={3}
                                className="input-field py-3 resize-none"
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Any additional context about the exit..."
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                            <button
                                type="button"
                                onClick={() => setIsRequestModalOpen(false)}
                                className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn-primary"
                            >
                                <Check className="w-4 h-4" />
                                Initiate Proceeding
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
        </div>
    );
}
