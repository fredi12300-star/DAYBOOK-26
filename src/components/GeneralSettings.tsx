import { useState, useEffect } from 'react';
import {
    Building2, MapPin, Phone, Mail,
    ShieldAlert, Landmark, Info, Briefcase
} from 'lucide-react';
import {
    fetchSystemConfig, fetchLedgers, fetchLedgerTags
} from '../lib/supabase';
import { SystemConfiguration, Ledger, LedgerTag } from '../types/accounting';

const GeneralSettings = () => {
    const [config, setConfig] = useState<SystemConfiguration | null>(null);
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'profile' | 'banks'>('profile');

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [settings, l, t] = await Promise.all([
                fetchSystemConfig(),
                fetchLedgers(true),
                fetchLedgerTags()
            ]);
            setConfig(settings);
            setLedgers(l);
            setTags(t);
        } catch (error) {
            console.error('Error loading general settings:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
                <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">Synchronizing Workspace...</p>
            </div>
        );
    }

    const bankTagIds = tags
        .filter(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))
        .map(t => t.id);

    const bankAccounts = ledgers.filter(l =>
        l.is_cash_bank && l.business_tags?.some(id => bankTagIds.includes(id))
    );

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-display font-black uppercase tracking-tight text-white flex items-center gap-4">
                        Workspace Settings
                        <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] text-slate-500 font-black tracking-widest">READ ONLY</div>
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Reference view of organizational identity and assets</p>
                </div>
            </div>

            <div className="flex h-[60vh] bg-slate-900/40 border border-slate-800/50 rounded-3xl overflow-hidden backdrop-blur-sm">
                {/* Navigation Sidebar */}
                <div className="w-72 border-r border-slate-800/50 flex flex-col pt-4">
                    <button
                        type="button"
                        onClick={() => setActiveTab('profile')}
                        className={`p-6 text-left transition-all border-b border-slate-800/20 group ${activeTab === 'profile' ? 'bg-brand-500/10' : 'hover:bg-slate-800/20'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${activeTab === 'profile' ? 'bg-brand-500/20 text-brand-500' : 'bg-slate-800 text-slate-500'}`}>
                                <Briefcase size={18} />
                            </div>
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'profile' ? 'text-white' : 'text-slate-500'}`}>Business Profile</p>
                                <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Corporate Detail</p>
                            </div>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('banks')}
                        className={`p-6 text-left transition-all border-b border-slate-800/20 group ${activeTab === 'banks' ? 'bg-emerald-500/10' : 'hover:bg-slate-800/20'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${activeTab === 'banks' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                                <Landmark size={18} />
                            </div>
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'banks' ? 'text-white' : 'text-slate-500'}`}>Bank Assets</p>
                                <p className="text-[8px] font-bold text-slate-600 uppercase mt-0.5">Linked Accounts</p>
                            </div>
                        </div>
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                    {activeTab === 'profile' ? (
                        <div className="space-y-10 animate-in fade-in duration-500">
                            <div className="flex items-center gap-3 pb-4 border-b border-slate-800/50">
                                <Info size={14} className="text-brand-500" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Identity Overview</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Legal Entity Name</label>
                                        <div className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                                            <Building2 size={16} className="text-slate-500" />
                                            <span className="text-xs font-black text-white uppercase tracking-widest">{config?.business_name || 'NOT DEFINED'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Tax Registration (GSTIN)</label>
                                        <div className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                                            <ShieldAlert size={16} className="text-slate-500" />
                                            <span className="text-xs font-black text-brand-400 uppercase tracking-widest">{config?.business_gstin || 'UNREGISTERED'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Current Financial Period</label>
                                        <div className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                                            <Landmark size={16} className="text-slate-500" />
                                            <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">{config?.current_fy?.name || 'NO ACTIVE FY'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Headquarters Address</label>
                                        <div className="flex items-start gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl min-h-[110px]">
                                            <MapPin size={16} className="text-slate-500 mt-1" />
                                            <span className="text-xs font-bold text-slate-400 leading-relaxed uppercase">{config?.business_address || 'NO ADDRESS SPECIFIED'}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Contact Phone</label>
                                            <div className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                                                <Phone size={14} className="text-slate-500" />
                                                <span className="text-[10px] font-black text-white">{config?.business_phone || '---'}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] ml-1">Official Email</label>
                                            <div className="flex items-center gap-3 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                                                <Mail size={14} className="text-slate-500" />
                                                <span className="text-[10px] font-black text-white truncate">{config?.business_email || '---'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-4">
                                <Info size={18} className="text-amber-500 mt-0.5" />
                                <p className="text-[10px] font-bold text-amber-200/60 leading-relaxed uppercase">
                                    This workspace displays the global system identity. To modify these details,
                                    request access to <span className="text-amber-400 font-black italic">Core Settings</span> from your administrator.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            <div className="flex items-center gap-3 pb-4 border-b border-slate-800/50">
                                <Landmark size={14} className="text-emerald-500" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Institutional Bank Registry</h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {bankAccounts.length === 0 ? (
                                    <div className="col-span-2 py-20 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center">
                                        <Landmark size={40} className="text-slate-800 mb-4" />
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No active bank accounts found in the registry</p>
                                    </div>
                                ) : (
                                    bankAccounts.map(bank => (
                                        <div key={bank.id} className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col justify-between group hover:border-emerald-500/20 transition-all">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                                                    <Landmark size={20} />
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] block">Ledger Classification</span>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{bank.ledger_group?.group_name}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-1">{bank.ledger_name}</h4>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        <div className="px-2 py-1 bg-slate-800 rounded text-[9px] font-black text-emerald-500/70 border border-emerald-500/10">ACC: {bank.bank_account_no || 'NOT SET'}</div>
                                                        <div className="px-2 py-1 bg-slate-800 rounded text-[9px] font-black text-brand-400/70 border border-brand-400/10">IFSC: {bank.bank_ifsc || '---'}</div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
                                                    <div>
                                                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest block mb-1">Bank Name</span>
                                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tight">{bank.bank_name || 'INTERNAL LEDGER'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest block mb-1">Institutional Local</span>
                                                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tight">{bank.bank_branch || '---'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GeneralSettings;
