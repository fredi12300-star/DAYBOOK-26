import React, { useState, useEffect } from 'react';
import { Building2, Plus, Pencil, Trash2, Loader2, CheckCircle, XCircle, X, Save } from 'lucide-react';
import { fetchDepartments, upsertDepartment, deleteDepartment } from '../../lib/supabase';
import { Department } from '../../types/accounting';
import Modal from '../ui/Modal';

// ================================================================
// DEPARTMENT MANAGEMENT COMPONENT
// Full CRUD for departments — shown in the Devices > Settings tab
// ================================================================

type FormState = {
    dept_code: string;
    dept_name: string;
    description: string;
    head_name: string;
    is_active: boolean;
};

const BLANK_FORM: FormState = {
    dept_code: '',
    dept_name: '',
    description: '',
    head_name: '',
    is_active: true,
};

export default function DepartmentManagement() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Department | null>(null);
    const [form, setForm] = useState<FormState>(BLANK_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchDepartments();
            setDepartments(data);
        } catch (err: any) {
            console.error('Failed to load departments:', err);
        } finally {
            setLoading(false);
        }
    };

    const openCreate = () => {
        setEditing(null);
        setForm(BLANK_FORM);
        setError(null);
        setIsModalOpen(true);
    };

    const openEdit = (dept: Department) => {
        setEditing(dept);
        setForm({
            dept_code: dept.dept_code,
            dept_name: dept.dept_name,
            description: dept.description || '',
            head_name: dept.head_name || '',
            is_active: dept.is_active,
        });
        setError(null);
        setIsModalOpen(true);
    };

    const handleDelete = async (dept: Department) => {
        if (!confirm(`Permanently delete department "${dept.dept_name}"? This cannot be undone.`)) return;
        try {
            await deleteDepartment(dept.id);
            await loadData();
        } catch (err: any) {
            alert('Delete failed: ' + (err.message || 'Unknown error'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!form.dept_code.trim() || !form.dept_name.trim()) {
            setError('Department Code and Name are required.');
            return;
        }
        setSubmitting(true);
        try {
            await upsertDepartment({
                ...(editing ? { id: editing.id } : {}),
                dept_code: form.dept_code.trim().toUpperCase(),
                dept_name: form.dept_name.trim().toUpperCase(),
                description: form.description.trim() || null,
                head_name: form.head_name.trim() || null,
                is_active: form.is_active,
            });
            setIsModalOpen(false);
            await loadData();
        } catch (err: any) {
            setError(err.message || 'Failed to save department.');
        } finally {
            setSubmitting(false);
        }
    };

    const field = (key: keyof FormState, value: string | boolean) =>
        setForm(prev => ({ ...prev, [key]: value }));

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="spinner !w-7 !h-7 border-brand-500" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Loading Departments…</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
                <div className="space-y-1">
                    <h2 className="text-3xl font-display font-black text-white uppercase tracking-tight flex items-center gap-3">
                        <Building2 className="w-8 h-8 text-brand-500" />
                        Departments
                    </h2>
                    <p className="text-slate-500 text-sm font-medium max-w-xl">
                        Create and manage organisational departments. These are used when enrolling staff members across HR modules.
                    </p>
                </div>
                <button onClick={openCreate} className="btn-primary flex items-center gap-2 shrink-0">
                    <Plus className="w-4 h-4" />
                    New Department
                </button>
            </div>

            {/* Department Table */}
            {departments.length === 0 ? (
                <div className="py-24 text-center surface-card border-dashed border-slate-800/50 rounded-[2rem]">
                    <Building2 className="w-10 h-10 text-slate-700 mx-auto mb-4" />
                    <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">No departments configured yet.</p>
                    <button onClick={openCreate} className="mt-6 btn-primary text-xs py-2.5 px-6">
                        Create First Department
                    </button>
                </div>
            ) : (
                <div className="surface-card rounded-[2rem] overflow-hidden border border-slate-800/20">
                    {/* Table Header */}
                    <div className="grid grid-cols-[80px_1fr_1fr_1fr_90px_100px] gap-4 px-6 py-4 bg-slate-900/60 border-b border-white/5">
                        {['Code', 'Name', 'Head', 'Description', 'Status', 'Actions'].map(h => (
                            <div key={h} className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{h}</div>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-white/[0.03]">
                        {departments.map(dept => (
                            <div
                                key={dept.id}
                                className="grid grid-cols-[80px_1fr_1fr_1fr_90px_100px] gap-4 px-6 py-4 items-center hover:bg-white/[0.015] transition-colors group"
                            >
                                <span className="font-mono text-[10px] font-black text-brand-400 uppercase tracking-widest">
                                    {dept.dept_code}
                                </span>
                                <span className="text-[13px] font-black text-white uppercase tracking-tight truncate">
                                    {dept.dept_name}
                                </span>
                                <span className="text-[11px] font-medium text-slate-400 truncate">
                                    {dept.head_name || <span className="text-slate-700 italic">—</span>}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500 truncate">
                                    {dept.description || <span className="text-slate-700 italic">—</span>}
                                </span>
                                <div>
                                    {dept.is_active ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                            <CheckCircle className="w-3 h-3" /> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-black uppercase tracking-widest">
                                            <XCircle className="w-3 h-3" /> Inactive
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEdit(dept)}
                                        className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all active:scale-95"
                                        title="Edit"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(dept)}
                                        className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => !submitting && setIsModalOpen(false)} closeOnBackdropClick={!submitting}>
                <div className="relative w-full max-w-lg bg-slate-950 border border-slate-800 rounded-[2.5rem] shadow-2xl animate-slide-down overflow-hidden mx-auto mt-[12vh]">
                    {/* Modal Header */}
                    <div className="px-10 pt-10 pb-6 bg-slate-900/50 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-brand-500/10 rounded-[1.5rem] flex items-center justify-center border border-brand-500/20">
                                <Building2 className="w-6 h-6 text-brand-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">
                                    {editing ? 'Edit Department' : 'New Department'}
                                </h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                                    {editing ? `Editing: ${editing.dept_name}` : 'Create a new department record'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsModalOpen(false)}
                            disabled={submitting}
                            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-10 space-y-6">
                        {/* Row: Code + Name */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                    Dept. Code <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={form.dept_code}
                                    onChange={e => field('dept_code', e.target.value)}
                                    className="input-field !uppercase font-mono !text-[12px]"
                                    placeholder="e.g. HR"
                                    maxLength={10}
                                    required
                                    disabled={submitting}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                    Department Name <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={form.dept_name}
                                    onChange={e => field('dept_name', e.target.value)}
                                    className="input-field !uppercase !font-bold"
                                    placeholder="e.g. HUMAN RESOURCES"
                                    required
                                    disabled={submitting}
                                />
                            </div>
                        </div>

                        {/* Head Name */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                Department Head
                            </label>
                            <input
                                value={form.head_name}
                                onChange={e => field('head_name', e.target.value)}
                                className="input-field"
                                placeholder="Name of the department head"
                                disabled={submitting}
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                Description
                            </label>
                            <textarea
                                value={form.description}
                                onChange={e => field('description', e.target.value)}
                                className="input-field min-h-[80px] resize-none"
                                placeholder="Optional description of this department's function…"
                                disabled={submitting}
                                rows={3}
                            />
                        </div>

                        {/* Status Toggle */}
                        <div className="flex items-center justify-between p-4 bg-slate-900/40 rounded-2xl border border-slate-800/50">
                            <div>
                                <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Active Status</p>
                                <p className="text-[10px] font-medium text-slate-600 mt-0.5">Inactive departments remain for historical reference</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => field('is_active', !form.is_active)}
                                disabled={submitting}
                                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border ${form.is_active
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                                    }`}
                            >
                                {form.is_active ? 'Active' : 'Inactive'}
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <p className="text-rose-400 text-[11px] font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                                {error}
                            </p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                disabled={submitting}
                                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex-1 btn-primary py-3.5 flex items-center justify-center gap-2"
                            >
                                {submitting
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                    : <><Save className="w-4 h-4" /> {editing ? 'Update' : 'Create'}</>
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
        </div>
    );
}
