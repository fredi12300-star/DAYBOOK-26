import { useState, useEffect } from 'react';
import {
    Settings, RefreshCw, AlertTriangle,
    ShieldAlert, CheckCircle2, Zap,
    Calendar, Lock, Unlock, Globe,
    ChevronRight, ArrowRight, Building2, MapPin,
    Phone, Mail, User, Save, Landmark, AlertCircle, Target, ShieldCheck,
    Clock, History, Pencil, X as XIcon, Filter, Upload as UploadIcon
} from 'lucide-react';
import {
    clearAllData, seedSampleData, resetUserManagement,
    fetchFinancialYears, fetchSystemConfig,
    updateSystemConfig, upsertFinancialYear,
    carryForwardBalances, fetchTrialBalance,
    toggleFinancialYearStatus, fetchLedgers, fetchLedgerTags,
    upsertLedger, updateBusinessDate, fetchSystemDateLogs, uploadBusinessLogo
} from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../lib/auth';
import { FinancialYear, SystemConfiguration, SystemDateLog, TrialBalanceRow, Ledger, LedgerTag } from '../types/accounting';
import { formatDateDMY, formatNumber, getTodayDate } from '../lib/validation';
import Modal from './ui/Modal';
import { getBusinessDate, setBusinessDateOverride, formatBusinessDateDisplay, onBusinessDateChange } from '../lib/businessDate';

interface SystemSettingsProps {
    config: SystemConfiguration | null;
    onConfigUpdate: (config: SystemConfiguration | null) => void;
}

const SystemSettings = ({ config: propConfig, onConfigUpdate }: SystemSettingsProps) => {
    const { isSuperAdmin, canExecute } = useAuth();
    const [isResetting, setIsResetting] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [success, setSuccess] = useState(false);
    const [seedSuccess, setSeedSuccess] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [showUserResetModal, setShowUserResetModal] = useState(false);
    const [userResetConfirmText, setUserResetConfirmText] = useState('');
    const [isUserResetting, setIsUserResetting] = useState(false);
    const [view, setView] = useState<'index' | 'fy-management' | 'profile' | 'permissions' | 'system-date'>('index');
    const [profileTab, setProfileTab] = useState<'business' | 'banks' | 'operations'>('business');
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [editingBankId, setEditingBankId] = useState<string | null>(null);
    const [bankForm, setBankForm] = useState<Partial<Ledger>>({});
    const [profileForm, setProfileForm] = useState<Partial<SystemConfiguration>>({});
    const [isEditingBank, setIsEditingBank] = useState(false);

    // System Config
    const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
    const [config, setConfig] = useState<SystemConfiguration | null>(propConfig);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [savingConfig, setSavingConfig] = useState(false);

    // Synchronize local config with propConfig when it changes (polling or other updates)
    useEffect(() => {
        if (propConfig) {
            setConfig(propConfig);
            if (!profileForm.id) {
                setProfileForm(propConfig);
            }
        }
    }, [propConfig]);

    // Rollover State
    const [showRolloverModal, setShowRolloverModal] = useState(false);
    const [showAddFYModal, setShowAddFYModal] = useState(false);
    const [rolloverBalances, setRolloverBalances] = useState<TrialBalanceRow[]>([]);
    const [loadingBalances, setLoadingBalances] = useState(false);
    const [shouldCarryForward, setShouldCarryForward] = useState(true);

    const [newFYData, setNewFYData] = useState({
        name: '',
        start_date: '',
        end_date: ''
    });

    // System Date Override State
    const [isEditingDate, setIsEditingDate] = useState(false);
    const [editedDate, setEditedDate] = useState('');
    const [dateChangeReason, setDateChangeReason] = useState('');
    const [savingDate, setSavingDate] = useState(false);
    const [dateLogs, setDateLogs] = useState<SystemDateLog[]>([]);
    const [loadingDateLogs, setLoadingDateLogs] = useState(false);
    const [logFilterStart, setLogFilterStart] = useState('');
    const [logFilterEnd, setLogFilterEnd] = useState('');

    const getNaturalFY = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-11

        let startYear, endYear;
        if (month >= 3) {
            startYear = year;
            endYear = year + 1;
        } else {
            startYear = year - 1;
            endYear = year;
        }

        return {
            name: `FY ${startYear}-${String(endYear).slice(2)}`,
            start_date: `${startYear}-04-01`,
            end_date: `${endYear}-03-31`
        };
    };

    useEffect(() => {
        loadSystemConfig();

        // Subscribe to business date changes for real-time UI sync
        const unsubscribe = onBusinessDateChange((newDate) => {
            setConfig(prev => prev ? { ...prev, business_date: newDate } : null);
            if (view === 'system-date') {
                setEditedDate(newDate || '');
            }
        });

        return () => unsubscribe();
    }, [view]);

    async function loadSystemConfig() {
        setLoadingConfig(true);
        try {
            const [years, settings, l, t] = await Promise.all([
                fetchFinancialYears(),
                fetchSystemConfig(),
                fetchLedgers(true),
                fetchLedgerTags()
            ]);
            setFinancialYears(years);
            setLedgers(l);
            setTags(t);
            if (settings) {
                setConfig(settings);
                setProfileForm(settings);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        } finally {
            setLoadingConfig(false);
        }
    }

    async function initializeSystem() {
        setSavingConfig(true);
        try {
            const natural = getNaturalFY();
            const newFY = await upsertFinancialYear(natural);
            setFinancialYears([newFY, ...financialYears]);

            const newConfig = await updateSystemConfig({
                current_financial_year_id: newFY.id
            } as any);

            setConfig(newConfig);
            onConfigUpdate(newConfig);
            toast.success(`System initialized for ${newFY.name}`);
        } catch (error) {
            console.error('Initialization failed:', error);
            toast.error("Failed to initialize system");
        } finally {
            setSavingConfig(false);
        }
    }

    async function openRolloverModal() {
        if (!config?.current_fy) return;

        // Pre-calculate next FY defaults
        const current = config.current_fy;
        const nameParts = current.name.split(' ');
        let nextName = "Next FY";
        if (nameParts.length === 2 && nameParts[1].includes('-')) {
            const years = nameParts[1].split('-');
            const y1 = parseInt(years[0]) + 1;
            const y2 = parseInt(years[1]) + 1;
            nextName = `FY ${y1}-${y2}`;
        }

        const nextStart = new Date(current.start_date);
        nextStart.setFullYear(nextStart.getFullYear() + 1);

        const nextEnd = new Date(current.end_date);
        nextEnd.setFullYear(nextEnd.getFullYear() + 1);

        setNewFYData({
            name: nextName,
            start_date: nextStart.toISOString().split('T')[0],
            end_date: nextEnd.toISOString().split('T')[0]
        });

        setShowRolloverModal(true);
        setLoadingBalances(true);
        try {
            // Fetch for all closing up to current FY end
            const allTb = await fetchTrialBalance('', current.end_date, false);
            // Only show ledgers in rollover preview
            const tb = allTb.filter(r => r.node_type === 'LEDGER');
            setRolloverBalances(tb);
        } catch (error) {
            console.error('Failed to load balances:', error);
            toast.error("Could not fetch ledger balances");
        } finally {
            setLoadingBalances(false);
        }
    }

    async function handleCreateNextFY() {
        if (!config?.current_fy) return;
        if (!newFYData.name || !newFYData.start_date || !newFYData.end_date) {
            toast.error("Please fill all FY details");
            return;
        }

        setSavingConfig(true);
        try {
            // Carry forward logic if enabled
            if (shouldCarryForward) {
                await carryForwardBalances(config.current_fy.end_date);
                toast.success("Balances carried forward successfully");
            }

            // Create the next FY
            const nextFY = await upsertFinancialYear(newFYData);

            // Finalize the current FY (close it by setting is_closed to true)
            const closedCurrentFY = await toggleFinancialYearStatus(config.current_fy.id, true);

            // Update local state: add new FY and update the closed one
            setFinancialYears(prev => [
                nextFY,
                ...prev.map(fy => fy.id === closedCurrentFY.id ? closedCurrentFY : fy)
            ]);

            // Auto-switch to next FY
            const updatedConfig = await updateSystemConfig({
                ...config,
                current_financial_year_id: nextFY.id
            });
            setConfig(updatedConfig);
            onConfigUpdate(updatedConfig);


            toast.success(`Successfully rolled over to ${nextFY.name}. Previous year finalized.`);
            setShowRolloverModal(false);
        } catch (error) {
            console.error('Rollover failed:', error);
            toast.error("Failed to create next Financial Year");
        } finally {
            setSavingConfig(false);
        }
    }

    async function handleUpdateConfig(updates: Partial<SystemConfiguration>) {
        if (!isSuperAdmin && !canExecute('role_mgmt', 'manage_org')) {
            toast.error("Unauthorized: Insufficient privileges to update core configuration");
            return;
        }
        setSavingConfig(true);
        try {
            console.log('--- SYSTEM CONFIG UPDATE START ---');
            console.log('Payload:', updates);
            const payload = config ? { ...config, ...updates } : updates;
            const updated = await updateSystemConfig(payload);
            console.log('Response:', updated);
            setConfig(updated);
            onConfigUpdate(updated); // Notify parent Sidebar/App
            toast.success("Settings updated successfully");
        } catch (error: any) {
            console.error('--- SYSTEM CONFIG UPDATE FAILED ---');
            console.error('Error Details:', error);
            toast.error(error.message || "Failed to update settings");
        } finally {
            setSavingConfig(false);
        }
    }

    async function handleUpdateBankLedger(ledgerId: string, updates: Partial<Ledger>) {
        setSavingConfig(true);
        try {
            const currentLedger = ledgers.find(l => l.id === ledgerId);
            if (!currentLedger) return;

            const finalUpdates = { ...updates };
            if (finalUpdates.sib_rap_prefix) {
                finalUpdates.sib_rap_prefix = finalUpdates.sib_rap_prefix.toUpperCase().replace(/-+$/, '');
            }

            const updated = await upsertLedger({ ...currentLedger, ...finalUpdates });
            setLedgers(prev => prev.map(l => l.id === ledgerId ? updated : l));
            setIsEditingBank(false);
            toast.success('Bank details saved successfully');
        } catch (error: any) {
            console.error('Bank update failed:', error);
            toast.error(error.message || "Failed to update bank details");
        } finally {
            setSavingConfig(false);
        }
    }

    async function handleAddFY() {
        if (!newFYData.name || !newFYData.start_date || !newFYData.end_date) {
            toast.error("Please fill all fields");
            return;
        }

        setSavingConfig(true);
        try {
            const fy = await upsertFinancialYear(newFYData);
            setFinancialYears(prev => [fy, ...prev]);

            // If first one, make it active
            if (financialYears.length === 0 || !config?.current_financial_year_id) {
                const updatedConfig = await updateSystemConfig({
                    ...config,
                    current_financial_year_id: fy.id
                } as any);
                setConfig(updatedConfig);
                onConfigUpdate(updatedConfig);
            }

            toast.success(`Added ${fy.name}`);
            setShowAddFYModal(false);
            setNewFYData({ name: '', start_date: '', end_date: '' });
        } catch (error) {
            console.error('Add FY failed:', error);
            toast.error("Failed to add Financial Year");
        } finally {
            setSavingConfig(false);
        }
    }

    async function handleToggleFYStatus(id: string, currentStatus: boolean) {
        setSavingConfig(true);
        try {
            const updated = await toggleFinancialYearStatus(id, !currentStatus);
            setFinancialYears(prev => prev.map(fy => fy.id === updated.id ? updated : fy));

            // If the year being toggled is the active one, refresh config
            if (config?.current_financial_year_id === id) {
                const refreshed = await fetchSystemConfig();
                setConfig(refreshed);
                onConfigUpdate(refreshed);
            }

            toast.success(`Financial Year ${updated.name} is now ${updated.is_closed ? 'CLOSED (Read-Only)' : 'OPEN'}`);
        } catch (error) {
            console.error('Toggle failed:', error);
            toast.error("Failed to update status");
        } finally {
            setSavingConfig(false);
        }
    }

    const handleReset = async () => {
        if (!isSuperAdmin) {
            toast.error("Critical: Factory Reset restricted to Super Admin only");
            return;
        }
        if (confirmText !== 'RESET') return;
        setIsResetting(true);
        try {
            await clearAllData();
            setSuccess(true);
            setShowConfirm(false);
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error('Reset failed:', error);
            alert('Reset failed. Check console for details.');
        } finally {
            setIsResetting(false);
        }
    };

    const handleSeed = async () => {
        if (!isSuperAdmin) {
            toast.error("Unauthorized: Sample generation restricted to Super Admin only");
            return;
        }
        setIsSeeding(true);
        try {
            await seedSampleData();
            setSeedSuccess(true);
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error('Seeding failed:', error);
            alert('Sample generation failed. Check console.');
        } finally {
            setIsSeeding(false);
        }
    };

    const loadSystemDateLogs = async () => {
        setLoadingDateLogs(true);
        try {
            const logs = await fetchSystemDateLogs({
                startDate: logFilterStart || undefined,
                endDate: logFilterEnd || undefined
            });
            setDateLogs(logs);
        } catch (error) {
            console.error('Failed to load system date logs:', error);
            toast.error('Could not load audit logs');
        } finally {
            setLoadingDateLogs(false);
        }
    };

    useEffect(() => {
        if (view === 'system-date') {
            loadSystemDateLogs();
            if (config?.business_date) {
                setEditedDate(config.business_date);
            }
        }
    }, [view, logFilterStart, logFilterEnd, config?.business_date]);

    const handleSystemDateSave = async () => {
        if (!isSuperAdmin && !canExecute('role_mgmt', 'manage_org')) {
            toast.error("Unauthorized: System Date override restricted to authorized administrators");
            return;
        }
        if (!editedDate) {
            toast.error('Please select a date');
            return;
        }

        setSavingDate(true);
        try {
            // 1. Validation
            if (isNaN(new Date(editedDate).getTime())) {
                toast.error('Please select a valid date');
                return;
            }

            if (!dateChangeReason.trim()) {
                toast.error('Audit reason is required');
                return;
            }

            // 2. Database Sync
            const updatedConfig = await updateBusinessDate(editedDate, dateChangeReason);

            // 3. UI/State Refresh
            setConfig(updatedConfig);
            onConfigUpdate(updatedConfig); // Notify parent
            setBusinessDateOverride(editedDate);
            setDateChangeReason('');
            setIsEditingDate(false);

            toast.success('System Date updated successfully');
            loadSystemDateLogs();
        } catch (error: any) {
            console.error('SYSTEM_DATE_OVERRIDE_ERROR:', error);
            const msg = error.message || 'Database connection error';
            toast.error(`Sync Failed: ${msg}`);

            if (msg.includes('PGRST205')) {
                toast.error('Schema cache delay. Please try again in 5 seconds or refresh.', { duration: 6000 });
            }
        } finally {
            setSavingDate(false);
        }
    };

    const handleSystemDateClear = async () => {
        setSavingDate(true);
        try {
            const updatedConfig = await updateBusinessDate(null, 'Cleared override');
            setConfig(updatedConfig);
            onConfigUpdate(updatedConfig); // Notify parent
            setBusinessDateOverride(null);
            setEditedDate('');
            setDateChangeReason('');
            setIsEditingDate(false);
            toast.success('System Date restored to Current Date');
            loadSystemDateLogs();
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Failed to clear system date');
        } finally {
            setSavingDate(false);
        }
    };

    const handleUserReset = async () => {
        if (!isSuperAdmin) {
            toast.error("Critical: Reset restricted to Super Admin only");
            return;
        }
        if (userResetConfirmText !== 'RESET USER MANAGEMENT') return;
        setIsUserResetting(true);
        try {
            const result = await resetUserManagement(userResetConfirmText);

            if (result.success) {
                toast.success('User Management reset successfully');
                console.log('Reset Stats:', result.stats);
                setShowUserResetModal(false);
                setUserResetConfirmText('');
                // Reload to reflect changes in staff/user lists
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                console.error('Reset failed:', result.error);
                toast.error(result.error || 'Reset failed');
            }
        } catch (error: any) {
            console.error('Reset failed:', error);
            toast.error(error.message || 'Reset failed');
        } finally {
            setIsUserResetting(false);
        }
    };

    const isYearEnd = config?.current_fy && new Date(getBusinessDate()) > new Date(config.current_fy.end_date);

    return (
        <div className={`max-w-4xl mx-auto space-y-10 py-6 transition-opacity duration-200 ${loadingConfig ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-3xl font-display font-black uppercase tracking-tight text-white flex items-center gap-4">
                        {view === 'index' ? 'Core Settings' : view === 'profile' ? 'Business Profile' : view === 'permissions' ? 'Permissions' : 'FY Management'}
                        {savingConfig && <RefreshCw size={20} className="text-brand-500 animate-spin" />}
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">
                        {view === 'index'
                            ? 'Enterprise-grade engine configurations and data management.'
                            : view === 'profile'
                                ? 'Manage institutional identity and financial touchpoints.'
                                : view === 'permissions'
                                    ? 'Configure feature access and system visibility.'
                                    : 'Manage financial periods, audit policies, and immutability.'}
                    </p>
                </div>
                {view !== 'index' && (
                    <button
                        type="button"
                        onClick={() => setView('index')}
                        className="px-5 py-2.5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-slate-700 active:scale-95"
                    >
                        &larr; Back to Index
                    </button>
                )}
            </div>

            {view === 'index' ? (
                /* Index View: High-level selection cards */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* FY Management Gateway */}
                    <button
                        type="button"
                        onClick={() => setView('fy-management')}
                        className="surface-card p-10 text-left hover:border-brand-500/30 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-brand-500/10 rounded-2xl text-brand-500 group-hover:scale-110 transition-transform">
                                <Calendar size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-white">FY Management</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Period & Audit Controls</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pr-12">
                            Configure financial periods, historical boundaries, and backdated posting policies.
                        </p>
                        <ArrowRight size={24} className="absolute bottom-10 right-10 text-slate-800 group-hover:text-brand-500 group-hover:translate-x-2 transition-all opacity-40 group-hover:opacity-100" />
                    </button>

                    {/* Profile & Identity Card */}
                    <button
                        type="button"
                        onClick={() => setView('profile')}
                        className="surface-card p-10 text-left hover:border-emerald-500/30 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover:scale-110 transition-transform">
                                <Building2 size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-white">Profile</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Institutional Identity</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pr-12">
                            Define business details, contact information, and audit-ready bank account list.
                        </p>
                        <ArrowRight size={24} className="absolute bottom-10 right-10 text-slate-800 group-hover:text-emerald-500 group-hover:translate-x-2 transition-all opacity-40 group-hover:opacity-100" />
                    </button>

                    {/* System Date Card */}
                    <button
                        type="button"
                        onClick={() => setView('system-date')}
                        className="surface-card p-10 text-left hover:border-amber-500/30 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500 group-hover:scale-110 transition-transform">
                                <Clock size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-white">System Date</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Time Travel & Audit</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pr-12">
                            Override the active business date for retroactive posting and view the compliance audit log.
                        </p>
                        <ArrowRight size={24} className="absolute bottom-10 right-10 text-slate-800 group-hover:text-amber-500 group-hover:translate-x-2 transition-all opacity-40 group-hover:opacity-100" />
                    </button>

                    {/* Permissions & Security Card */}
                    <button
                        type="button"
                        onClick={() => {
                            setView('permissions');
                            setProfileTab('operations');
                        }}
                        className="surface-card p-10 text-left hover:border-brand-400/30 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-brand-400/10 rounded-2xl text-brand-400 group-hover:scale-110 transition-transform">
                                <Lock size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-white">Permissions</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Feature Visibility</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pr-12">
                            Enable or disable high-level application modules and specialized workflows.
                        </p>
                        <ArrowRight size={24} className="absolute bottom-10 right-10 text-slate-800 group-hover:text-brand-400 group-hover:translate-x-2 transition-all opacity-40 group-hover:opacity-100" />
                    </button>

                    {/* Data & Maintenance Card */}
                    {isSuperAdmin && (
                        <div className="surface-card p-10 flex flex-col justify-between">
                            <div className="flex items-center gap-6 mb-8">
                                <div className="p-4 bg-slate-800 rounded-2xl text-slate-400">
                                    <ShieldAlert size={32} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-widest text-white">Maintenance</h3>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Data & Destruction</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <button
                                    type="button"
                                    onClick={handleSeed}
                                    disabled={isSeeding || isResetting}
                                    className="w-full p-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-brand-500/20 transition-all flex items-center justify-between group disabled:opacity-30"
                                >
                                    <div className="flex items-center gap-3">
                                        <Zap size={16} className="text-brand-500" />
                                        Generate Sample Data
                                    </div>
                                    <RefreshCw size={14} className={isSeeding ? 'animate-spin' : ''} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(true)}
                                    disabled={isSeeding || isResetting}
                                    className="w-full p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-between group disabled:opacity-30"
                                >
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle size={16} />
                                        Factory Reset
                                    </div>
                                    <RefreshCw size={14} className={isResetting ? 'animate-spin' : ''} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowUserResetModal(true)}
                                    disabled={isSeeding || isResetting || isUserResetting}
                                    className="w-full p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-orange-500/60 hover:text-orange-500 hover:bg-orange-500/10 transition-all flex items-center justify-between group disabled:opacity-30"
                                >
                                    <div className="flex items-center gap-3">
                                        <ShieldAlert size={16} />
                                        Reset User Management
                                    </div>
                                    <RefreshCw size={14} className={isUserResetting ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="md:col-span-2 p-8 border border-dashed border-slate-800 rounded-[2.5rem] flex items-center justify-center">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">More core settings coming soon</p>
                    </div>
                </div>
            ) : view === 'fy-management' ? (
                /* Detail View: FY Management Workspace */
                <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                    {/* Rollover Alert (NEW) */}
                    {isYearEnd && (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl flex items-center gap-6 animate-pulse">
                            <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500">
                                <AlertCircle size={24} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-black uppercase tracking-widest text-amber-500">Year-End Detected</h4>
                                <p className="text-[10px] font-bold text-amber-500/60 uppercase mt-1">The current date is outside your active Financial Year. Please click "Next FY" below to rollover.</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Financial Year Selection */}
                        <div className="surface-card p-10 space-y-8">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-brand-500">
                                    <Calendar size={24} />
                                    <h3 className="text-sm font-black uppercase tracking-widest">Financial Year</h3>
                                </div>
                                {config?.current_fy?.is_closed ? (
                                    <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2">
                                        <Lock size={10} /> Closed
                                    </div>
                                ) : (
                                    <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2">
                                        <Unlock size={10} /> Active
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Active Period</label>
                                    <select
                                        value={config?.current_financial_year_id || ''}
                                        onChange={(e) => handleUpdateConfig({ current_financial_year_id: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-xs font-bold text-slate-300 focus:border-brand-500 outline-none transition-all"
                                    >
                                        {financialYears.length === 0 ? (
                                            <option value="">No Financial Years Defined</option>
                                        ) : (
                                            <>
                                                {!config?.current_financial_year_id && <option value="">-- Select Active Year --</option>}
                                                {financialYears.map(fy => (
                                                    <option key={fy.id} value={fy.id}>{fy.name} ({new Date(fy.start_date).getFullYear()} - {new Date(fy.end_date).getFullYear()})</option>
                                                ))}
                                            </>
                                        )}
                                    </select>
                                </div>

                                {financialYears.length === 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={initializeSystem}
                                            className="px-6 py-4 bg-brand-600/10 border border-brand-500/20 text-brand-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all shadow-glow shadow-brand-500/10 flex flex-col items-center justify-center gap-1 group"
                                        >
                                            <span className="group-hover:text-white">Auto-Initialize</span>
                                            <span className="text-[8px] opacity-60 font-bold group-hover:text-white/80">{getNaturalFY().name}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddFYModal(true)}
                                            className="px-6 py-4 bg-slate-800 border border-slate-700 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-2"
                                        >
                                            <Settings size={14} /> Manual Setup
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                                    <Globe size={18} className="text-slate-500" />
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Default Boundaries</p>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">
                                            {config?.current_fy ? `${formatDateDMY(config.current_fy.start_date)} to ${formatDateDMY(config.current_fy.end_date)}` : 'Not Set'}
                                        </p>
                                    </div>
                                    {config?.current_fy && (
                                        <button
                                            type="button"
                                            onClick={openRolloverModal}
                                            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all border border-slate-700 hover:border-white shrink-0"
                                        >
                                            Next FY <ChevronRight size={10} className="inline ml-1" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Audit Policies */}
                        <div className="surface-card p-10 space-y-8">
                            <div className="flex items-center gap-4 text-brand-400">
                                <Lock size={24} />
                                <h3 className="text-sm font-black uppercase tracking-widest">Audit Policies</h3>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Backdated Posting</p>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Allow entry outside active FY</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateConfig({ allow_backdated_posting: !config?.allow_backdated_posting })}
                                        className={`w-12 h-6 rounded-full transition-all relative ${config?.allow_backdated_posting ? 'bg-brand-600' : 'bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config?.allow_backdated_posting ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>

                                {config?.allow_backdated_posting && (
                                    <div className="flex items-center justify-between p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10 animate-in zoom-in-95 duration-200">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Backdate Limit (Days)</p>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Maximum days allowed for historical entry</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min="0"
                                                max="365"
                                                value={config?.backdate_limit_days || 0}
                                                onChange={(e) => handleUpdateConfig({ backdate_limit_days: parseInt(e.target.value) || 0 })}
                                                className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-500 transition-all text-center"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Cross-FY Reporting</p>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Allow reports to span years</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateConfig({ allow_cross_fy_reports: !config?.allow_cross_fy_reports })}
                                        className={`w-12 h-6 rounded-full transition-all relative ${config?.allow_cross_fy_reports ? 'bg-brand-600' : 'bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config?.allow_cross_fy_reports ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Financial Year Management Table */}
                        <div className="md:col-span-2 surface-card p-10 space-y-8">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-brand-500">
                                    <Calendar size={24} />
                                    <h3 className="text-sm font-black uppercase tracking-widest">Financial Year Management</h3>
                                </div>
                                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Manage period immutability and finalization</p>
                            </div>

                            <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-800/50 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                        <tr>
                                            <th className="px-8 py-5">FY Name</th>
                                            <th className="px-8 py-5">Period</th>
                                            <th className="px-8 py-5 text-center">Status</th>
                                            <th className="px-8 py-5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {financialYears.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-8 py-12 text-center text-slate-600 text-[10px] font-black uppercase tracking-[0.2em] italic">No Financial Years defined yet.</td>
                                            </tr>
                                        ) : (
                                            financialYears.map(fy => (
                                                <tr key={fy.id} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-8 py-5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-white uppercase tracking-widest">{fy.name}</span>
                                                            {config?.current_financial_year_id === fy.id && (
                                                                <span className="text-[8px] font-black text-brand-500 uppercase tracking-widest mt-0.5">Currently Active</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                            {formatDateDMY(fy.start_date)} - {formatDateDMY(fy.end_date)}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex justify-center">
                                                            {fy.is_closed ? (
                                                                <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2">
                                                                    <Lock size={10} /> Finalized
                                                                </div>
                                                            ) : (
                                                                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2">
                                                                    <Unlock size={10} /> Open
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleFYStatus(fy.id, fy.is_closed)}
                                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${fy.is_closed
                                                                ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-emerald-500 hover:border-emerald-500/30'
                                                                : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white'
                                                                }`}
                                                        >
                                                            {fy.is_closed ? 'Re-Open Period' : 'Finalize Year'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex gap-4 p-5 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                <AlertCircle size={18} className="text-amber-500 shrink-0" />
                                <p className="text-[9px] font-bold text-amber-500/80 uppercase leading-relaxed">
                                    Finalizing a year locks all transactions. No edits, deletes, or new vouchers can be posted in a finalized period.
                                    Corrections must be made via adjustment journals in the current open period.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : view === 'permissions' ? (
                /* Detail View: Permissions & Access Control */
                <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex h-[65vh] surface-card overflow-hidden">
                    {/* Left Pane */}
                    <div className="w-80 border-r border-slate-800/50 bg-slate-900/30 flex flex-col">
                        <button
                            type="button"
                            onClick={() => setProfileTab('operations')}
                            className={`p-6 text-left transition-all border-b border-slate-800/50 group ${profileTab === 'operations' ? 'bg-brand-500/10' : 'hover:bg-slate-800/30'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-xl ${profileTab === 'operations' ? 'bg-brand-500/20 text-brand-500' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                                    <Zap size={18} />
                                </div>
                                <div>
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${profileTab === 'operations' ? 'text-white' : 'text-slate-500'}`}>Operations</p>
                                    <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Workflow Modules</p>
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Right Pane Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/10">
                        {profileTab === 'operations' && (
                            <div className="p-10 space-y-10">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Workflow Permissions</h3>
                                    <button
                                        onClick={() => handleUpdateConfig(profileForm)}
                                        disabled={savingConfig}
                                        className="px-6 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 transition-all shadow-glow shadow-brand-500/20 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {savingConfig ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                        {savingConfig ? 'Saving...' : 'Save Permissions'}
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-6 bg-slate-900/50 rounded-2xl border border-slate-800/50 hover:border-brand-500/20 transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-brand-500/10 rounded-xl text-brand-400 group-hover:scale-110 transition-transform">
                                                <ShieldCheck size={20} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-white">TXN Approvals</p>
                                                <p className="text-[8px] font-bold text-slate-500 uppercase mt-1 pr-10 leading-relaxed">
                                                    ENABLE DEDICATED SIDEBAR ENTRY FOR FINAL TRANSACTION AUTHORIZATION QUEUE.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setProfileForm({ ...profileForm, enable_txn_approvals: (profileForm.enable_txn_approvals === false ? true : false) })}
                                            className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${profileForm.enable_txn_approvals !== false ? 'bg-brand-600 shadow-glow shadow-brand-500/20' : 'bg-slate-800'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profileForm.enable_txn_approvals !== false ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : view === 'profile' ? (
                /* Detail View: Profile & Identity Workspace */
                <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex h-[65vh] surface-card overflow-hidden">
                    {/* Left Pane */}
                    <div className="w-80 border-r border-slate-800/50 bg-slate-900/30 flex flex-col">
                        <button
                            type="button"
                            onClick={() => setProfileTab('business')}
                            className={`p-6 text-left transition-all border-b border-slate-800/50 group ${profileTab === 'business' ? 'bg-brand-500/10' : 'hover:bg-slate-800/30'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-xl ${profileTab === 'business' ? 'bg-brand-500/20 text-brand-500' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                                    <User size={18} />
                                </div>
                                <div>
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${profileTab === 'business' ? 'text-white' : 'text-slate-500'}`}>Business Details</p>
                                    <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Corporate Identity</p>
                                </div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setProfileTab('banks')}
                            className={`p-6 text-left transition-all border-b border-slate-800/50 group ${profileTab === 'banks' ? 'bg-emerald-500/10' : 'hover:bg-slate-800/30'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-xl ${profileTab === 'banks' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                                    <Landmark size={18} />
                                </div>
                                <div>
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${profileTab === 'banks' ? 'text-white' : 'text-slate-500'}`}>Bank Accounts</p>
                                    <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Financial Touchpoints</p>
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Right Pane Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/10">
                        {profileTab === 'business' ? (
                            <div className="p-10 space-y-10">
                                {/* Business Profile Form */}
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Corporate Identity</h3>
                                    <button
                                        onClick={() => handleUpdateConfig(profileForm)}
                                        disabled={savingConfig}
                                        className="px-6 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 transition-all shadow-glow shadow-brand-500/20 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {savingConfig ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                        {savingConfig ? 'Saving...' : 'Update Business Profile'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-10 bg-slate-900/50 border border-slate-800 rounded-3xl">
                                    {/* Logo Upload Section */}
                                    <div className="md:col-span-2 flex items-center gap-8 p-6 bg-slate-800/20 border border-slate-800/50 rounded-2xl mb-4">
                                        <div className="relative group">
                                            <div className="w-24 h-24 rounded-full bg-white border-2 border-slate-700 overflow-hidden flex items-center justify-center shadow-inner group-hover:border-brand-500/50 transition-all p-2">
                                                {profileForm.business_logo_url ? (
                                                    <img src={profileForm.business_logo_url} alt="Business Logo" className="w-full h-full object-contain scale-90" />
                                                ) : (
                                                    <Building2 size={32} className="text-slate-600 group-hover:text-brand-500 transition-colors" />
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            try {
                                                                const url = await uploadBusinessLogo(file);
                                                                setProfileForm({ ...profileForm, business_logo_url: url });
                                                                toast.success('Logo uploaded successfully');
                                                            } catch (error) {
                                                                console.error('Logo upload failed:', error);
                                                                toast.error('Failed to upload logo');
                                                            }
                                                        }
                                                    }}
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    title="Upload Business Logo"
                                                />
                                            </div>
                                            <div className="absolute -bottom-2 -right-2 p-1.5 bg-brand-600 text-white rounded-lg shadow-lg group-hover:scale-110 transition-transform pointer-events-none">
                                                <UploadIcon size={12} strokeWidth={3} />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-white">Institutional Logo</h4>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase leading-relaxed max-w-[200px]">
                                                Upload your corporate logo. Recommended: Square PNG or SVG with transparent background.
                                            </p>
                                            {profileForm.business_logo_url && (
                                                <button
                                                    onClick={() => setProfileForm({ ...profileForm, business_logo_url: null })}
                                                    className="text-[8px] font-black text-red-500 uppercase tracking-widest hover:text-red-400 mt-2 block"
                                                >
                                                    Remove Logo
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Legal Business Name</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                            <input
                                                type="text"
                                                value={profileForm.business_name || ''}
                                                onChange={(e) => setProfileForm({ ...profileForm, business_name: e.target.value })}
                                                className="input-field !pl-12 !py-4 font-bold"
                                                placeholder="ENTER COMPANY NAME..."
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">GSTIN / Tax ID</label>
                                        <div className="relative">
                                            <ShieldAlert className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                            <input
                                                type="text"
                                                value={profileForm.business_gstin || ''}
                                                onChange={(e) => setProfileForm({ ...profileForm, business_gstin: e.target.value.toUpperCase() })}
                                                className="input-field !pl-12 !py-4 font-bold uppercase"
                                                placeholder="EX: 29AAAAA0000A1Z5"
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Registered Address</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-5 text-slate-500" size={16} />
                                            <textarea
                                                value={profileForm.business_address || ''}
                                                onChange={(e) => setProfileForm({ ...profileForm, business_address: e.target.value })}
                                                className="input-field !pl-12 !py-4 font-bold min-h-[100px] resize-none"
                                                placeholder="ENTER FULL CORPORATE ADDRESS..."
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contact Phone</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                            <input
                                                type="text"
                                                value={profileForm.business_phone || ''}
                                                onChange={(e) => setProfileForm({ ...profileForm, business_phone: e.target.value })}
                                                className="input-field !pl-12 !py-4 font-bold"
                                                placeholder="+91 00000 00000"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Official Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                            <input
                                                type="email"
                                                value={profileForm.business_email || ''}
                                                onChange={(e) => setProfileForm({ ...profileForm, business_email: e.target.value })}
                                                className="input-field !pl-12 !py-4 font-bold"
                                                placeholder="contact@company.com"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-brand-500">
                                            <Target size={20} />
                                            <h3 className="text-sm font-black uppercase tracking-widest text-white">Party Identifier Logic</h3>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-10 bg-slate-900/50 border border-slate-800 rounded-3xl">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Customer ID Prefix</label>
                                            <input
                                                type="text"
                                                value={profileForm.customer_id_prefix || 'CU'}
                                                onChange={(e) => setProfileForm({ ...profileForm, customer_id_prefix: e.target.value.toUpperCase() })}
                                                className="input-field !py-4 font-bold uppercase"
                                                placeholder="EX: CU, CUST, PT"
                                            />
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight ml-1">Auto-applied as prefix for new counterparties.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Starting Serial Number</label>
                                            <input
                                                type="number"
                                                value={profileForm.customer_id_start_number || 1}
                                                onChange={(e) => setProfileForm({ ...profileForm, customer_id_start_number: parseInt(e.target.value) || 1 })}
                                                className="input-field !py-4 font-bold"
                                                placeholder="1"
                                                min="1"
                                            />
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight ml-1">Sequence starts from this number if no records exist.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-10 space-y-8">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Institutional Bank Accounts</h3>
                                    {editingBankId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingBankId(null);
                                                setIsEditingBank(false);
                                            }}
                                            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-slate-700/50"
                                        >
                                            Back to List
                                        </button>
                                    )}
                                </div>

                                {editingBankId ? (
                                    /* Detailed Bank Form */
                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        {(() => {
                                            const bank = ledgers.find(l => l.id === editingBankId);
                                            if (!bank) return null;
                                            return (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-900/50 border border-slate-800 rounded-3xl">
                                                    <div className="md:col-span-2 flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-emerald-500/10 rounded-xl">
                                                                <Landmark size={24} className="text-emerald-500" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-black uppercase text-white tracking-widest">{bank.ledger_name}</h4>
                                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{bank.ledger_group?.group_name}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {!isEditingBank ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsEditingBank(true)}
                                                                    className="px-6 py-3 bg-slate-800 text-brand-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-brand-500/20 flex items-center gap-2"
                                                                >
                                                                    <Settings size={12} /> Edit Details
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdateBankLedger(editingBankId, bankForm)}
                                                                    disabled={savingConfig}
                                                                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-glow shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
                                                                >
                                                                    {savingConfig ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                                                    {savingConfig ? 'Saving...' : 'Update Bank Details'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Number</label>
                                                        <input
                                                            type="text"
                                                            value={bankForm.bank_account_no || ''}
                                                            readOnly={!isEditingBank}
                                                            onChange={(e) => setBankForm({ ...bankForm, bank_account_no: e.target.value })}
                                                            className={`w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-emerald-500 outline-none transition-all placeholder:opacity-30 ${!isEditingBank ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            placeholder="ENTER ACCOUNT NO"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">IFSC Code</label>
                                                        <input
                                                            type="text"
                                                            value={bankForm.bank_ifsc || ''}
                                                            readOnly={!isEditingBank}
                                                            onChange={(e) => setBankForm({ ...bankForm, bank_ifsc: e.target.value.toUpperCase() })}
                                                            className={`w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-emerald-500 outline-none transition-all placeholder:opacity-30 uppercase ${!isEditingBank ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            placeholder="SBIN0000000"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Official Bank Name</label>
                                                        <input
                                                            type="text"
                                                            value={bankForm.bank_name || ''}
                                                            readOnly={!isEditingBank}
                                                            onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                                                            className={`w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-emerald-500 outline-none transition-all placeholder:opacity-30 ${!isEditingBank ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            placeholder="STATE BANK OF INDIA"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Branch Name</label>
                                                        <input
                                                            type="text"
                                                            value={bankForm.bank_branch || ''}
                                                            readOnly={!isEditingBank}
                                                            onChange={(e) => setBankForm({ ...bankForm, bank_branch: e.target.value })}
                                                            className={`w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-emerald-500 outline-none transition-all placeholder:opacity-30 ${!isEditingBank ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            placeholder="MAIN BRANCH, CITY"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-brand-500 uppercase tracking-widest ml-1">SIB RAP PREFIX</label>

                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={bankForm.sib_rap_prefix !== null && bankForm.sib_rap_prefix !== undefined && bankForm.sib_rap_prefix !== ''}
                                                                disabled={!isEditingBank}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setBankForm({ ...bankForm, sib_rap_prefix: '' });
                                                                    } else {
                                                                        setBankForm({ ...bankForm, sib_rap_prefix: '' });
                                                                    }
                                                                }}
                                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-offset-0 focus:ring-0 cursor-pointer"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={bankForm.sib_rap_prefix || ''}
                                                                readOnly={!isEditingBank}
                                                                onChange={(e) => setBankForm({ ...bankForm, sib_rap_prefix: e.target.value.toUpperCase().replace(/-+$/, '') })}
                                                                className={`flex-1 bg-slate-900 border border-brand-500/20 rounded-xl px-4 py-3 text-[10px] font-bold text-brand-400 focus:border-brand-500 outline-none transition-all placeholder:opacity-30 ${!isEditingBank ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                placeholder=""
                                                            />
                                                        </div>
                                                        <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-1 ml-6">
                                                            Check to enable. Format: 3 Letters ends with dash (e.g. ALK-)
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    /* Bank List */
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {ledgers.filter(l => {
                                            const bankTagIds = tags
                                                .filter(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))
                                                .map(t => t.id);
                                            return l.is_cash_bank && l.business_tags?.some(id => bankTagIds.includes(id));
                                        }).length === 0 ? (
                                            <div className="md:col-span-2 py-20 bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center">
                                                <Landmark size={48} className="text-slate-800 mb-4" />
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-loose">
                                                    No bank accounts identified.<br />
                                                    Tag ledgers as "Bank Account" in the Chart of Accounts to see them here.
                                                </p>
                                            </div>
                                        ) : (
                                            ledgers.filter(l => {
                                                const bankTagIds = tags
                                                    .filter(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))
                                                    .map(t => t.id);
                                                return l.is_cash_bank && l.business_tags?.some(id => bankTagIds.includes(id));
                                            }).map(bank => (
                                                <div
                                                    key={bank.id}
                                                    onClick={() => {
                                                        setEditingBankId(bank.id);
                                                        setBankForm({
                                                            bank_name: bank.bank_name,
                                                            bank_account_no: bank.bank_account_no,
                                                            bank_ifsc: bank.bank_ifsc,
                                                            bank_branch: bank.bank_branch,
                                                            sib_rap_prefix: bank.sib_rap_prefix
                                                        });
                                                        setIsEditingBank(false);
                                                    }}
                                                    className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between group hover:border-emerald-500/30 transition-all cursor-pointer hover:bg-slate-800/40"
                                                >
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 group-hover:scale-110 transition-transform">
                                                            <Landmark size={20} />
                                                        </div>
                                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">{bank.ledger_group?.group_name}</span>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-black text-white uppercase tracking-widest mb-1">{bank.ledger_name}</h4>
                                                        {(bank.bank_account_no || bank.bank_ifsc) ? (
                                                            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest opacity-80">
                                                                {bank.bank_account_no} • {bank.bank_ifsc}
                                                            </p>
                                                        ) : (
                                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Click to setup details</p>
                                                        )}
                                                    </div>
                                                    <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Opening Bal</span>
                                                        <span className="text-xs font-mono font-black text-emerald-500">
                                                            ₹{bank.opening_balance?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {bank.opening_balance_side}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : view === 'system-date' ? (
                /* Detail View: System Date Workspace */
                <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">
                    <div className="flex items-center justify-between p-6 bg-slate-900/50 rounded-[2rem] border border-slate-800">
                        <div className="flex flex-col gap-2">
                            <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">Current active business date</p>
                            {config?.business_date ? (
                                <div className="flex items-baseline gap-4">
                                    <h1 className="text-4xl font-display font-black tracking-tighter text-amber-400">
                                        {formatBusinessDateDisplay(config.business_date).day} {formatBusinessDateDisplay(config.business_date).month} {formatBusinessDateDisplay(config.business_date).year}
                                    </h1>
                                    <span className="text-xs font-bold text-amber-500/60 uppercase tracking-widest px-3 py-1 bg-amber-500/10 rounded-full border border-amber-500/20">
                                        Override Active
                                    </span>
                                </div>
                            ) : (
                                <h1 className="text-4xl font-display font-black tracking-tighter text-emerald-400">
                                    {formatBusinessDateDisplay(getTodayDate()).day} {formatBusinessDateDisplay(getTodayDate()).month} {formatBusinessDateDisplay(getTodayDate()).year}
                                </h1>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-3">
                            {!isEditingDate ? (
                                <div className="flex flex-col items-end gap-2">
                                    <button
                                        onClick={() => setIsEditingDate(true)}
                                        className="px-6 py-3 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-slate-700 hover:border-slate-500 flex items-center gap-2"
                                    >
                                        <Pencil size={12} /> Override System Date
                                    </button>
                                    {config?.business_date && (
                                        <button
                                            onClick={handleSystemDateClear}
                                            disabled={savingDate}
                                            className="text-[9px] font-bold text-slate-500 hover:text-red-400 uppercase tracking-widest transition-colors flex items-center gap-1"
                                        >
                                            <XIcon size={10} /> Clear Override
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="surface-card p-6 min-w-[320px] animate-scale-in">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-white">Set Override Date</h4>
                                            <button onClick={() => setIsEditingDate(false)} className="text-slate-500 hover:text-white">
                                                <XIcon size={14} />
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">Select Date</label>
                                            <input
                                                type="date"
                                                value={editedDate}
                                                onChange={e => setEditedDate(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs font-bold text-white focus:border-amber-500 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">Audit Reason</label>
                                            <input
                                                type="text"
                                                value={dateChangeReason}
                                                onChange={e => setDateChangeReason(e.target.value)}
                                                placeholder="REQUIRED FOR COMPLIANCE"
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-white focus:border-amber-500 outline-none transition-all placeholder:opacity-30"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSystemDateSave}
                                            disabled={savingDate || !editedDate || !dateChangeReason}
                                            className="w-full py-3 bg-amber-500 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-glow shadow-amber-500/20 disabled:opacity-50 mt-2 flex justify-center items-center gap-2"
                                        >
                                            {savingDate ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                                            {savingDate ? 'Saving...' : 'Confirm Override'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Audit Logs */}
                    <div className="surface-card p-0 overflow-hidden flex flex-col h-[500px]">
                        <div className="p-6 border-b border-slate-800/50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4 text-white">
                                <History size={20} className="text-amber-500" />
                                <h3 className="text-sm font-black uppercase tracking-widest">Date Change Audit Log</h3>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 rounded-xl border border-slate-800">
                                    <Filter size={12} className="text-slate-500" />
                                    <input
                                        type="date"
                                        value={logFilterStart}
                                        onChange={e => setLogFilterStart(e.target.value)}
                                        className="bg-transparent border-none text-[10px] font-bold text-slate-300 outline-none w-28"
                                    />
                                    <span className="text-slate-600 font-bold px-1">to</span>
                                    <input
                                        type="date"
                                        value={logFilterEnd}
                                        onChange={e => setLogFilterEnd(e.target.value)}
                                        className="bg-transparent border-none text-[10px] font-bold text-slate-300 outline-none w-28"
                                    />
                                    {(logFilterStart || logFilterEnd) && (
                                        <button onClick={() => { setLogFilterStart(''); setLogFilterEnd(''); }} className="ml-2 text-slate-500 hover:text-red-400">
                                            <XIcon size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 p-0">
                            <table className="w-full text-left">
                                <thead className="bg-slate-900/80 sticky top-0 backdrop-blur-md text-[9px] font-black uppercase tracking-widest text-slate-500 z-10 border-b border-slate-800">
                                    <tr>
                                        <th className="px-8 py-4">Timestamp</th>
                                        <th className="px-8 py-4">Action</th>
                                        <th className="px-8 py-4">Previous Date</th>
                                        <th className="px-8 py-4">New Date</th>
                                        <th className="px-8 py-4">Reason</th>
                                        <th className="px-8 py-4">User</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/30">
                                    {loadingDateLogs ? (
                                        <tr>
                                            <td colSpan={6} className="px-8 py-12 text-center text-slate-500 italic text-[10px] font-bold uppercase tracking-widest">
                                                <RefreshCw size={14} className="animate-spin inline mr-2" /> Loading Audit Records...
                                            </td>
                                        </tr>
                                    ) : dateLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-8 py-16 text-center flex flex-col items-center justify-center gap-3">
                                                <History size={32} className="text-slate-800" />
                                                <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">No system date modifications found</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        dateLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-8 py-4 text-[10px] font-mono text-slate-400">
                                                    {new Date(log.changed_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-8 py-4">
                                                    <span className={`px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-md ${log.action === 'SET' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-700 text-slate-300'}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-4 text-xs font-bold text-slate-500">
                                                    {log.old_date ? formatDateDMY(log.old_date) : '-'}
                                                </td>
                                                <td className="px-8 py-4 text-xs font-black text-white">
                                                    {log.new_date ? formatDateDMY(log.new_date) : 'Current Date'}
                                                </td>
                                                <td className="px-8 py-4 text-[10px] font-medium text-slate-400 pr-12">
                                                    {log.reason || '-'}
                                                </td>
                                                <td className="px-8 py-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    <User size={10} /> {log.changed_by}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* FY Rollover Modal */}
            <Modal isOpen={showRolloverModal} onClose={() => setShowRolloverModal(false)}>
                <div className="max-w-2xl w-full surface-card p-10 space-y-8 animate-scale-in">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="p-6 bg-brand-500/20 rounded-full">
                            <RefreshCw size={48} className="text-brand-500 animate-spin-slow" />
                        </div>
                        <div>
                            <h3 className="text-xl font-display font-black uppercase tracking-tight text-white">Start New Financial Year</h3>
                            <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                                You are about to rollover from <span className="text-white font-bold">{config?.current_fy?.name}</span> to the next period.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-900/30 rounded-3xl border border-slate-800/50">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Next Year Name</label>
                            <input
                                type="text"
                                value={newFYData.name}
                                onChange={e => setNewFYData({ ...newFYData, name: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-brand-500 outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Start Date</label>
                            <input
                                type="date"
                                value={newFYData.start_date}
                                onChange={e => setNewFYData({ ...newFYData, start_date: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-brand-500 outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">End Date</label>
                            <input
                                type="date"
                                value={newFYData.end_date}
                                onChange={e => setNewFYData({ ...newFYData, end_date: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-[10px] font-bold text-slate-300 focus:border-brand-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Balance Preview */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Ledger Balances (Closing)</h4>
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black uppercase ${shouldCarryForward ? 'text-emerald-500' : 'text-slate-600'}`}>
                                    Carry Forward Enabled
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShouldCarryForward(!shouldCarryForward)}
                                    className={`w-8 h-4 rounded-full transition-all relative ${shouldCarryForward ? 'bg-emerald-600' : 'bg-slate-800'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${shouldCarryForward ? 'left-4.5' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
                            <div className="max-h-48 overflow-y-auto">
                                <table className="w-full text-[10px] text-left">
                                    <thead className="sticky top-0 bg-slate-800 text-slate-500 font-black uppercase tracking-widest">
                                        <tr>
                                            <th className="px-4 py-3">Ledger Name</th>
                                            <th className="px-4 py-3 text-right">Closing Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {loadingBalances ? (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-8 text-center text-slate-500 italic">Calculating closing balances...</td>
                                            </tr>
                                        ) : rolloverBalances.length === 0 ? (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-8 text-center text-slate-500 italic">No ledger activity found.</td>
                                            </tr>
                                        ) : (
                                            rolloverBalances.map(row => (
                                                <tr key={row.node_id} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-4 py-3 font-bold text-slate-300">{row.node_name}</td>
                                                    <td className={`px-4 py-3 text-right font-bold ${row.closing_dr > 0 ? 'text-brand-400' : 'text-emerald-400'}`}>
                                                        {formatNumber(row.closing_dr || row.closing_cr)} {row.closing_dr > 0 ? 'DR' : 'CR'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="bg-brand-500/5 border border-brand-500/10 p-4 rounded-2xl flex gap-4 items-center">
                        <AlertCircle size={20} className="text-brand-500 shrink-0" />
                        <p className="text-[9px] font-bold text-brand-500/80 leading-relaxed uppercase">
                            Warning: Carrying forward will update the \"Opening Balance\" of all ledgers to their current physical values. Ensure all entries for the previous year are finalized.
                        </p>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={() => setShowRolloverModal(false)}
                            className="flex-1 py-4 bg-slate-800/50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleCreateNextFY}
                            disabled={savingConfig}
                            className="flex-1 py-4 bg-brand-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 transition-all shadow-glow shadow-brand-500/20 flex items-center justify-center gap-2"
                        >
                            {savingConfig ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Confirm Rollover <ArrowRight size={14} />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Manual FY Add Modal */}
            <Modal isOpen={showAddFYModal} onClose={() => setShowAddFYModal(false)}>
                <div className="max-w-md w-full surface-card p-10 space-y-8 animate-scale-in">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="p-6 bg-brand-500/20 rounded-full">
                            <Calendar size={48} className="text-brand-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-display font-black uppercase tracking-tight text-white">Create Financial Year</h3>
                            <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                                Define the boundaries for your accounting period and give it a descriptive name.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Year Name</label>
                            <input
                                type="text"
                                value={newFYData.name}
                                onChange={e => setNewFYData({ ...newFYData, name: e.target.value })}
                                placeholder="ex: FY 2025-26"
                                className="input-field !py-4 font-bold"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Start Date</label>
                                <input
                                    type="date"
                                    value={newFYData.start_date}
                                    onChange={e => setNewFYData({ ...newFYData, start_date: e.target.value })}
                                    className="input-field !py-4 font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">End Date</label>
                                <input
                                    type="date"
                                    value={newFYData.end_date}
                                    onChange={e => setNewFYData({ ...newFYData, end_date: e.target.value })}
                                    className="input-field !py-4 font-bold"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-slate-800/50">
                        <button
                            type="button"
                            onClick={() => setShowAddFYModal(false)}
                            className="flex-1 py-4 bg-slate-800/50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAddFY}
                            disabled={savingConfig}
                            className="flex-1 py-4 bg-brand-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 transition-all shadow-glow shadow-brand-500/20"
                        >
                            {savingConfig ? 'Creating...' : 'Create Year'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Confirmation Modal (Reset) */}
            <Modal isOpen={showConfirm} onClose={() => { setShowConfirm(false); setConfirmText(''); }}>
                <div className="max-w-md w-full surface-card p-10 space-y-8 animate-scale-in">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="p-6 bg-red-500/20 rounded-full animate-pulse">
                            <AlertTriangle size={48} className="text-red-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-display font-black uppercase tracking-tight text-white">Full System Reset?</h3>
                            <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                                This action is irreversible. All transaction history, counterparty profiles, and ledger balances will be permanently deleted.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex justify-center text-center">
                            Type <span className="text-red-500 mx-1.5 underline">RESET</span> to confirm destruction
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            className="input-field text-center font-black tracking-widest !bg-red-500/5 !border-red-500/20 focus:!border-red-500/50"
                            placeholder="TYPE HERE..."
                        />
                    </div>

                    <div className="flex gap-4 pt-2">
                        <button
                            type="button"
                            onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                            className="flex-1 py-4 bg-slate-800/50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={confirmText !== 'RESET' || isResetting}
                            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${confirmText === 'RESET'
                                ? 'bg-red-600 text-white shadow-glow shadow-red-500/20'
                                : 'bg-red-600/20 text-red-500/50 opacity-50 cursor-not-allowed'
                                }`}
                        >
                            {isResetting ? 'Deleting...' : 'Destroy Data'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* User Management Reset Modal */}
            <Modal isOpen={showUserResetModal} onClose={() => { setShowUserResetModal(false); setUserResetConfirmText(''); }}>
                <div className="max-w-xl w-full surface-card p-10 space-y-8 animate-scale-in">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="p-6 bg-orange-500/20 rounded-full">
                            <ShieldAlert size={48} className="text-orange-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-display font-black uppercase tracking-tight text-white">Reset User Management?</h3>
                            <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                                You are about to wipe <span className="text-white font-bold">non-administrative staff profiles, device authorizations, and job-specific role assignments</span>.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-2">Will be preserved</p>
                            <ul className="text-[10px] font-bold text-slate-400 space-y-2">
                                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-500"></div> Super Admin Identities</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-500"></div> System Roles (Master/User Admin)</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-emerald-500"></div> Admin Access Mappings</li>
                            </ul>
                        </div>
                        <div className="p-5 bg-red-500/5 border border-red-500/10 rounded-2xl">
                            <p className="text-[9px] font-black uppercase tracking-widest text-red-500 mb-2">Will be removed</p>
                            <ul className="text-[10px] font-bold text-slate-400 space-y-2">
                                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-red-500"></div> All Non-Admin Staff</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-red-500"></div> Job Roles (non-system)</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-red-500"></div> All Device Authorizations</li>
                            </ul>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex justify-center text-center">
                            Type <span className="text-orange-500 mx-1.5 underline">RESET USER MANAGEMENT</span> to confirm
                        </label>
                        <input
                            type="text"
                            value={userResetConfirmText}
                            onChange={(e) => setUserResetConfirmText(e.target.value)}
                            className="input-field text-center font-black tracking-widest !bg-orange-500/5 !border-orange-500/20 focus:!border-orange-500/50"
                            placeholder="TYPE PHRASE HERE..."
                        />
                    </div>

                    <div className="flex gap-4 pt-2">
                        <button
                            type="button"
                            onClick={() => { setShowUserResetModal(false); setUserResetConfirmText(''); }}
                            className="flex-1 py-4 bg-slate-800/50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleUserReset}
                            disabled={userResetConfirmText !== 'RESET USER MANAGEMENT' || isUserResetting}
                            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${userResetConfirmText === 'RESET USER MANAGEMENT'
                                ? 'bg-orange-600 text-white shadow-glow shadow-orange-500/20'
                                : 'bg-orange-600/20 text-orange-500/50 opacity-50 cursor-not-allowed'
                                }`}
                        >
                            {isUserResetting ? 'Resetting...' : 'Execute Reset'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Notifications */}
            {seedSuccess && (
                <div className="fixed bottom-10 right-10 z-[110] animate-slide-up">
                    <div className="bg-brand-600 text-white px-8 py-5 rounded-2xl flex items-center gap-4 shadow-2xl shadow-brand-500/20 border border-brand-400/30">
                        <Zap size={24} className="fill-white/20" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Samples Generated</p>
                            <p className="text-brand-100 text-[9px] font-black uppercase tracking-widest opacity-60">Refreshing Workspace...</p>
                        </div>
                    </div>
                </div>
            )}

            {success && (
                <div className="fixed bottom-10 right-10 z-[110] animate-slide-up">
                    <div className="bg-emerald-600 text-white px-8 py-5 rounded-2xl flex items-center gap-4 shadow-2xl shadow-emerald-500/20">
                        <CheckCircle2 size={24} />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">System Wiped</p>
                            <p className="text-emerald-100 text-[9px] font-black uppercase tracking-widest opacity-60">Restarting Application...</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemSettings;
