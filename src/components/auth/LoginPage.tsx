import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { KeyRound, Mail, LogIn, ShieldCheck, Building2, ChevronDown, User } from 'lucide-react';
import toast from 'react-hot-toast';

const CREDS_KEY = 'role_credentials';

function loadAllCredentials(): Record<string, { email: string; password: string }> {
    try { return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}'); } catch { return {}; }
}

// Friendly display name from storage key (e.g. "admin__Super Admin" → "Super Admin")
function displayName(key: string): string {
    const raw = key.replace(/^(admin|job)__/, '');
    if (raw === 'Super Admin') return 'Super Admin';
    return raw;
}


export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [savedAccounts, setSavedAccounts] = useState<Record<string, { email: string; password: string }>>({});
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string>('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const refreshAccounts = () => {
        setSavedAccounts(loadAllCredentials());
    };

    useEffect(() => {
        // Initial load
        refreshAccounts();

        // Live sync: update when another tab saves credentials via RoleManagement
        const onStorageChange = (e: StorageEvent) => {
            if (e.key === CREDS_KEY) refreshAccounts();
        };
        window.addEventListener('storage', onStorageChange);

        // Same-tab polling: catches saves made within the same browser tab (e.g. from role modal)
        const interval = setInterval(refreshAccounts, 2000);

        return () => {
            window.removeEventListener('storage', onStorageChange);
            clearInterval(interval);
        };
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const accountKeys = Object.keys(savedAccounts);

    const handleSelectAccount = (key: string) => {
        setSelectedKey(key);
        setEmail(savedAccounts[key].email);
        setPassword(''); // Always clear password for security - must be entered manually
        setDropdownOpen(false);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Supabase Authenticated session handles identity

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) { toast.error(error.message); }
            else { toast.success('Welcome back!'); }
        } catch (error) {
            console.error('Login failed:', error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 selection:bg-brand-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
            </div>

            <div className="w-full max-w-md relative">
                {/* Logo & Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-600 shadow-glow shadow-brand-500/20 mb-6 group hover:scale-105 transition-transform duration-500">
                        <Building2 size={40} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2">
                        DAY<span className="text-brand-500">BOOK</span>
                    </h1>
                    <p className="text-slate-400 font-medium tracking-wide uppercase text-[10px]">
                        Enterprise Financial Intelligence
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-slate-900/50 backdrop-blur-3xl border border-slate-800/50 p-10 rounded-[40px] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-50" />

                    <form onSubmit={handleLogin} className="space-y-6">

                        {/* Saved Accounts Dropdown */}
                        {accountKeys.length > 0 && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                                    Saved Accounts
                                </label>
                                <div className="relative" ref={dropdownRef}>
                                    {/* Trigger button */}
                                    <button
                                        type="button"
                                        onClick={() => setDropdownOpen(v => !v)}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 bg-slate-950/50 border rounded-2xl text-left transition-all outline-none ${dropdownOpen
                                            ? 'border-brand-500 ring-2 ring-brand-500/20'
                                            : 'border-slate-800 hover:border-slate-700'
                                            }`}
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                                            <User className="w-3.5 h-3.5 text-brand-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {selectedKey ? (
                                                <>
                                                    <div className="text-[12px] font-black text-white uppercase tracking-tight truncate">
                                                        {displayName(selectedKey)}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium truncate">
                                                        {savedAccounts[selectedKey]?.email}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-[12px] font-bold text-slate-600">
                                                    Select a saved account...
                                                </span>
                                            )}
                                        </div>
                                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${dropdownOpen ? 'rotate-180 text-brand-500' : ''}`} />
                                    </button>

                                    {/* Dropdown list */}
                                    {dropdownOpen && (
                                        <div className="absolute top-full mt-2 left-0 right-0 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-slide-down">
                                            {accountKeys.map(key => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => handleSelectAccount(key)}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-brand-500/10 hover:text-white group ${selectedKey === key ? 'bg-brand-500/10 border-l-2 border-brand-500' : 'border-l-2 border-transparent'
                                                        }`}
                                                >
                                                    <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                                                        <User className="w-3.5 h-3.5 text-brand-500" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[12px] font-black text-white uppercase tracking-tight truncate">
                                                            {displayName(key)}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 font-medium truncate">
                                                            {savedAccounts[key].email}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
                            <div className="relative group/field">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail size={18} className="text-slate-500 group-focus-within/field:text-brand-500 transition-colors" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); setSelectedKey(''); }}
                                    className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all placeholder:text-slate-700 font-bold"
                                    placeholder="your@email.com"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Security Password</label>
                            <div className="relative group/field">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <KeyRound size={18} className="text-slate-500 group-focus-within/field:text-brand-500 transition-colors" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setSelectedKey(''); }}
                                    className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all placeholder:text-slate-700 font-bold"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm shadow-lg shadow-brand-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-3 overflow-hidden group/btn"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>Access Terminal</span>
                                    <LogIn size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Info notice */}
                    <div className="mt-8 p-4 bg-brand-500/5 border border-brand-500/10 rounded-2xl flex items-start gap-3">
                        <ShieldCheck size={18} className="text-brand-500 shrink-0 mt-0.5" />
                        <div className="text-[10px] text-slate-400 leading-relaxed font-bold">
                            <span className="text-brand-500 uppercase tracking-wider block mb-1">
                                {accountKeys.length > 0 ? 'Saved Accounts Available' : 'Production Security'}
                            </span>
                            {accountKeys.length > 0
                                ? `${accountKeys.length} account(s) saved. Select from the dropdown above to autofill.`
                                : 'Enterprise-grade authentication active. Please enter your credentials to access the terminal.'
                            }
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                        SECURE AES-256 ENCRYPTED SESSION
                    </p>
                </div>
            </div>
        </div>
    );
}
