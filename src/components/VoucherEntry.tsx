import { useState, useEffect, useRef } from 'react';
import { Plus, AlertCircle, CheckCircle2, X, ChevronDown, Save, FileText } from 'lucide-react';
import PartyModal from './PartyModal';
import VoucherPickerModal from './VoucherPickerModal';
import DraftsModal from './DraftsModal';
import { v4 as uuidv4 } from 'uuid';
import {
    fetchVoucherTypes, fetchVoucherGroups, fetchLedgers, fetchLedgerTags,
    searchLedgers, searchParties, fetchPartyById, upsertParty,
    getNextReferenceNumber, fetchUOMs, createVoucher, fetchSystemConfig,
    fetchFinancialYears, fetchTemplateById
} from '../lib/supabase';
import {
    Ledger, LedgerTag, Party, Template, Voucher, VoucherFormData,
    VoucherLineInput, SystemConfiguration, FinancialYear, VoucherType,
    VoucherGroup, UOM
} from '../types/accounting';
import toast from 'react-hot-toast';

import SearchableSelect from './ui/SearchableSelect';
import { getAutoSide } from '../lib/validation';
import { getBusinessDate } from '../lib/businessDate';

interface VoucherEntryProps {
    isSessionChild?: boolean;
    initialData?: Partial<VoucherFormData>;
    onDataChange?: (data: VoucherFormData) => void;
    onDraftLoaded?: (draft: Voucher) => void;
    sessionId?: string;
    lockedPartyId?: string;
    lockedDate?: string;
    sessionHeaderNodes?: {
        customerNode: React.ReactNode;
        invoiceNode: React.ReactNode;
        dateNode: React.ReactNode;
    };
    onSaveAsDraft?: () => void;
}

export default function VoucherEntry({
    isSessionChild = false,
    initialData,
    onDataChange,
    onDraftLoaded,
    lockedPartyId,
    lockedDate,
    sessionHeaderNodes,
    onSaveAsDraft
}: VoucherEntryProps) {
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([]);
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [uoms, setUoms] = useState<UOM[]>([]);

    // Quick Creation States
    const [showPartyModal, setShowPartyModal] = useState(false);
    const [showVoucherPicker, setShowVoucherPicker] = useState(false);
    const [editingPartyModal, setEditingPartyModal] = useState<Partial<Party> | null>(null);

    const [loading, setLoading] = useState(false);
    const [systemConfig, setSystemConfig] = useState<SystemConfiguration | null>(null);
    const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
    const [posted] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

    const [editingAmount, setEditingAmount] = useState<{ id: string, value: string } | null>(null);

    const createEmptyLine = (lineNumber: number): VoucherLineInput => {
        return {
            id: uuidv4(),
            line_number: lineNumber,
            ledger_id: '',
            party_id: null,
            side: 'DR',
            amount: null,
            line_narration: '',
            external_ref: '',
            quantity: undefined,
            uom_id: '',
            rate: undefined,
            valuation_ref: '',
            is_side_manual: false,
            ledger_allow_party: false,
            ledger_is_cash: false,
            ledger_is_bank: false
        };
    };

    const initialFormData: VoucherFormData = {
        ui_key: crypto.randomUUID(),
        voucher_type_id: '',
        voucher_date: getBusinessDate(),
        narration: '',
        reference_no: '',
        party_id: null,
        template_id: null,
        lines: []
    };

    const [formData, setFormData] = useState<VoucherFormData>(() => {
        const base = { ...initialFormData, lines: [], ...initialData };
        if (lockedPartyId) base.party_id = lockedPartyId;
        if (lockedDate) base.voucher_date = lockedDate;
        return base;
    });

    const [errors, setErrors] = useState<string[]>([]);
    const [success, setSuccess] = useState<string | null>(null);

    // Use ref to track onDataChange to avoid infinite loops when parent re-renders
    const onDataChangeRef = useRef(onDataChange);
    useEffect(() => {
        onDataChangeRef.current = onDataChange;
    }, [onDataChange]);

    // Notify parent of changes in child mode
    useEffect(() => {
        if (isSessionChild && onDataChangeRef.current) {
            onDataChangeRef.current(formData);
        }
    }, [formData, isSessionChild]);

    // Sync with parent locks & Auto-propagate party to relevant lines
    useEffect(() => {
        if (isSessionChild) {
            setFormData(prev => {
                const newPartyId = lockedPartyId || prev.party_id;
                const newDate = lockedDate || prev.voucher_date;

                // If party changed, we might want to update lines that should have this party
                const updatedLines = prev.lines.map(line => {
                    const ledger = ledgers.find(l => l.id === line.ledger_id);
                    const shouldHaveParty = ledger?.allow_party;

                    if (shouldHaveParty && !line.party_id) {
                        return { ...line, party_id: newPartyId };
                    }
                    return line;
                });

                return {
                    ...prev,
                    party_id: newPartyId,
                    voucher_date: newDate,
                    lines: updatedLines
                };
            });
        }
    }, [lockedPartyId, lockedDate, isSessionChild, ledgers]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (success || errors.length > 0) {
            timer = setTimeout(() => {
                setSuccess(null);
                setErrors([]);
            }, 5000);
        }
        return () => clearTimeout(timer);
    }, [success, errors]);


    useEffect(() => {
        loadInitialData();
    }, []);

    // Sync template state if template_id is present but selectedTemplate is null
    // This happens during tab switches in session or draft loads
    useEffect(() => {
        if (formData.template_id && (!selectedTemplate || selectedTemplate.id !== formData.template_id)) {
            const fetchTemplate = async () => {
                try {
                    const template = await fetchTemplateById(formData.template_id!);
                    if (template) {
                        setSelectedTemplate(template);
                    }
                } catch (error) {
                    console.error('Error syncing template state:', error);
                }
            };
            fetchTemplate();
        }
    }, [formData.template_id, selectedTemplate]);

    // Rule: Auto-generate reference number starting with OMRDDMMYYnnn


    // Rule: Auto-generate reference number starting with OMRDDMMYYnnn
    useEffect(() => {
        if (!posted && (!formData.reference_no || formData.reference_no.startsWith('OMR'))) {
            const timer = setTimeout(async () => {
                try {
                    const nextRef = await getNextReferenceNumber(formData.voucher_date);
                    setFormData(prev => ({ ...prev, reference_no: nextRef }));
                } catch (error) {
                    console.error('Error generating reference number:', error);
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [formData.voucher_date, posted]);

    async function loadInitialData() {
        setLoading(true);
        try {
            const [typesData, groupsData, ledgersData, ledgerTagsData, uomsData, configData, yearsData] = await Promise.all([
                fetchVoucherTypes(),
                fetchVoucherGroups(),
                fetchLedgers(true),
                fetchLedgerTags(),
                fetchUOMs(true),
                fetchSystemConfig(),
                fetchFinancialYears()
            ]);
            setVoucherTypes(typesData);
            setVoucherGroups(groupsData);
            setLedgers(ledgersData);
            setTags(ledgerTagsData);
            setUoms(uomsData);
            setSystemConfig(configData);
            setFinancialYears(yearsData);
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load accounting data');
        } finally {
            setLoading(false);
        }
    }

    function applyTemplate(template: Template) {
        if (!template.lines) return;

        const settlementCashTagId = tags.find(t => t.tag_name.toUpperCase().includes('PHYSICAL CASH'))?.id;
        const settlementBankTagId = tags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id;

        const newLines: VoucherLineInput[] = template.lines.map((tLine, index) => {
            const hasBankTag = (settlementBankTagId && tLine.ledger?.business_tags?.includes(settlementBankTagId));
            const hasCashTag = (settlementCashTagId && tLine.ledger?.business_tags?.includes(settlementCashTagId));

            const isBankFallback = !hasCashTag && (
                tLine.ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                tLine.ledger?.ledger_name?.toLowerCase().includes('bank')
            );
            const isBank = tLine.ledger?.is_cash_bank && (hasBankTag || isBankFallback);

            return {
                id: uuidv4(),
                line_number: index + 1,
                ledger_id: tLine.ledger_id,
                ledger_name: tLine.ledger?.ledger_name,
                party_id: null,
                side: tLine.default_side,
                amount: tLine.amount_rule === 'FIXED' ? (Number(tLine.amount_value) || 0) : null,
                line_narration: '',
                external_ref: '',
                quantity: undefined,
                uom_id: tLine.ledger?.default_uom_id || '',
                rate: undefined,
                valuation_ref: '',
                is_fixed_side: tLine.is_fixed_side,
                is_side_manual: false,
                is_from_template: true,
                ledger_allow_party: tLine.ledger?.allow_party,
                ledger_is_cash: tLine.ledger?.is_cash_bank && !isBank,
                ledger_is_bank: isBank
            };
        });

        setFormData(prev => ({
            ...prev,
            template_id: template.id,
            lines: newLines
        }));
        setSelectedTemplate(template);
    }

    function handleLedgerChange(lineId: string, ledgerId: string) {
        const ledger = ledgers.find(l => l.id === ledgerId);
        if (!ledger) return;

        const currentVoucherType = voucherTypes.find(vt => vt.id === formData.voucher_type_id);

        setFormData(prev => ({
            ...prev,
            lines: prev.lines.map(line => {
                if (line.id === lineId) {
                    const autoSide = getAutoSide(
                        ledger.nature,
                        line.side,
                        line.is_fixed_side,
                        ledger,
                        currentVoucherType?.cash_bank_flow
                    );

                    // Auto-fill party_id if it's a party nature ledger
                    const shouldHaveParty = ledger.allow_party;

                    // Priority 1: Explicit System Tags
                    const settlementCashTagId = tags.find(t => t.tag_name.toUpperCase().includes('PHYSICAL CASH'))?.id;
                    const settlementBankTagId = tags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id;

                    const hasBankTag = (settlementBankTagId && ledger.business_tags?.includes(settlementBankTagId));
                    const hasCashTag = (settlementCashTagId && ledger.business_tags?.includes(settlementCashTagId));

                    const isBankFallback = !hasCashTag && (
                        ledger.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                        ledger.ledger_name?.toLowerCase().includes('bank')
                    );

                    const isBank = ledger.is_cash_bank && (hasBankTag || isBankFallback);

                    return {
                        ...line,
                        ledger_id: ledgerId,
                        ledger_name: ledger.ledger_name,
                        side: autoSide,
                        party_id: shouldHaveParty ? (formData.party_id || line.party_id) : line.party_id,
                        uom_id: ledger.default_uom_id || line.uom_id,
                        is_side_manual: false,
                        ledger_allow_party: ledger.allow_party,
                        ledger_is_cash: ledger.is_cash_bank && !isBank,
                        ledger_is_bank: isBank
                    };
                }
                return line;
            })
        }));
    }

    function handleLineChange(lineId: string, field: keyof VoucherLineInput, value: any) {
        setFormData(prev => {
            const updatedLines = prev.lines.map((line: VoucherLineInput) => {
                if (line.id === lineId) {
                    const updatedLine = { ...line, [field]: value };
                    if (field === 'side') {
                        updatedLine.is_side_manual = true;
                    }
                    return updatedLine;
                }
                return line;
            });

            if (field === 'amount' && selectedTemplate) {
                const inputTotal = updatedLines
                    .filter((l: VoucherLineInput) => l.is_from_template && !l.is_fixed_side)
                    .reduce((sum: number, l: VoucherLineInput) => sum + (Number(l.amount) || 0), 0);

                return {
                    ...prev,
                    lines: updatedLines.map((line: VoucherLineInput) => {
                        if (line.is_from_template) {
                            const tLine = selectedTemplate.lines?.find(tl => tl.line_number === line.line_number);
                            if (tLine?.amount_rule === 'CALCULATED' && tLine.calc_formula) {
                                try {
                                    const formula = tLine.calc_formula.replace(/TOTAL/g, String(inputTotal));
                                    const result = new Function(`return ${formula}`)();
                                    return { ...line, amount: Number(result.toFixed(2)) };
                                } catch (e) {
                                    console.error("Formula error:", e);
                                }
                            }
                        }
                        return line;
                    })
                };
            }

            return { ...prev, lines: updatedLines };
        });
    }

    function addLine() {
        if (posted) return;
        const newLine = createEmptyLine(formData.lines.length + 1);
        setFormData(prev => ({
            ...prev,
            lines: [...prev.lines, newLine]
        }));
    }

    function removeLine(lineId: string) {
        if (posted || formData.lines.length <= 1) return;

        setFormData(prev => ({
            ...prev,
            lines: prev.lines.filter(line => line.id !== lineId)
        }));
    }

    async function handleEditParty(id: string) {
        setLoading(true);
        try {
            const party = await fetchPartyById(id);
            setEditingPartyModal(party);
            setShowPartyModal(true);
        } catch (error) {
            console.error('Error fetching party for edit:', error);
            setErrors(['Failed to load party details for editing']);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveParty(partyData: Party) {
        try {
            const party = await upsertParty(partyData);
            setSuccess(`Counterparty "${party.party_name}" saved successfully.`);
            setFormData(prev => ({ ...prev, party_id: party.id }));
            setShowPartyModal(false);
        } catch (error: any) {
            throw error;
        }
    }

    const [showDraftsModal, setShowDraftsModal] = useState(false);

    async function handleSaveDraft() {
        if (!formData.voucher_type_id) {
            setErrors(['Voucher Type is required for draft']);
            return;
        }
        if (!formData.narration) {
            setErrors(['Narration is required for draft']);
            return;
        }

        // Financial Year Validation
        const vDate = new Date(formData.voucher_date);
        const targetFY = financialYears.find(y => {
            const start = new Date(y.start_date);
            const end = new Date(y.end_date);
            return vDate >= start && vDate <= end;
        });

        if (!targetFY) {
            setErrors([`Voucher date (${formData.voucher_date}) does not fall within any defined Financial Year.`]);
            return;
        }

        if (targetFY.is_closed) {
            setErrors([`Financial Year ${targetFY.name} is CLOSED. Posting or saving drafts is strictly prohibited.`]);
            return;
        }

        if (systemConfig && !systemConfig.allow_backdated_posting) {
            if (systemConfig.current_financial_year_id !== targetFY.id) {
                setErrors([`Backdated posting to ${targetFY.name} is disabled by system policy.`]);
                return;
            }
        }

        setLoading(true);
        try {
            const savedVoucher = await createVoucher({
                ...formData,
                id: formData.draft_id || undefined,
                status: 'DRAFT',
                lines: formData.lines.map(l => ({
                    ledger_id: l.ledger_id || '',
                    party_id: l.party_id,
                    side: l.side,
                    amount: Number(l.amount) || 0,
                    line_narration: l.line_narration,
                    external_ref: l.external_ref,
                    quantity: l.quantity,
                    uom_id: l.uom_id,
                    rate: l.rate,
                    valuation_ref: l.valuation_ref,
                })).filter(l => l.ledger_id)
            });
            setSuccess('Draft saved successfully');
            setFormData(prev => ({ ...prev, draft_id: savedVoucher.id }));
            // Do not reset form, allow further editing of the same draft

        } catch (error: any) {
            console.error('Save Draft Error:', error);
            setErrors([error.message || 'Failed to save draft']);
        } finally {
            setLoading(false);
        }
    }

    const handleAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
        if (e.key === 'Enter') {
            const line = formData.lines[currentIndex];
            const hasAmount = line.amount !== null && line.amount !== 0;

            if (hasAmount) {
                e.preventDefault();

                // If this is the last row, automatically add a new entry
                const isLastRow = currentIndex === formData.lines.length - 1;

                if (isLastRow && !formData.template_id && !posted) {
                    addLine();
                    // We need to wait for the state update and then focus the new input.
                    // React state updates are async, so we use a small timeout or rely on autofocus if we add it.
                    // For now, let's just add the line; the user can click it or we can try to find it in the next render.
                    return;
                }

                // Find next editable amount field
                const nextInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-amount-index]'));
                for (let i = currentIndex + 1; i < nextInputs.length; i++) {
                    const nextInput = nextInputs[i];
                    if (!nextInput.disabled) {
                        nextInput.focus();
                        nextInput.select();
                        break;
                    }
                }
            }
        }
    };

    function handleLoadDraft(draft: Voucher) {
        const vType = voucherTypes.find(vt => vt.id === draft.voucher_type_id);

        setFormData({
            ui_key: uuidv4(),
            draft_id: draft.id,
            voucher_type_id: draft.voucher_type_id,
            voucher_type_name: vType?.type_name || draft.voucher_type?.type_name || '',
            voucher_date: draft.voucher_date,
            narration: draft.narration,
            reference_no: draft.reference_no || '',
            party_id: draft.party_id,
            template_id: draft.template_id || null,
            lines: draft.lines?.map(l => ({
                id: uuidv4(),
                line_number: l.line_number,
                ledger_id: l.ledger_id,
                ledger_name: l.ledger?.ledger_name,
                party_id: l.party_id,
                side: l.side,
                amount: l.amount,
                line_narration: l.line_narration || '',
                external_ref: l.external_ref || '',
                quantity: l.quantity || undefined,
                uom_id: l.uom_id || '',
                rate: l.rate || undefined,
                valuation_ref: l.valuation_ref || '',
                is_side_manual: false,
                is_from_template: l.is_from_template,
                is_fixed_side: l.is_fixed_side,
                is_credit_settlement: l.is_credit_settlement || (l.ledger?.ledger_name === 'Customer Receivables' && l.side === 'DR'),
                is_discount_settlement: l.is_discount_settlement || (l.ledger?.ledger_name === 'Discount Allowed'),
                ledger_allow_party: l.ledger?.allow_party,
                ledger_is_cash: l.ledger?.is_cash_bank && !(l.ledger?.business_tags?.includes(tags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id || '') || (!l.ledger?.business_tags?.includes(tags.find(t => t.tag_name.toUpperCase().includes('PHYSICAL CASH'))?.id || '') && (l.ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') || l.ledger?.ledger_name?.toLowerCase().includes('bank')))),
                ledger_is_bank: l.ledger?.is_cash_bank && (l.ledger?.business_tags?.includes(tags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id || '') || (!l.ledger?.business_tags?.includes(tags.find(t => t.tag_name.toUpperCase().includes('PHYSICAL CASH'))?.id || '') && (l.ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') || l.ledger?.ledger_name?.toLowerCase().includes('bank'))))
            })) || []
        });

        setShowDraftsModal(false);
        setSuccess('Draft loaded');
        if (onDraftLoaded) onDraftLoaded(draft);
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="spinner !w-8 !h-8 border-brand-500"></div>
                <p className="text-[10px] font-black text-slate-500 animate-pulse uppercase tracking-[0.3em]">
                    Initializing Ledger Engine...
                </p>
            </div>
        );
    }

    const showQuantityColumns = formData.lines.some(l => {
        const ledger = ledgers.find(led => led.id === l.ledger_id);
        return ledger?.allow_quantity;
    });

    return (
        <form
            onSubmit={(e) => e.preventDefault()}
            className={`animate-fade-in ${isSessionChild ? 'pb-0 mb-0 space-y-0 w-full' : 'pb-20 max-w-7xl mx-auto space-y-10'}`}
        >
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-xl pointer-events-none px-4 flex flex-col gap-2 items-center">
                {success && (
                    <div className="pointer-events-auto bg-emerald-950/90 backdrop-blur-md border border-emerald-500/30 text-emerald-400 px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-slide-down">
                        <CheckCircle2 size={20} className="shrink-0" />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">{success}</span>
                    </div>
                )}
                {errors.length > 0 && (
                    <div className="pointer-events-auto bg-rose-950/90 backdrop-blur-md border border-rose-500/30 text-rose-400 px-8 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-3 animate-slide-down min-w-[300px]">
                        <div className="flex items-center gap-3 border-b border-rose-500/20 pb-2 w-full justify-center">
                            <AlertCircle size={18} className="shrink-0" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500">System Alert</span>
                        </div>
                        <ul className="space-y-1 text-center">
                            {errors.map((err, i) => (
                                <li key={i} className="text-[11px] font-bold text-rose-200/90 uppercase tracking-wide leading-relaxed">{err}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className={`surface-card w-full ${isSessionChild ? 'rounded-b-none border-b-0 shadow-none' : 'lg:w-fit'} max-w-full ${showQuantityColumns ? 'min-w-[600px]' : 'min-w-[500px]'} ${isSessionChild ? '' : 'mx-auto'} bg-[#0f172a]/20 relative z-20 !overflow-visible`}>
                <div className="p-6 lg:p-8 space-y-6">
                    {sessionHeaderNodes ? (
                        <div className="grid grid-cols-12 gap-6 items-start">
                            {/* COL 1: Invoice + Date */}
                            <div className="col-span-12 md:col-span-3 space-y-4">
                                {sessionHeaderNodes.invoiceNode}
                                {sessionHeaderNodes.dateNode}
                            </div>

                            {/* COL 2: Customer + Voucher */}
                            <div className="col-span-12 md:col-span-4 space-y-4">
                                {sessionHeaderNodes.customerNode}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Voucher *</label>
                                    <button
                                        type="button"
                                        disabled={posted}
                                        onClick={() => setShowVoucherPicker(true)}
                                        className="w-full flex items-center justify-between px-6 h-14 bg-slate-950/40 border border-slate-800 rounded-2xl hover:border-brand-500/50 hover:bg-slate-900/60 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-4">
                                            {formData.voucher_type_id ? (
                                                <>
                                                    <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-[10px] font-black text-white">
                                                        {voucherTypes.find(v => v.id === formData.voucher_type_id)?.prefix}
                                                    </div>
                                                    <span className="text-sm font-black text-white uppercase tracking-tight">
                                                        {voucherTypes.find(v => v.id === formData.voucher_type_id)?.type_name}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-sm font-black text-slate-500 uppercase tracking-tight">Select Voucher Type...</span>
                                            )}
                                        </div>
                                        <ChevronDown size={18} className="text-slate-600 group-hover:text-brand-400 transition-colors" />
                                    </button>
                                </div>
                            </div>

                            {/* COL 3: Draft buttons + Narration */}
                            <div className="col-span-12 md:col-span-5 space-y-3">
                                <div className="flex justify-end gap-3 h-[40px] items-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowDraftsModal(true)}
                                        className="text-[11px] font-bold text-slate-500 hover:text-white uppercase tracking-wider transition-all flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-800"
                                        title="View saved drafts"
                                    >
                                        <FileText size={14} /> View Drafts
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onSaveAsDraft || handleSaveDraft}
                                        className="text-[11px] font-black text-brand-500 hover:text-brand-400 uppercase tracking-wider transition-all flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-brand-500/10"
                                        title="Save current work as draft"
                                    >
                                        <Save size={14} /> Save Draft
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Narration *</label>
                                    <textarea
                                        className="input-field !h-[114px] py-4 leading-relaxed uppercase resize-none w-full"
                                        disabled={posted}
                                        placeholder="ENTER NARRATION..."
                                        value={formData.narration}
                                        onChange={e => setFormData(prev => ({ ...prev, narration: e.target.value.toUpperCase() }))}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Voucher *</label>
                                <button
                                    type="button"
                                    disabled={posted}
                                    onClick={() => setShowVoucherPicker(true)}
                                    className="w-full flex items-center justify-between px-6 h-14 bg-slate-950/40 border border-slate-800 rounded-2xl hover:border-brand-500/50 hover:bg-slate-900/60 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-4">
                                        {formData.voucher_type_id ? (
                                            <>
                                                <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-[10px] font-black text-white">
                                                    {voucherTypes.find(v => v.id === formData.voucher_type_id)?.prefix}
                                                </div>
                                                <span className="text-sm font-black text-white uppercase tracking-tight">
                                                    {voucherTypes.find(v => v.id === formData.voucher_type_id)?.type_name}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-sm font-black text-slate-500 uppercase tracking-tight">Select Voucher Type...</span>
                                        )}
                                    </div>
                                    <ChevronDown size={18} className="text-slate-600 group-hover:text-brand-400 transition-colors" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Narration *</label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowDraftsModal(true)}
                                            className="text-[11px] font-bold text-slate-500 hover:text-white uppercase tracking-wider transition-all flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-800"
                                            title="View saved drafts"
                                        >
                                            <FileText size={14} /> View Drafts
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onSaveAsDraft || handleSaveDraft}
                                            className="text-[11px] font-black text-brand-500 hover:text-brand-400 uppercase tracking-wider transition-all flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-brand-500/10"
                                            title="Save current work as draft"
                                        >
                                            <Save size={14} /> Save Draft
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    className="input-field !h-14 leading-relaxed uppercase"
                                    disabled={posted}
                                    placeholder="ENTER NARRATION..."
                                    value={formData.narration}
                                    onChange={e => setFormData(prev => ({ ...prev, narration: e.target.value.toUpperCase() }))}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    {!isSessionChild && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Invoice No.</label>
                                    <input
                                        type="text"
                                        className="input-field read-only:bg-slate-950/20 read-only:text-slate-500 read-only:cursor-not-allowed"
                                        disabled={posted}
                                        readOnly={formData.reference_no.startsWith('OMR')}
                                        placeholder="Invoice Number"
                                        value={formData.reference_no}
                                        onChange={e => setFormData(prev => ({ ...prev, reference_no: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Counter Party</label>
                                    <SearchableSelect
                                        value={formData.party_id || ''}
                                        disabled={posted || isSessionChild}
                                        placeholder="SELECT ANY COUNTERPARTY..."
                                        onSearch={async (term) => {
                                            const results = await searchParties(term);
                                            return results.map(p => ({
                                                id: p.id,
                                                label: p.party_name,
                                                subLabel: `${p.party_type}${p.phone ? ' • ' + p.phone : ''}`,
                                                badge: 'PARTY'
                                            }));
                                        }}
                                        onCreateNew={() => {
                                            setEditingPartyModal(null);
                                            setShowPartyModal(true);
                                        }}
                                        onEdit={(id) => handleEditParty(id)}
                                        onChange={(id) => setFormData(prev => ({ ...prev, party_id: id || null }))}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>


                <div className="border-t border-slate-800/40">
                    <div className="relative z-[200] px-6 lg:px-8 py-4 border-b border-slate-800/20 flex items-center justify-between bg-slate-950/20">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 font-display">Transaction Details</h2>

                        {selectedTemplate && (
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-brand-500/10 px-3 py-1.5 rounded-lg border border-brand-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
                                <span className="text-[9px] font-black text-brand-400 uppercase tracking-widest">{selectedTemplate.template_name}</span>
                            </div>
                        )}

                        {!posted && (
                            <div className="flex items-center gap-4">

                                {!formData.template_id && (
                                    <button
                                        type="button"
                                        onClick={addLine}
                                        className="text-[10px] font-black uppercase tracking-widest text-brand-500 hover:text-brand-400 transition-colors flex items-center gap-2 px-2"
                                    >
                                        <Plus size={14} strokeWidth={3} /> Add Entry
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative z-10 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-[110] bg-[#0f172a] backdrop-blur-md">
                                <tr className="bg-slate-950/40">
                                    <th className="px-6 py-4 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest w-12">#</th>
                                    <th className="px-4 py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest w-[320px]">Target Account</th>
                                    {!showQuantityColumns && <th className="w-auto"></th>}
                                    <th className="px-4 py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest w-24">Side</th>
                                    <th className="w-auto"></th>
                                    {showQuantityColumns && (
                                        <>
                                            <th className="px-4 py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest w-32">Quantity</th>
                                            <th className="px-4 py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest w-28">Unit</th>
                                            <th className="w-auto"></th>
                                        </>
                                    )}
                                    <th className="px-4 py-4 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest w-48 pr-12">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/20">
                                {formData.lines.map((line, index) => (
                                    <tr key={line.id} style={{ zIndex: 100 - index }} className="group hover:bg-[#0f172a]/40 transition-all border-b border-slate-800/2 last:border-0 font-medium relative">
                                        <td className="px-6 py-4 font-mono text-[11px] font-black text-slate-700 align-top">
                                            <div className="h-14 flex items-center">
                                                {index + 1}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 align-top w-[320px]">
                                            <SearchableSelect
                                                value={line.ledger_id}
                                                initialLabel={line.ledger_name}
                                                disabled={posted || !!formData.template_id || line.is_credit_settlement || line.is_discount_settlement}
                                                placeholder="SELECT TARGET ACCOUNT..."
                                                onSearch={async (term) => {
                                                    const results = await searchLedgers(term);
                                                    return results.map(l => ({
                                                        id: l.id,
                                                        label: l.ledger_name,
                                                        subLabel: l.ledger_group?.group_name,
                                                        badge: l.nature
                                                    }));
                                                }}
                                                onChange={(id: string) => handleLedgerChange(line.id, id)}
                                                className="!h-11 shadow-sm"
                                                size="sm"
                                            />
                                        </td>
                                        {!showQuantityColumns && <td className="w-auto"></td>}
                                        <td className="px-4 py-4 text-center align-top">
                                            <div className="h-14 flex items-center justify-center">
                                                <button
                                                    type="button"
                                                    disabled={posted || line.is_from_template || line.is_credit_settlement || line.is_discount_settlement}
                                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${line.side === 'DR'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                        } disabled:opacity-100 hover:scale-110 active:scale-95`}
                                                    onClick={() => handleLineChange(line.id, 'side', line.side === 'DR' ? 'CR' : 'DR')}
                                                >
                                                    {line.side}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="w-auto"></td>
                                        {showQuantityColumns && (
                                            <>
                                                <td className="px-4 py-4 text-center align-top">
                                                    {ledgers.find(l => l.id === line.ledger_id)?.allow_quantity ? (
                                                        <div className="h-14 flex items-center justify-center">
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                className="w-full h-11 bg-brand-500/5 border border-brand-500/20 rounded-xl px-3 text-center font-mono font-black text-sm text-brand-400 focus:outline-none focus:border-brand-500 transition-all"
                                                                disabled={posted}
                                                                value={line.quantity || ''}
                                                                onChange={e => handleLineChange(line.id, 'quantity', e.target.value === '' ? undefined : Number(e.target.value))}
                                                                placeholder="0.00"
                                                                required={ledgers.find(l => l.id === line.ledger_id)?.quantity_required}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="h-14 flex items-center justify-center text-slate-800">—</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-center align-top">
                                                    {ledgers.find(l => l.id === line.ledger_id)?.allow_quantity ? (
                                                        <div className="h-14 flex items-center justify-center">
                                                            <select
                                                                className="w-full h-11 bg-slate-950/40 border border-slate-800 rounded-xl px-2 text-[10px] font-black uppercase text-slate-400 focus:outline-none focus:border-brand-500 transition-all"
                                                                disabled={posted || line.is_from_template}
                                                                value={line.uom_id || ''}
                                                                onChange={e => handleLineChange(line.id, 'uom_id', e.target.value)}
                                                                required={ledgers.find(l => l.id === line.ledger_id)?.allow_quantity}
                                                            >
                                                                <option value="" className="bg-slate-900 text-white">UNIT</option>
                                                                {uoms.map(u => (
                                                                    <option key={u.id} value={u.id} className="bg-slate-900 text-white">{u.code}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <div className="h-14 flex items-center justify-center text-slate-800">—</div>
                                                    )}
                                                </td>
                                                <td className="w-auto"></td>
                                            </>
                                        )}
                                        <td className="px-4 py-4 align-top w-48">
                                            <div className="flex items-center gap-4">
                                                <div className="relative flex-1">

                                                    <input
                                                        type="text"
                                                        className={`w-full h-11 bg-[#020617]/40 border border-slate-700/80 rounded-xl px-3 py-2 text-right font-mono font-black text-xs focus:outline-none focus:border-brand-500/50 focus:text-brand-400 transition-all ${posted ? 'opacity-80' :
                                                            (line.is_from_template && selectedTemplate?.lines?.find(tl => tl.line_number === line.line_number)?.amount_rule === 'CALCULATED')
                                                                ? 'text-brand-400 bg-brand-500/5 cursor-not-allowed border-brand-500/20'
                                                                : 'text-white'
                                                            }`}
                                                        disabled={posted || (line.is_from_template && selectedTemplate?.lines?.find(tl => tl.line_number === line.line_number)?.amount_rule === 'CALCULATED')}
                                                        data-amount-index={index}
                                                        onKeyDown={(e) => handleAmountKeyDown(e, index)}
                                                        value={(() => {
                                                            if (editingAmount?.id === line.id) {
                                                                return editingAmount.value;
                                                            }
                                                            if ((line.amount === null || line.amount === 0) && line.quantity && line.uom_id) {
                                                                const uomCode = uoms.find(u => u.id === line.uom_id)?.code;
                                                                return uomCode ? `${line.quantity} ${uomCode}` : '';
                                                            }
                                                            return line.amount === null ? '' : line.amount;
                                                        })()}
                                                        onFocus={() => {
                                                            if (!posted) {
                                                                setEditingAmount({ id: line.id, value: line.amount === null ? '' : String(line.amount) });
                                                            }
                                                        }}
                                                        onBlur={() => setEditingAmount(null)}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (val === '') {
                                                                setEditingAmount({ id: line.id, value: '' });
                                                                handleLineChange(line.id, 'amount', null);
                                                                return;
                                                            }
                                                            if (/^-?\d*\.?\d*$/.test(val)) {
                                                                setEditingAmount({ id: line.id, value: val });
                                                                const numericVal = Number(val);
                                                                if (!isNaN(numericVal)) {
                                                                    handleLineChange(line.id, 'amount', numericVal);
                                                                }
                                                            }
                                                        }}
                                                        placeholder="0.00"
                                                        required={!line.quantity}
                                                    />
                                                </div>
                                                {!posted && !formData.template_id && formData.lines.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLine(line.id)}
                                                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-950/40 border border-slate-800 text-slate-600 hover:text-rose-500 hover:border-rose-500/30 hover:bg-rose-500/5 transition-all active:scale-90 shrink-0"
                                                        title="Remove Row"
                                                    >
                                                        <X size={14} strokeWidth={3} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {posted && (
                    <div className="px-10 pb-10">
                        <div className="p-8 bg-emerald-500/5 border border-emerald-500/20 rounded-[2.5rem] text-center space-y-4">
                            <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
                            <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em]">Record Locked</p>
                            <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase">Journal entries have been successfully committed to the ledger. No further edits permitted.</p>
                        </div>
                    </div>
                )}
            </div>

            <VoucherPickerModal
                isOpen={showVoucherPicker}
                onClose={() => setShowVoucherPicker(false)}
                voucherTypes={voucherTypes}
                groups={voucherGroups}
                selectedVoucherId={formData.voucher_type_id}
                onSelect={(type, template) => {
                    if (template) {
                        setFormData(prev => ({
                            ...prev,
                            voucher_type_id: type.id,
                            voucher_type_name: type.type_name,
                            template_id: template.id
                        }));
                        applyTemplate(template);
                    } else {
                        setFormData(prev => ({
                            ...prev,
                            voucher_type_id: type.id,
                            voucher_type_name: type.type_name,
                            template_id: null,
                            lines: []
                        }));
                        setSelectedTemplate(null);
                    }
                    setShowVoucherPicker(false);
                }}
            />

            <PartyModal
                isOpen={showPartyModal}
                onClose={() => setShowPartyModal(false)}
                onSave={handleSaveParty}
                party={editingPartyModal as Party}
            />

            <DraftsModal
                isOpen={showDraftsModal}
                onClose={() => setShowDraftsModal(false)}
                onSelect={handleLoadDraft}
            />
        </form>
    );
}
