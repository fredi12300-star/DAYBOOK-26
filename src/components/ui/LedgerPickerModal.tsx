import { useState, useMemo } from 'react';
import {
    Search, X, Landmark, Wallet, Activity,
    ArrowRight, Calculator, PieChart, TrendingUp
} from 'lucide-react';
import Modal from './Modal';
import type { Ledger, AccountNature } from '../../types/accounting';

interface LedgerPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    ledgers: Ledger[];
    onSelect: (ledgerId: string) => void;
    title?: string;
}

const NATURE_CONFIG: Record<AccountNature, { title: string; icon: any; color: string; bg: string }> = {
    ASSET: { title: 'Assets', icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    LIABILITY: { title: 'Liabilities', icon: Wallet, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20' },
    INCOME: { title: 'Income', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    EXPENSE: { title: 'Expenses', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    EQUITY: { title: 'Equity', icon: Calculator, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' }
};

export default function LedgerPickerModal({
    isOpen,
    onClose,
    ledgers,
    onSelect,
    title = 'Select Ledger Account'
}: LedgerPickerModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<AccountNature | 'ALL'>(searchTerm ? 'ALL' : 'ASSET');

    const natures: AccountNature[] = ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'];

    const filteredLedgers = useMemo(() => {
        let results = ledgers;

        if (searchTerm) {
            results = results.filter(l =>
                l.ledger_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.ledger_group?.group_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        } else if (activeTab !== 'ALL') {
            results = results.filter(l => l.nature === activeTab);
        }

        return results.sort((a, b) => a.ledger_name.localeCompare(b.ledger_name));
    }, [ledgers, searchTerm, activeTab]);

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col h-[85vh] max-h-[700px] w-full max-w-4xl animate-fade-in">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-600">
                            <PieChart size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white uppercase tracking-tight">{title}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Navigate your Chart of Accounts by Category</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Sub-Header: Search & Stats */}
                <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-200/50 dark:border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Find account..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {!searchTerm && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
                            {natures.map((nature) => {
                                const config = NATURE_CONFIG[nature];
                                const isActive = activeTab === nature;
                                const count = ledgers.filter(l => l.nature === nature).length;

                                return (
                                    <button
                                        key={nature}
                                        onClick={() => setActiveTab(nature)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2 border ${isActive
                                                ? `bg-white dark:bg-slate-800 ${config.color} border-${nature === 'ASSET' ? 'blue' : nature === 'LIABILITY' ? 'rose' : nature === 'INCOME' ? 'emerald' : nature === 'EXPENSE' ? 'amber' : 'purple'}-200 dark:border-slate-700 shadow-sm`
                                                : "bg-transparent text-slate-400 border-transparent hover:text-slate-600 dark:hover:text-slate-300"
                                            }`}
                                    >
                                        <config.icon size={12} />
                                        {config.title}
                                        <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${isActive ? 'bg-slate-100 dark:bg-slate-700' : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-500'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {searchTerm && (
                        <div className="px-4 py-1 bg-brand-500/10 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                            Showing Search Results: {filteredLedgers.length}
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20 dark:bg-slate-900/20 custom-scrollbar">
                    {filteredLedgers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredLedgers.map(ledger => {
                                const config = NATURE_CONFIG[ledger.nature];
                                return (
                                    <button
                                        key={ledger.id}
                                        onClick={() => {
                                            onSelect(ledger.id);
                                            onClose();
                                        }}
                                        className="surface-card p-4 text-left group hover:border-brand-500/50 hover:shadow-glow transition-all active:scale-[0.98]"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                                <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors line-clamp-1">{ledger.ledger_name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${config.color}`}>
                                                        {ledger.ledger_group?.group_name}
                                                    </span>
                                                    {searchTerm && (
                                                        <>
                                                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{config.title}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <ArrowRight size={14} className="mt-1 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <PieChart size={48} className="text-slate-300 mb-4" />
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No accounts found here</p>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Activity size={10} className="text-brand-500" />
                        Double-Entry Ledger Intelligence
                    </p>
                </div>
            </div>
        </Modal>
    );
}
