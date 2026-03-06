import React, { useState, useEffect, useCallback } from 'react';
import {
    MonitorSmartphone,
    KeyRound, Trash2, Wifi, Loader2,
    Settings, Lock, CheckCircle, X, Save
} from 'lucide-react';
import {
    fetchDevices, upsertDevice, provisionDeviceAccount,
    deleteDevice, updateUserAuthCredentials,
    fetchDeviceDepartments, upsertDeviceDepartment, fetchDevicesByDepartment,
    fetchStaffMasters, updateStaffMaster
} from '../../lib/supabase';
import { Device, DeviceDepartment, StaffMaster } from '../../types/accounting';
import { MODULE_CATEGORIES, MODULES, ACTIONS } from '../../constants/permissions';
import { useAuth } from '../../lib/auth';
import Modal from '../ui/Modal';

export default function DeviceManagement() {
    const { isSuperAdmin, canExecute } = useAuth();
    const canManage = isSuperAdmin || canExecute('device_mgmt', 'manage_devices');
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [modalTab, setModalTab] = useState<'IDENTITY' | 'ACCOUNT' | 'PERMISSIONS'>('IDENTITY');
    const [loadingAccess, setLoadingAccess] = useState(false);
    const [selectedModuleId, setSelectedModuleId] = useState<string>(MODULES[0].id);
    // Device-level permissions (local editable copy while modal is open)
    const [devicePerms, setDevicePerms] = useState<Record<string, string[]>>({});
    const [savingPerms, setSavingPerms] = useState(false);
    const [departments, setDepartments] = useState<DeviceDepartment[]>([]);
    const [isDeptSettingsOpen, setIsDeptSettingsOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Partial<DeviceDepartment> | null>(null);
    const [loadingDeptUsage, setLoadingDeptUsage] = useState<string | null>(null);
    const [deptUsage, setDeptUsage] = useState<Record<string, Device[]>>({});

    // Dept Settings Modal Tabs
    const [deptModalTab, setDeptModalTab] = useState<'DEPARTMENTS' | 'ASSIGN_STAFF'>('DEPARTMENTS');
    const [staffList, setStaffList] = useState<StaffMaster[]>([]);
    const [loadingStaff, setLoadingStaff] = useState(false);
    const [updatingStaffId, setUpdatingStaffId] = useState<string | null>(null);

    useEffect(() => { loadData(); }, []);
    useEffect(() => {
        if (isDeptSettingsOpen && deptModalTab === 'ASSIGN_STAFF') {
            loadStaff();
        }
    }, [isDeptSettingsOpen, deptModalTab]);

    const loadData = async () => {
        try {
            const [d, depts] = await Promise.all([
                fetchDevices(),
                fetchDeviceDepartments()
            ]);
            setDevices(d);
            setDepartments(depts);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (d: Device) => {
        setEditingDevice(d);
        setDevicePerms((d.permissions as Record<string, string[]>) || {});
        loadData();
        setSelectedModuleId(MODULES[0].id);
        setModalTab('IDENTITY');
        setIsEditModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to permanently decommission this terminal?')) return;
        try {
            await deleteDevice(id);
            await loadData();
        } catch (error: any) {
            alert('Decommission failed: ' + error.message);
        }
    };

    const handleSubmitIdentity = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingDevice) return;
        setSubmitting(true);
        const formData = new FormData(e.currentTarget);
        const deviceName = formData.get('device_name') as string;
        const deviceFingerprint = formData.get('device_fingerprint') as string;
        const departmentId = formData.get('department_id') as string;
        const isAuthorized = formData.get('is_authorized') === 'true';

        try {
            await upsertDevice({
                id: editingDevice.id || undefined,
                device_name: deviceName,
                device_fingerprint: deviceFingerprint,
                department_id: departmentId || null,
                is_authorized: isAuthorized
            });
            await loadData();
            setIsEditModalOpen(false);
        } catch (error: any) {
            alert('Operation failed: ' + (error.message || 'Unknown error'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleConnectAccount = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingDevice) return;
        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;
        if (!email) return;

        setLoadingAccess(true);
        try {
            await provisionDeviceAccount(editingDevice.id, email);
            const updated = await fetchDevices();
            setDevices(updated);
            const fresh = updated.find(d => d.id === editingDevice.id);
            if (fresh) setEditingDevice(fresh);
        } catch (error: any) {
            alert('Connection failed: ' + error.message);
        } finally {
            setLoadingAccess(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingDevice || !editingDevice.email) return;
        const formData = new FormData(e.currentTarget);
        const password = formData.get('password') as string;
        if (!password) return;

        setLoadingAccess(true);
        try {
            await updateUserAuthCredentials(editingDevice.email, null, password);
            alert('Credentials updated successfully.');
            (e.target as HTMLFormElement).reset();
        } catch (error: any) {
            alert('Update failed: ' + error.message);
        } finally {
            setLoadingAccess(false);
        }
    };

    // Toggle a module on/off (on = give all its actions; off = remove)
    const handleToggleModule = useCallback((moduleId: string) => {
        setDevicePerms(prev => {
            const current = prev[moduleId] || [];
            if (current.length > 0) {
                // Turn off — remove module
                const next = { ...prev };
                delete next[moduleId];
                return next;
            } else {
                // Turn on — grant all actions for this module
                const allActions = ACTIONS.filter(a => a.modules.includes(moduleId)).map(a => a.id);
                return { ...prev, [moduleId]: allActions };
            }
        });
    }, []);

    // Toggle a single action within a module
    const handleToggleAction = useCallback((moduleId: string, actionId: string) => {
        setDevicePerms(prev => {
            const current = prev[moduleId] || [];
            const has = current.includes(actionId);
            const next = has ? current.filter(a => a !== actionId) : [...current, actionId];
            if (next.length === 0) {
                const updated = { ...prev };
                delete updated[moduleId];
                return updated;
            }
            return { ...prev, [moduleId]: next };
        });
    }, []);

    // Save device permissions to the DB
    const handleSavePermissions = async () => {
        if (!editingDevice) return;
        setSavingPerms(true);
        try {
            // Strip out joined/virtual fields that aren't actual columns on the devices table
            const { email: _email, department: _dept, ...deviceRow } = editingDevice as any;
            await upsertDevice({ ...deviceRow, permissions: devicePerms });
            setEditingDevice(prev => prev ? { ...prev, permissions: devicePerms } : prev);
            await loadData();
        } catch (error: any) {
            alert('Failed to save permissions: ' + error.message);
        } finally {
            setSavingPerms(false);
        }
    };

    const loadStaff = async () => {
        setLoadingStaff(true);
        try {
            const data = await fetchStaffMasters(true); // only active staff
            setStaffList(data);
        } catch (error) {
            console.error('Error loading staff:', error);
        } finally {
            setLoadingStaff(false);
        }
    };

    const handleAssignStaffDept = async (staffId: string, deptId: string | null) => {
        setUpdatingStaffId(staffId);
        try {
            await updateStaffMaster(staffId, {
                department_id: deptId || null
            });
            await loadStaff();
        } catch (error: any) {
            alert('Failed to update assignment: ' + error.message);
        } finally {
            setUpdatingStaffId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="spinner !w-8 !h-8 border-brand-500"></div>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Scanning Network Terminals...</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
                <div className="space-y-2">
                    <h1 className="text-4xl font-display font-black text-white uppercase tracking-tight leading-none flex items-center gap-4">
                        <MonitorSmartphone className="w-10 h-10 text-brand-500" />
                        Terminal Registry
                    </h1>
                    <p className="text-slate-500 font-medium text-sm max-w-xl">
                        Monitor authorized hardware endpoints and enforce regional terminal isolation policies across the network infrastructure.
                    </p>
                </div>
                {canManage && (
                    <>
                        <button
                            onClick={() => {
                                setEditingDevice({
                                    id: '',
                                    device_name: '',
                                    device_fingerprint: '',
                                    is_authorized: false,
                                    last_seen: null,
                                    created_at: new Date().toISOString()
                                } as Device);
                                setModalTab('IDENTITY');
                                setIsEditModalOpen(true);
                            }}
                            className="btn-primary"
                        >
                            Register New Terminal
                        </button>
                        <button
                            onClick={() => setIsDeptSettingsOpen(true)}
                            className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white hover:border-slate-700 transition-all flex items-center justify-center gap-2"
                        >
                            <Settings className="w-5 h-5 font-black" />
                            <span className="text-[11px] font-black uppercase tracking-widest leading-none">Settings</span>
                        </button>
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map((device) => (
                    <div key={device.id} className="surface-card p-8 border border-slate-800/10 hover:shadow-glow shadow-brand-500/5 transition-all group flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 shadow-lg shadow-brand-500/5 group-hover:scale-110 transition-transform">
                                        <MonitorSmartphone className="w-6 h-6" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h3 className="text-lg font-display font-black text-white uppercase tracking-tight">{device.device_name}</h3>
                                        <div className="font-mono text-[9px] text-slate-600 font-black uppercase tracking-widest leading-none">
                                            {device.device_fingerprint?.substring(0, 12)}...
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {device.is_authorized ? (
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                    ) : (
                                        <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3 mb-8">
                                <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <Wifi className="w-3.5 h-3.5 text-slate-600" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Network Status</span>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${device.is_authorized ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {device.is_authorized ? 'Authorized' : 'Restricted'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Credentials</span>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${device.user_id ? 'text-brand-400' : 'text-slate-600'}`}>
                                        {device.user_id ? 'Connected' : 'Offline'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500/40" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Department</span>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                                        {device.department?.name || 'Unassigned'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {canManage && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleEdit(device)}
                                    className="flex-1 p-3 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white hover:border-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                    Configure
                                </button>
                                <button
                                    onClick={() => handleDelete(device.id)}
                                    className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                {devices.length === 0 && (
                    <div className="col-span-full py-24 text-center surface-card border-dashed border-slate-800/50">
                        <p className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">No terminal nodes detected on the network.</p>
                    </div>
                )}
            </div>

            <Modal isOpen={isEditModalOpen} onClose={() => !submitting && setIsEditModalOpen(false)}>
                <div className="relative w-full max-w-4xl h-[860px] max-h-[94vh] bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden rounded-[2.5rem] animate-slide-down mx-auto mt-[5vh]">
                    {/* Fixed Header */}
                    <div className="px-10 py-10 bg-slate-900/50 border-b border-white/5 shrink-0">
                        <div className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-brand-500/10 rounded-[2rem] flex items-center justify-center border border-brand-500/20 shadow-glow shadow-brand-500/5">
                                    <Settings className="w-8 h-8 text-brand-500" />
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-display font-black text-white uppercase tracking-tight">
                                        Terminal Config
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-black text-brand-500 uppercase tracking-[0.2em]">{editingDevice?.device_name}</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-700" />
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Hardware Registry</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
                                {(['IDENTITY', 'ACCOUNT', 'PERMISSIONS'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setModalTab(tab)}
                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${modalTab === tab ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hidden">
                        {modalTab === 'IDENTITY' && (
                            <form onSubmit={handleSubmitIdentity} className="space-y-8 animate-fade-in">
                                <div className="p-8 bg-slate-900/40 rounded-[2rem] border border-slate-800/50 space-y-6">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Terminal Identity</label>
                                        <input
                                            name="device_name"
                                            defaultValue={editingDevice?.device_name}
                                            className="input-field !text-lg !font-display !font-black !uppercase"
                                            placeholder="e.g. TERMINAL-01"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Network Hash</label>
                                        {!editingDevice?.id ? (
                                            <input
                                                name="device_fingerprint"
                                                defaultValue={editingDevice?.device_fingerprint}
                                                className="input-field font-mono !text-[11px]"
                                                placeholder="Enter hardware fingerprint"
                                            />
                                        ) : (
                                            <div className="font-mono text-[11px] text-slate-400 break-all font-bold p-4 bg-slate-950/60 rounded-2xl border border-slate-800/50">
                                                {editingDevice?.device_fingerprint}
                                                <input type="hidden" name="device_fingerprint" value={editingDevice?.device_fingerprint} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Department</label>
                                        <select
                                            name="department_id"
                                            defaultValue={editingDevice?.department_id || ''}
                                            className="select-field"
                                        >
                                            <option value="">Unassigned</option>
                                            {departments.length === 0 && <option disabled value="">No departments found. Go to Settings to register.</option>}
                                            {departments.map(dept => (
                                                <option key={dept.id} value={dept.id}>{dept.name} {!dept.is_active ? '(Offline)' : ''} {dept.is_default ? '(Default)' : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Authorization Status</label>
                                        <select
                                            name="is_authorized"
                                            defaultValue={editingDevice?.is_authorized ? 'true' : 'false'}
                                            className="select-field"
                                        >
                                            <option value="true">Authorize (Allow Network Access)</option>
                                            <option value="false">Restrict (Deny Network Access)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button type="submit" disabled={submitting} className="btn-primary w-full py-4">
                                        {submitting ? 'Updating Registry...' : 'Save Configuration'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {modalTab === 'ACCOUNT' && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="p-8 bg-slate-900/40 rounded-[2rem] border border-slate-800/50">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Auth Account Connection</h4>
                                    {!editingDevice?.user_id ? (
                                        <form onSubmit={handleConnectAccount} className="space-y-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Supabase Email</label>
                                                <input name="email" type="email" required className="input-field" placeholder="terminal-auth@company.com" />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={loadingAccess}
                                                className="btn-primary w-full py-4 flex items-center justify-center gap-2"
                                            >
                                                {loadingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                                Link Terminal Account
                                            </button>
                                            <p className="text-[10px] text-slate-600 font-medium italic text-center">Important: The user account must exist in Authentication before linking.</p>
                                        </form>
                                    ) : (
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                                                <div className="flex items-center gap-3">
                                                    <Wifi className="w-4 h-4 text-emerald-500" />
                                                    <div className="space-y-0.5">
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Connected Identity</div>
                                                        <div className="text-[12px] font-bold text-white">{editingDevice.email}</div>
                                                    </div>
                                                </div>
                                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-2 py-1 bg-emerald-500/10 rounded-lg">Active</span>
                                            </div>

                                            <form onSubmit={handleUpdatePassword} className="space-y-4 pt-4 border-t border-white/5">
                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Update Password</h4>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">New Terminal Password</label>
                                                    <input name="password" type="password" required className="input-field" placeholder="••••••••" />
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={loadingAccess}
                                                    className="btn-ghost w-full py-4 border-brand-500/20 text-brand-400 hover:bg-brand-500 hover:text-white"
                                                >
                                                    {loadingAccess ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                                                    Update Credentials
                                                </button>
                                            </form>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {modalTab === 'PERMISSIONS' && (
                            <div className="space-y-4 animate-fade-in">
                                {/* Two-pane permissions matrix — device-level, no role linking */}
                                <div className="flex overflow-hidden rounded-[2rem] border border-slate-800/60 bg-slate-900/20 h-[420px]">

                                    {/* Left Pane: Module list with toggle */}
                                    <div className="w-52 border-r border-white/5 flex flex-col shrink-0 bg-slate-950/40">
                                        <div className="px-4 py-3 border-b border-white/5 shrink-0">
                                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Terminal Access Modules</p>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hidden p-2 space-y-5">
                                            {MODULE_CATEGORIES.map(cat => {
                                                const catModules = MODULES.filter(m => m.category === cat.id);
                                                return (
                                                    <div key={cat.id} className="space-y-1">
                                                        <div className="px-3 py-1 text-[8px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5 mb-1">
                                                            {cat.name}
                                                        </div>
                                                        {catModules.map(m => {
                                                            const isActive = (devicePerms[m.id] || []).length > 0;
                                                            const isSelected = selectedModuleId === m.id;
                                                            return (
                                                                <div
                                                                    key={m.id}
                                                                    onClick={() => setSelectedModuleId(m.id)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={e => { if (e.key === 'Enter') setSelectedModuleId(m.id); }}
                                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer group ${isSelected ? 'bg-brand-500/10 border border-brand-500/20 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'}`}
                                                                >
                                                                    <span className="text-[9px] font-black uppercase tracking-wider text-left">{m.name}</span>
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); handleToggleModule(m.id); }}
                                                                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 ${isActive ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' : 'bg-slate-800 text-slate-600 border border-slate-700 opacity-0 group-hover:opacity-100'}`}
                                                                    >
                                                                        {isActive ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Right Pane: Action toggles for selected module */}
                                    <div className="flex-1 flex flex-col min-w-0 bg-slate-900/40">
                                        {(() => {
                                            const module = MODULES.find(m => m.id === selectedModuleId);
                                            if (!module) return null;
                                            const moduleActions = ACTIONS.filter(a => a.modules.includes(module.id));
                                            const granted = devicePerms[module.id] || [];
                                            const isModuleActive = granted.length > 0;

                                            return (
                                                <div className="flex flex-col h-full">
                                                    {/* Module header */}
                                                    <div className="px-8 py-5 border-b border-white/5 shrink-0 flex items-center justify-between">
                                                        <div>
                                                            <div className="text-[11px] font-black text-white uppercase tracking-widest">{module.name}</div>
                                                            <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-0.5">
                                                                {isModuleActive ? `${granted.length} of ${moduleActions.length} protocols active` : 'No access granted'}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleToggleModule(module.id)}
                                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${isModuleActive ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20' : 'bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20'}`}
                                                        >
                                                            {isModuleActive ? 'Disable Module' : 'Enable All'}
                                                        </button>
                                                    </div>

                                                    {/* Action grid */}
                                                    <div className="flex-1 overflow-y-auto scrollbar-hidden p-6">
                                                        {moduleActions.length === 0 ? (
                                                            <div className="h-full flex items-center justify-center opacity-30">
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">No configurable actions for this module.</p>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {moduleActions.map(action => {
                                                                    const ok = granted.includes(action.id);
                                                                    return (
                                                                        <button
                                                                            key={action.id}
                                                                            onClick={() => handleToggleAction(module.id, action.id)}
                                                                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left active:scale-95 ${ok ? 'bg-brand-500/10 border-brand-500/20 text-slate-100 shadow-glow shadow-brand-500/5' : 'bg-slate-950/20 border-slate-800/40 text-slate-600 hover:border-slate-700 hover:text-slate-400'}`}
                                                                        >
                                                                            {ok
                                                                                ? <CheckCircle className="w-4 h-4 text-brand-500 shrink-0" />
                                                                                : <X className="w-4 h-4 text-slate-700 shrink-0" />}
                                                                            <span className="text-[10px] font-black uppercase tracking-wider">{action.name}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Save bar */}
                                <div className="flex items-center justify-between px-2">
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                        {Object.keys(devicePerms).length} module{Object.keys(devicePerms).length !== 1 ? 's' : ''} active · Changes are not saved until you click Save
                                    </p>
                                    <button
                                        onClick={handleSavePermissions}
                                        disabled={savingPerms}
                                        className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        {savingPerms ? 'Saving…' : 'Save Permissions'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Fixed Footer */}
                    <div className="px-10 py-8 bg-slate-900/50 border-t border-white/5 shrink-0 flex justify-end">
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 border border-white/5"
                        >
                            Close Protocol
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Department Settings Modal */}
            <Modal isOpen={isDeptSettingsOpen} onClose={() => setIsDeptSettingsOpen(false)}>
                <div className="relative w-full max-w-4xl h-[700px] max-h-[90vh] bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden rounded-[2.5rem] animate-slide-down mx-auto mt-[5vh]">
                    <div className="px-10 py-8 bg-slate-900/50 border-b border-white/5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="w-12 h-12 bg-brand-500/10 rounded-2xl flex items-center justify-center border border-brand-500/20">
                                <Settings className="w-6 h-6 text-brand-500" />
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-xl font-display font-black text-white uppercase tracking-tight">System Configuration</h2>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Global Registry</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60 ml-auto mr-6">
                            {(['DEPARTMENTS', 'ASSIGN_STAFF'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setDeptModalTab(tab);
                                        if (tab === 'ASSIGN_STAFF') loadStaff();
                                    }}
                                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${deptModalTab === tab ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {tab === 'DEPARTMENTS' ? 'Departments' : 'Assign Staff'}
                                </button>
                            ))}
                        </div>

                        {deptModalTab === 'DEPARTMENTS' && (
                            <button
                                onClick={() => setEditingDept({ name: '', is_active: true, is_default: false })}
                                className="btn-primary py-3 !text-[10px]"
                            >
                                Add Department
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hidden">
                        {deptModalTab === 'DEPARTMENTS' ? (
                            <>
                                {editingDept && (
                                    <div className="p-8 bg-brand-500/5 rounded-[2rem] border border-brand-500/10 space-y-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-[10px] font-black text-brand-500 uppercase tracking-widest tracking-[0.2em]">{editingDept.id ? 'Modify Parameters' : 'Register New Entity'}</h3>
                                            <button onClick={() => setEditingDept(null)}><X className="w-4 h-4 text-slate-600 hover:text-white" /></button>
                                        </div>
                                        <form onSubmit={async (e) => {
                                            e.preventDefault();
                                            const fd = new FormData(e.currentTarget);
                                            try {
                                                await upsertDeviceDepartment({
                                                    ...editingDept,
                                                    name: fd.get('name') as string,
                                                    is_active: fd.get('is_active') === 'true',
                                                    is_default: fd.get('is_default') === 'true',
                                                    eligible_for_session_posting: fd.get('eligible_for_session_posting') === 'true'
                                                });
                                                const fresh = await fetchDeviceDepartments();
                                                setDepartments(fresh);
                                                setEditingDept(null);
                                            } catch (err: any) { alert(err.message); }
                                        }} className="grid grid-cols-4 gap-4 items-end">
                                            <div className="col-span-2 space-y-1">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Department Name</label>
                                                <input name="name" defaultValue={editingDept.name} required className="input-field !py-3" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Status</label>
                                                <select name="is_active" defaultValue={editingDept.is_active ? 'true' : 'false'} className="select-field !py-3">
                                                    <option value="true">Active</option>
                                                    <option value="false">Offline</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Posting Audit</label>
                                                <select name="eligible_for_session_posting" defaultValue={editingDept.eligible_for_session_posting ? 'true' : 'false'} className="select-field !py-3">
                                                    <option value="true">Eligible</option>
                                                    <option value="false">Restricted</option>
                                                </select>
                                            </div>
                                            <button type="submit" className="btn-primary py-3">Persist Change</button>
                                        </form>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-2">
                                    <div className="grid grid-cols-12 px-6 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5 mb-2">
                                        <div className="col-span-4">Department Identity</div>
                                        <div className="col-span-2 text-center">Status</div>
                                        <div className="col-span-2 text-center">Usage</div>
                                        <div className="col-span-2 text-center">Protocol</div>
                                        <div className="col-span-2 text-right">Actions</div>
                                    </div>
                                    {departments.map(dept => (
                                        <div key={dept.id} className="grid grid-cols-12 items-center px-6 py-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl hover:border-brand-500/30 transition-all">
                                            <div className="col-span-4 flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                                <span className="text-[11px] font-bold text-white uppercase">{dept.name}</span>
                                                {dept.is_default && <span className="text-[8px] font-black bg-brand-500/20 text-brand-400 px-2 py-0.5 rounded-md uppercase tracking-tighter">Default</span>}
                                                {dept.eligible_for_session_posting && (
                                                    <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md uppercase tracking-tighter">Audit Eligible</span>
                                                )}
                                            </div>
                                            <div className="col-span-2 text-center">
                                                <button
                                                    onClick={async () => {
                                                        await upsertDeviceDepartment({ ...dept, is_active: !dept.is_active });
                                                        const fresh = await fetchDeviceDepartments();
                                                        setDepartments(fresh);
                                                    }}
                                                    className={`text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest transition-all ${dept.is_active ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}
                                                >
                                                    {dept.is_active ? 'Active' : 'Offline'}
                                                </button>
                                            </div>
                                            <div className="col-span-2 text-center">
                                                <button
                                                    onClick={async () => {
                                                        if (loadingDeptUsage === dept.id) return;
                                                        setLoadingDeptUsage(dept.id);
                                                        try {
                                                            const usedDevices = await fetchDevicesByDepartment(dept.id);
                                                            setDeptUsage(prev => ({ ...prev, [dept.id]: usedDevices }));
                                                        } finally { setLoadingDeptUsage(null); }
                                                    }}
                                                    className="text-[9px] font-black text-brand-400 hover:text-brand-300 underline underline-offset-4 uppercase tracking-widest"
                                                >
                                                    {loadingDeptUsage === dept.id ? 'Scanning...' : `${deptUsage[dept.id]?.length || 0} Nodes`}
                                                </button>
                                            </div>
                                            <div className="col-span-2 text-center">
                                                <button
                                                    onClick={async () => {
                                                        await upsertDeviceDepartment({ ...dept, is_default: true });
                                                        const fresh = await fetchDeviceDepartments();
                                                        setDepartments(fresh);
                                                    }}
                                                    disabled={dept.is_default}
                                                    className={`text-[9px] font-black uppercase tracking-widest ${dept.is_default ? 'text-slate-700' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    {dept.is_default ? 'System Default' : 'Set Default'}
                                                </button>
                                            </div>
                                            <div className="col-span-2 text-right">
                                                <button
                                                    onClick={() => setEditingDept(dept)}
                                                    className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-500 hover:text-white"
                                                >
                                                    <Settings className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="grid grid-cols-12 px-6 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5 mb-2">
                                        <div className="col-span-5">Staff Member</div>
                                        <div className="col-span-4">Assigned Department</div>
                                        <div className="col-span-3 text-right">Action</div>
                                    </div>

                                    {loadingStaff ? (
                                        <div className="col-span-full py-12 flex flex-col items-center justify-center gap-3">
                                            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scanning Personnel...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-12">
                                            {/* Grouped by Department */}
                                            {departments.map(dept => {
                                                const deptStaff = staffList.filter(s => s.department_id === dept.id);
                                                if (deptStaff.length === 0) return null;

                                                return (
                                                    <div key={dept.id} className="space-y-4">
                                                        <div className="flex items-center gap-3 px-2">
                                                            <div className="w-2 h-2 rounded-full bg-brand-500" />
                                                            <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">{dept.name}</h3>
                                                            <div className="flex-1 h-px bg-slate-800/50" />
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{deptStaff.length} Nodes</span>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {deptStaff.map(s => (
                                                                <div key={s.id} className="grid grid-cols-12 items-center px-6 py-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl hover:border-brand-500/30 transition-all">
                                                                    <div className="col-span-5 flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500 font-black text-xs border border-brand-500/20">
                                                                            {s.full_name?.charAt(0)}
                                                                        </div>
                                                                        <div className="space-y-0.5">
                                                                            <span className="text-[11px] font-bold text-white uppercase block">{s.full_name}</span>
                                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{s.staff_code}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="col-span-4">
                                                                        <select
                                                                            className="select-field !py-2 !text-[10px] !bg-slate-950/60"
                                                                            value={s.department_id || ''}
                                                                            onChange={(e) => handleAssignStaffDept(s.id, e.target.value)}
                                                                            disabled={updatingStaffId === s.id}
                                                                        >
                                                                            <option value="">Unassigned</option>
                                                                            {departments.map(d => (
                                                                                <option key={d.id} value={d.id}>{d.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div className="col-span-3 text-right">
                                                                        {updatingStaffId === s.id ? (
                                                                            <Loader2 className="w-4 h-4 text-brand-500 animate-spin ml-auto" />
                                                                        ) : (
                                                                            <div className="flex items-center justify-end gap-2">
                                                                                <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md uppercase tracking-tight">Active Map</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Unassigned / Floating */}
                                            {(() => {
                                                const floatingStaff = staffList.filter(s => !s.department_id);
                                                if (floatingStaff.length === 0) return null;

                                                return (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3 px-2">
                                                            <div className="w-2 h-2 rounded-full bg-slate-700" />
                                                            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Floating Personnel</h3>
                                                            <div className="flex-1 h-px bg-slate-800/50" />
                                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{floatingStaff.length} Nodes</span>
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            {floatingStaff.map(s => (
                                                                <div key={s.id} className="grid grid-cols-12 items-center px-6 py-4 bg-slate-950/20 border border-slate-800/50 rounded-2xl border-dashed hover:border-brand-500/30 transition-all">
                                                                    <div className="col-span-5 flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 font-black text-xs border border-slate-700">
                                                                            {s.full_name?.charAt(0)}
                                                                        </div>
                                                                        <div className="space-y-0.5">
                                                                            <span className="text-[11px] font-bold text-slate-400 uppercase block">{s.full_name}</span>
                                                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{s.staff_code}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="col-span-4">
                                                                        <select
                                                                            className="select-field !py-2 !text-[10px] !bg-slate-950/60"
                                                                            value={s.department_id || ''}
                                                                            onChange={(e) => handleAssignStaffDept(s.id, e.target.value)}
                                                                            disabled={updatingStaffId === s.id}
                                                                        >
                                                                            <option value="">Unassigned</option>
                                                                            {departments.map(d => (
                                                                                <option key={d.id} value={d.id}>{d.name}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div className="col-span-3 text-right">
                                                                        {updatingStaffId === s.id ? (
                                                                            <Loader2 className="w-4 h-4 text-brand-500 animate-spin ml-auto" />
                                                                        ) : (
                                                                            <div className="flex items-center justify-end gap-2">
                                                                                <span className="text-[8px] font-black bg-slate-800 text-slate-600 px-2 py-1 rounded-md uppercase tracking-tight">Floating</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {!loadingStaff && staffList.length === 0 && (
                                                <div className="col-span-full py-12 text-center surface-card border-dashed border-slate-800/50">
                                                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No active personnel detected.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="px-10 py-6 bg-slate-900/50 border-t border-white/5 flex justify-end shrink-0">
                        <button onClick={() => setIsDeptSettingsOpen(false)} className="px-6 py-3 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5">Close Policy</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
