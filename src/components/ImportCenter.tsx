import { useState, useRef, useEffect } from 'react';
import {
    Upload, FileSpreadsheet, CheckCircle2,
    Database, Download,
    ArrowRight, X, AlertTriangle, Loader2
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
    supabase, fetchLedgerGroups, fetchLedgers, upsertLedger,
    fetchVoucherTypes, fetchVoucherGroups
} from '../lib/supabase';
import type { LedgerGroup, Side } from '../types/accounting';
import toast from 'react-hot-toast';

type ImportType = 'LEDGER' | 'VOUCHER_TYPE';

export default function ImportCenter() {
    const [importType, setImportType] = useState<ImportType>('LEDGER');
    const [file, setFile] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [metaData, setMetaData] = useState<{ groups: any[], vGroups: any[], types: any[] }>({ groups: [], vGroups: [], types: [] });
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function loadMeta() {
            const [gs, vgs, ts] = await Promise.all([
                fetchLedgerGroups(),
                fetchVoucherGroups(),
                fetchVoucherTypes()
            ]);
            setMetaData({ groups: gs, vGroups: vgs, types: ts });
        }
        loadMeta();
    }, []);

    // Ledger Mapping Fields
    const ledgerFields = [
        { key: 'ledger_name', label: 'Ledger Display Name *', required: true },
        { key: 'group_name', label: 'Accounting Group *', required: true },
        { key: 'is_active', label: 'Active Status (Toggle)', required: false },
        { key: 'opening_balance', label: 'Opening Balance', required: false },
        { key: 'balance_side', label: 'Balance Side', required: false },
        { key: 'allow_party', label: 'Party Tracking (Toggle)', required: false },
        { key: 'is_cash_bank', label: 'Cash / Bank Flow (Toggle)', required: false },
        { key: 'allow_quantity', label: 'Track Quantity / Weight (Toggle)', required: false }
    ];

    // Voucher Type Mapping Fields (Masters)
    const voucherTypeFields = [
        { key: 'type_name', label: 'Voucher Name *', required: true },
        { key: 'type_code', label: 'System Code *', required: true },
        { key: 'prefix', label: 'Number Prefix *', required: true },
        { key: 'group_name', label: 'Voucher Group', required: false },
        { key: 'nature', label: 'Nature *', required: true },
        { key: 'flow', label: 'Flow *', required: true },
        { key: 'party_rule', label: 'Party Rule *', required: true },
        { key: 'is_active', label: 'Active Status (TRUE/FALSE)', required: false }
    ];

    const currentFields =
        importType === 'LEDGER' ? ledgerFields : voucherTypeFields;

    function downloadTemplate(type: ImportType) {
        const fields =
            type === 'LEDGER' ? ledgerFields : voucherTypeFields;

        const mainSheetData = [fields.map(f => f.key)];

        // Reference Sheet Data
        const optionsSheetData: any[][] = [];
        if (type === 'LEDGER') {
            optionsSheetData.push(['Accounting Groups', 'Balance Side (DR/CR)', 'Toggle Options (TRUE/FALSE)']);
            const toggleOptions = ['TRUE', 'FALSE'];
            const sideOptions = ['DR', 'CR'];
            const maxLength = Math.max(metaData.groups.length, sideOptions.length, toggleOptions.length);
            for (let i = 0; i < maxLength; i++) {
                optionsSheetData.push([
                    metaData.groups[i]?.group_name || '',
                    sideOptions[i] || '',
                    toggleOptions[i] || ''
                ]);
            }
        } else if (type === 'VOUCHER_TYPE') {
            optionsSheetData.push(['Voucher Groups', 'Nature', 'Flow', 'Party Rule']);
            const natureOptions = ['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL', 'SALE', 'PURCHASE'];
            const flowOptions = ['INFLOW', 'OUTFLOW', 'NEUTRAL'];
            const partyOptions = ['MANDATORY', 'OPTIONAL', 'NOT_ALLOWED'];
            const maxLength = Math.max(metaData.vGroups.length, natureOptions.length, flowOptions.length, partyOptions.length);

            for (let i = 0; i < maxLength; i++) {
                optionsSheetData.push([
                    metaData.vGroups[i]?.group_name || '',
                    natureOptions[i] || '',
                    flowOptions[i] || '',
                    partyOptions[i] || ''
                ]);
            }
        }

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.aoa_to_sheet(mainSheetData);
        const ws2 = XLSX.utils.aoa_to_sheet(optionsSheetData);

        XLSX.utils.book_append_sheet(wb, ws1, "template");
        XLSX.utils.book_append_sheet(wb, ws2, "option reference");

        if (type === 'LEDGER') {
            const promptText = `You are an Excel accounting template assistant.

I will upload an Excel file.  
Your task is to fill one ledger row in the sheet \`template\` using valid options from \`option reference\`.

Important rules:
1. Use only these heads from \`template\`:
   - ledger_name
   - group_name
   - is_active
   - opening_balance
   - balance_side
   - allow_party
   - is_cash_bank
   - allow_quantity
2. Use \`option reference\` for allowed values (especially dropdown/boolean/group values).
3. Do not create new columns or rename heads.
4. If an exact option is missing, choose the closest value and list it under \`Needs confirmation\`.
5. Return output as plain text only.

Return format:
ledger_name: <value>
group_name: <value>
is_active: <value>
opening_balance: <value>
balance_side: <value>
allow_party: <value>
is_cash_bank: <value>
allow_quantity: <value>`;

            const promptSheetData = promptText.split('\n').map(line => [line]);
            const ws3 = XLSX.utils.aoa_to_sheet(promptSheetData);
            XLSX.utils.book_append_sheet(wb, ws3, "prompt");
        } else if (type === 'VOUCHER_TYPE') {
            const promptText = `You are an Excel accounting template assistant.

I will upload an Excel file.
Your task is to fill one voucher type row in the sheet \`template\` using valid options from \`option reference\`.

Important rules:
1. Use only these heads from \`template\`:
   - type_name
   - type_code
   - prefix
   - group_name
   - nature
   - flow
   - party_rule
   - is_active
2. Use \`option reference\` for allowed values (especially dropdown/boolean/group values).
3. Do not create new columns or rename heads.
4. If an exact option is missing, choose the closest value and list it under \`Needs confirmation\`.
5. Return output as plain text only.

Voucher details for this run:
- type_name: <value>
- type_code: <value>
- prefix: <value>
- group_name: <value>
- nature: <value>
- flow: <value>
- party_rule: <value>
- is_active: <value>

Return format:
type_name: <value>
type_code: <value>
prefix: <value>
group_name: <value>
nature: <value>
flow: <value>
party_rule: <value>
is_active: <value>`;

            const promptSheetData = promptText.split('\n').map(line => [line]);
            const ws3 = XLSX.utils.aoa_to_sheet(promptSheetData);
            XLSX.utils.book_append_sheet(wb, ws3, "prompt");
        }

        XLSX.writeFile(wb, `${type.toLowerCase()}_template.xlsx`);
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        const isExcel = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');

        if (isExcel) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0]; // Take first sheet
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                setCsvData(data);
                if (data.length > 0) {
                    const firstRow = data[0] as any;
                    const headers = Object.keys(firstRow);
                    setHeaders(headers);
                    autoMap(headers);
                }
            };
            reader.readAsBinaryString(selectedFile);
        } else {
            Papa.parse(selectedFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setCsvData(results.data);
                    if (results.meta.fields) {
                        setHeaders(results.meta.fields);
                        autoMap(results.meta.fields);
                    }
                }
            });
        }
    }

    function autoMap(fileHeaders: string[]) {
        const initialMapping: Record<string, string> = {};
        fileHeaders.forEach(h => {
            const normalizedHeader = h.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const fieldMatch = currentFields.find(f =>
                f.key === normalizedHeader ||
                f.label.toLowerCase().includes(normalizedHeader)
            );
            if (fieldMatch) initialMapping[fieldMatch.key] = h;
        });
        setMapping(initialMapping);
    }

    async function processLedgerImport() {
        setImporting(true);
        setProgress(0);
        let successCount = 0;
        let errorCount = 0;

        try {
            const [groups, existingLedgers] = await Promise.all([
                fetchLedgerGroups(),
                fetchLedgers(false)
            ]);

            const groupMap = new Map(groups.map(g => [g.group_name.toUpperCase(), g]));
            const ledgerMap = new Map(existingLedgers.map(l => [l.ledger_name.toUpperCase(), l.id]));

            for (let i = 0; i < csvData.length; i++) {
                const row = csvData[i];
                const ledgerName = row[mapping['ledger_name']]?.trim();
                const groupName = row[mapping['group_name']]?.trim();

                if (!ledgerName || !groupName) {
                    errorCount++;
                    continue;
                }

                // 1. Resolve Group
                let group = groupMap.get(groupName.toUpperCase());
                if (!group) {
                    // Default to ASSET if group is unknown and Nature isn't provided
                    const { data: newGroup, error: groupErr } = await supabase
                        .from('ledger_groups')
                        .insert({ group_name: groupName, nature: 'ASSET' })
                        .select()
                        .single();

                    if (groupErr) {
                        console.error('Failed to create group:', groupName, groupErr);
                        errorCount++;
                        continue;
                    }
                    group = newGroup as LedgerGroup;
                    groupMap.set(groupName.toUpperCase(), group);
                }

                // 2. Resolve/Upsert Ledger
                const nature = group.nature;
                const derivedNormalSide = ['ASSET', 'EXPENSE'].includes(nature) ? 'DR' : 'CR';

                const ledgerData: any = {
                    ledger_name: ledgerName,
                    ledger_group_id: group.id,
                    nature: nature,
                    normal_side: derivedNormalSide,
                    opening_balance: parseFloat(String(row[mapping['opening_balance']] || '0')),
                    opening_balance_side: (String(row[mapping['balance_side']] || derivedNormalSide).toUpperCase()) as Side,
                    is_active: String(row[mapping['is_active']] || 'TRUE').toUpperCase() !== 'FALSE',
                    allow_party: String(row[mapping['allow_party']] || 'FALSE').toUpperCase() === 'TRUE',
                    is_cash_bank: String(row[mapping['is_cash_bank']] || 'FALSE').toUpperCase() === 'TRUE',
                    allow_quantity: String(row[mapping['allow_quantity']] || 'FALSE').toUpperCase() === 'TRUE'
                };

                const existingId = ledgerMap.get(ledgerName.toUpperCase());
                if (existingId) ledgerData.id = existingId;

                try {
                    await upsertLedger(ledgerData);
                    successCount++;
                } catch (e) {
                    console.error('Failed to upsert ledger:', ledgerName, e);
                    errorCount++;
                }

                setProgress(Math.round(((i + 1) / csvData.length) * 100));
            }

            toast.success(`Import Complete: ${successCount} ledgers processed, ${errorCount} errors.`);
            resetState();
        } catch (error) {
            console.error('Ledger Import Critical Failure:', error);
            toast.error('Import failed due to a system error.');
        } finally {
            setImporting(false);
        }
    }

    async function processVoucherTypeImport() {
        setImporting(true);
        setProgress(0);
        let successCount = 0;
        let errorCount = 0;

        try {
            const [vGroups, existingTypes] = await Promise.all([
                fetchVoucherGroups(),
                fetchVoucherTypes()
            ]);

            const vGroupMap = new Map(vGroups.map(vg => [vg.group_name.toUpperCase(), vg.id]));
            const typeMap = new Map(existingTypes.map(t => [t.type_code.toUpperCase(), t.id]));

            for (let i = 0; i < csvData.length; i++) {
                const row = csvData[i];
                const typeName = row[mapping['type_name']]?.trim();
                const typeCode = row[mapping['type_code']]?.trim();

                if (!typeName || !typeCode) {
                    errorCount++;
                    continue;
                }

                let groupId = null;
                const gName = row[mapping['group_name']]?.trim();
                if (gName) {
                    groupId = vGroupMap.get(gName.toUpperCase()) || null;
                }

                const typeData: any = {
                    type_name: typeName,
                    type_code: typeCode,
                    prefix: row[mapping['prefix']] || typeCode.substring(0, 3).toUpperCase(),
                    group_id: groupId,
                    voucher_nature: row[mapping['nature']]?.toUpperCase() || 'JOURNAL',
                    cash_bank_flow: row[mapping['flow']]?.toUpperCase() || 'NEUTRAL',
                    party_rule: row[mapping['party_rule']]?.toUpperCase() || 'OPTIONAL',
                    is_active: row[mapping['is_active']]?.toUpperCase() !== 'FALSE'
                };

                const existingId = typeMap.get(typeCode.toUpperCase());
                if (existingId) typeData.id = existingId;

                const { error } = await supabase.from('voucher_types').upsert(typeData);
                if (error) {
                    console.error('Failed to upsert voucher type:', typeName, error);
                    errorCount++;
                } else {
                    successCount++;
                }

                setProgress(Math.round(((i + 1) / csvData.length) * 100));
            }

            toast.success(`Import Complete: ${successCount} voucher types created/updated.`);
            resetState();
        } catch (error) {
            console.error('Voucher Type Import Critical Failure:', error);
            toast.error('Voucher Type import failed.');
        } finally {
            setImporting(false);
        }
    }

    function resetState() {
        setFile(null);
        setCsvData([]);
        setHeaders([]);
        setMapping({});
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    return (
        <div className="space-y-8 animate-fade-in p-6">
            <header>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                    <Database className="text-brand-500" />
                    Data Import Center
                </h1>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Batch migrate ledgers and voucher types</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LEFT: Configuration */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Select Data Type</label>
                        <div className="grid grid-cols-2 gap-3 mb-8">
                            <div className="relative group/box">
                                <button
                                    onClick={() => { setImportType('LEDGER'); resetState(); }}
                                    className={`w-full p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${importType === 'LEDGER' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}
                                >
                                    <Database size={20} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Ledgers</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadTemplate('LEDGER'); }}
                                    className="absolute top-2 right-2 p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 opacity-0 group-hover/box:opacity-100 transition-opacity hover:text-brand-500"
                                    title="Download Template"
                                >
                                    <Download size={12} />
                                </button>
                            </div>
                            <div className="relative group/box">
                                <button
                                    onClick={() => { setImportType('VOUCHER_TYPE'); resetState(); }}
                                    className={`w-full p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${importType === 'VOUCHER_TYPE' ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}
                                >
                                    <FileSpreadsheet size={20} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Voucher Types</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadTemplate('VOUCHER_TYPE'); }}
                                    className="absolute top-2 right-2 p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 opacity-0 group-hover/box:opacity-100 transition-opacity hover:text-brand-500"
                                    title="Download Template"
                                >
                                    <Download size={12} />
                                </button>
                            </div>

                        </div>

                        {!file ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 flex flex-col items-center justify-center gap-4 hover:border-brand-500 transition-all cursor-pointer group bg-slate-50/50 dark:bg-slate-800/20"
                            >
                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Upload className="text-slate-400 group-hover:text-brand-500" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Select CSV File</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-1">drag & drop also supported</p>
                                </div>
                                <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            </div>
                        ) : (
                            <div className="bg-brand-600 rounded-3xl p-6 text-white shadow-xl shadow-brand-500/20 relative overflow-hidden group">
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">File Ready</p>
                                        <h4 className="text-sm font-black truncate">{file.name}</h4>
                                        <p className="text-[10px] font-bold mt-1">{(file.size / 1024).toFixed(1)} KB &bull; {csvData.length} Rows</p>
                                    </div>
                                    <button onClick={resetState} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                                        <X size={18} />
                                    </button>
                                </div>
                                <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                                    <FileSpreadsheet size={100} />
                                </div>
                            </div>
                        )}
                    </div>

                    {file && (
                        <button
                            disabled={importing || Object.keys(mapping).length < currentFields.filter(f => f.required).length}
                            onClick={
                                importType === 'LEDGER' ? processLedgerImport : processVoucherTypeImport
                            }
                            className="w-full py-6 rounded-3xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase tracking-[0.2em] shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    Importing... {progress}%
                                </>
                            ) : (
                                <>
                                    <ArrowRight size={20} />
                                    Launch Import
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* RIGHT: Column Mapping */}
                <div className="lg:col-span-2">
                    {file ? (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col h-full">
                            <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Column Mapping</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">Align your CSV headers with system fields</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-full">
                                    <CheckCircle2 size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Verified Schema</span>
                                </div>
                            </div>

                            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {currentFields.map(field => (
                                        <div key={field.key} className="space-y-2">
                                            <div className="flex items-center justify-between px-1">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    {field.label}
                                                    {field.required && <span className="text-rose-500">*</span>}
                                                </label>
                                                {mapping[field.key] && (
                                                    <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Mapped</span>
                                                )}
                                            </div>
                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                                                className={`select-field !text-xs font-bold !bg-slate-50/50 dark:!bg-slate-800/50 border-2 transition-all ${mapping[field.key] ? 'border-emerald-500/30' : 'border-transparent'}`}
                                            >
                                                <option value="">Select CSV Column...</option>
                                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-12 p-6 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200 dark:border-amber-900/30">
                                    <div className="flex gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                                            <AlertTriangle className="text-amber-600" size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-black text-amber-900 dark:text-amber-500 uppercase tracking-widest mb-1">Important Precautions</h4>
                                            <p className="text-[10px] text-amber-800 dark:text-amber-400 font-bold leading-relaxed border-l-2 border-amber-500/30 pl-3">
                                                Ensure dates are in <span className="underline">YYYY-MM-DD</span> format. Ledger names must exactly match for Vouchers. Missing Groups will be auto-created under 'ASSET' by default. This action cannot be undone except via 'Reset System'.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-6">
                                <Database size={32} className="text-slate-300" />
                            </div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Upload a file to begin mapping</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-3 max-w-sm">The import center will analyze your CSV structure and suggest field mappings for rapid data onboarding.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
