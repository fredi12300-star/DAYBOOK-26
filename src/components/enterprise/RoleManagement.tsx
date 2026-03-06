import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, KeyRound, AlertCircle, RefreshCw, Eye, EyeOff, Lock, CheckCircle, X, ChevronRight, Mail, Loader2, Save } from 'lucide-react';
import { fetchRoles, upsertRole, deleteRole, fetchStaffProfiles, fetchUserOrgAccess, upsertUserOrgAccess, revokeUserOrgAccess, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Role, StaffProfile, UserOrgAccess } from '../../types/accounting';
import { MODULE_CATEGORIES, MODULES, ACTIONS } from '../../constants/permissions';
import Modal from '../ui/Modal';



// â”€â”€ localStorage helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CREDS_KEY = 'role_credentials';

function loadAllCredentials(): Record<string, { email: string; password: string }> {
    try { return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}'); } catch { return {}; }
}
function saveCredential(roleKey: string, email: string) {
    const all = loadAllCredentials();
    all[roleKey] = { email } as any; // Stop storing password
    localStorage.setItem(CREDS_KEY, JSON.stringify(all));
}
function clearCredential(roleKey: string) {
    const all = loadAllCredentials();
    delete all[roleKey];
    localStorage.setItem(CREDS_KEY, JSON.stringify(all));
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Toggle Component
const Toggle = ({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onChange(); }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-brand-600' : 'bg-slate-800'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
);

// Permissions detail modal (shared by admin + job roles)
function RoleDetailModal({
    isOpen,
    roleName,
    description,
    permissions,
    isSystem,
    roleKey,
    onToggleModule,
    onTogglePermission,
    onClose,
    isSuperAdmin,
    StaffProfiles = [],
    assignedStaffIds = [],
    onToggleStaffAssignment,
    onUpdateRole,
    duties,
    category
}: {
    isOpen: boolean;
    roleName: string;
    description: string;
    permissions: Record<string, string[]> | { all: boolean } | any;
    isSystem: boolean;
    roleKey: string;
    onToggleModule?: (moduleId: string) => void;
    onTogglePermission?: (moduleId: string, actionId: string) => void;
    onClose: () => void;
    isSuperAdmin: boolean;
    StaffProfiles?: (StaffProfile & { userId?: string })[];
    assignedStaffIds?: string[];
    onToggleStaffAssignment?: (staffId: string, assigned: boolean) => Promise<void>;
    onUpdateRole?: (name: string, description: string, duties: { id: string, text: string }[]) => Promise<void>;
    duties?: { id: string, text: string }[];
    category: 'ADMIN' | 'JOB';
}) {
    const [modalTab, setModalTab] = useState<'permissions' | 'credentials' | 'assignment' | 'general' | 'duties'>(isSystem ? 'permissions' : 'general');
    const [selectedModuleId, setSelectedModuleId] = useState<string>(MODULES[0].id);
    const [credEmail, setCredEmail] = useState('');

    // Identity editing state
    const [editName, setEditName] = useState(roleName);
    const [editDesc, setEditDesc] = useState(description);
    const [editDuties, setEditDuties] = useState<{ id: string, text: string }[]>(duties || []);
    const [isSavingIdentity, setIsSavingIdentity] = useState(false);
    const [newDuty, setNewDuty] = useState('');

    useEffect(() => {
        setEditName(roleName);
        setEditDesc(description);
        setEditDuties(duties || []);
        if (!isOpen) {
            setModalTab(isSystem ? 'permissions' : 'general');
        }
    }, [roleName, description, duties, isOpen, isSystem]);
    const [credPassword, setCredPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [credSaved, setCredSaved] = useState(false);
    const [credCleared, setCredCleared] = useState(false);
    const [credSyncing, setCredSyncing] = useState(false);
    const [credSyncError, setCredSyncError] = useState<string | null>(null);
    const [credSyncSuccess, setCredSyncSuccess] = useState(false);

    // Block close for admin roles when credentials have been cleared but not re-saved
    const mustSetCreds = isSystem && credCleared && !credSaved;

    // Load existing credentials on open
    useEffect(() => {
        const all = loadAllCredentials();
        if (all[roleKey]) {
            setCredEmail(all[roleKey].email);
            // setCredPassword(''); // Don't load password from storage
            setCredSaved(true);
        }
    }, [roleKey]);

    useEffect(() => {
        if (!isSuperAdmin && modalTab === 'credentials') {
            setModalTab('permissions');
        }
    }, [isSuperAdmin, modalTab]);

    const handleSaveCreds = async () => {
        if (!isSuperAdmin) {
            setCredSyncError('Only Super Admin can sync authentication credentials.');
            return;
        }

        const email = credEmail.trim();
        const password = credPassword.trim();
        if (!email || !password) return;

        setCredSyncing(true);
        setCredSyncError(null);
        setCredSyncSuccess(false);

        try {
            // Call the SECURITY DEFINER RPC â€” it looks up auth.users by email internally
            const { data: rpcResult, error: rpcError } = await supabase.rpc(
                'update_user_auth_credentials',
                {
                    p_email: email,
                    p_password: password
                }
            );

            if (rpcError) throw new Error(rpcError.message);

            const result = rpcResult as { success: boolean; error?: string };
            if (!result.success) throw new Error(result.error || 'Unknown error from server');

            // Save locally for email autofill only (no password storage)
            saveCredential(roleKey, email);
            setCredSaved(true);
            setCredCleared(false);
            setCredSyncSuccess(true);

        } catch (err: any) {
            setCredSyncError(err.message || 'Failed to sync credentials');
        } finally {
            setCredSyncing(false);
        }
    };

    const handleClearCreds = () => {
        clearCredential(roleKey);
        setCredEmail('');
        setCredPassword('');
        setCredSaved(false);
        setCredSyncSuccess(false);
        setCredSyncError(null);
        if (isSystem) setCredCleared(true); // lock drawer for admin roles
    };

    const isAllAccess = (permissions as any)?.all === true;

    return (
        <Modal isOpen={isOpen} onClose={mustSetCreds ? () => { } : onClose} closeOnBackdropClick={!mustSetCreds}>
            {/* Panel */}
            <div
                className="relative w-full max-w-2xl h-[800px] max-h-[90vh] bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden rounded-[2.5rem] animate-slide-down"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-start justify-between gap-4 shrink-0">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-brand-500/10 rounded-xl flex items-center justify-center border border-brand-500/20">
                                <Shield className="w-4.5 h-4.5 text-brand-500" />
                            </div>
                            <h2 className="text-2xl font-display font-black text-white uppercase tracking-tight">{editName || roleName}</h2>
                        </div>
                        <p className="text-[12px] text-slate-500 font-medium leading-relaxed max-w-sm">{editDesc || description}</p>
                        {isSystem && (
                            <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-brand-500 bg-brand-500/10 px-2.5 py-1 rounded-lg border border-brand-500/20">
                                <Lock className="w-3 h-3" /> System Protocol
                            </span>
                        )}
                    </div>
                    <button
                        onClick={mustSetCreds ? undefined : onClose}
                        className={`p-2 rounded-xl transition-all shrink-0 ${mustSetCreds
                            ? 'text-slate-700 cursor-not-allowed opacity-40'
                            : 'text-slate-500 hover:text-white hover:bg-slate-800'
                            }`}
                        title={mustSetCreds ? 'Set a password before closing' : 'Close'}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-0.5 px-8 pt-6 shrink-0 overflow-x-auto scrollbar-hidden">
                    {(isSuperAdmin
                        ? (isSystem
                            ? (['permissions', 'credentials'] as const)
                            : (category === 'JOB'
                                ? (['general', 'duties', 'assignment'] as const)
                                : (['general', 'duties', 'permissions', 'credentials', 'assignment'] as const)))
                        : (isSystem
                            ? (['permissions'] as const)
                            : (category === 'JOB'
                                ? (['general', 'duties', 'assignment'] as const)
                                : (['general', 'duties', 'permissions', 'assignment'] as const)))
                    ).map(t => (
                        <button
                            key={t}
                            onClick={() => setModalTab(t as any)}
                            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === t
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {t === 'general' ? 'General' : t === 'duties' ? 'Roles & Duties' : t === 'permissions' ? 'Permissions' : t === 'assignment' ? 'Staff Assignment' : 'Login Credentials'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto scrollbar-hidden p-8 space-y-4">
                    {modalTab === 'general' ? (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Role Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="input-field"
                                        placeholder="e.g., Senior Accountant"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Description</label>
                                    <input
                                        type="text"
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        className="input-field"
                                        placeholder="Describe responsibilities..."
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={async () => {
                                        if (!onUpdateRole) return;
                                        setIsSavingIdentity(true);
                                        try {
                                            await onUpdateRole(editName, editDesc, editDuties);
                                        } finally {
                                            setIsSavingIdentity(false);
                                        }
                                    }}
                                    disabled={isSavingIdentity || (editName === roleName && editDesc === description)}
                                    className="btn-primary py-2.5 px-8"
                                >
                                    {isSavingIdentity ? 'Saving...' : 'Update Identity'}
                                </button>
                            </div>
                        </div>
                    ) : modalTab === 'duties' ? (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between px-1">
                                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Roles & Duties Protocols</h4>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{editDuties.length} Tasks Defined</span>
                            </div>

                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newDuty}
                                        onChange={(e) => setNewDuty(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newDuty.trim()) {
                                                setEditDuties(prev => [...prev, { id: crypto.randomUUID(), text: newDuty.trim() }]);
                                                setNewDuty('');
                                            }
                                        }}
                                        className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl py-3.5 px-4 text-white text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-700"
                                        placeholder="Add a new duty or responsibility..."
                                    />
                                    <button
                                        onClick={() => {
                                            if (newDuty.trim()) {
                                                setEditDuties(prev => [...prev, { id: crypto.randomUUID(), text: newDuty.trim() }]);
                                                setNewDuty('');
                                            }
                                        }}
                                        className="p-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-all active:scale-95"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 scrollbar-hidden">
                                    {editDuties.length === 0 ? (
                                        <div className="text-center py-12 bg-slate-950/20 rounded-[2rem] border border-dashed border-slate-800/50">
                                            <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">No personnel protocols defined.</p>
                                        </div>
                                    ) : (
                                        editDuties.map((duty, idx) => (
                                            <div key={duty.id} className="group flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl hover:border-brand-500/20 hover:bg-slate-900 transition-all">
                                                <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-700 shrink-0">
                                                    {idx + 1}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={duty.text}
                                                    onChange={(e) => {
                                                        const updated = [...editDuties];
                                                        updated[idx].text = e.target.value;
                                                        setEditDuties(updated);
                                                    }}
                                                    className="flex-1 bg-transparent border-none outline-none text-[13px] font-medium text-slate-300 focus:text-white transition-colors"
                                                />
                                                <button
                                                    onClick={() => setEditDuties(prev => prev.filter(d => d.id !== duty.id))}
                                                    className="p-1.5 text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={async () => {
                                        if (!onUpdateRole) return;
                                        setIsSavingIdentity(true);
                                        try {
                                            await onUpdateRole(editName, editDesc, editDuties);
                                        } finally {
                                            setIsSavingIdentity(false);
                                        }
                                    }}
                                    disabled={isSavingIdentity}
                                    className="px-8 py-3.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                                >
                                    {isSavingIdentity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    Commit Protocols
                                </button>
                            </div>
                        </div>
                    ) : modalTab === 'permissions' ? (
                        <>
                            {isAllAccess ? (
                                <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl text-center space-y-2">
                                    <div className="text-2xl font-black text-rose-500">âˆž</div>
                                    <div className="text-[11px] font-black text-rose-400 uppercase tracking-widest">Unrestricted Super Admin Access</div>
                                    <div className="text-[11px] text-slate-500">Full control over every module and action in the system.</div>
                                </div>
                            ) : (
                                <div className="flex-1 flex overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/20">
                                    {/* Left Pane: Categorised Module List */}
                                    <div className="w-64 border-r border-white/5 flex flex-col shrink-0 bg-slate-950/40">
                                        <div className="flex-1 overflow-y-auto scrollbar-hidden p-3 space-y-6">
                                            {MODULE_CATEGORIES.map(cat => {
                                                const catModules = MODULES.filter(m => m.category === cat.id);
                                                const activeInCat = catModules.filter(m => ((permissions as any)?.[m.id] || []).length > 0);

                                                return (
                                                    <div key={cat.id} className="space-y-1.5">
                                                        <div className="px-3 py-1.5 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] sticky top-0 bg-slate-950/40 backdrop-blur-md z-10 border-b border-white/5 mb-1 flex justify-between items-center">
                                                            <span>{cat.name}</span>
                                                            {activeInCat.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />}
                                                        </div>
                                                        {catModules.map(m => {
                                                            const isActive = ((permissions as any)?.[m.id] || []).length > 0;
                                                            return (
                                                                <button
                                                                    key={m.id}
                                                                    onClick={() => setSelectedModuleId(m.id)}
                                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all group ${selectedModuleId === m.id ? 'bg-brand-500/10 border border-brand-500/20 text-white shadow-glow shadow-brand-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                                                                >
                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-left">{m.name}</span>
                                                                    {isActive && <CheckCircle className={`w-3 h-3 ${selectedModuleId === m.id ? 'text-emerald-500' : 'text-emerald-500/40'}`} />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Right Pane: Content */}
                                    <div className="flex-1 flex flex-col min-w-0 bg-slate-900/40 text-left">
                                        {(() => {
                                            const module = MODULES.find(m => m.id === selectedModuleId);
                                            if (!module) return (
                                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-30">
                                                    <Shield className="w-12 h-12 mb-4" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-[#FFF]">Select a module to view permissions</p>
                                                </div>
                                            );

                                            const moduleActions = ACTIONS.filter(a => a.modules.includes(module.id));
                                            const granted: string[] = (permissions as any)?.[module.id] || [];
                                            const isActive = granted.length > 0;

                                            return (
                                                <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
                                                    <div className="px-8 py-6 border-b border-white/5 bg-white/[0.01] flex items-center justify-between shrink-0">
                                                        <div className="space-y-1">
                                                            <div className="text-[12px] font-black text-white uppercase tracking-widest">{module.name}</div>
                                                            <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Security Classification</div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            {isSystem && !isSuperAdmin ? (
                                                                <div className="px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                                    <Lock className="w-3 h-3" /> System
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-3">
                                                                    {isSystem && isSuperAdmin && (
                                                                        <div className="px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[7px] font-black uppercase tracking-[0.2em]">Override</div>
                                                                    )}
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{isActive ? 'Access ON' : 'Access OFF'}</span>
                                                                        <Toggle
                                                                            enabled={isActive}
                                                                            onChange={() => onToggleModule?.(module.id)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 overflow-y-auto scrollbar-hidden p-8">
                                                        {!isActive ? (
                                                            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                                                                <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center border border-slate-700">
                                                                    <Shield className="w-8 h-8 text-slate-500" />
                                                                </div>
                                                                <div className="max-w-xs space-y-1">
                                                                    <div className="text-[11px] font-black text-white uppercase tracking-wider">Module Restricted</div>
                                                                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed uppercase tracking-tight">Access to this sector is currently locked. Enable it to view protocols.</p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-4">
                                                                {moduleActions.map(action => {
                                                                    const ok = granted.includes(action.id) || (permissions as any)?.all === true;
                                                                    const canEdit = onTogglePermission && (!isSystem || isSuperAdmin);
                                                                    return (
                                                                        <div
                                                                            key={action.id}
                                                                            onClick={() => canEdit && onTogglePermission?.(module.id, action.id)}
                                                                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${ok ? 'bg-brand-500/10 border-brand-500/20 text-slate-100 shadow-glow shadow-brand-500/5' : 'bg-slate-950/20 border-slate-800/40 text-slate-600 opacity-60'} ${canEdit ? 'cursor-pointer hover:border-brand-500/30' : ''}`}
                                                                        >
                                                                            {ok ? <CheckCircle className="w-4 h-4 text-brand-500 shrink-0" /> : <X className="w-4 h-4 text-slate-700 shrink-0" />}
                                                                            <span className="text-[10px] font-black uppercase tracking-wider">{action.name}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {moduleActions.length === 0 && (
                                                                    <div className="col-span-full py-12 text-center opacity-30">
                                                                        <p className="text-[10px] font-black uppercase tracking-widest text-[#FFF]">No specific actions defined for this module.</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : modalTab === 'assignment' ? (
                        /* â”€â”€ Assignment Panel â”€â”€ */
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-1">
                                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Personnel Assignment</h4>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    {assignedStaffIds.length} Assigned
                                </span>
                            </div>

                            <div className="space-y-3">
                                {(() => {
                                    const linkedStaff = StaffProfiles.filter(s => s.userId);
                                    const assignedStaff = linkedStaff.filter(s => assignedStaffIds.includes(s.id));
                                    const displayStaff = assignedStaff.length > 0 ? assignedStaff : linkedStaff;

                                    if (displayStaff.length === 0) {
                                        return (
                                            <div className="text-center py-12 bg-slate-950/20 rounded-[2rem] border border-dashed border-slate-800/50">
                                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">No personnel matched criteria.</p>
                                            </div>
                                        );
                                    }

                                    return displayStaff.map(s => {
                                        const isAssigned = assignedStaffIds.includes(s.id);
                                        return (
                                            <div key={s.id} className="flex items-center justify-between p-5 bg-slate-900 border border-slate-800 rounded-2xl group hover:border-brand-500/30 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border transition-all ${isAssigned ? 'bg-brand-500/10 text-brand-500 border-brand-500/20' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                                                        {s.full_name.charAt(0)}
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <div className="text-[13px] font-bold text-white tracking-tight">{s.full_name}</div>
                                                        <div className="text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase">{s.department}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onToggleStaffAssignment?.(s.id, isAssigned)}
                                                    disabled={assignedStaffIds.length > 0 && !isAssigned}
                                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${isAssigned
                                                        ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white'
                                                        : assignedStaffIds.length > 0
                                                            ? 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
                                                            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white'
                                                        }`}
                                                >
                                                    {isAssigned ? 'Revoke' : 'Assign'}
                                                </button>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            <div className="p-6 bg-brand-500/5 border border-brand-500/10 rounded-[2rem] flex gap-4">
                                <Shield className="w-5 h-5 text-brand-500 shrink-0" />
                                <div className="space-y-1">
                                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">Assignment Policy</h5>
                                    <p className="text-[11px] text-slate-400 leading-relaxed font-bold">
                                        Only staff with linked user accounts (Supabase Auth) are eligible for role assignment. Operational job roles should be assigned based on regional or global scope requirements.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* â”€â”€ Credentials Panel â”€â”€ */
                        isSuperAdmin ? (
                            <div className="space-y-6">
                                {/* Mandatory credential lock warning */}
                                {mustSetCreds && (
                                    <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl animate-slide-down">
                                        <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <div className="space-y-0.5">
                                            <div className="text-[11px] font-black text-amber-400 uppercase tracking-wider">Password Required to Close</div>
                                            <div className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                                Admin role credentials cannot be left empty. Set a new email and password to continue.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Sync Success Banner */}
                                {credSyncSuccess && (
                                    <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl animate-slide-down">
                                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <div className="space-y-0.5">
                                            <div className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">Synced to Supabase Auth</div>
                                            <div className="text-[10px] text-slate-500 font-medium">Email &amp; password updated in authentication service</div>
                                        </div>
                                    </div>
                                )}

                                {/* Locally saved (autofill) indicator â€” only when NOT showing sync success */}
                                {credSaved && !credSyncSuccess && (
                                    <div className="flex items-center gap-3 p-4 bg-brand-500/10 border border-brand-500/20 rounded-2xl">
                                        <CheckCircle className="w-4 h-4 text-brand-500 shrink-0" />
                                        <div className="text-[11px] font-black text-brand-400 uppercase tracking-wider">Saved locally â€” available on login screen</div>
                                    </div>
                                )}

                                {/* Sync Error Banner */}
                                {credSyncError && (
                                    <div className="flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-slide-down">
                                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                        <div className="space-y-0.5">
                                            <div className="text-[11px] font-black text-rose-400 uppercase tracking-wider">Sync Failed</div>
                                            <div className="text-[10px] text-slate-400 font-medium leading-relaxed">{credSyncError}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type="email"
                                            value={credEmail}
                                            onChange={e => { setCredEmail(e.target.value); setCredSaved(false); setCredSyncSuccess(false); setCredSyncError(null); }}
                                            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-3.5 pl-11 pr-4 text-white text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-700"
                                            placeholder="user@company.com"
                                            disabled={credSyncing}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Password</label>
                                    <div className="relative">
                                        <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={credPassword}
                                            onChange={e => { setCredPassword(e.target.value); setCredSaved(false); setCredSyncSuccess(false); setCredSyncError(null); }}
                                            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-3.5 pl-11 pr-12 text-white text-sm font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-700"
                                            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                            disabled={credSyncing}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={handleSaveCreds}
                                        disabled={!credEmail.trim() || !credPassword.trim() || credSyncing}
                                        className="flex-1 py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {credSyncing ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                Syncing...
                                            </>
                                        ) : (
                                            'Save & Sync to Supabase'
                                        )}
                                    </button>
                                    {credSaved && !credSyncing && (
                                        <button
                                            type="button"
                                            onClick={handleClearCreds}
                                            className="py-3 px-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
                                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                        <span className="text-slate-400 font-black">Security Note:</span> Email is saved locally for identification. <span className="text-brand-400 font-black">Passwords are never stored in the browser</span> and are synced directly to Supabase Authentication.
                                    </p>
                                </div>
                            </div>
                        ) : null)}
                </div>
            </div>
        </Modal>
    );
}

export default function RoleManagement() {
    const { isSuperAdmin, refreshSession } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<'ADMIN' | 'JOB'>('JOB');

    // Modal state
    const [detailModalRole, setDetailModalRole] = useState<{
        id?: string;
        name: string; description: string;
        permissions: any; isSystem: boolean; roleKey: string;
        duties?: { id: string, text: string }[];
        category: 'ADMIN' | 'JOB';
    } | null>(null);

    const handleUpdateRole = async (name: string, description: string, duties: { id: string, text: string }[]) => {
        if (!detailModalRole || !detailModalRole.id) return;
        const roleToUpdate = roles.find(r => r.id === detailModalRole.id);
        if (!roleToUpdate) return;

        try {
            await upsertRole({ ...roleToUpdate, role_name: name, description, duties });
            await loadData();
            setDetailModalRole(prev => prev ? { ...prev, name, description, duties } : null);
        } catch (error: any) {
            alert('Failed to update role protocols: ' + error.message);
        }
    };

    // Edit modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<Record<string, string[] | boolean>>({});

    // Staff Assignment State
    const [StaffProfiles, setStaffProfiles] = useState<(StaffProfile & { userId?: string })[]>([]);
    const [userOrgAccess, setUserOrgAccess] = useState<UserOrgAccess[]>([]);
    useEffect(() => {
        if (!isSuperAdmin && activeTab === 'ADMIN') {
            setActiveTab('JOB');
        }
    }, [activeTab, isSuperAdmin]);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [data, staff, access, { data: profiles }] = await Promise.all([
                fetchRoles(),
                fetchStaffProfiles(),
                fetchUserOrgAccess(),
                supabase.from('user_profiles').select('id, staff_id')
            ]);
            setRoles(data);

            const mergedStaff = staff.map(s => {
                const p = profiles?.find(prof => prof.staff_id === s.id);
                return { ...s, userId: p?.id };
            });

            setStaffProfiles(mergedStaff);
            setUserOrgAccess(access);
        } catch (error: any) {
            console.error('Error loading roles data:', error);
        } finally {
            setLoading(false);
        }
    };

    const openRoleDetail = (role: Role) => {
        setDetailModalRole({
            id: role.id,
            name: role.role_name,
            description: role.description || 'No description provided.',
            permissions: role.permissions || {},
            isSystem: role.is_system || false,
            roleKey: role.category === 'ADMIN' ? `admin__${role.role_name}` : `job__${role.id}`,
            duties: role.duties || [],
            category: role.category
        });
    };

    const handleCreate = () => {
        setEditingRole({ role_name: '', description: '', is_system: false, category: activeTab });
        setCurrentPermissions({});
        setIsEditModalOpen(true);
    };


    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Delete this role? Staff assigned to it may lose access.')) return;
        try {
            await deleteRole(id);
            setRoles(roles.filter(r => r.id !== id));
            await refreshSession();
        }
        catch (error: any) { alert('Failed to delete: ' + error.message); }
    };

    const handleToggleStaffAssignment = async (staffId: string, assigned: boolean) => {
        if (!detailModalRole?.id) return;
        try {
            const staff = StaffProfiles.find(s => s.id === staffId);
            if (!staff?.userId) {
                alert('This staff member does not have a linked user account.');
                return;
            }

            if (assigned) {
                const mapping = userOrgAccess.find(a => a.user_id === staff.userId && a.role_id === detailModalRole.id);
                if (mapping) {
                    await revokeUserOrgAccess(mapping.id);
                }
            } else {
                await upsertUserOrgAccess({
                    user_id: staff.userId,
                    role_id: detailModalRole.id,
                    scope_type: 'GLOBAL',
                    is_active: true
                });
            }
            await loadData();
        } catch (error: any) {
            alert('Error updating assignment: ' + error.message);
        }
    };


    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingRole) return;
        setSubmitting(true);
        const formData = new FormData(e.currentTarget);
        const payload: Partial<Role> = {
            id: editingRole.id,
            role_name: editingRole.is_system ? editingRole.role_name : formData.get('role_name') as string,
            description: editingRole.is_system ? editingRole.description : formData.get('description') as string,
            permissions: editingRole.is_system && !isSuperAdmin ? editingRole.permissions : currentPermissions,
            is_system: editingRole.is_system || false,
            category: editingRole.category || activeTab
        };
        try {
            await upsertRole(payload);
            await loadData();
            await refreshSession();
            setIsEditModalOpen(false);
            if (detailModalRole && detailModalRole.id === editingRole.id) {
                setDetailModalRole(prev => prev ? {
                    ...prev,
                    name: payload.role_name || prev.name,
                    description: payload.description || prev.description,
                    permissions: payload.permissions || prev.permissions,
                    isSystem: payload.is_system ?? prev.isSystem
                } : null);
            }
        } catch (error: any) { alert('Error saving role: ' + error.message); }
        finally { setSubmitting(false); }
    };

    const handleToggleModuleFromDetail = async (moduleId: string) => {
        if (!detailModalRole || !detailModalRole.id) return; // Only for job roles

        const roleToUpdate = roles.find(r => r.id === detailModalRole.id);
        if (!roleToUpdate) return;

        const currentPerms = (roleToUpdate.permissions as any) || {};
        const newPerms = { ...currentPerms };

        if (newPerms[moduleId]) {
            delete newPerms[moduleId];
        } else {
            newPerms[moduleId] = ['view']; // Default to 'view' when enabling
        }

        try {
            await upsertRole({ ...roleToUpdate, permissions: newPerms });
            await loadData();
            await refreshSession();
            setDetailModalRole(prev => prev ? { ...prev, permissions: newPerms } : null);
        } catch (error: any) {
            await refreshSession();
            alert('Failed to update module permissions: ' + error.message);
        }
    };

    const handleTogglePermissionFromDetail = async (moduleId: string, actionId: string) => {
        if (!detailModalRole || !detailModalRole.id) return;

        const roleToUpdate = roles.find(r => r.id === detailModalRole.id);
        if (!roleToUpdate) return;

        const currentPerms = { ...(roleToUpdate.permissions as any || {}) };
        const m = currentPerms[moduleId] || [];
        const mArr = Array.isArray(m) ? [...m] : [];

        currentPerms[moduleId] = mArr.includes(actionId)
            ? mArr.filter(a => a !== actionId)
            : [...mArr, actionId];

        try {
            await upsertRole({ ...roleToUpdate, permissions: currentPerms });
            await loadData();
            await refreshSession();
            setDetailModalRole(prev => prev ? { ...prev, permissions: currentPerms } : null);
        } catch (error: any) {
            alert('Failed to update granular permission: ' + error.message);
        }
    };


    const RoleCard = ({ onClick, title, subtitle, description, footer, assignedCount = 0, showAssignment = true, assignedStaffName }: {
        onClick: () => void; title: string; subtitle?: string;
        description: string; footer: React.ReactNode;
        assignedCount?: number;
        showAssignment?: boolean;
        assignedStaffName?: string;
    }) => (
        <div
            onClick={onClick}
            className={`surface-card flex flex-col border hover:border-brand-500/30 hover:shadow-glow shadow-brand-500/5 transition-all group cursor-pointer ${showAssignment && assignedCount === 0 ? 'border-rose-500/30' : 'border-slate-800/10'}`}
        >
            <div className="p-7 border-b border-white/5 flex-1 space-y-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-display font-black text-white uppercase tracking-tight group-hover:text-brand-400 transition-colors">{title}</h3>
                            {showAssignment && assignedCount === 0 && (
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] animate-pulse" title="No staff assigned" />
                            )}
                        </div>
                        {subtitle && <span className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-500">{subtitle}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${showAssignment && assignedCount === 0 ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-brand-500/10 text-brand-500 border-brand-500/20 group-hover:bg-brand-500/20'}`}>
                            <Shield className="w-4 h-4" />
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                </div>
                <p className="text-[12px] font-medium text-slate-400 leading-relaxed line-clamp-2">{description}</p>
            </div>
            <div className="px-7 py-4 bg-black/20 shrink-0 border-t border-white/5 flex items-center justify-between">
                {footer}
                <div className="flex flex-col items-end">
                    {showAssignment && (
                        <span className={`text-[10px] font-black uppercase tracking-widest ${assignedCount > 0 ? 'text-brand-500' : 'text-slate-400'}`}>
                            {assignedCount > 0 ? (assignedStaffName || 'Assigned') : 'Not Assigned'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-10 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
                <div className="space-y-2">
                    <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none flex items-center gap-4">
                        <KeyRound className="w-10 h-10 text-brand-500" />
                        Privilege Policies
                    </h1>
                    <p className="text-slate-500 font-medium text-sm max-w-xl">
                        Click any role to view permissions and manage login credentials.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {isSuperAdmin && activeTab === 'JOB' && (
                        <button onClick={handleCreate} className="btn-primary">
                            <Plus className="w-4 h-4" /> Create Protocol
                        </button>
                    )}
                    <button onClick={loadData} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl w-fit">
                {(isSuperAdmin ? (['JOB', 'ADMIN'] as const) : (['JOB'] as const)).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                            : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {tab === 'JOB' ? 'Job Roles' : 'Admin Roles'}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {roles
                    .filter(r => r.category === activeTab)
                    .map(role => {
                        const assignedAccess = userOrgAccess.find(a => a.role_id === role.id);
                        const assignedStaff = assignedAccess ? StaffProfiles.find(s => s.userId === assignedAccess.user_id) : null;
                        const assignedStaffName = assignedStaff ? assignedStaff.full_name : undefined;
                        const roleAssignedCount = assignedStaff ? 1 : 0;

                        return (
                            <RoleCard
                                key={role.id}
                                onClick={() => openRoleDetail(role)}
                                assignedCount={roleAssignedCount}
                                assignedStaffName={assignedStaffName}
                                showAssignment={activeTab !== 'ADMIN'}
                                title={role.role_name}
                                subtitle={role.is_system ? 'System Protocol' : undefined}
                                description={role.description || 'No description provided for this role.'}
                                footer={
                                    <div className="flex gap-2 items-center justify-between w-full">
                                        <div className="flex gap-2">
                                            {!role.is_system && (
                                                <button
                                                    onClick={e => handleDelete(e, role.id)}
                                                    className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        {role.is_system && (
                                            <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                Immutable
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        );
                    })}
                {roles.filter(r => r.category === activeTab).length === 0 && !loading && (
                    <div className="col-span-full py-24 text-center surface-card border-dashed border-slate-800/50">
                        <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">
                            {activeTab === 'ADMIN' ? 'No system protocols found.' : 'No job roles defined.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            <RoleDetailModal
                isOpen={!!detailModalRole}
                roleName={detailModalRole?.name || ''}
                description={detailModalRole?.description || ''}
                permissions={detailModalRole?.permissions}
                isSystem={detailModalRole?.isSystem || false}
                roleKey={detailModalRole?.roleKey || ''}
                onToggleModule={handleToggleModuleFromDetail}
                onTogglePermission={handleTogglePermissionFromDetail}
                onUpdateRole={handleUpdateRole}
                duties={detailModalRole?.duties || []}
                category={detailModalRole?.category || 'JOB'}
                onClose={() => setDetailModalRole(null)}
                isSuperAdmin={isSuperAdmin}
                StaffProfiles={StaffProfiles}
                assignedStaffIds={userOrgAccess.filter(a => a.role_id === detailModalRole?.id).map(a => {
                    const staff = StaffProfiles.find(s => s.userId === a.user_id);
                    return staff ? staff.id : '';
                }).filter(id => id !== '')}
                onToggleStaffAssignment={handleToggleStaffAssignment}
            />

            {/* Create/Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => !submitting && setIsEditModalOpen(false)}>
                <div
                    className="relative w-full max-w-xl bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden rounded-[2.5rem] animate-slide-down"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-8 border-b border-white/5 flex items-start justify-between gap-4 shrink-0">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-brand-500/10 rounded-xl flex items-center justify-center border border-brand-500/20">
                                    <Shield className="w-4.5 h-4.5 text-brand-500" />
                                </div>
                                <h2 className="text-2xl font-display font-black text-white uppercase tracking-tight">
                                    {editingRole?.id ? 'Modify Protocol' : 'Formulate Protocol'}
                                </h2>
                            </div>
                            <p className="text-[12px] text-slate-500 font-medium uppercase tracking-widest px-1">Identity & Responsibilities</p>
                        </div>
                        <button
                            onClick={() => !submitting && setIsEditModalOpen(false)}
                            className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-hidden p-8 space-y-6 max-h-[75vh]">
                        {editingRole && (
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Role Name</label>
                                        <input type="text" name="role_name" required defaultValue={editingRole.role_name}
                                            readOnly={editingRole.is_system} className="input-field disabled:opacity-50" placeholder="e.g., Regional Accountant" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Description</label>
                                        <input type="text" name="description" defaultValue={editingRole.description || ''}
                                            readOnly={editingRole.is_system}
                                            className="input-field disabled:opacity-50" placeholder="Describe responsibilities..." />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-white/5 flex justify-end gap-3">
                                    <button type="button" onClick={() => setIsEditModalOpen(false)} disabled={submitting} className="btn-ghost">Cancel</button>
                                    <button type="submit" disabled={submitting} className="btn-primary">
                                        {submitting ? 'Saving...' : 'Save Role'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
