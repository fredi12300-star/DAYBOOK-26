import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    Calculator, PieChart,
    ArrowLeft, Download,
    TrendingUp, Landmark, BookOpen,
    RotateCcw, User, Search, Eye, Edit2,
    Building2, ChevronLeft, ArrowRight, Check,
    Loader2, X, ChevronDown, ChevronRight,
    ArrowUpRight, ArrowDownRight, EyeOff
} from 'lucide-react';
import {
    fetchLedgers,
    fetchLedgerStatement,
    fetchTrialBalance,
    fetchProfitLoss,
    fetchBalanceSheet,
    fetchLedgerTags,
    fetchSystemConfig,
    fetchFinancialYears,
    fetchParties,
    fetchPartiesForLedger,
    fetchPartyBalancesForLedger,
    upsertParty,
    updateOpeningBalance,
    fetchFeatureVisibility,
    updateFeatureVisibility,
    supabase
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import PartyModal from './PartyModal';
import { SystemConfiguration } from '../types/accounting';
import {
    exportLedgerStatement,
    exportTrialBalance,
    exportProfitLoss,
    exportBalanceSheet
} from '../lib/reportExport';
import { formatDate, formatNumber } from '../lib/validation';
import { getBusinessDate, onBusinessDateChange } from '../lib/businessDate';
import type {
    Ledger,
    LedgerStatementRow,
    TrialBalanceRow,
    LedgerTag,
    FinancialYear,
    Side,
    Party
} from '../types/accounting';
import LedgerPickerModal from './ui/LedgerPickerModal';

type ReportType = 'HUB' | 'LEDGER_STMT' | 'TRIAL_BALANCE' | 'PL' | 'BS' | 'CASH_BOOK' | 'BANK_BOOK' | 'CP_CENTER';

export default function Reports({
    initialContext,
    onContextHandled
}: {
    initialContext?: { ledgerId: string; partyId: string; view: 'list' | 'profile' | 'ledger' } | null;
    onContextHandled?: () => void;
}) {
    const [activeReport, setActiveReport] = useState<ReportType>('HUB');
    const [loading, setLoading] = useState(false);
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [ledgerTags, setLedgerTags] = useState<LedgerTag[]>([]);
    const [systemConfig, setSystemConfig] = useState<SystemConfiguration | null>(null);
    const { isSuperAdmin } = useAuth();
    const [featureVisibility, setFeatureVisibility] = useState<Record<string, boolean>>({});

    // Filters
    const [selectedLedgerId, setSelectedLedgerId] = useState('');
    const [partySearch, setPartySearch] = useState('');
    const [cpViewMode, setCpViewMode] = useState<'list' | 'profile' | 'ledger'>('list');
    const [activePartyIds, setActivePartyIds] = useState<string[]>([]);
    const [matchedParty, setMatchedParty] = useState<Party | null>(null);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [partyBalances, setPartyBalances] = useState<Record<string, { balance: number; side: Side }>>({});
    const [parties, setParties] = useState<Party[]>([]);

    const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
    const [selectedFYId, setSelectedFYId] = useState<string>('');
    const [startDate, setStartDate] = useState(getBusinessDate());
    const [endDate, setEndDate] = useState(getBusinessDate());
    const [dateMode, setDateMode] = useState<'today' | 'single' | 'range' | 'quarters' | 'fy'>('today');
    const [selectedDate, setSelectedDate] = useState(getBusinessDate());
    const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);

    // Data
    const [ledgerStatement, setLedgerStatement] = useState<LedgerStatementRow[]>([]);
    const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
    const [plData, setPlData] = useState<{ income: any[], expense: any[], netProfit: number }>({ income: [], expense: [], netProfit: 0 });
    const [bsData, setBsData] = useState<{ assets: any[], liabilities: any[], equity: any[], retainedEarnings: number }>({ assets: [], liabilities: [], equity: [], retainedEarnings: 0 });
    // State for Trial Balance Enhancements
    const [showMovement, setShowMovement] = useState(false);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [includeDrafts, setIncludeDrafts] = useState(false);
    const [showQuantityBalance, setShowQuantityBalance] = useState(false);

    // UX State
    const [hasRanReport, setHasRanReport] = useState(false);

    // Modals
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    // Inline Editing State
    const [isEditingOpening, setIsEditingOpening] = useState(false);
    const [editingOpeningValue, setEditingOpeningValue] = useState<number>(0);
    const [editingOpeningSide, setEditingOpeningSide] = useState<Side>('DR');
    const [savingOpening, setSavingOpening] = useState(false);

    useEffect(() => {
        loadInitialReportContext();

        const unsubscribe = onBusinessDateChange((newDate) => {
            const dateToUse = newDate || getBusinessDate();
            setStartDate(dateToUse);
            setEndDate(dateToUse);
            setSelectedDate(dateToUse);
            setDateMode('today');

            // Note: intentionally completely resetting the report output so the 
            // user sees they must run the report again under the new system date.
            resetReportData();
            toast.success(`System Date Override synched`);
        });

        return () => unsubscribe();
    }, []);

    // Handle Deep Linking from other parts of the app
    useEffect(() => {
        if (initialContext && parties.length > 0 && financialYears.length > 0) {
            setActiveReport('CP_CENTER');
            setSelectedLedgerId(initialContext.ledgerId);
            setCpViewMode(initialContext.view);

            // Default to FY view for deep links to show historical context
            const currentFYId = systemConfig?.current_financial_year_id;
            const fy = financialYears.find(f => f.id === currentFYId) || financialYears[0];
            if (fy) {
                setStartDate(fy.start_date);
                setEndDate(fy.end_date);
                setSelectedFYId(fy.id);
                setDateMode('fy');
            }

            const party = parties.find(p => p.id === initialContext.partyId);
            if (party) {
                setMatchedParty(party);
                // Trigger report with explicit FY boundaries to bypass state lag
                runReport(
                    'CP_CENTER',
                    initialContext.partyId,
                    initialContext.ledgerId,
                    fy ? fy.start_date : startDate,
                    fy ? fy.end_date : endDate
                );
            }
            onContextHandled?.();
        }
    }, [initialContext, parties, financialYears, systemConfig]);

    const resetReportData = () => {
        setLedgerStatement([]);
        setTrialBalance([]);
        setPlData({ income: [], expense: [], netProfit: 0 });
        setBsData({ assets: [], liabilities: [], equity: [], retainedEarnings: 0 });
        setHasRanReport(false);
    };

    const handleLedgerSelect = (id: string) => {
        if (id !== selectedLedgerId) {
            setSelectedLedgerId(id);
            resetReportData();
            // Clear party selection if moving between unrelated ledgers
            setMatchedParty(null);
            setPartySearch('');
        }
    };

    async function loadInitialReportContext() {
        try {
            const [ledgersData, tagsData, configData, yearsData, partiesData, visibilityData] = await Promise.all([
                fetchLedgers(true),
                fetchLedgerTags(),
                fetchSystemConfig(),
                fetchFinancialYears(),
                fetchParties(true),
                fetchFeatureVisibility()
            ]);
            setLedgers(ledgersData);
            setLedgerTags(tagsData);
            setSystemConfig(configData);
            setFinancialYears(yearsData);
            setParties(partiesData);

            const visibilityMap = (visibilityData || []).reduce((acc: any, curr: any) => {
                acc[curr.feature_id] = curr.is_enabled;
                return acc;
            }, {});
            setFeatureVisibility(visibilityMap);

            // Default to current FY boundaries if active
            /* 
            // MODIFIED: User requested Today to be default, not FY
            if (configData && configData.current_fy) {
                setStartDate(configData.current_fy.start_date);
                setEndDate(configData.current_fy.end_date);
                setSelectedDate(configData.current_fy.end_date);
                setDateMode('fy');
                setSelectedFYId(configData.current_financial_year_id || '');
            }
            */
        } catch (error) {
            console.error('Error loading report context:', error);
        }


    }

    function handleResetFilters() {
        setSelectedLedgerId('');
        const today = getBusinessDate();
        setStartDate(today);
        setEndDate(today);
        setSelectedDate(today);
        setDateMode('today');
        setSelectedFYId('custom');

        setLedgerStatement([]);
        setTrialBalance([]);
        setPlData({ income: [], expense: [], netProfit: 0 });
        setBsData({ assets: [], liabilities: [], equity: [], retainedEarnings: 0 });
        setHasRanReport(false);
    }

    function handleExport(format: 'PDF' | 'EXCEL') {
        const periodStr = dateMode === 'today' ? formatDate(getBusinessDate()) :
            dateMode === 'single' ? formatDate(startDate) :
                `${formatDate(startDate)} to ${formatDate(endDate)}`;

        switch (activeReport) {
            case 'LEDGER_STMT':
            case 'CASH_BOOK':
            case 'BANK_BOOK':
                const ledger = ledgers.find(l => l.id === selectedLedgerId);
                exportLedgerStatement(ledgerStatement, ledger?.ledger_name || 'Account', periodStr, format);
                break;
            case 'TRIAL_BALANCE':
                exportTrialBalance(trialBalance, formatDate(endDate), format);
                break;
            case 'PL':
                exportProfitLoss(plData, periodStr, format);
                break;
            case 'BS':
                exportBalanceSheet(bsData, formatDate(endDate), format);
                break;
            case 'CP_CENTER':
                const cpLedger = ledgers.find(l => l.id === selectedLedgerId);
                const title = matchedParty ? `${matchedParty.party_name} - ${cpLedger?.ledger_name}` : (cpLedger?.ledger_name || 'Account');
                exportLedgerStatement(ledgerStatement, title, periodStr, format);
                break;
        }
    }

    useEffect(() => {
        // Only clear if we're moving away from a report or explicitly changing critical filters
        // But DON'T clear if we're just drill-down navigating within the Hub
        if (activeReport === 'HUB') {
            setLedgerStatement([]);
            setTrialBalance([]);
            setPlData({ income: [], expense: [], netProfit: 0 });
            setBsData({ assets: [], liabilities: [], equity: [], retainedEarnings: 0 });
            setHasRanReport(false);
        }
    }, [startDate, endDate, dateMode, selectedDate, activeReport, selectedFYId]);

    // Auto-enable movement columns in Period/FY mode for Trial Balance
    useEffect(() => {
        if (activeReport === 'TRIAL_BALANCE' && (dateMode === 'range' || dateMode === 'fy')) {
            setShowMovement(true);
        } else if (activeReport === 'TRIAL_BALANCE' && (dateMode === 'today' || dateMode === 'single')) {
            // Optional: User might want to keep it on, but Tally usually hides for "As On"
            // Let's leave it as is or default to false to declutter
            // setShowMovement(false); 
        }
    }, [dateMode, activeReport]);

    const handlePartySave = async (updatedParty: Party) => {
        try {
            await upsertParty(updatedParty);
            toast.success('Party updated successfully');
            setMatchedParty(updatedParty);
            // Refresh reports to reflect new opening balance
            runReport(activeReport, updatedParty.id);
        } catch (err: any) {
            toast.error(err.message || 'Failed to update party');
        }
    };

    const handleSaveOpeningBalance = async () => {
        setSavingOpening(true);
        try {
            await updateOpeningBalance(
                selectedLedgerId,
                matchedParty?.id || null,
                editingOpeningValue,
                editingOpeningSide
            );
            toast.success('Opening balance updated');
            setIsEditingOpening(false);
            runReport(activeReport, matchedParty?.id);
        } catch (err: any) {
            toast.error(err.message || 'Failed to update opening balance');
        } finally {
            setSavingOpening(false);
        }
    };

    function handleFYChange(fyId: string) {
        if (fyId === 'custom') {
            setSelectedFYId('custom');
            return;
        }

        const fy = financialYears.find(f => f.id === fyId);
        if (fy) {
            setStartDate(fy.start_date);
            setEndDate(fy.end_date);
            setSelectedDate(fy.end_date); // Defaults to end of period for single date reports
            setDateMode('fy');
            setSelectedFYId(fyId);
        }
    }

    function handleQuarterChange(quarter: number) {
        let fyId = selectedFYId;
        if (!fyId || fyId === 'custom') {
            fyId = systemConfig?.current_financial_year_id || (financialYears.length > 0 ? financialYears[0].id : '');
        }

        const fy = financialYears.find(f => f.id === fyId);
        if (fy) {
            const startStr = fy.start_date; // YYYY-MM-DD
            const start = new Date(startStr);

            // Calculate quarter start/end
            // Quarter is relative to FY start. Q1: month 0-2 (relative), Q2: 3-5, Q3: 6-8, Q4: 9-11
            const qStartMonth = (quarter - 1) * 3;
            const qEndMonth = qStartMonth + 2;

            const qStartDate = new Date(start);
            qStartDate.setMonth(start.getMonth() + qStartMonth);

            const qEndDate = new Date(start);
            qEndDate.setMonth(start.getMonth() + qEndMonth + 1);
            qEndDate.setDate(0); // Last day of the end month

            const pad = (n: number) => String(n).padStart(2, '0');
            const format = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

            setStartDate(format(qStartDate));
            setEndDate(format(qEndDate));
            setSelectedDate(format(qEndDate));
            setDateMode('quarters');
            setSelectedQuarter(quarter);
            setSelectedFYId(fyId);
        }
    }

    async function runReport(
        type?: ReportType,
        partyIdFilter?: string,
        overrideLedgerId?: string,
        overrideStartDate?: string,
        overrideEndDate?: string
    ) {
        setLoading(true);
        setHasRanReport(true);
        if (type) setActiveReport(type);

        const currentLedgerId = overrideLedgerId || selectedLedgerId;
        const currentStartDate = overrideStartDate || startDate;
        const currentEndDate = overrideEndDate || endDate;

        try {
            switch (type || activeReport) {
                case 'LEDGER_STMT':
                case 'CASH_BOOK':
                case 'BANK_BOOK': {
                    if (!currentLedgerId) return;
                    const statement = await fetchLedgerStatement(currentLedgerId, currentStartDate, currentEndDate);
                    setLedgerStatement(statement);
                    break;
                }
                case 'CP_CENTER': {
                    if (!currentLedgerId) return;
                    const cpStatement = await fetchLedgerStatement(currentLedgerId, currentStartDate, currentEndDate, partyIdFilter);
                    setLedgerStatement(cpStatement);
                    break;
                }
                case 'TRIAL_BALANCE': {
                    const { count: totalVouchers } = await supabase.from('vouchers').select('*', { count: 'exact', head: true });
                    const { count: periodVouchers } = await supabase.from('vouchers').select('*', { count: 'exact', head: true }).gte('voucher_date', currentStartDate).lte('voucher_date', currentEndDate);
                    const { data: statusCheck } = await supabase.from('vouchers').select('status, voucher_date').limit(20);
                    const { count: activeLedgers } = await supabase.from('ledgers').select('*', { count: 'exact', head: true }).eq('is_active', true);

                    console.log('Diagnostic - Total Vouchers in DB:', totalVouchers);
                    console.log('Diagnostic - Vouchers in Period:', periodVouchers);
                    console.log('Diagnostic - First 20 Vouchers:', statusCheck);
                    console.log('Diagnostic - Active Ledgers:', activeLedgers);

                    toast(`DB Check: ${totalVouchers} vouchers (${periodVouchers} in range). ${activeLedgers} active ledgers.`, { icon: '🔍' });

                    const includeDrafts = localStorage.getItem('hideDraftsInTB') !== 'true';
                    const tbContent = await fetchTrialBalance(currentStartDate, currentEndDate, includeDrafts);
                    setTrialBalance(tbContent);
                    if (tbContent && tbContent.length > 0) {
                        toast.success(`Found ${tbContent.length} accounting records.`);
                        console.table(tbContent);
                    } else {
                        toast.error('No movement found in the database for these dates.');
                    }
                    break;
                }
                case 'PL': {
                    const pl = await fetchProfitLoss(currentStartDate, currentEndDate);
                    setPlData(pl);
                    break;
                }
                case 'BS': {
                    const bs = await fetchBalanceSheet(currentEndDate);
                    setBsData(bs);
                    break;
                }
            }
        } catch (error) {
            console.error('CRITICAL REPORT ERROR:', error);
            toast.error('Failed to generate report. Check console for details.');
            setHasRanReport(false);
        } finally {
            setLoading(false);
        }
    }

    const toggleVisibility = async (featureId: string) => {
        const currentStatus = featureVisibility[featureId] !== false; // Default true
        const newStatus = !currentStatus;

        try {
            await updateFeatureVisibility(featureId, newStatus);
            setFeatureVisibility(prev => ({ ...prev, [featureId]: newStatus }));
            toast.success(newStatus ? 'Box enabled for all' : 'Box restricted to admins only');
        } catch (err) {
            toast.error('Failed to update visibility');
        }
    };

    function renderHub() {
        const reportTiles = [
            { id: 'LEDGER_STMT', name: 'Ledger Statement', desc: 'Detailed transaction list with running balance', icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
            { id: 'TRIAL_BALANCE', name: 'Trial Balance', desc: 'System health check - Ledger-wise totals', icon: Calculator, color: 'text-purple-600', bg: 'bg-purple-50' },
            { id: 'PL', name: 'Profit & Loss', desc: 'Income vs Expense performance monitoring', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { id: 'BS', name: 'Balance Sheet', desc: 'Snapshot of Assets, Liabilities, and Equity', icon: Landmark, color: 'text-brand-600', bg: 'bg-brand-50' },
            { id: 'CASH_BOOK', name: 'Cash Book', desc: 'Specialized ledger view for Cash accounts', icon: PieChart, color: 'text-amber-600', bg: 'bg-amber-50' },
            { id: 'BANK_BOOK', name: 'Bank Book', desc: 'Specialized ledger view for Bank accounts', icon: Landmark, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { id: 'CP_CENTER', name: 'Counterparty Accounts', desc: 'Manage Debtors & Creditors accounts', icon: User, color: 'text-rose-600', bg: 'bg-rose-50' },
        ];

        const filteredTiles = reportTiles.filter(tile => {
            if (isSuperAdmin) return true;
            return featureVisibility[`HUB_TILE_${tile.id}`] !== false;
        });

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredTiles.map((report) => {
                    const featureId = `HUB_TILE_${report.id}`;
                    const isEnabled = featureVisibility[featureId] !== false;

                    return (
                        <button
                            type="button"
                            key={report.id}
                            onClick={() => {
                                // 1. Reset shared context state
                                setSelectedLedgerId('');
                                setMatchedParty(null);
                                setPartySearch('');
                                setLedgerStatement([]);
                                setHasRanReport(false);

                                setActiveReport(report.id as ReportType);

                                // For Counterparty Accounts, default to Financial Year view so they see history
                                if (report.id === 'CP_CENTER' && systemConfig?.current_fy) {
                                    setStartDate(systemConfig.current_fy.start_date);
                                    setEndDate(systemConfig.current_fy.end_date);
                                    setDateMode('fy');
                                    setSelectedFYId(systemConfig.current_financial_year_id || '');
                                }

                                // Auto-select first matching ledger for Cash/Bank Book
                                if (report.id === 'CASH_BOOK' || report.id === 'BANK_BOOK') {
                                    const settlementCashTagId = ledgerTags.find(t => t.tag_name.toUpperCase().includes('PHYSICAL CASH'))?.id;
                                    const settlementBankTagId = ledgerTags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id;

                                    const matchingLedger = ledgers.find(l => {
                                        if (!l.is_cash_bank) return false;

                                        const hasBankTag = settlementBankTagId && l.business_tags?.includes(settlementBankTagId);
                                        const hasCashTag = settlementCashTagId && l.business_tags?.includes(settlementCashTagId);

                                        const isBankFallback = !hasCashTag && (
                                            l.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                                            l.ledger_name?.toLowerCase().includes('bank')
                                        );

                                        const isBank = hasBankTag || isBankFallback;
                                        const isCash = l.is_cash_bank && !isBank;

                                        return report.id === 'CASH_BOOK' ? isCash : isBank;
                                    });

                                    if (matchingLedger) setSelectedLedgerId(matchingLedger.id);
                                }
                            }}
                            className={`surface-card p-10 text-left group hover:shadow-glow hover:-translate-y-2 transition-all duration-300 border-dashed border-2 hover:border-solid hover:border-brand-500/30 relative ${!isEnabled && isSuperAdmin ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/50' : ''}`}
                        >
                            {isSuperAdmin && (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleVisibility(featureId);
                                    }}
                                    className={`absolute top-4 right-4 p-2 rounded-xl transition-all ${isEnabled ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-500/10' : 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'}`}
                                    title={isEnabled ? 'Restrict to Admin' : 'Enable for All'}
                                >
                                    {isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                                </div>
                            )}

                            <div className={`w-14 h-14 ${report.bg} ${report.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                <report.icon size={28} />
                            </div>
                            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-2 group-hover:text-brand-600 transition-colors">
                                {report.name}
                                {!isEnabled && isSuperAdmin && <span className="ml-2 text-[8px] px-1.5 py-0.5 bg-rose-500/20 text-rose-500 rounded-full font-black tracking-widest">ADMIN ONLY</span>}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                                {report.desc}
                            </p>
                        </button>
                    );
                })}
            </div>
        );
    }

    async function findPartyByLedger(ledgerId: string) {
        setMatchedParty(null);
        setActivePartyIds([]);
        setPartyBalances({});
        setCpViewMode('list');

        try {
            const [activeIds, balances] = await Promise.all([
                fetchPartiesForLedger(ledgerId),
                fetchPartyBalancesForLedger(ledgerId)
            ]);
            setActivePartyIds(activeIds);
            setPartyBalances(balances);

            if (activeIds.length === 1) {
                const party = parties.find(p => p.id === activeIds[0]);
                if (party) {
                    setMatchedParty(party);
                    setCpViewMode('ledger');
                    runReport('CP_CENTER', party.id, ledgerId);
                }
            }
        } catch (error) {
            console.error('Error fetching active counterparties:', error);
        }
    }

    function renderCPPartyList() {
        const ledger = ledgers.find(l => l.id === selectedLedgerId);
        if (!ledger) return null;

        const filteredParties = parties.filter(p => {
            const isRelevant = activePartyIds.includes(p.id);
            if (!isRelevant) return false;

            const term = partySearch.toLowerCase();
            return p.party_name.toLowerCase().includes(term) ||
                (p.phone && p.phone.includes(term)) ||
                (p.customer_id && p.customer_id.toLowerCase().includes(term));
        });

        return (
            <div className="animate-fade-in space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedLedgerId('');
                                setMatchedParty(null);
                                setCpViewMode('list');
                            }}
                            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-brand-500 hover:border-brand-500/50 transition-all shadow-sm"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div>
                            <h3 className="text-3xl font-display font-black text-white uppercase tracking-tighter leading-tight">
                                {ledger.ledger_name}
                            </h3>
                            <p className="text-[10px] text-brand-500 font-black uppercase tracking-[0.2em] mt-1">
                                SELECT COUNTERPARTY &bull; {filteredParties.length} PROFILES MATCHED
                            </p>
                        </div>
                    </div>
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, ID or phone..."
                            className="input-field pl-12 h-12 text-xs font-bold"
                            value={partySearch}
                            onChange={(e) => setPartySearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex flex-col p-1 space-y-1">
                    {filteredParties.map(party => (
                        <div
                            key={party.id}
                            className="group flex items-center justify-between p-4 rounded-2xl transition-all border border-transparent hover:bg-white/5 hover:border-white/5 cursor-pointer"
                            onClick={() => {
                                setMatchedParty(party);
                                setCpViewMode('ledger');
                                runReport('CP_CENTER', party.id, selectedLedgerId);
                            }}
                        >
                            <div className="flex items-center gap-4 flex-1">
                                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 transition-colors">
                                    <User size={20} className="text-slate-600 dark:text-slate-400 group-hover:text-brand-500" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-[13px] font-bold text-slate-900 dark:text-white uppercase tracking-wide truncate group-hover:text-brand-600 transition-colors block text-left">
                                            {party.party_name}
                                        </h4>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-[8px] font-black tracking-[0.1em] uppercase text-slate-400">
                                            {party.party_type || 'PARTY'}
                                        </span>
                                        {party.phone && (
                                            <div className="flex items-center gap-1.5 opacity-40">
                                                <span className="text-[9px] font-bold tracking-tight">{party.phone}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {party.customer_id && (
                                    <div className="hidden md:flex flex-col items-end px-4 border-r border-white/5">
                                        <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">ID</span>
                                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tighter">{party.customer_id}</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-4 min-w-[140px] justify-end">
                                    {partyBalances[party.id] && (
                                        <div className="text-right">
                                            <p className={`text-[11px] font-mono font-black ${partyBalances[party.id].side === 'DR' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                ₹{formatNumber(partyBalances[party.id].balance)} {partyBalances[party.id].side}
                                            </p>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMatchedParty(party);
                                            setIsProfileModalOpen(true);
                                        }}
                                        className="p-2 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-xl transition-all"
                                        title="View Profile"
                                    >
                                        <Eye size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredParties.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                            <User size={48} className="text-slate-600" />
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No matching counterparties found</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }


    function renderCPCenter() {
        const cpTag = ledgerTags.find(t => t.tag_name === 'COUNTERPARTY ACCOUNTS');
        let cpLedgers = ledgers.filter(l => cpTag && l.business_tags?.includes(cpTag.id));

        if (!isSuperAdmin) {
            cpLedgers = cpLedgers.filter(ledger => featureVisibility[`CP_LEDGER_${ledger.id}`] !== false);
        }

        if (!selectedLedgerId) {
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in text-slate-100">
                    {cpLedgers.map((ledger) => {
                        const featureId = `CP_LEDGER_${ledger.id}`;
                        const isEnabled = featureVisibility[featureId] !== false;

                        return (
                            <button
                                type="button"
                                key={ledger.id}
                                onClick={() => {
                                    handleLedgerSelect(ledger.id);
                                    findPartyByLedger(ledger.id);
                                }}
                                className={`surface-card p-8 text-left group hover:shadow-glow hover:-translate-y-1 transition-all duration-300 border-2 relative ${!isEnabled && isSuperAdmin ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/50' : 'border-transparent hover:border-brand-500/20'}`}
                            >
                                {isSuperAdmin && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleVisibility(featureId);
                                        }}
                                        className={`absolute top-4 right-4 p-2 rounded-xl transition-all z-20 ${isEnabled ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-500/10' : 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'}`}
                                        title={isEnabled ? 'Restrict to Admin' : 'Enable for All'}
                                    >
                                        {isEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </div>
                                )}
                                <div className="flex items-start justify-between">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl group-hover:bg-brand-50 dark:group-hover:bg-brand-900/20 transition-colors duration-300 shadow-inner">
                                        <Building2 size={24} className="text-slate-600 dark:text-slate-400 group-hover:text-brand-500" />
                                    </div>
                                    <ArrowRight size={20} className="text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
                                </div>
                                <div className="mt-8">
                                    <h3 className="text-lg font-display font-black text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-brand-600 transition-colors">
                                        {ledger.ledger_name}
                                        {!isEnabled && isSuperAdmin && <span className="ml-2 text-[8px] px-1.5 py-0.5 bg-rose-500/20 text-rose-500 rounded-full font-black tracking-widest">ADMIN ONLY</span>}
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">{ledger.nature}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            );
        }

        const ledger = ledgers.find(l => l.id === selectedLedgerId);
        const content = cpViewMode === 'list' ? renderCPPartyList() : (
            <div className="animate-fade-in space-y-8">
                {/* Hub Detail Header */}
                <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-6">
                        <button
                            type="button"
                            onClick={() => setCpViewMode('list')}
                            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-brand-500 hover:border-brand-500/50 transition-all shadow-sm"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-3xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-tight">
                                    {matchedParty?.party_name || ledger?.ledger_name}
                                </h3>
                                {matchedParty && (
                                    <button
                                        type="button"
                                        onClick={() => setIsProfileModalOpen(true)}
                                        className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-brand-50 transition-all ml-2"
                                        title="View Profile"
                                    >
                                        <Eye size={20} />
                                    </button>
                                )}
                            </div>
                            <p className="text-[10px] text-brand-500 font-black uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                                <Check size={12} /> Statement Ledger View
                            </p>
                        </div>
                    </div>
                </div>
                {renderLedgerStatement()}
            </div>
        );

        return content;
    }

    function renderReportHeader(title: string) {
        return (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 animate-fade-in relative z-10">
                <div className="flex items-center gap-6">
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedLedgerId('');
                            setMatchedParty(null);
                            setPartySearch('');
                            setHasRanReport(false);
                            setLedgerStatement([]);

                            if (activeReport === 'CP_CENTER') {
                                setCpViewMode('list');
                            }
                            setActiveReport('HUB');
                        }}
                        className="w-12 h-12 flex items-center justify-center bg-slate-900/40 border border-white/5 rounded-2xl text-slate-400 hover:text-brand-400 hover:border-brand-500/30 hover:shadow-glow hover:shadow-brand-500/10 transition-all group"
                    >
                        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-3xl font-display font-black text-white uppercase tracking-tighter leading-none">{title}</h2>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                                <span className="w-1 h-1 rounded-full bg-brand-500 animate-pulse"></span>
                                <span className="text-[8px] font-black text-brand-400 uppercase tracking-widest">Live Engine</span>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-2">Audit-Grade Financial Architecture &bull; ISO Compliant</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!(activeReport === 'CP_CENTER' && cpViewMode === 'list') && (
                        <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md">
                            <button
                                type="button"
                                onClick={() => handleExport('PDF')}
                                disabled={!hasRanReport}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-white hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                                <Download size={14} className="opacity-50" /> PDF
                            </button>
                            <div className="w-px h-4 bg-white/10 self-center mx-1"></div>
                            <button
                                type="button"
                                onClick={() => handleExport('EXCEL')}
                                disabled={!hasRanReport}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-white hover:bg-white/5 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                                <Download size={14} className="opacity-50" /> Excel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    function renderFilters() {
        // Note: Filtering is now handled by the LedgerPickerModal component


        return (
            <div className="surface-card p-4 mb-6 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex flex-col xl:flex-row gap-4 items-center">
                    {(activeReport === 'LEDGER_STMT' || activeReport === 'CASH_BOOK' || activeReport === 'BANK_BOOK' || (activeReport === 'CP_CENTER' && selectedLedgerId)) && (
                        <div className="flex-1 w-full relative z-20">
                            {activeReport === 'CP_CENTER' ? (
                                <div className="input-field !h-10 w-full text-left flex items-center justify-between font-bold bg-slate-100 dark:bg-slate-800 border-brand-500/20 opacity-70 cursor-not-allowed">
                                    <span className="text-slate-900 dark:text-white text-xs">
                                        {ledgers.find(l => l.id === selectedLedgerId)?.ledger_name}
                                    </span>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsPickerOpen(true)}
                                    className="select-field !h-10 w-full text-left flex items-center justify-between font-bold group hover:border-brand-500/50 transition-all bg-white dark:bg-slate-900"
                                >
                                    <span className={selectedLedgerId ? 'text-slate-900 dark:text-white text-xs' : 'text-slate-400 text-xs'}>
                                        {selectedLedgerId
                                            ? ledgers.find(l => l.id === selectedLedgerId)?.ledger_name || 'Account Selected'
                                            : 'Choose Account...'}
                                    </span>
                                    <TrendingUp size={14} className="text-slate-400 group-hover:text-brand-500" />
                                </button>
                            )}
                        </div>
                    )}



                    {/* Financial Period Section */}
                    <div className="flex-[2] w-full min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDateMode('today');
                                        const today = getBusinessDate();
                                        setStartDate(today);
                                        setEndDate(today);
                                        setSelectedFYId('custom');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'today'
                                        ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                >
                                    Today
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDateMode('single');
                                        setSelectedFYId('custom');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'single'
                                        ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                >
                                    Date
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDateMode('range');
                                        setSelectedFYId('custom');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'range'
                                        ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                >
                                    Range
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDateMode('quarters');
                                        handleQuarterChange(selectedQuarter || 1);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'quarters'
                                        ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                >
                                    Quarters
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDateMode('fy');
                                        if (systemConfig?.current_fy) {
                                            handleFYChange(systemConfig.current_financial_year_id!);
                                        }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'fy'
                                        ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                >
                                    FY
                                </button>
                            </div>

                            {dateMode === 'quarters' && (
                                <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                                    {[1, 2, 3, 4].map(q => (
                                        <button
                                            key={q}
                                            type="button"
                                            onClick={() => handleQuarterChange(q)}
                                            className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${selectedQuarter === q
                                                ? 'bg-brand-500 text-white shadow-glow'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                        >
                                            Q{q}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {dateMode === 'fy' && (
                                <select
                                    className="select-field !py-1.5 !h-10 text-[10px] font-black w-full md:w-44 bg-white dark:bg-slate-900 border-brand-500/20 shadow-glow uppercase tracking-wider"
                                    value={selectedFYId || 'custom'}
                                    onChange={(e) => handleFYChange(e.target.value)}
                                >
                                    <option value="custom">SELECT FY...</option>
                                    {financialYears.map(fy => (
                                        <option key={fy.id} value={fy.id}>
                                            {fy.name} {fy.is_closed ? '(LOCKED)' : ''}
                                        </option>
                                    ))}
                                </select>
                            )}

                            {dateMode === 'single' && (
                                <input
                                    type="date"
                                    className="input-field !w-auto !py-1.5 !h-10 text-[11px] font-bold"
                                    value={selectedDate}
                                    onChange={e => {
                                        const d = e.target.value;
                                        setSelectedDate(d);
                                        setStartDate(d);
                                        setEndDate(d);
                                        setSelectedFYId('custom');
                                    }}
                                />
                            )}

                            {dateMode === 'range' && (
                                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1 h-10 shadow-sm">
                                    <input
                                        type="date"
                                        className="bg-transparent border-none text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-0 p-1"
                                        value={startDate}
                                        onChange={e => {
                                            setStartDate(e.target.value);
                                            setSelectedFYId('custom');
                                        }}
                                    />
                                    <span className="text-slate-400 font-bold text-[10px]">TO</span>
                                    <input
                                        type="date"
                                        className="bg-transparent border-none text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-0 p-1"
                                        value={endDate}
                                        onChange={e => {
                                            setEndDate(e.target.value);
                                            setSelectedFYId('custom');
                                        }}
                                    />
                                </div>
                            )}

                            {/* Closed Period Badge (shown inline) */}
                            {(() => {
                                const activeFY = financialYears.find(fy => {
                                    const s = new Date(fy.start_date);
                                    const e = new Date(fy.end_date);
                                    const currS = new Date(startDate);
                                    const currE = new Date(endDate);
                                    return currS >= s && currE <= e;
                                });
                                if (activeFY?.is_closed) {
                                    return (
                                        <div className="flex items-center gap-1.5 text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 h-6 shrink-0">
                                            <span>🔒</span> Locked
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    </div>

                    <div className="w-full xl:w-auto flex items-center gap-2">
                        {activeReport === 'TRIAL_BALANCE' && (
                            <button
                                type="button"
                                onClick={() => setIncludeDrafts(!includeDrafts)}
                                className={`h-10 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-2 flex items-center gap-2 ${includeDrafts ? 'bg-amber-500 border-amber-500 text-white shadow-glow animate-pulse-slow' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-amber-400'}`}
                            >
                                <Check size={12} className={includeDrafts ? 'opacity-100' : 'opacity-0'} />
                                {includeDrafts ? 'DRAFTS INCLUDED' : 'INCLUDE DRAFTS'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            className="btn-secondary !h-10 px-4 text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-colors bg-white dark:bg-slate-900"
                            title="Reset all filters"
                        >
                            <RotateCcw size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => runReport(activeReport)}
                            className="btn-primary flex-1 xl:flex-none !h-10 px-6 text-[9px] font-black uppercase tracking-widest shadow-glow hover:scale-105 active:scale-95 transition-all"
                        >
                            Generate Report
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    function renderLedgerStatement() {
        return (
            <div className="surface-card bg-slate-900/40 border-slate-800/50 animate-fade-in overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Temporal Flow (Date)</th>
                                <th className="px-4 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Document / Voucher</th>
                                <th className="px-4 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction Narration</th>
                                {ledgerStatement.some(r => r.ledger_name) && (
                                    <th className="px-4 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Ledger Interface</th>
                                )}
                                {ledgerStatement.some(r => r.party_name) && (
                                    <th className="px-4 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Counterparty</th>
                                )}
                                {ledgerStatement.some(r => r.quantity) && (
                                    <th className="px-4 py-5 text-center">
                                        <div className="flex items-center justify-center gap-3">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity Metrics</span>
                                            <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                                                <input
                                                    type="checkbox"
                                                    id="qty-bal-toggle"
                                                    checked={showQuantityBalance}
                                                    onChange={(e) => setShowQuantityBalance(e.target.checked)}
                                                    className="w-3 h-3 rounded bg-slate-800 border-slate-700 text-brand-500 focus:ring-0 cursor-pointer"
                                                />
                                                <label htmlFor="qty-bal-toggle" className="text-[8px] font-black text-slate-500 uppercase tracking-tighter cursor-pointer select-none">
                                                    Bal View
                                                </label>
                                            </div>
                                        </div>
                                    </th>
                                )}
                                <th className="px-4 py-5 text-right text-[10px] font-black text-emerald-500/50 uppercase tracking-widest bg-emerald-500/[0.01]">Debit Magnitude</th>
                                <th className="px-4 py-5 text-right text-[10px] font-black text-rose-500/50 uppercase tracking-widest bg-rose-500/[0.01]">Credit Magnitude</th>
                                <th className="px-4 py-5 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">Net Effect</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] bg-white/[0.01]">Synthesized Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {ledgerStatement.map((row, i) => (
                                <tr
                                    key={i}
                                    className={`group transition-colors ${row.is_opening
                                        ? 'bg-brand-600/10 border-brand-500/20'
                                        : 'hover:bg-white/[0.02]'
                                        }`}
                                >
                                    <td className="px-8 py-5 whitespace-nowrap">
                                        {row.is_opening ? (
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-glow shadow-brand-500/30"></div>
                                                <span className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-black">Opening Baseline</span>
                                                {matchedParty && !isEditingOpening && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingOpeningValue(row.balance);
                                                            setEditingOpeningSide(row.balance_side);
                                                            setIsEditingOpening(true);
                                                        }}
                                                        className="p-1 text-slate-500 hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Calibrate Opening Value"
                                                    >
                                                        <Edit2 size={10} />
                                                    </button>
                                                )}
                                                {isEditingOpening && (
                                                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95">
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveOpeningBalance}
                                                            disabled={savingOpening}
                                                            className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded-md transition-all"
                                                        >
                                                            {savingOpening ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsEditingOpening(false)}
                                                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition-all"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs font-bold text-slate-400">{formatDate(row.date)}</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-5">
                                        {row.is_opening ? (
                                            <span className="text-slate-600">—</span>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-brand-400 font-mono tracking-tight uppercase">{row.voucher_no}</span>
                                                {row.is_reversed && (
                                                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black uppercase tracking-tighter">
                                                        ↺ Reversed
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    <td className={`px-4 py-5 text-xs ${row.is_opening ? 'text-brand-300 font-bold' : 'text-slate-400 group-hover:text-slate-200'} transition-colors leading-relaxed`}>
                                        {row.narration}
                                    </td>

                                    {ledgerStatement.some(r => r.ledger_name) && (
                                        <td className="px-4 py-5">
                                            {row.ledger_name ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors uppercase tracking-tight">{row.ledger_name}</span>
                                                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{row.ledger_nature}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                    )}

                                    {ledgerStatement.some(r => r.party_name) && (
                                        <td className="px-4 py-5">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{row.party_name || <span className="text-slate-600">—</span>}</span>
                                                {row.customer_id && <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">ID: {row.customer_id}</span>}
                                            </div>
                                        </td>
                                    )}

                                    {ledgerStatement.some(r => r.quantity) && (
                                        <td className="px-4 py-5 text-center font-mono">
                                            {row.quantity ? (
                                                <div className="inline-flex items-baseline gap-1.5 px-3 py-1 bg-white/5 rounded-lg border border-white/5">
                                                    <span className="text-xs font-black text-brand-400">{row.quantity}</span>
                                                    <span className="text-[10px] text-slate-500 font-black uppercase">{row.uom_code}</span>
                                                </div>
                                            ) : <span className="text-slate-600">—</span>}
                                        </td>
                                    )}

                                    <td className="px-4 py-5 text-right">
                                        <span className={`font-mono text-sm font-black ${row.debit > 0 ? 'text-emerald-400' : 'text-slate-600 opacity-20'}`}>
                                            {row.debit > 0 ? formatNumber(row.debit) : '—'}
                                        </span>
                                    </td>

                                    <td className="px-4 py-5 text-right">
                                        <span className={`font-mono text-sm font-black ${row.credit > 0 ? 'text-rose-400' : 'text-slate-600 opacity-20'}`}>
                                            {row.credit > 0 ? formatNumber(row.credit) : '—'}
                                        </span>
                                    </td>

                                    <td className="px-4 py-5 text-center">
                                        {row.is_opening ? (
                                            <span className="text-slate-600 text-xs">—</span>
                                        ) : (
                                            <div className="flex items-center justify-center">
                                                <div className={`flex items-center justify-center w-7 h-7 rounded-full transition-all border ${row.effect_direction === 'increase'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                    }`} title={row.effect_direction === 'increase' ? 'Magnitude Appreciation' : 'Magnitude Depreciation'}>
                                                    {row.effect_direction === 'increase' ? <ArrowUpRight size={14} strokeWidth={3} /> : <ArrowDownRight size={14} strokeWidth={3} />}
                                                </div>
                                            </div>
                                        )}
                                    </td>

                                    <td className="px-8 py-5 text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            {row.is_opening && isEditingOpening ? (
                                                <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-xl border border-brand-500/30 shadow-glow shadow-brand-500/5 transition-all">
                                                    <input
                                                        type="number"
                                                        className="w-24 px-2 py-1 bg-transparent text-right text-xs font-black text-white outline-none"
                                                        value={editingOpeningValue === 0 ? '' : editingOpeningValue}
                                                        onChange={e => setEditingOpeningValue(e.target.value === '' ? 0 : Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        autoFocus
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingOpeningSide(editingOpeningSide === 'DR' ? 'CR' : 'DR')}
                                                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-all border ${editingOpeningSide === 'DR' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}
                                                    >
                                                        {editingOpeningSide}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-baseline gap-2">
                                                    <span className={`text-sm font-mono font-black ${showQuantityBalance ? 'text-brand-300' : 'text-white'}`}>
                                                        {showQuantityBalance ? row.quantity_balance : formatNumber(row.balance)}
                                                    </span>
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{showQuantityBalance ? row.uom_code : row.balance_side}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {ledgerStatement.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={10}
                                        className="py-32 text-center opacity-20"
                                    >
                                        <div className="flex flex-col items-center gap-4">
                                            <BookOpen size={48} />
                                            <p className="text-[11px] font-black uppercase tracking-[0.4em]">Zero Ledger Records Synthesized</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    function renderTrialBalance() {
        const toggleNode = (nodeId: string) => {
            const next = new Set(expandedNodes);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            setExpandedNodes(next);
        };

        const renderRow = (row: TrialBalanceRow) => {
            const isExpanded = expandedNodes.has(row.node_id);
            const indent = row.depth * 24;
            const hasChildren = !row.is_leaf;

            return (
                <tr key={row.node_id} className={`group transition-colors ${row.node_type === 'GROUP' ? 'bg-white/[0.02]' : 'hover:bg-white/[0.01]'}`}>
                    <td className="px-4 py-4 font-medium text-slate-300 dark:text-white uppercase tracking-tight" style={{ paddingLeft: `${indent + 24}px` }}>
                        <div className="flex items-center gap-3">
                            {hasChildren && (
                                <button
                                    type="button"
                                    onClick={() => toggleNode(row.node_id)}
                                    className={`p-1 rounded-md transition-all ${isExpanded ? 'bg-brand-500/10 text-brand-400' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            )}
                            {!hasChildren && <div className="w-6 h-6 flex items-center justify-center opacity-20"><div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div></div>}
                            <span className={row.node_type === 'GROUP' ? 'font-black text-slate-100 italic' : 'font-bold text-slate-400 group-hover:text-slate-200'}>
                                {row.node_name}
                            </span>
                            {row.node_type === 'LEDGER' && row.allow_party && row.reconciliation_gap > 0.01 && (
                                <div
                                    className="group/warn relative flex items-center justify-center w-5 h-5 bg-rose-500/20 border border-rose-500/30 rounded-full text-rose-500 cursor-help shrink-0 ml-2"
                                >
                                    <X size={10} strokeWidth={4} />
                                    <div className="absolute left-full ml-3 hidden group-hover/warn:block z-50 w-72 p-5 bg-slate-900/95 border border-white/10 backdrop-blur-2xl rounded-2xl shadow-2xl">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 mb-2">Reconciliation Anomaly</p>
                                        <div className="space-y-2 text-[11px] font-bold text-slate-300 leading-relaxed">
                                            <p className="flex justify-between">Control: <span className="text-white">₹{formatNumber(row.closing_dr - row.closing_cr)}</span></p>
                                            <p className="flex justify-between">Parties: <span className="text-white">₹{formatNumber(row.sub_ledger_total)}</span></p>
                                            <div className="h-px bg-white/5 my-2" />
                                            <p className="opacity-70 italic font-medium">Party-maintained ledger mismatch. Verify individual party entries against control total.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </td>

                    {showMovement && (
                        <>
                            <td className="px-4 py-4 text-right font-mono text-xs text-slate-500">
                                {row.opening_dr > 0 ? formatNumber(row.opening_dr) : '-'}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs text-slate-500">
                                {row.opening_cr > 0 ? formatNumber(row.opening_cr) : '-'}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs text-emerald-500/60">
                                {row.period_dr > 0 ? formatNumber(row.period_dr) : '-'}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs text-rose-500/60">
                                {row.period_cr > 0 ? formatNumber(row.period_cr) : '-'}
                            </td>
                        </>
                    )}

                    <td className="px-6 py-4 text-right">
                        <span className={`font-mono text-sm font-black ${row.closing_dr > 0 ? 'text-slate-200' : 'text-slate-600 opacity-20'}`}>
                            {row.closing_dr > 0 ? formatNumber(row.closing_dr) : '-'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <span className={`font-mono text-sm font-black ${row.closing_cr > 0 ? 'text-slate-200' : 'text-slate-600 opacity-20'}`}>
                            {row.closing_cr > 0 ? formatNumber(row.closing_cr) : '-'}
                        </span>
                    </td>
                </tr>
            );
        };

        const displayRows = trialBalance.filter(row => {
            if (!row.parent_id) return true;
            let current = row;
            while (current.parent_id) {
                if (expandedNodes.has(current.parent_id)) {
                    const parent = trialBalance.find(r => r.node_id === current.parent_id);
                    if (!parent || !parent.parent_id) return true;
                    current = parent;
                } else {
                    return false;
                }
            }
            return true;
        });

        const totalDr = trialBalance.filter(r => !r.parent_id).reduce((sum, r) => sum + r.closing_dr, 0);
        const totalCr = trialBalance.filter(r => !r.parent_id).reduce((sum, r) => sum + r.closing_cr, 0);

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-4">
                        <div className={`px-4 py-2 rounded-full border-2 font-black text-[9px] uppercase tracking-[0.2em] transition-all shadow-glow shadow-indigo-500/5 ${dateMode === 'range' || dateMode === 'fy'
                            ? 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                            {dateMode === 'range' || dateMode === 'fy' ? 'Dynamic Movement Analytics' : 'Point-in-Time Inventory'}
                        </div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] hidden sm:block">
                            Hierarchical Value Distribution
                        </h4>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowMovement(!showMovement)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${showMovement ? 'bg-brand-600 text-white border-brand-500 shadow-glow' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'}`}
                        >
                            <TrendingUp size={12} />
                            {showMovement ? 'Movement Visible' : 'Show Movement'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const allGroups = trialBalance.filter(r => r.node_type === 'GROUP').map(r => r.node_id);
                                if (expandedNodes.size === allGroups.length) setExpandedNodes(new Set());
                                else setExpandedNodes(new Set(allGroups));
                            }}
                            className="px-4 py-2 bg-slate-800 text-[10px] font-black uppercase tracking-widest border border-slate-700 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-all"
                        >
                            {expandedNodes.size > 0 ? 'Contract Deep Hierarchy' : 'Expand All Nodes'}
                        </button>
                    </div>
                </div>

                <div className="surface-card bg-slate-900/40 border-slate-800/50">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Institutional Chart of Accounts</th>
                                    {showMovement && (
                                        <>
                                            <th className="px-4 py-5 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest bg-black/10">Opening (DR)</th>
                                            <th className="px-4 py-5 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest bg-black/10">Opening (CR)</th>
                                            <th className="px-4 py-5 text-right text-[10px] font-black text-emerald-500/50 uppercase tracking-widest">Period (DR)</th>
                                            <th className="px-4 py-5 text-right text-[10px] font-black text-rose-500/50 uppercase tracking-widest">Period (CR)</th>
                                        </>
                                    )}
                                    <th className="px-8 py-5 text-right text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] bg-white/[0.01]">Mag. Debit</th>
                                    <th className="px-8 py-5 text-right text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] bg-white/[0.01]">Mag. Credit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-semibold">
                                {trialBalance.length === 0 && (
                                    <tr>
                                        <td colSpan={showMovement ? 7 : 3} className="py-32 text-center opacity-20">
                                            <div className="flex flex-col items-center gap-4">
                                                <Calculator size={48} />
                                                <p className="text-[11px] font-black uppercase tracking-[0.4em]">Zero Ledger Movement</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {displayRows.map(row => renderRow(row))}
                            </tbody>
                            {trialBalance.length > 0 && (
                                <tfoot className="bg-brand-600/10 border-t border-brand-500/20">
                                    <tr className="font-display font-black">
                                        <td className="px-8 py-8 text-slate-200 uppercase tracking-[0.3em] text-[11px]">System Grand Total Balance</td>
                                        {showMovement && <td colSpan={4}></td>}
                                        <td className="px-8 py-8 text-right text-2xl font-mono text-white tracking-tighter">₹{formatNumber(totalDr)}</td>
                                        <td className="px-8 py-8 text-right text-2xl font-mono text-white tracking-tighter">₹{formatNumber(totalCr)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    function renderProfitLoss() {
        const totalIncome = plData.income.reduce((sum, r) => sum + r.amount, 0);
        const totalExpense = plData.expense.reduce((sum, r) => sum + r.amount, 0);
        const netProfit = totalIncome - totalExpense;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                {/* Income Case */}
                <div className="surface-card bg-slate-900/40 border-slate-800/50 h-fit">
                    <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-glow shadow-emerald-500/20"></div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Direct & Indirect Incomes</h3>
                        </div>
                        <span className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest">{plData.income.length} Streams</span>
                    </div>
                    <div className="p-2">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-white/5">
                                {plData.income.map((row, i) => (
                                    <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors uppercase tracking-tight">{row.head}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-mono text-sm font-black text-emerald-400">₹{formatNumber(row.amount)}</span>
                                        </td>
                                    </tr>
                                ))}
                                {plData.income.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-6 py-12 text-center opacity-20">
                                            <TrendingUp size={24} className="mx-auto mb-2" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">No Income Records</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-8 py-6 bg-emerald-500/5 border-t border-emerald-500/10 flex justify-between items-center">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Total Revenue</span>
                        <span className="text-xl font-mono font-black text-emerald-400 tracking-tighter">₹{formatNumber(totalIncome)}</span>
                    </div>
                </div>

                {/* Expenses Case */}
                <div className="surface-card bg-slate-900/40 border-slate-800/50 h-fit">
                    <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-6 bg-rose-500 rounded-full shadow-glow shadow-rose-500/20"></div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Direct & Indirect Expenses</h3>
                        </div>
                        <span className="text-[10px] font-black text-rose-500/50 uppercase tracking-widest">{plData.expense.length} Categories</span>
                    </div>
                    <div className="p-2">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-white/5">
                                {plData.expense.map((row, i) => (
                                    <tr key={i} className="group hover:bg-white/[0.02] transition-all">
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors uppercase tracking-tight">{row.head}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-mono text-sm font-black text-rose-400">₹{formatNumber(row.amount)}</span>
                                        </td>
                                    </tr>
                                ))}
                                {plData.expense.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-6 py-12 text-center opacity-20">
                                            <TrendingUp size={24} className="mx-auto mb-2" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">No Expenditure Records</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-8 py-6 bg-rose-500/5 border-t border-rose-500/10 flex justify-between items-center">
                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Total Expenditures</span>
                        <span className="text-xl font-mono font-black text-rose-400 tracking-tighter">₹{formatNumber(totalExpense)}</span>
                    </div>
                </div>

                {/* Performance Summary Banner */}
                {(plData.income.length > 0 || plData.expense.length > 0) && (
                    <div className="lg:col-span-2 relative overflow-hidden group">
                        <div className={`surface-card p-12 border-none relative z-10 flex flex-col md:flex-row justify-between items-center gap-8 ${netProfit >= 0 ? 'bg-gradient-to-br from-brand-600 to-indigo-700' : 'bg-gradient-to-br from-rose-600 to-rose-800'}`}>
                            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-48 -mt-48 blur-3xl group-hover:scale-110 transition-transform duration-700"></div>

                            <div className="relative">
                                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/60 mb-3">Institutional Performance Statement</p>
                                <h2 className="text-5xl font-display font-black text-white leading-none tracking-tighter">
                                    {netProfit >= 0 ? 'NET RETAINED PROFIT' : 'NET OPERATING LOSS'}
                                </h2>
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mt-6 flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse"></div>
                                    Reflecting real-time operating efficiency across cost centers
                                </div>
                            </div>

                            <div className="text-center md:text-right relative">
                                <div className="text-7xl font-mono font-black text-white tracking-tighter leading-none mb-2">
                                    ₹{formatNumber(Math.abs(netProfit))}
                                </div>
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/20 rounded-full border border-white/10 mt-4 backdrop-blur-md">
                                    <div className={`w-2 h-2 rounded-full ${netProfit >= 0 ? 'bg-emerald-400' : 'bg-rose-400 shadow-glow shadow-rose-500'}`}></div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                                        {netProfit >= 0 ? 'Surplus Liquidity Detected' : 'Operational Deficit Identified'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    function renderBalanceSheet() {
        const totalAssets = bsData.assets.reduce((sum, r) => sum + r.amount, 0);
        const totalLiabilities = bsData.liabilities.reduce((sum, r) => sum + r.amount, 0);
        const totalEquity = bsData.equity.reduce((sum, r) => sum + r.amount, 0);

        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in pb-20">
                <div className="space-y-8">
                    {/* Liabilities */}
                    <div className="surface-card bg-slate-900/40 border-slate-800/50 h-fit">
                        <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-6 bg-indigo-500 rounded-full shadow-glow shadow-indigo-500/20"></div>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Institutional Liabilities & Equities</h3>
                            </div>
                            <span className="text-[10px] font-black text-indigo-500/50 uppercase tracking-widest">Capital & Obligations</span>
                        </div>
                        <div className="p-2">
                            <table className="w-full text-sm">
                                <tbody className="divide-y divide-white/5 font-semibold">
                                    <tr className="bg-white/[0.01]"><td colSpan={2} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Internal / Shareholders Funds</td></tr>
                                    {bsData.equity.map((row, i) => (
                                        <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{row.head}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="font-mono text-sm font-black text-indigo-400">{formatNumber(row.amount)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-white/[0.01]"><td colSpan={2} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">External Obligations</td></tr>
                                    {bsData.liabilities.map((row, i) => (
                                        <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{row.head}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="font-mono text-sm font-black text-rose-400">{formatNumber(row.amount)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-8 py-8 bg-black/40 border-t border-white/5 flex justify-between items-center group">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] group-hover:text-slate-200 transition-colors">Total Funds Utilized</span>
                            <span className="text-3xl font-mono font-black text-white tracking-tighter">₹{formatNumber(totalLiabilities + totalEquity)}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Assets */}
                    {(bsData.assets.length > 0 || bsData.liabilities.length > 0) && (
                        <>
                            <div className="surface-card bg-slate-900/40 border-slate-800/50 h-fit">
                                <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-glow shadow-emerald-500/20"></div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Application of Funds (Assets)</h3>
                                    </div>
                                    <span className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest">Asset Magnitude</span>
                                </div>
                                <div className="p-2">
                                    <table className="w-full text-sm">
                                        <tbody className="divide-y divide-white/5 font-semibold">
                                            <tr className="bg-white/[0.01]"><td colSpan={2} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fixed & Working Capital</td></tr>
                                            {bsData.assets.map((row, i) => (
                                                <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{row.head}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="font-mono text-sm font-black text-emerald-400">{formatNumber(row.amount)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-8 py-8 bg-emerald-500/[0.03] border-t border-emerald-500/10 flex justify-between items-center group">
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Total Magnified Assets</span>
                                    <span className="text-3xl font-mono font-black text-emerald-400 tracking-tighter">₹{formatNumber(totalAssets)}</span>
                                </div>
                            </div>

                            <div className={`surface-card p-8 border-dashed flex flex-col sm:flex-row items-center justify-between gap-6 transition-all duration-500 ${Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'border-emerald-500/30 bg-emerald-500/[0.02]' : 'border-rose-500/30 bg-rose-500/[0.02] shadow-glow shadow-rose-500/10'}`}>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`w-2 h-2 rounded-full animate-pulse ${Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'text-emerald-400' : 'text-rose-400'}`}>Accounting Equilibrium</span>
                                    </div>
                                    <span className="font-display font-black text-xl text-white uppercase tracking-tight">System Integrity Check</span>
                                    <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest italic opacity-60">A = L + E Verification status for audit compliance</p>
                                </div>
                                <div className="text-center sm:text-right">
                                    <div className={`text-3xl font-mono font-black tracking-tight ${Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'BALANCED' : 'VARIANCE DETECTED'}
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full mt-2 overflow-hidden">
                                        <div className={`h-full transition-all duration-1000 ${Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 ? 'w-full bg-emerald-500 shadow-glow shadow-emerald-500/20' : 'w-1/2 bg-rose-500 shadow-glow shadow-rose-500/20'}`}></div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {bsData.assets.length === 0 && bsData.liabilities.length === 0 && (
                    <div className="lg:col-span-2 py-32 flex flex-col items-center justify-center text-slate-600 font-black uppercase tracking-[0.4em] opacity-40">
                        <Landmark size={64} className="mb-8" />
                        <p>{hasRanReport ? "Institutional Position Zeroed" : "Initiate Position Synthesis"}</p>
                    </div>
                )}
            </div>
        );
    }

    function renderActiveReport() {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <div className="spinner !w-8 !h-8"></div>
                    <p className="text-[10px] font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">Synthesizing Ledger Intelligence...</p>
                </div>
            );
        }

        switch (activeReport) {
            case 'LEDGER_STMT':
            case 'CASH_BOOK':
            case 'BANK_BOOK':
                return (
                    <>
                        {renderReportHeader(activeReport === 'CASH_BOOK' ? 'Cash Book Analysis' : activeReport === 'BANK_BOOK' ? 'Bank Book Analysis' : 'Ledger Account Statement')}
                        {renderFilters()}
                        {renderLedgerStatement()}
                    </>
                );
            case 'CP_CENTER':
                return (
                    <>
                        {renderReportHeader('Counterparty Accounts Center')}
                        {renderCPCenter()}
                    </>
                );
            case 'TRIAL_BALANCE':
                return (
                    <>
                        {renderReportHeader('Trial Balance Consolidated')}
                        {renderFilters()}
                        {renderTrialBalance()}
                    </>
                );
            case 'PL':
                return (
                    <>
                        {renderReportHeader('Profit & Loss Performance Statement')}
                        {renderFilters()}
                        {renderProfitLoss()}
                    </>
                );
            case 'BS':
                return (
                    <>
                        {renderReportHeader('Executive Balance Sheet')}
                        {renderFilters()}
                        {renderBalanceSheet()}
                    </>
                );
            default:
                return null;
        }
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 animate-fade-in">
            {activeReport === 'HUB' ? (
                <>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div>
                            <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">Reports Hub</h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-lg text-sm leading-relaxed">
                                Professional-grade financial intelligence and audit-ready reporting engine.
                            </p>
                        </div>
                    </div>
                    {renderHub()}
                </>
            ) : renderActiveReport()}

            {/* Account Picker Modal */}
            <LedgerPickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                ledgers={
                    (activeReport === 'CASH_BOOK' || activeReport === 'BANK_BOOK')
                        ? ledgers.filter(ledger => {
                            const settlementCashTagId = ledgerTags.find(t => t.tag_name === 'PHYSICAL CASH')?.id;
                            const settlementBankTagId = ledgerTags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id;
                            if (!ledger.is_cash_bank) return false;
                            const hasBankTag = settlementBankTagId && ledger.business_tags?.includes(settlementBankTagId);
                            const hasCashTag = settlementCashTagId && ledger.business_tags?.includes(settlementCashTagId);
                            const isBankFallback = !hasCashTag && (
                                ledger.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                                ledger.ledger_name?.toLowerCase().includes('bank')
                            );
                            const isBank = hasBankTag || isBankFallback;
                            const isCash = ledger.is_cash_bank && !isBank;
                            return activeReport === 'CASH_BOOK' ? isCash : isBank;
                        })
                        : ledgers
                }
                onSelect={handleLedgerSelect}
                title={
                    activeReport === 'CASH_BOOK' ? 'Select Cash Account' :
                        activeReport === 'BANK_BOOK' ? 'Select Bank Account' :
                            'Select Ledger Account'
                }
            />

            {/* Global Party Modal */}
            <PartyModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                party={matchedParty}
                onSave={handlePartySave}
            />
        </div>
    );
}
