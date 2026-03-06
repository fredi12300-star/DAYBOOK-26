import { useState, useEffect, useMemo, useRef } from 'react';
import {
    CheckCircle,
    ArrowRightLeft, Upload, Download,
    RefreshCw, Search, Undo2, Sparkles, PlusCircle, X,
    Lock, Unlock, Table, Calculator
} from 'lucide-react';
import {
    fetchLedgers,
    fetchBankVoucherLines,
    fetchBankStatementItems,
    reconcileBankMatches,
    unreconcileBankTxn,
    fetchReconLock,
    updateReconLock,
    importBankStatement,
    fetchVoucherTypes,
    recordAndReconcileAtomic
} from '../lib/supabase';
import { Ledger, VoucherLine, BankStatementItem, Voucher, Party, ReconcileLock, VoucherType } from '../types/accounting';
import { format, parse, isValid } from 'date-fns';
import toast from 'react-hot-toast';
import Papa from 'papaparse';

type ExtendedVoucherLine = VoucherLine & { voucher: Voucher; party: Party };

export default function BankReconciliation() {
    // --- State ---
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [selectedLedgerId, setSelectedLedgerId] = useState<string>('');
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [statementBalance, setStatementBalance] = useState<number>(0);

    const [bookLines, setBookLines] = useState<ExtendedVoucherLine[]>([]);
    const [bankItems, setBankItems] = useState<BankStatementItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [reconLock, setReconLock] = useState<ReconcileLock | null>(null);

    // Filters & UI Mode
    const [viewMode, setViewMode] = useState<'MATCHING' | 'RECONCILED' | 'BRS'>('MATCHING');
    const [bookSearch, setBookSearch] = useState('');
    const [bankSearch, setBankSearch] = useState('');
    const [autoExcludedBankIds, setAutoExcludedBankIds] = useState<string[]>([]);
    const [autoExcludedBookIds, setAutoExcludedBookIds] = useState<string[]>([]);

    // Selection
    const [selectedBookLineIds, setSelectedBookLineIds] = useState<string[]>([]);
    const [selectedBankItemId, setSelectedBankItemId] = useState<string | null>(null);
    const lastSelectedBookIndex = useRef<number | null>(null);

    // Import State
    const [showImportModal, setShowImportModal] = useState(false);
    const [clearBeforeImport, setClearBeforeImport] = useState(true);
    const [csvFields, setCsvFields] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<any[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({
        txn_date: '',
        description: '',
        amount: '',
        direction: '',
        reference: ''
    });

    // Quick Voucher Modal
    const [showQuickVoucher, setShowQuickVoucher] = useState<BankStatementItem | null>(null);
    const [quickVoucherLedger, setQuickVoucherLedger] = useState('');
    const [isSavingVoucher, setIsSavingVoucher] = useState(false);
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);

    // --- Effects ---
    useEffect(() => {
        loadLedgers();
    }, []);

    useEffect(() => {
        if (selectedLedgerId) {
            // Clear stale selections before loading new data
            setSelectedBookLineIds([]);
            setSelectedBankItemId(null);
            lastSelectedBookIndex.current = null;
            setAutoExcludedBankIds([]); // Reset archive when ledger/period changes
            loadData();
            loadLock();
        }
    }, [selectedLedgerId, startDate, endDate]);

    const loadLedgers = async () => {
        try {
            const data = await fetchLedgers();
            setLedgers(data.filter(l =>
                l.is_cash_bank &&
                l.ledger_name.toLowerCase().includes('bank') &&
                !l.ledger_name.toLowerCase().includes('cash')
            ));
        } catch (error) {
            toast.error('Failed to load ledgers');
        }
    };

    const loadData = async () => {
        if (!selectedLedgerId) return;
        setLoading(true);
        try {
            const [books, bank] = await Promise.all([
                fetchBankVoucherLines(selectedLedgerId, startDate, endDate),
                fetchBankStatementItems(selectedLedgerId, startDate, endDate)
            ]);
            setBookLines(books);
            setBankItems(bank);
        } catch (error) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadMetadata = async () => {
        try {
            const [vTypes, ledgers] = await Promise.all([
                fetchVoucherTypes(),
                fetchLedgers(true)
            ]);
            setVoucherTypes(vTypes);
            setAllLedgers(ledgers);
        } catch (error) {
            console.error('Failed to load metadata:', error);
        }
    };

    useEffect(() => {
        loadMetadata();
    }, []);

    const loadLock = async () => {
        const lock = await fetchReconLock(selectedLedgerId);
        setReconLock(lock);
    };

    // --- Filtered Data ---
    const filteredBankItems = useMemo(() => {
        return bankItems.filter(item => {
            if (viewMode === 'BRS') return false;
            // Handle null/empty match_status as UNMATCHED
            const status = item.match_status || 'UNMATCHED';
            const matchesMode = viewMode === 'MATCHING'
                ? status === 'UNMATCHED'
                : status === 'MATCHED';

            const searchLower = bankSearch.toLowerCase();
            const matchesSearch = !bankSearch ||
                item.description?.toLowerCase().includes(searchLower) ||
                (item.reference && item.reference.toLowerCase().includes(searchLower)) ||
                item.amount.toString().includes(searchLower);

            const isAutoExcluded = autoExcludedBankIds.includes(item.id);

            return matchesMode && matchesSearch && !isAutoExcluded;
        });
    }, [bankItems, viewMode, bankSearch, autoExcludedBankIds]);

    const filteredBookLines = useMemo(() => {
        return bookLines.filter(line => {
            if (viewMode === 'BRS') return false;
            const matchesMode = viewMode === 'MATCHING'
                ? line.recon_status === 'UNRECONCILED'
                : line.recon_status === 'RECONCILED';

            const searchLower = bookSearch.toLowerCase();
            const matchesSearch = !bookSearch ||
                line.voucher.voucher_no.toLowerCase().includes(searchLower) ||
                (line.party?.party_name && line.party.party_name.toLowerCase().includes(searchLower)) ||
                (line.line_narration && line.line_narration.toLowerCase().includes(searchLower)) ||
                line.amount.toString().includes(searchLower);

            const isAutoExcluded = autoExcludedBookIds.includes(line.id);
            return matchesMode && matchesSearch && !isAutoExcluded;
        });
    }, [bookLines, viewMode, bookSearch, autoExcludedBookIds]);

    // --- Calculations ---
    const totals = useMemo(() => {
        const bookClosing = bookLines.reduce((sum, l) => sum + (l.side === 'DR' ? l.amount : -l.amount), 0);

        // Items in Books not in Bank
        const bookNotBank = bookLines.filter(l => l.recon_status === 'UNRECONCILED');
        const totalBookNotBankDR = bookNotBank.filter(l => l.side === 'DR').reduce((s, l) => s + l.amount, 0);
        const totalBookNotBankCR = bookNotBank.filter(l => l.side === 'CR').reduce((s, l) => s + l.amount, 0);

        // Matching selections
        const selectedBookSum = bookLines
            .filter(l => selectedBookLineIds.includes(l.id))
            .reduce((sum, l) => sum + l.amount, 0);

        const selectedBankAmt = bankItems.find(i => i.id === selectedBankItemId)?.amount || 0;

        const computedBankBalance = bookClosing + Math.abs(totalBookNotBankCR) - totalBookNotBankDR;

        return {
            bookClosing,
            totalBookNotBankDR,
            totalBookNotBankCR,
            unreconciledBook: totalBookNotBankDR - totalBookNotBankCR,
            difference: statementBalance - computedBankBalance,
            selectedMatchDiff: Math.abs(selectedBookSum - selectedBankAmt)
        };
    }, [bookLines, statementBalance, selectedBookLineIds, selectedBankItemId, bankItems]);

    const downloadTemplate = () => {
        const headers = ['txn_date', 'description', 'reference', 'amount', 'direction'];
        const sampleRow = [format(new Date(), 'yyyy-MM-dd'), 'Sample Description', 'REF123', '1500.00', 'CR'];
        const csvContent = [headers, sampleRow].map(e => e.join(",")).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "bank_statement_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Actions ---
    const toggleBookSelection = (id: string, index: number, event: React.MouseEvent) => {
        if (event.shiftKey && lastSelectedBookIndex.current !== null) {
            const start = Math.min(lastSelectedBookIndex.current, index);
            const end = Math.max(lastSelectedBookIndex.current, index);
            const rangeIds = filteredBookLines.slice(start, end + 1).map(l => l.id);
            setSelectedBookLineIds(prev => Array.from(new Set([...prev, ...rangeIds])));
        } else {
            setSelectedBookLineIds(prev =>
                prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
            );
            lastSelectedBookIndex.current = index;
        }
    };

    const runSmartMatch = () => {
        setLoading(true);
        const newArchivedBankIds: string[] = [];
        const newArchivedBookIds: string[] = [];
        let matchCount = 0;

        // Clone book lines to track virtual "matching"
        const availableBookLines = [...bookLines.filter(l =>
            l.recon_status === 'UNRECONCILED' && !autoExcludedBookIds.includes(l.id)
        )];

        filteredBankItems.forEach(bankItem => {
            const candidateIdx = availableBookLines.findIndex(l => {
                const isAmountMatch = Math.abs(l.amount - bankItem.amount) <= 0.011;
                const isSideMatch = (
                    (bankItem.direction === 'CR' && l.side === 'DR') ||
                    (bankItem.direction === 'DR' && l.side === 'CR')
                );
                const isDateMatch = l.voucher.voucher_date === bankItem.txn_date;
                return isAmountMatch && isSideMatch && isDateMatch;
            });

            if (candidateIdx !== -1) {
                newArchivedBankIds.push(bankItem.id);
                newArchivedBookIds.push(availableBookLines[candidateIdx].id);
                availableBookLines.splice(candidateIdx, 1);
                matchCount++;
            }
        });

        if (matchCount > 0) {
            setAutoExcludedBankIds(prev => [...prev, ...newArchivedBankIds]);
            setAutoExcludedBookIds(prev => [...prev, ...newArchivedBookIds]);
            toast.success(`Automatically hidden ${matchCount} matching pairs.`);
        } else {
            toast.error('No more switch matches found.');
        }
        setLoading(false);
    };

    const handleConfirmAllArchived = async () => {
        if (autoExcludedBankIds.length === 0) return;
        setLoading(true);
        let successCount = 0;
        try {
            // Reconcile each pairs
            for (let i = 0; i < autoExcludedBankIds.length; i++) {
                const bankId = autoExcludedBankIds[i];
                const bookId = autoExcludedBookIds[i];
                const bankItem = bankItems.find(item => item.id === bankId);
                if (bankItem && bookId) {
                    await reconcileBankMatches([bookId], bankId, bankItem.txn_date);
                    successCount++;
                }
            }
            toast.success(`Successfully reconciled ${successCount} transactions`);
            setAutoExcludedBankIds([]);
            setAutoExcludedBookIds([]);
            loadData();
        } catch (error: any) {
            toast.error('Some reconciliations failed');
            loadData();
        } finally {
            setLoading(false);
        }
    };

    const handleReconcile = async () => {
        if (selectedBookLineIds.length === 0 || !selectedBankItemId) {
            toast.error('Select one or more from Books and one from Statement');
            return;
        }

        if (totals.selectedMatchDiff > 0.01) {
            toast.error(`Cannot reconcile: There is a difference of ${totals.selectedMatchDiff.toLocaleString('en-IN')}`);
            return;
        }
        const bankItem = bankItems.find(i => i.id === selectedBankItemId);
        if (!bankItem) return;

        try {
            await reconcileBankMatches(selectedBookLineIds, selectedBankItemId, bankItem.txn_date);
            toast.success('Successfully matched');
            setSelectedBookLineIds([]);
            setSelectedBankItemId(null);
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Matching failed');
        }
    };

    const handleUnreconcile = async (statementItemId: string) => {
        try {
            await unreconcileBankTxn(statementItemId);
            toast.success('Match undone');
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to unreconcile');
        }
    };

    const handleUpdateLock = async () => {
        const newLockDate = prompt('Enter Lock Date (YYYY-MM-DD):', reconLock?.lock_date || '');
        if (!newLockDate) return;
        try {
            await updateReconLock(selectedLedgerId, newLockDate);
            toast.success('Period Locked');
            loadLock();
        } catch (error) {
            toast.error('Failed to lock period');
        }
    };

    // --- Import Logic ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                setCsvFields(results.meta.fields || []);
                setCsvRows(results.data);
                // Reset mappings so old column assignments don't carry over to a new file
                setMapping({ txn_date: '', description: '', amount: '', direction: '', reference: '' });
                setShowImportModal(true);
            },
            error: (err) => {
                console.error('CSV Parse Error:', err);
                toast.error(`Failed to parse CSV: ${err.message}`);
            }
        });

        // Reset the input value so the same file can be selected again
        e.target.value = '';
    };

    const executeImport = async () => {
        console.log('--- executeImport Start ---');
        if (!selectedLedgerId) {
            console.warn('Abort: No selectedLedgerId');
            toast.error('Please select a bank account first');
            return;
        }
        if (!mapping.txn_date || !mapping.amount || !mapping.description) {
            console.warn('Abort: Mandatory mappings missing', mapping);
            toast.error('Requirement: Date, Amount, and Description must be mapped');
            return;
        }
        if (csvRows.length === 0) {
            console.warn('Abort: csvRows is empty');
            toast.error('No data found to import. Please upload a CSV file first.');
            return;
        }

        setLoading(true);
        const skippedRows: { row: number; reason: string }[] = [];

        try {
            const items = csvRows.map((row, idx) => {
                const rowNum = idx + 1;
                try {
                    const rawDate = row[mapping.txn_date];
                    const rawAmt = row[mapping.amount];
                    const rawDesc = row[mapping.description];

                    if (!rawDate || !rawAmt || !rawDesc) {
                        skippedRows.push({ row: rowNum, reason: 'Missing required fields (Date, Amount, or Description)' });
                        return null;
                    }

                    // 1. Parse Amount
                    const cleanAmt = String(rawAmt).replace(/,/g, '');
                    const amt = parseFloat(cleanAmt);
                    if (isNaN(amt)) {
                        skippedRows.push({ row: rowNum, reason: `Invalid amount format: "${rawAmt}"` });
                        return null;
                    }

                    // 2. Parse Direction
                    let direction: 'DR' | 'CR' = 'CR';
                    let explicitDirectionMapped = false;

                    if (mapping.direction && row[mapping.direction]) {
                        const rawDir = String(row[mapping.direction]).toUpperCase();
                        if (rawDir.includes('DR') || rawDir.includes('DEBIT') || rawDir.includes('WDL') || rawDir.includes('WITHDRAW')) {
                            direction = 'DR';
                            explicitDirectionMapped = true;
                        } else if (rawDir.includes('CR') || rawDir.includes('CREDIT') || rawDir.includes('DEP') || rawDir.includes('DEPOSIT')) {
                            direction = 'CR';
                            explicitDirectionMapped = true;
                        } else {
                            skippedRows.push({ row: rowNum, reason: `Ambiguous direction: "${row[mapping.direction]}"` });
                            return null;
                        }
                    }
                    // Handle accounting sign convention ONLY IF direction was not explicitly provided by a mapped column
                    if (!explicitDirectionMapped && amt < 0) {
                        direction = direction === 'DR' ? 'CR' : 'DR';
                    }

                    // 3. Robust Date Parsing
                    const rawDateStr = String(rawDate).trim();
                    let finalDate: string | null = null;
                    const formats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'dd-MM-yyyy', 'MM/dd/yyyy', 'MM-dd-yyyy', 'dd.MM.yyyy'];

                    for (const fmt of formats) {
                        const d = parse(rawDateStr, fmt, new Date());
                        if (isValid(d) && d.getFullYear() > 1900) {
                            finalDate = format(d, 'yyyy-MM-dd');
                            break;
                        }
                    }

                    if (!finalDate) {
                        const d = new Date(rawDateStr);
                        if (isValid(d) && d.getFullYear() > 1900) {
                            finalDate = format(d, 'yyyy-MM-dd');
                        }
                    }

                    if (!finalDate) {
                        skippedRows.push({ row: rowNum, reason: `Unrecognized date format: "${rawDate}"` });
                        return null;
                    }

                    return {
                        txn_date: finalDate,
                        description: String(rawDesc).trim().substring(0, 500),
                        reference: row[mapping.reference] ? String(row[mapping.reference]).trim().substring(0, 100) : '',
                        amount: Math.abs(amt),
                        direction
                    } as Partial<BankStatementItem>;

                } catch (e: any) {
                    skippedRows.push({ row: rowNum, reason: e.message || 'Unknown parsing error' });
                    return null;
                }
            }).filter(i => i !== null) as Partial<BankStatementItem>[];

            if (items.length === 0) {
                toast.error(`Import failed: All ${csvRows.length} rows were invalid or skipped.`);
                return;
            }

            await importBankStatement(selectedLedgerId, items, clearBeforeImport);

            if (skippedRows.length > 0) {
                toast(
                    `Imported ${items.length} rows. ${skippedRows.length} rows were skipped due to errors.`,
                    { icon: '⚠️', duration: 6000 }
                );
                console.group('Import Skips');
                skippedRows.forEach(s => console.warn(`Row ${s.row}: ${s.reason}`));
                console.groupEnd();
            } else {
                toast.success(`Successfully imported all ${items.length} transactions.`);
            }

            setShowImportModal(false);
            loadData();
        } catch (error: any) {
            console.error('Import Error:', error);
            toast.error(`Import Failed: ${error.message || 'Database error'}`);
        } finally {
            setLoading(false);
        }
    };

    const saveQuickVoucher = async () => {
        if (!showQuickVoucher || !quickVoucherLedger) return;
        if (quickVoucherLedger === selectedLedgerId) {
            toast.error('Cannot select the same bank account as contra ledger.');
            return;
        }
        setIsSavingVoucher(true);
        try {
            const isOutflow = showQuickVoucher.direction === 'DR'; // Bank view DR = withdrawal
            const typeCode = isOutflow ? 'PAYMENT' : 'RECEIPT';
            const vType = voucherTypes.find(t => t.type_code === typeCode);

            if (!vType) {
                throw new Error(`Voucher type ${typeCode} not found. Please ensure PAYMENT and RECEIPT types exist.`);
            }

            const bankSide = isOutflow ? 'CR' : 'DR';
            const otherSide = isOutflow ? 'DR' : 'CR';

            // Single atomic call — voucher + reconcile in one transaction.
            // If reconcile fails, the voucher is automatically rolled back.
            await recordAndReconcileAtomic({
                voucherTypeId: vType.id,
                bankLedgerId: selectedLedgerId,
                statementItemId: showQuickVoucher.id,
                voucherDate: showQuickVoucher.txn_date,
                narration: `Bank Recon: ${showQuickVoucher.description}`,
                contraLedgerId: quickVoucherLedger,
                lines: [
                    {
                        ledger_id: selectedLedgerId,
                        side: bankSide,
                        amount: showQuickVoucher.amount,
                        line_narration: showQuickVoucher.description || undefined
                    },
                    {
                        ledger_id: quickVoucherLedger,
                        side: otherSide,
                        amount: showQuickVoucher.amount,
                        line_narration: showQuickVoucher.description || undefined
                    }
                ]
            });

            toast.success('Voucher created & reconciled');
            setShowQuickVoucher(null);
            setQuickVoucherLedger('');
            loadData();
        } catch (error: any) {
            console.error('Quick Voucher Error:', error);
            toast.error(error.message || 'Failed to create quick voucher');
        } finally {
            setIsSavingVoucher(false);
        }
    };

    return (
        <div className="flex flex-col h-full animate-fade-in pb-32">
            {/* Header / Toolbar */}
            <div className="surface-card p-8 mb-6 border-brand-500/10 shadow-glow shadow-brand-500/5">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-6">
                        <div>
                            <h1 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                                <ArrowRightLeft className="w-8 h-8 text-brand-500" />
                                Bank Reconciliation
                            </h1>
                            <div className="flex items-center gap-4 mt-2">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
                                    Double-Entry Integrity &bull; Phase 4 Enterprise
                                </p>
                            </div>
                        </div>

                        <div className="h-10 w-px bg-slate-800" />

                        <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 self-center">
                            {[
                                { id: 'MATCHING', icon: Sparkles, label: 'Matching' },
                                { id: 'RECONCILED', icon: Table, label: 'History' },
                                { id: 'BRS', icon: Calculator, label: 'Statement (BRS)' }
                            ].map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => setViewMode(mode.id as any)}
                                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 ${viewMode === mode.id ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <mode.icon className="w-3.5 h-3.5" />
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800">
                            {reconLock ? <Lock className="w-4 h-4 text-brand-500" /> : <Unlock className="w-4 h-4 text-slate-600" />}
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Lock: {reconLock?.lock_date ? format(new Date(reconLock.lock_date), 'dd MMM yyyy') : 'No Lock'}
                            </div>
                            <button onClick={handleUpdateLock} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white">
                                <RefreshCw className="w-3 h-3" />
                            </button>
                        </div>

                        <div className="flex bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shrink-0">
                            <label className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 cursor-pointer text-[11px] font-black text-slate-300 transition-colors group">
                                <Upload className="w-4 h-4 group-hover:text-brand-400" />
                                Import
                                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                            </label>
                            <div className="w-px bg-slate-800" />
                            <button
                                onClick={downloadTemplate}
                                className="flex items-center justify-center px-4 py-2 hover:bg-slate-800 text-slate-500 hover:text-brand-400 transition-colors"
                                title="Download CSV Template"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        </div>

                        <button onClick={loadData} className="btn-primary">
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Update
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Select Bank Account</label>
                        <select
                            value={selectedLedgerId}
                            onChange={(e) => setSelectedLedgerId(e.target.value)}
                            className="select-field"
                        >
                            <option value="">-- Choose Account --</option>
                            {ledgers.map(l => (
                                <option key={l.id} value={l.id} className="bg-slate-900">{l.ledger_name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Period From</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Period To</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-brand-400 uppercase tracking-[0.2em] ml-2">Statement Closing Balance</label>
                        <input
                            type="number"
                            placeholder="0.00"
                            value={statementBalance || ''}
                            onChange={e => setStatementBalance(Number(e.target.value))}
                            className="input-field border-brand-500/30 text-brand-400 font-mono text-lg font-black"
                        />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            {viewMode === 'BRS' ? (
                <div className="flex-1 glass-panel p-12 border-slate-700/30 overflow-y-auto no-scrollbar max-w-4xl mx-auto w-full">
                    <div className="flex justify-between items-start mb-12">
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Bank Reconciliation Statement</h2>
                        <div className="text-right">
                            <div className="text-xs font-mono text-slate-500 uppercase tracking-widest">{startDate} to {endDate}</div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <BRSRow label="Balance as per ERP (Book Balance)" amount={totals.bookClosing} />

                        <div className="h-8" />
                        <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4">Add: Adjustments (Increases Bank Balance)</h3>
                        <BRSRow
                            label="Unmatched Payments (Cheques issued but not presented)"
                            amount={Math.abs(totals.totalBookNotBankCR)}
                            subHighlight
                        />
                        <p className="text-[9px] text-slate-500 italic mb-4">These are entries in your ERP (outgoing) not yet debited by the bank.</p>

                        <div className="h-8" />
                        <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4">Less: Adjustments (Decreases Bank Balance)</h3>
                        <BRSRow
                            label="Unmatched Receipts (Deposits not yet credited)"
                            amount={totals.totalBookNotBankDR}
                            subHighlight
                            isLess
                        />
                        <p className="text-[9px] text-slate-500 italic mb-4">These are entries in your ERP (incoming) not yet credited by the bank.</p>

                        <div className="h-12 border-t border-slate-800 mt-8 pt-8" />
                        <BRSRow
                            label="Computed Bank Balance"
                            amount={totals.bookClosing + Math.abs(totals.totalBookNotBankCR) - totals.totalBookNotBankDR}
                            isTotal
                        />
                        <BRSRow
                            label="Actual Balance as per Bank Statement"
                            amount={statementBalance}
                            isTotal
                            highlight
                        />

                        <div className={`mt-12 p-6 rounded-2xl border-2 flex items-center justify-between ${totals.difference === 0 ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'}`}>
                            <div>
                                <h4 className={`text-sm font-black uppercase tracking-widest ${totals.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {totals.difference === 0 ? 'Fully Reconciled' : 'Unreconciled Difference'}
                                </h4>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">Status of mathematical proof for selected period</p>
                            </div>
                            <div className={`text-3xl font-mono font-black ${totals.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {totals.difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex gap-6">
                    {/* Tables logic... identical but with Shift+Click and Mapping Modal */}
                    <Panel
                        title="Bank Statement"
                        badgeColor={viewMode === 'MATCHING' ? 'badge-neutral' : 'badge-success'}
                        badgeText={`${filteredBankItems.length} ${viewMode === 'MATCHING' ? 'Unmatched' : 'Matched'}`}
                        search={bankSearch}
                        onSearch={setBankSearch}
                        icon={<Search className="w-3.5 h-3.5 text-brand-500" />}
                        rightElement={autoExcludedBankIds.length > 0 && (
                            <button
                                onClick={() => { setAutoExcludedBankIds([]); setAutoExcludedBookIds([]); }}
                                className="text-[9px] font-black uppercase text-brand-400 hover:text-brand-300 flex items-center gap-1"
                            >
                                <Undo2 className="w-3 h-3" /> Reset
                            </button>
                        )}
                    >
                        <table className="w-full">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="table-head-cell">Date</th>
                                    <th className="table-head-cell">Description</th>
                                    <th className="table-head-cell text-right pr-6">Amount</th>
                                    {viewMode === 'MATCHING' && <th className="table-head-cell w-10"></th>}
                                    {viewMode === 'RECONCILED' && <th className="table-head-cell w-10"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/10">
                                {filteredBankItems.map(item => (
                                    <tr
                                        key={item.id}
                                        onClick={() => viewMode === 'MATCHING' && setSelectedBankItemId(item.id)}
                                        className={`table-row group cursor-pointer ${selectedBankItemId === item.id ? 'bg-brand-500/10 border-brand-500/30' : ''}`}
                                    >
                                        <td className="table-cell font-mono text-[11px] text-slate-500">{format(new Date(item.txn_date), 'dd MMM')}</td>
                                        <td className="table-cell max-w-[200px] truncate">
                                            <div className="text-slate-200 font-bold truncate">{item.description}</div>
                                            <div className="text-[10px] text-slate-600 font-mono">{item.reference || '-'}</div>
                                        </td>
                                        <td className={`table-cell text-right pr-6 font-mono text-sm font-black ${item.direction === 'CR' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        {viewMode === 'MATCHING' && (
                                            <td className="table-cell text-center pr-4">
                                                <button onClick={(e) => { e.stopPropagation(); setShowQuickVoucher(item); }} className="p-1.5 text-slate-700 hover:text-brand-400 hover:bg-brand-400/10 rounded-lg transition-all" title="Create Voucher">
                                                    <PlusCircle className="w-4 h-4" />
                                                </button>
                                            </td>
                                        )}
                                        {viewMode === 'RECONCILED' && (
                                            <td className="table-cell text-center pr-4">
                                                <button onClick={(e) => { e.stopPropagation(); handleUnreconcile(item.id); }} className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all" title="Undo Match">
                                                    <Undo2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {autoExcludedBankIds.length > 0 && (
                            <div className="mt-4 border-t border-slate-800/50 bg-slate-950/30 p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Lock className="w-3 h-3" /> Archived Matches ({autoExcludedBankIds.length})
                                    </h4>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={handleConfirmAllArchived}
                                            className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[9px] font-black hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
                                        >
                                            <CheckCircle className="w-3 h-3" /> Post All
                                        </button>
                                        <button
                                            onClick={() => { setAutoExcludedBankIds([]); setAutoExcludedBookIds([]); }}
                                            className="text-[9px] font-bold text-brand-400 hover:underline"
                                        >
                                            Restore All
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2 opacity-40">
                                    {bankItems
                                        .filter(i => autoExcludedBankIds.includes(i.id))
                                        .slice(0, 3) // Show first 3 as sample
                                        .map(item => (
                                            <div key={item.id} className="flex justify-between items-center text-[10px] font-mono">
                                                <span className="truncate max-w-[120px]">{item.description}</span>
                                                <span className="text-emerald-500">{item.amount.toLocaleString('en-IN')}</span>
                                            </div>
                                        ))
                                    }
                                    {autoExcludedBankIds.length > 3 && (
                                        <div className="text-[9px] italic text-slate-600">... and {autoExcludedBankIds.length - 3} more</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </Panel>

                    {viewMode === 'MATCHING' && (
                        <div className="flex flex-col justify-center gap-6 relative">
                            <button onClick={runSmartMatch} className="p-4 rounded-3xl transition-all shadow-lg bg-indigo-900 shadow-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-800 active:scale-95" title="Smart Auto-Match">
                                <Sparkles className="w-6 h-6" />
                            </button>

                            {selectedBankItemId && selectedBookLineIds.length > 0 && (
                                <button
                                    onClick={handleReconcile}
                                    disabled={totals.selectedMatchDiff > 0.01}
                                    className={`p-4 rounded-3xl transition-all shadow-lg border ${totals.selectedMatchDiff <= 0.01 ? 'bg-emerald-900 shadow-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-800 active:scale-95' : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'}`}
                                    title="Match Selected Items"
                                >
                                    <CheckCircle className="w-6 h-6" />
                                </button>
                            )}
                        </div>
                    )}

                    <Panel
                        title="Book Ledger (ERP)"
                        badgeColor={viewMode === 'MATCHING' ? 'badge-neutral' : 'badge-success'}
                        badgeText={`${filteredBookLines.length} ${viewMode === 'MATCHING' ? 'Unreconciled' : 'Matched'}`}
                        search={bookSearch}
                        onSearch={setBookSearch}
                        icon={<Search className="w-3.5 h-3.5 text-emerald-500" />}
                    >
                        <table className="w-full">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="table-head-cell">Date</th>
                                    <th className="table-head-cell">Voucher</th>
                                    <th className="table-head-cell text-right pr-8">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/10">
                                {filteredBookLines.map((line, idx) => (
                                    <tr
                                        key={line.id}
                                        onClick={(e) => viewMode === 'MATCHING' && toggleBookSelection(line.id, idx, e)}
                                        className={`table-row cursor-pointer ${selectedBookLineIds.includes(line.id) ? 'bg-emerald-500/10 border-emerald-500/30' : ''}`}
                                    >
                                        <td className="table-cell font-mono text-[11px] text-slate-500">{format(new Date(line.voucher.voucher_date), 'dd MMM')}</td>
                                        <td className="table-cell">
                                            <div className="text-slate-200 font-bold">{line.voucher.voucher_no}</div>
                                            <div className="text-[10px] text-slate-600 truncate max-w-[150px] italic">{line.line_narration || '-'}</div>
                                        </td>
                                        <td className={`table-cell text-right pr-8 font-mono text-sm font-black ${line.side === 'DR' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {line.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Panel>
                </div>
            )}

            {/* Float Summary Bar */}
            <div className="fixed bottom-10 left-80 right-10 z-[40]">
                <div className={`surface-card p-6 flex items-center justify-between gap-8 border-slate-700/50 shadow-glow transition-all duration-500 ${totals.difference === 0 ? 'border-emerald-500/30 bg-emerald-950/20' : ''}`}>
                    <div className="flex gap-12 flex-1 items-center">
                        <SummaryStat label="Book Balance" val={totals.bookClosing} />
                        <SummaryStat label="Statement Balance" val={statementBalance} color="text-brand-500" />

                        <div className="h-10 w-px bg-slate-800" />

                        <div className="text-right">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Difference</div>
                            <div className={`text-2xl font-mono font-black ${totals.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {Math.abs(totals.difference).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CSV Mapping Modal */}
            {showImportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-3xl animate-fade-in">
                    <div className="w-full max-w-2xl surface-card border-brand-500/20 shadow-glow p-8 animate-slide-up">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                <Table className="w-6 h-6 text-brand-500" /> Column Mapping (CSV)
                            </h2>
                            <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
                                <X className="w-6 h-6 text-slate-500" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-12">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">Mandatory Fields</h4>
                                <MappingField label="Transaction Date" val={mapping.txn_date} options={csvFields} onChange={v => setMapping({ ...mapping, txn_date: v })} />
                                <MappingField label="Amount" val={mapping.amount} options={csvFields} onChange={v => setMapping({ ...mapping, amount: v })} />
                                <MappingField label="Description" val={mapping.description} options={csvFields} onChange={v => setMapping({ ...mapping, description: v })} />
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">Optional Fields</h4>
                                <MappingField label="Reference / Cheque No" val={mapping.reference} options={csvFields} onChange={v => setMapping({ ...mapping, reference: v })} />
                                <MappingField label="Direction (Dr/Cr)" val={mapping.direction} options={csvFields} onChange={v => setMapping({ ...mapping, direction: v })} />
                            </div>
                            <div className="flex items-center gap-2 mb-8 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                <input
                                    type="checkbox"
                                    id="freshImport"
                                    checked={clearBeforeImport}
                                    onChange={e => setClearBeforeImport(e.target.checked)}
                                    className="checkbox checkbox-primary checkbox-sm"
                                />
                                <label htmlFor="freshImport" className="text-[10px] font-bold text-amber-200 cursor-pointer">
                                    Fresh Import: Clear existing unmatched statement data before importing
                                </label>
                            </div>

                            <button
                                onClick={executeImport}
                                disabled={loading}
                                className={`btn-primary px-12 py-5 text-[11px] ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Execute Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Voucher Modal */}
            {showQuickVoucher && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-3xl">
                    <div className="w-full max-w-md surface-card p-8 shadow-glow border-brand-500/20 relative">
                        <button onClick={() => { setShowQuickVoucher(null); setQuickVoucherLedger(''); }} className="absolute top-6 right-6 p-2 hover:bg-slate-800 rounded-xl transition-colors">
                            <X className="w-6 h-6 text-slate-500 hover:text-white" />
                        </button>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <PlusCircle className="w-5 h-5 text-brand-500" /> Quick Entry
                        </h2>
                        <div className="space-y-6">
                            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                                <div className="text-[9px] font-black text-slate-600 uppercase mb-1">Statement Item</div>
                                <div className="text-sm font-bold text-white mb-1">{showQuickVoucher.description}</div>
                                <div className="text-xl font-mono underline decoration-brand-500/30">{showQuickVoucher.amount.toLocaleString('en-IN')}</div>
                            </div>

                            <select
                                className="select-field"
                                value={quickVoucherLedger}
                                onChange={e => setQuickVoucherLedger(e.target.value)}
                            >
                                <option value="">-- Select GL Account --</option>
                                {allLedgers
                                    .filter(l => l.id !== selectedLedgerId)
                                    .sort((a, b) => a.ledger_name.localeCompare(b.ledger_name))
                                    .map(l => (
                                        <option key={l.id} value={l.id}>{l.ledger_name}</option>
                                    ))
                                }
                            </select>

                            <button onClick={saveQuickVoucher} disabled={!quickVoucherLedger || isSavingVoucher} className="btn-primary w-full py-5 text-[11px]">
                                {isSavingVoucher ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Record & Auto-Match'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Subcomponents ---

function SummaryStat({ label, val, color = "text-white" }: { label: string, val: number, color?: string }) {
    return (
        <div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">{label}</div>
            <div className={`text-xl font-mono font-black ${color}`}>{val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
    );
}

function BRSRow({ label, amount, highlight = false, subHighlight = false, isLess = false, isTotal = false }: any) {
    return (
        <div className={`flex items-center justify-between py-4 group transition-all ${isTotal ? 'border-b border-slate-700/50' : ''}`}>
            <div className={`text-xs font-bold uppercase tracking-wide ${isTotal ? 'text-white text-sm' : 'text-slate-400'}`}>
                {isLess && <span className="text-rose-500 mr-2">(-)</span>}
                {!isLess && !isTotal && <span className="text-emerald-500 mr-2">(+)</span>}
                {label}
            </div>
            <div className={`font-mono text-lg font-black ${highlight ? 'text-brand-400 text-2xl' : subHighlight ? 'text-white' : 'text-slate-500'}`}>
                {amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
        </div>
    );
}

function Panel({ title, children, badgeText, badgeColor, search, onSearch, icon, rightElement }: any) {
    return (
        <div className="flex-1 glass-panel flex flex-col overflow-hidden border-slate-800/40">
            <div className="card-header flex justify-between items-center py-4 bg-slate-900/60">
                <div className="flex items-center gap-3">
                    {icon}
                    <div className="relative group">
                        <input
                            placeholder={`Search ${title}...`}
                            className="bg-transparent outline-none placeholder:text-slate-700 w-48 text-[11px] font-bold text-slate-200"
                            value={search}
                            onChange={e => onSearch(e.target.value)}
                        />
                        <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-brand-500/50 transition-all group-focus-within:w-full" />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {rightElement}
                    <div className={`badge ${badgeColor}`}>{badgeText}</div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {children}
            </div>
        </div>
    );
}

function MappingField({ label, val, options, onChange }: { label: string, val: string, options: string[], onChange: (v: string) => void }) {
    return (
        <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-1">{label}</label>
            <select className="select-field text-xs h-12" value={val} onChange={e => onChange(e.target.value)}>
                <option value="">-- Manual Select --</option>
                {options.map(f => (
                    <option key={f} value={f} className="bg-slate-900">{f}</option>
                ))}
            </select>
        </div>
    );
}
