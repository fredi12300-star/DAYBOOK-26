import { useState, useMemo, useEffect, useRef } from 'react';
import {
    Plus, Trash2, ChevronDown, AlertCircle,
    CheckCircle2, Landmark, Building2, UserPlus, ArrowRight,
    Maximize2, Search, ChevronLeft, ChevronRight
} from 'lucide-react';
import VoucherEntry from './VoucherEntry';
import PartyModal from './PartyModal';
import SessionBreakdownDrawer from './SessionBreakdownDrawer';
import StaffPostingModal from './StaffPostingModal';
import {
    searchParties, createTransactionSession, postTransactionSession,
    upsertParty, getNextReferenceNumber, fetchLedgers, fetchLedgerTags,
    fetchSystemConfig, fetchFinancialYears, fetchPartyById,
    fetchPartyBusinessBalance, fetchPartyBalanceByLedger, fetchSessionById,
    saveSessionStaff, fetchPostingEligibleStaff
} from '../lib/supabase';
import { useAuth } from '../lib/auth';

import { FinancialYear, SystemConfiguration, Ledger, LedgerTag, Party, SessionFormData, VoucherFormData, StaffProfile } from '../types/accounting';
import { formatNumber } from '../lib/validation';
import { getBusinessDate } from '../lib/businessDate';
import type { Voucher, Side, ApprovalStatus } from '../types/accounting';
import toast from 'react-hot-toast';
interface VoucherSessionEntryProps {
    onDirtyChange?: (isDirty: boolean) => void;
    forceSaveDraftTrigger?: number;
    onSavedSuccessfully?: () => void;
    onNavigateToReports?: (data: { ledgerId: string; partyId: string; view: 'list' | 'profile' | 'ledger' }) => void;
}

export default function VoucherSessionEntry({
    onDirtyChange,
    forceSaveDraftTrigger,
    onSavedSuccessfully,
    onNavigateToReports
}: VoucherSessionEntryProps) {
    const { user, isSuperAdmin, access, isLoading } = useAuth();
    const isAdmin = isSuperAdmin || access.some(a => a.role?.category === 'ADMIN');
    const [isBaseDataLoaded, setIsBaseDataLoaded] = useState(false);

    // Load static context once for the session (Robust identification)
    useEffect(() => {
        if (!isBaseDataLoaded) {
            loadBaseData().then(() => setIsBaseDataLoaded(true));
        }
    }, [isBaseDataLoaded]);

    // Load staff/depts whenever auth settlement or admin status changes
    useEffect(() => {
        if (!isLoading) {
            loadStaffAndDepts();
        }
    }, [isLoading, isAdmin]);
    const [partyId, setPartyId] = useState<string | null>(null);


    const [partyName, setPartyName] = useState<string>("");
    const [selectedParty, setSelectedParty] = useState<Party | null>(null);
    const [date, setDate] = useState(getBusinessDate()); // Made uneditable via state as well
    const [sessionRef, setSessionRef] = useState('');
    const [vouchers, setVouchers] = useState<VoucherFormData[]>(() => [{
        ui_key: crypto.randomUUID(),
        voucher_type_id: '',
        voucher_date: getBusinessDate(),
        narration: '',
        reference_no: '',
        party_id: null,
        template_id: null,
        lines: []
    }]);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionStatus, setSessionStatus] = useState<'DRAFT' | 'POSTED' | null>(null);
    const [systemConfig, setSystemConfig] = useState<SystemConfiguration | null>(null);
    const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
    const [liveBalance, setLiveBalance] = useState<{ balance: number; side: Side } | null>(null);

    // Robust Settlement Data (Used for real-time identification)
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [tags, setTags] = useState<LedgerTag[]>([]);
    const [customerLedgerId, setCustomerLedgerId] = useState<string | null>(null);



    // Quick Creation States
    const [showPartyModal, setShowPartyModal] = useState(false);
    const [editingPartyModal, setEditingPartyModal] = useState<Partial<Party> | null>(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [breakdownView, setBreakdownView] = useState<'audit' | 'flow'>('audit');
    const [showBankFlowModal, setShowBankFlowModal] = useState(false);

    // Staff Posting Modal State
    const [staff, setStaff] = useState<StaffProfile[]>([]);
    const [showStaffPostingModal, setShowStaffPostingModal] = useState(false);
    const [loadingStaff, setLoadingStaff] = useState(false);


    // Party Autocomplete States
    const [partySearchTerm, setPartySearchTerm] = useState('');
    const [partySuggestions, setPartySuggestions] = useState<Party[]>([]);
    const [showPartySuggestions, setShowPartySuggestions] = useState(false);
    const [partyBankIndex, setPartyBankIndex] = useState(0);
    const [showBankDropdown, setShowBankDropdown] = useState(false);
    const [isRouteAcknowledged, setIsRouteAcknowledged] = useState(false);
    const bankDropdownRef = useRef<HTMLDivElement>(null);
    const lastSavedStateRef = useRef<string>("");


    // Helper to capture current data for comparison
    const getCurrentStateString = () => {
        return JSON.stringify({
            partyId,
            date,
            sessionRef,
            vouchers: vouchers.map(v => ({
                voucher_type_id: v.voucher_type_id,
                narration: v.narration,
                reference_no: v.reference_no,
                lines: v.lines.map(l => ({
                    ledger_id: l.ledger_id,
                    party_id: l.party_id,
                    side: l.side,
                    amount: l.amount,
                    quantity: l.quantity,
                    uom_id: l.uom_id,
                    line_narration: l.line_narration,
                    external_ref: l.external_ref
                }))
            }))
        });
    };


    // Auto-reset acknowledgment if key fields change
    useEffect(() => {
        setIsRouteAcknowledged(false);
        setPartyBankIndex(0);
    }, [partyId, date, selectedParty?.bank_accounts?.length]);

    async function handleSaveParty(partyData: Partial<Party>) {
        try {
            const party = await upsertParty(partyData);
            setSuccess(`Counterparty "${party.party_name}" saved successfully.`);
            setPartyId(party.id);
            setPartyName(party.party_name);

            // Refresh selectedParty to show updated bank accounts
            if (party && partyId === party.id) {
                const refreshed = await fetchPartyById(party.id);
                if (refreshed) {
                    setSelectedParty(refreshed);
                }
            } else {
                setSelectedParty(party as Party);
            }

            setShowPartyModal(false);
            setEditingPartyModal(null);
        } catch (error: any) {
            setErrors([error.message || 'Failed to save party']);
        }
    }

    // Auto-dismiss alerts
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

    // Auto-generate Session Reference (Invoice No.)
    useEffect(() => {
        if (!sessionId && !sessionRef) {
            const timer = setTimeout(async () => {
                try {
                    const nextRef = await getNextReferenceNumber(date);
                    setSessionRef(nextRef);
                } catch (error) {
                    console.error('Error generating reference number:', error);
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [date, sessionId, sessionRef]);

    // Dirty state detection
    const isDirty = useMemo(() => {
        const hasParty = !!partyId;
        const hasVoucherType = vouchers.some(v => !!v.voucher_type_id);

        // Requirement: Prompt ONLY if both party and at least one voucher type are selected
        if (!hasParty || !hasVoucherType) {
            return false;
        }

        // If it's a loaded draft, compare against last saved version
        if (sessionId) {
            return getCurrentStateString() !== lastSavedStateRef.current;
        }

        // For new sessions, if both party and type are selected, we consider it "dirty"
        // as the user has initiated a meaningful transaction entry.
        return true;
    }, [partyId, vouchers, sessionId, date, sessionRef]);


    // Notify parent of dirty state
    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Browser exit protection
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    async function handleSaveAsDraft(options?: { silent?: boolean }) {
        const silent = options?.silent ?? false;
        if (!partyId) {
            setErrors(['Please select a customer first']);
            return;
        }
        setLoading(true);
        setErrors([]);
        try {
            // Validation: Every voucher that has DATA must have a TYPE
            const invalidVoucherIdx = vouchers.findIndex(v => {
                const hasData = v.lines.length > 0 || v.narration.trim() !== '';
                return hasData && !v.voucher_type_id;
            });

            if (invalidVoucherIdx !== -1) {
                setErrors([`Entry #${invalidVoucherIdx + 1} has data but no Voucher Type selected.`]);
                setActiveTabIndex(invalidVoucherIdx);
                setLoading(false);
                return;
            }

            const currentState = getCurrentStateString();
            const sessionData: SessionFormData & { id?: string } = {
                id: sessionId || undefined,
                session_date: date,
                narration: '',
                party_id: partyId,
                session_ref: sessionRef,
                vouchers: vouchers.map(v => ({
                    ...v,
                    draft_id: v.draft_id || undefined,
                    status: 'DRAFT'
                }))
            };

            const result = await createTransactionSession(sessionData);

            if (result?.id) {
                setSessionId(result.id);
            }

            // Sync vouchers state (crucial for silent saves/auto-saves)
            if (result?.vouchers && result.vouchers.length > 0) {
                setVouchers(prev => prev.map(oldV => {
                    // Try to find matching voucher by ui_key (set in supabase.ts)
                    const match = result?.vouchers?.find((newV: any) => newV.ui_key === oldV.ui_key);
                    if (match) {
                        return {
                            ...oldV,
                            draft_id: match.id,
                            status: match.status,
                            voucher_no: match.voucher_no,
                            updated_at: match.updated_at
                        };
                    }
                    return oldV;
                }));
            }

            // Update reference state IMMEDIATELY to clear dirty flag
            lastSavedStateRef.current = currentState;

            if (!silent) {
                toast.success(sessionId ? 'Draft updated successfully' : 'Draft saved successfully');

                // Reset the form as requested by user ("when saved as draft then reset the form")
                setTimeout(() => {
                    resetSession();
                    onDirtyChange?.(false);
                    onSavedSuccessfully?.();
                }, 500);
            } else {
                onDirtyChange?.(false);
            }
        } catch (err: any) {
            console.error('Draft save failed:', err);
            const msg = err.message || 'Failed to save draft';
            setErrors([msg]);
            toast.error(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }



    function resetSession() {
        lastSavedStateRef.current = "";
        setSessionId(null);
        setSessionStatus(null);

        setSessionRef('');
        setPartyId(null);
        setPartyName("");
        setPartySearchTerm('');
        setPartySuggestions([]);
        setShowPartySuggestions(false);
        setSelectedParty(null);
        setVouchers([{
            ui_key: crypto.randomUUID(),
            voucher_type_id: '',
            voucher_date: date,
            narration: '',
            reference_no: '',
            party_id: null,
            template_id: null,
            lines: []
        }]);
        setActiveTabIndex(0);
        setSuccess(null);
        setErrors([]);
        setIsRouteAcknowledged(false);
    }

    // Handle force save from parent
    useEffect(() => {
        if (forceSaveDraftTrigger && forceSaveDraftTrigger > 0 && isDirty) {
            handleSaveAsDraft();
        }
    }, [forceSaveDraftTrigger]);

    // Load static context once for the session (Robust identification)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (bankDropdownRef.current && !bankDropdownRef.current.contains(event.target as Node)) {
                setShowBankDropdown(false);
            }

        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load static context once for the session (Robust identification)
    useEffect(() => {
        loadBaseData();
        loadStaffAndDepts();
    }, []);

    const loadBaseData = async () => {
        try {
            const [l, t, config, years] = await Promise.all([
                fetchLedgers(true),
                fetchLedgerTags(),
                fetchSystemConfig(),
                fetchFinancialYears()
            ]);
            setLedgers(l);
            setTags(t);
            setSystemConfig(config);
            setFinancialYears(years);

            // Identify Customer Receivables Ledger
            const custLedger = l.find(led => led.ledger_name === 'Customer Receivables');
            if (custLedger) {
                setCustomerLedgerId(custLedger.id);
            }

            if (config?.current_fy) {
                // If it's a new session, default to today's date if within active FY,
                // else default to current_fy end_date to avoid immediate errors
                const today = getBusinessDate();
                const startDate = new Date(config.current_fy.start_date);
                const endDate = new Date(config.current_fy.end_date);
                const todayDate = new Date(today);

                if (todayDate < startDate || todayDate > endDate) {
                    setDate(config.current_fy.end_date);
                } else {
                    setDate(today);
                }
            }
        } catch (e) {
            console.error('Settlement Context Error:', e);
        }
    };

    const loadStaffAndDepts = async () => {
        setLoadingStaff(true);
        try {
            // Unified: Everyone (including Admin) only sees ELIGIBLE staff in the Session Audit context
            const eligibleStaff = await fetchPostingEligibleStaff();
            setStaff(eligibleStaff);
        } catch (error) {
            console.error('Failed to load session governance context:', error);
        } finally {
            setLoadingStaff(false);
        }
    };

    // Fetch full party details when partyId changes for enhanced settlements
    useEffect(() => {
        if (partyId) {
            fetchPartyById(partyId)
                .then(setSelectedParty)
                .catch(err => console.error('Error fetching party details:', err));

            if (customerLedgerId) {
                fetchPartyBalanceByLedger(partyId, customerLedgerId)
                    .then(bal => setLiveBalance(bal as { balance: number; side: Side }))
                    .catch(e => console.error('Error fetching live balance:', e));
            } else {
                fetchPartyBusinessBalance(partyId)
                    .then(bal => setLiveBalance(bal as { balance: number; side: Side }))
                    .catch(e => console.error('Error fetching live balance:', e));
            }
        } else {
            setSelectedParty(null);
            setLiveBalance(null);
        }
    }, [partyId]);

    // Session-level Integrity
    const integrity = useMemo(() => {
        let totalDR = 0;
        let totalCR = 0;
        let allTabsBalanced = true;

        vouchers.forEach(v => {
            let tabDR = 0;
            let tabCR = 0;
            v.lines.forEach(l => {
                if (l.side === 'DR') tabDR += Number(l.amount) || 0;
                else tabCR += Number(l.amount) || 0;
            });

            // A tab is balanced only if it's not empty and DR equals CR
            const isTabActive = v.lines.length > 0 && (tabDR > 0 || tabCR > 0);
            const isTabBalanced = isTabActive && Math.abs(tabDR - tabCR) < 0.01;

            if (!isTabBalanced) {
                allTabsBalanced = false;
            }

            totalDR += tabDR;
            totalCR += tabCR;
        });

        const difference = totalDR - totalCR;
        const isBalanced = Math.abs(difference) < 0.01;
        const netImpact = totalDR - totalCR;

        return { totalDR, totalCR, difference, isBalanced, netImpact, allTabsBalanced };
    }, [vouchers]);

    // Customer Settlement Lens (Robust Identification VERSION)
    const settlement = useMemo(() => {
        const SETTLEMENT_CASH_TAG = 'PHYSICAL CASH';
        const SETTLEMENT_BANK_TAG = 'BANK ACCOUNT';
        const cashTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_CASH_TAG))?.id;
        const bankTagId = tags.find(t => t.tag_name.toUpperCase().includes(SETTLEMENT_BANK_TAG))?.id;

        let businessReceive = 0; // CR on Business Ledgers (Value IN)
        let businessPay = 0;     // DR on Business Ledgers (Value OUT)

        let totalCashIn = 0;
        let totalCashOut = 0;
        let totalBankIn = 0;
        let totalBankOut = 0;

        const bankLedgerAnalysis: Record<string, { ledger: Ledger, net: number }> = {};

        vouchers.forEach(v => {
            v.lines.forEach(l => {
                // Find full ledger object for ROBUST identification
                const ledger = ledgers.find(lg => lg.id === l.ledger_id);
                // Identification logic (Matches VoucherEntry.tsx)
                const isCashBankLedger = ledger?.is_cash_bank || l.ledger_is_cash || l.ledger_is_bank;
                const hasBankTag = bankTagId && ledger?.business_tags?.includes(bankTagId);
                const hasCashTag = cashTagId && ledger?.business_tags?.includes(cashTagId);

                const isBankFallback = !hasCashTag && (
                    ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                    ledger?.ledger_name?.toLowerCase().includes('bank')
                );
                const isBankLine = isCashBankLedger && (hasBankTag || isBankFallback);
                const isCashLine = isCashBankLedger && !isBankLine;

                // An item is relevant if it's explicitly for this party OR if the entire voucher is for this party
                // AND it's not a cash/bank execution line (which are handled separately).
                const isExplicitPartyLine = l.party_id === partyId;
                const isVoucherLevelParty = v.party_id === partyId && !l.party_id;
                const isRelevant = isExplicitPartyLine || isVoucherLevelParty;

                if (isRelevant) {
                    const amount = Number(l.amount) || 0;
                    const side = l.side;

                    if (isBankLine) {
                        if (side === 'DR') totalBankIn += amount;
                        else totalBankOut += amount;

                        // Per-ledger tracking
                        if (ledger) {
                            if (!bankLedgerAnalysis[ledger.id]) {
                                bankLedgerAnalysis[ledger.id] = { ledger, net: 0 };
                            }
                            bankLedgerAnalysis[ledger.id].net += (side === 'DR' ? amount : -amount);
                        }
                    } else if (isCashLine) {
                        if (side === 'DR') totalCashIn += amount;
                        else totalCashOut += amount;
                    } else {
                        // Business Item (Non-Cash/Bank Flow)
                        if (side === 'DR') businessPay += amount;
                        else businessReceive += amount;
                    }
                }
            });
        });

        // FORMULA (Requested by User):
        // 1. Business Position: Only non-cash/bank items
        const netBusinessPosition = businessReceive - businessPay; // Negative means PAY, Positive means RECEIVE

        // 2. Bank Offset: Does bank execution perfectly match business position?
        const bankNetExecution = totalBankIn - totalBankOut;
        const isSettledByBank = Math.abs(netBusinessPosition + bankNetExecution) < 0.01 && (Math.abs(bankNetExecution) > 0.01);

        // 3. Final display status
        let status: 'RECEIVE' | 'PAY' | 'SETTLED' = 'SETTLED';
        if (isSettledByBank) {
            status = 'SETTLED';
        } else if (netBusinessPosition > 0.01) {
            status = 'RECEIVE';
        } else if (netBusinessPosition < -0.01) {
            status = 'PAY';
        } else if (Math.abs(netBusinessPosition) < 0.01) {
            status = 'SETTLED';
        }

        return {
            totalReceivable: businessReceive,
            totalPayable: businessPay,
            netPosition: Math.abs(netBusinessPosition),
            isSettled: status === 'SETTLED',
            status,
            cash: { in: totalCashIn, out: totalCashOut, net: totalCashIn - totalCashOut },
            bank: {
                in: totalBankIn,
                out: totalBankOut,
                net: totalBankIn - totalBankOut,
                ledgers: Object.values(bankLedgerAnalysis)
            }
        };
    }, [vouchers, partyId, ledgers, tags]);



    function addVoucher() {
        const newVoucher: VoucherFormData = {
            ui_key: crypto.randomUUID(),
            voucher_type_id: '',
            voucher_date: date,
            narration: '',
            reference_no: '',
            party_id: partyId,
            template_id: null,
            lines: []
        };
        const nextIndex = vouchers.length;
        setVouchers(prev => [...prev, newVoucher]);
        setActiveTabIndex(nextIndex);
        setIsRouteAcknowledged(false);
    }

    function removeVoucher(index: number) {
        setVouchers(prev => prev.filter((_, i) => i !== index));
    }


    async function handleDraftLoaded(draft: Voucher) {
        setLoading(true);
        try {
            if (draft.party_id) {
                const party = await fetchPartyById(draft.party_id);
                if (party) {
                    setPartyId(party.id);
                    setPartyName(party.party_name);
                    setSelectedParty(party);
                }
            }

            if (draft.session_id) {
                const session = await fetchSessionById(draft.session_id);
                if (session && session.vouchers) {
                    setSessionId(session.id);
                    setSessionStatus('DRAFT');
                    setSessionRef(session.session_ref || '');

                    const mappedVouchers: VoucherFormData[] = session.vouchers.map(v => ({
                        ui_key: crypto.randomUUID(),
                        draft_id: v.id,
                        updated_at: v.updated_at,
                        voucher_type_id: v.voucher_type_id,
                        voucher_type_name: v.voucher_type?.type_name || '',
                        voucher_date: v.voucher_date,
                        narration: v.narration,
                        reference_no: v.reference_no || '',
                        party_id: v.party_id,
                        template_id: v.template_id,
                        lines: v.lines?.map(l => ({
                            id: crypto.randomUUID(),
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
                            is_from_template: !!v.template_id,
                            is_fixed_side: false, // Default
                            is_credit_settlement: l.is_credit_settlement || (l.ledger?.ledger_name === 'Customer Receivables' && l.side === 'DR'),
                            ledger_allow_party: l.ledger?.allow_party,
                            ledger_is_cash: l.ledger?.is_cash_bank && !l.ledger?.ledger_name?.toLowerCase().includes('bank'),
                            ledger_is_bank: l.ledger?.is_cash_bank && l.ledger?.ledger_name?.toLowerCase().includes('bank')
                        })) || []
                    }));

                    setVouchers(mappedVouchers);
                    setActiveTabIndex(0);
                }
            } else {
                // Legacy single voucher draft
                setSessionId(null);
                setSessionStatus('DRAFT');

                const singleVoucher: VoucherFormData = {
                    ui_key: crypto.randomUUID(),
                    draft_id: draft.id,
                    updated_at: draft.updated_at,
                    voucher_type_id: draft.voucher_type_id,
                    voucher_type_name: draft.voucher_type?.type_name || '',
                    voucher_date: draft.voucher_date,
                    narration: draft.narration,
                    reference_no: draft.reference_no || '',
                    party_id: draft.party_id,
                    template_id: draft.template_id,
                    lines: draft.lines?.map(l => ({
                        id: crypto.randomUUID(),
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
                        is_from_template: !!draft.template_id,
                        is_fixed_side: false,
                        is_credit_settlement: l.is_credit_settlement || (l.ledger?.ledger_name === 'Customer Receivables' && l.side === 'DR'),
                        ledger_allow_party: l.ledger?.allow_party,
                        ledger_is_cash: l.ledger?.is_cash_bank && !l.ledger?.ledger_name?.toLowerCase().includes('bank'),
                        ledger_is_bank: l.ledger?.is_cash_bank && l.ledger?.ledger_name?.toLowerCase().includes('bank')
                    })) || []
                };
                setVouchers([singleVoucher]);
                setActiveTabIndex(0);
            }

            // We'll update lastSavedState after a delay to ensure parent state 
            // is fully updated before we baseline it.
            setTimeout(() => {
                lastSavedStateRef.current = getCurrentStateString();
                onDirtyChange?.(false);
            }, 400);
        } catch (error) {
            console.error('Error loading draft details:', error);
            toast.error('Failed to load full session data');
        } finally {
            setLoading(false);
        }
    }

    function handleVoucherDataChange(index: number, data: VoucherFormData) {
        setVouchers(prev => {
            const next = [...prev];
            next[index] = data;
            return next;
        });
    }



    async function handleFinalizeAndPost() {
        if (!partyId) {
            setErrors(['Please select a party first']);
            return;
        }
        if (vouchers.length === 0) {
            setErrors(['Add at least one voucher to the session']);
            return;
        }

        // Financial Year Validation
        const vDate = new Date(date);

        // 1. Check for specific FY that contains this date
        const targetFY = financialYears.find(y => {
            const start = new Date(y.start_date);
            const end = new Date(y.end_date);
            return vDate >= start && vDate <= end;
        });

        if (!targetFY) {
            setErrors([`Voucher date (${date}) does not fall within any defined Financial Year. Please create an FY in Core Settings first.`]);
            return;
        }

        if (targetFY.is_closed) {
            setErrors([`Financial Year ${targetFY.name} is CLOSED. Posting is strictly prohibited. Corrections must be made in an open year.`]);
            return;
        }

        // 2. Policy Check: Active Year only?
        if (systemConfig && !systemConfig.allow_backdated_posting) {
            if (systemConfig.current_financial_year_id !== targetFY.id) {
                setErrors([`Backdated posting is disabled. You are attempting to post into ${targetFY.name}, but the active year is ${systemConfig.current_fy?.name}.`]);
                return;
            }
        }

        // Helper validation function
        const validateVoucherItem = (v: VoucherFormData) => {
            if (!v.voucher_type_id) return { valid: false, msg: `Please select a Voucher Type for this entry` };
            if (!v.narration || v.narration.trim() === '') return { valid: false, msg: `Please provide a narration for this entry` };

            const zeroLineIndex = v.lines.findIndex(l => {
                // If amount is null (empty), it MUST have a quantity
                // If amount is 0, it is VALID provided the user explicitly typed it (which usually results in 0)
                // However, we need to distinguish "empty" from "0".
                // In our new system, empty is null, 0 is 0.

                const amount = l.amount;
                const quantity = Number(l.quantity) || 0;

                // Invalid if amount is EMPTY (null) AND quantity is 0
                return amount === null && quantity <= 0;
            });
            if (zeroLineIndex !== -1) return { valid: false, msg: `Line #${zeroLineIndex + 1} must have an amount or a quantity` };

            // Ensure EACH voucher is balanced
            const dr = v.lines.filter(l => l.side === 'DR').reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
            const cr = v.lines.filter(l => l.side === 'CR').reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
            if (Math.abs(dr - cr) > 0.01) return { valid: false, msg: `Voucher is unbalanced (Dr: ${dr.toFixed(2)}, Cr: ${cr.toFixed(2)})` };

            return { valid: true };
        };

        // 1. Check Active Tab First
        const activeCheck = validateVoucherItem(vouchers[activeTabIndex]);
        if (!activeCheck.valid) {
            setErrors([activeCheck.msg!]);
            return; // Stay on current tab
        }

        // 2. Check Other Tabs
        for (let i = 0; i < vouchers.length; i++) {
            if (i === activeTabIndex) continue; // Skip already checked

            const check = validateVoucherItem(vouchers[i]);
            if (!check.valid) {
                setErrors([`Entry #${i + 1}: ${check.msg}`]);
                setActiveTabIndex(i); // Auto-switch to invalid tab
                return;
            }
        }

        // Validate Session Integrity (Overall Balance)
        if (!integrity.isBalanced) {
            setErrors([`Session is not tallied. Net Impact: ${formatNumber(integrity.netImpact)}. Please balance before posting.`]);
            return;
        }

        // Route Acknowledgment Enforcement
        if (settlement.bank.ledgers.length > 0 && !isRouteAcknowledged) {
            setShowBankFlowModal(true);
            setErrors(['Please acknowledge the settlement transfer route before finalizing.']);
            return;
        }

        setLoading(true);
        setErrors([]);
        try {
            // Instead of creating the session here, we just show the modal
            setShowStaffPostingModal(true);
        } catch (error: any) {
            setErrors([error.message || 'Failed to prepare for posting']);
        } finally {
            setLoading(false);
        }
    }

    const handleConfirmPost = async (selectedStaffIds: string[], responsibleStaffId: string | null, exceptionReason?: string) => {
        setLoading(true);
        setErrors([]);
        const isApprovalRequired = systemConfig?.enable_txn_approvals;

        try {
            // Construct session data
            const sessionData: SessionFormData = {
                party_id: partyId,
                session_date: date,
                narration: '',
                session_ref: sessionRef,
                audit_exception_reason: exceptionReason,
                vouchers: vouchers.map(v => {
                    const hasBankLine = v.lines.some(l => {
                        const ledger = ledgers.find(lg => lg.id === l.ledger_id);
                        const isCashBankLedger = ledger?.is_cash_bank || l.ledger_is_cash || l.ledger_is_bank;
                        const isBankLine = isCashBankLedger && (
                            ledger?.business_tags?.some(tid => tags.find(t => t.tag_name.toUpperCase().includes('BANK ACCOUNT'))?.id === tid) ||
                            ledger?.ledger_group?.group_name?.toLowerCase().includes('bank') ||
                            ledger?.ledger_name?.toLowerCase().includes('bank')
                        );
                        return isBankLine;
                    });

                    let approvalStatus: ApprovalStatus = 'NOT_REQUIRED';
                    if (isApprovalRequired) approvalStatus = 'PENDING';

                    if (hasBankLine && isRouteAcknowledged) {
                        return { ...v, bank_status: 'PENDING', approval_status: approvalStatus };
                    }
                    return { ...v, bank_status: 'NONE', approval_status: approvalStatus };
                })
            };

            // Step 1: Create Session Draft
            const session = await createTransactionSession(sessionData);
            setSessionId(session.id);

            // Step 2: Save staff on duty for this session (with responsible flag and auditing)
            try {
                await saveSessionStaff(session.id, selectedStaffIds, responsibleStaffId, user?.id);
            } catch (staffError: any) {
                console.warn('Staff save failed (non-critical):', staffError.message);
            }

            // Step 3: Post or Send for Approval
            if (!isApprovalRequired) {
                await postTransactionSession(session.id);
                toast.success("Session finalized and posted successfully");
            } else {
                toast.success("Transaction sent for approval successfully");
            }

            setShowStaffPostingModal(false);
            onSavedSuccessfully?.();

            // Reset for next entry
            setTimeout(() => {
                resetSession();
            }, 1500);
        } catch (error: any) {
            setErrors([error.message || "Failed to finalize session"]);
            toast.error(error.message || "Failed to finalize session");
        } finally {
            setLoading(false);
        }
    };




    const tabsContainerRef = useRef<HTMLDivElement>(null);

    const scrollTabs = (direction: 'left' | 'right') => {
        if (tabsContainerRef.current) {
            const scrollAmount = 200;
            tabsContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-6 pb-20 animate-fade-in pt-4 space-y-6">
            {/* Top Fixed Alerts */}
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] alert-overlay w-full max-w-xl pointer-events-none px-4 flex flex-col gap-2 items-center">
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
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-500">Session Alert</span>
                        </div>
                        <ul className="space-y-1 text-center">
                            {errors.map((err, i) => (
                                <li key={i} className="text-[11px] font-bold text-rose-200/90 uppercase tracking-wide leading-relaxed">{err}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Header Row - Now at the very top for global alignment */}
            <div className="flex items-center justify-between gap-4 px-1">

                {/* Scrollable Tabs Container */}
                <div className="relative group flex-1 max-w-[calc(100%-250px)]">
                    {/* Left Scroll Button */}
                    <button
                        type="button"
                        onClick={() => scrollTabs('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-[#020617]/80 backdrop-blur-sm p-1 rounded-full border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-500 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <div
                        ref={tabsContainerRef}
                        className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-8"
                    >
                        {vouchers.map((v, index) => (
                            <div
                                key={index}
                                className={`relative flex-shrink-0 group rounded-2xl transition-all ${activeTabIndex === index
                                    ? 'bg-brand-600 text-white shadow-glow'
                                    : 'bg-slate-800/40 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setActiveTabIndex(index)}
                                    className={`w-full py-3 text-[10px] font-black uppercase tracking-widest text-left ${!sessionId && vouchers.length > 1 ? 'pl-6 pr-10' : 'px-6'
                                        }`}
                                >
                                    {v.voucher_type_name || `New Entry ${index + 1}`}
                                </button>
                                {sessionStatus !== 'POSTED' && vouchers.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeVoucher(index);
                                            setActiveTabIndex(Math.max(0, activeTabIndex - 1));
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete Segment"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Add Tab Button */}
                        {sessionStatus !== 'POSTED' && (
                            <button
                                type="button"
                                onClick={() => addVoucher()}
                                className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-800/40 hover:bg-brand-500/20 border border-slate-700/50 hover:border-brand-500/40 text-slate-500 hover:text-brand-400 flex items-center justify-center transition-all"
                                title="Add New Entry"
                            >
                                <Plus size={16} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>

                    {/* Right Scroll Button */}
                    <button
                        type="button"
                        onClick={() => scrollTabs('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-[#020617]/80 backdrop-blur-sm p-1 rounded-full border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-500 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>


                {/* Right Actions */}
                <div className="flex items-center gap-3">

                    {sessionStatus !== 'POSTED' && (
                        <button
                            type="button"
                            onClick={handleFinalizeAndPost}
                            disabled={loading}
                            className="btn-primary !h-11 !px-6 flex items-center gap-2 shadow-glow !text-[9px]"
                        >
                            <CheckCircle2 size={14} /> Finalize & Post Session
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

                {/* Vouchers List (Main Content area) */}
                <div className="lg:col-span-12 flex flex-col gap-0 border-0 m-0 p-0 relative z-20">
                    {/* Active Tab Content */}
                    <div className="animate-fade-in w-full relative z-30">
                        {vouchers[activeTabIndex] && (
                            <VoucherEntry
                                key={vouchers[activeTabIndex].ui_key} // Use stable unique key
                                isSessionChild={true}
                                initialData={vouchers[activeTabIndex]}
                                onDataChange={(data) => handleVoucherDataChange(activeTabIndex, data)}
                                onDraftLoaded={handleDraftLoaded}
                                onSaveAsDraft={handleSaveAsDraft}
                                lockedPartyId={partyId || undefined}
                                lockedDate={date}

                                sessionHeaderNodes={{
                                    customerNode: (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Select Customer *</label>
                                                {liveBalance && liveBalance.balance > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (selectedParty && customerLedgerId && onNavigateToReports) {
                                                                onNavigateToReports({
                                                                    ledgerId: customerLedgerId,
                                                                    partyId: selectedParty.id,
                                                                    view: 'ledger'
                                                                });
                                                            }
                                                        }}
                                                        className={`text-[10px] font-black uppercase tracking-tighter hover:underline transition-all cursor-pointer flex items-center gap-1.5 ${liveBalance.side === 'DR' ? 'text-emerald-400 hover:text-emerald-300' : 'text-rose-400 hover:text-rose-300'}`}
                                                    >
                                                        {(() => {
                                                            if (!selectedParty) return "Current Balance";
                                                            const type = selectedParty.party_type;
                                                            const isDebit = liveBalance.side === 'DR';

                                                            if (type === 'CUSTOMER') return isDebit ? "CUSTOMER RECEIVABLES" : "CUSTOMER ADVANCES";
                                                            if (type === 'VENDOR') return isDebit ? "SUPPLIER ADVANCES" : "SUPPLIER PAYABLES";
                                                            if (type === 'BOTH') {
                                                                return isDebit ? "CUSTOMER RECEIVABLES" : "SUPPLIER PAYABLES";
                                                            }
                                                            return "Current Balance";
                                                        })()}: {formatNumber(liveBalance.balance)} {liveBalance.side}
                                                        <Search size={10} className="opacity-50" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                                    <input
                                                        type="text"
                                                        className="input-field !pl-10 !pr-10 font-bold uppercase"
                                                        placeholder=""
                                                        value={partyName || partySearchTerm}
                                                        onChange={async (e) => {
                                                            const term = e.target.value;
                                                            setPartySearchTerm(term);
                                                            setPartyName(term);
                                                            setPartyId(null);

                                                            // Rule: Minimum 2 characters to search
                                                            if (term.trim().length >= 2) {
                                                                const results = await searchParties(term);
                                                                setPartySuggestions(results);
                                                                setShowPartySuggestions(true);
                                                            } else {
                                                                setPartySuggestions([]);
                                                                setShowPartySuggestions(false);
                                                            }
                                                        }}
                                                        onFocus={async () => {
                                                            // Only show suggestions if there's already a valid search term
                                                            if (partySearchTerm.trim().length >= 2) {
                                                                const results = await searchParties(partySearchTerm);
                                                                setPartySuggestions(results);
                                                                setShowPartySuggestions(true);
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            setTimeout(() => setShowPartySuggestions(false), 200);
                                                        }}
                                                    />

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (partyId) {
                                                                setEditingPartyModal({ id: partyId, party_name: partyName });
                                                            } else {
                                                                const term = partySearchTerm.trim();
                                                                if (term) {
                                                                    const isPhone = /^\d+$/.test(term);
                                                                    setEditingPartyModal(isPhone ? { phone: term } : { party_name: term });
                                                                } else {
                                                                    setEditingPartyModal({});
                                                                }
                                                            }
                                                            setShowPartyModal(true);
                                                        }}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 transition-all"
                                                        title="Open Party Master"
                                                    >
                                                        <UserPlus size={18} />
                                                    </button>
                                                </div>

                                                {showPartySuggestions && partySuggestions.length > 0 && (
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#0f172a] border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                                                        {partySuggestions.map(party => (
                                                            <button
                                                                type="button"
                                                                key={party.id}
                                                                className="w-full text-left p-3 hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0"
                                                                onClick={() => {
                                                                    setPartyId(party.id);
                                                                    setPartyName(party.party_name);
                                                                    setPartySearchTerm('');
                                                                    setShowPartySuggestions(false);
                                                                    setErrors(prev => prev.filter(err => err !== 'Please select a party first'));
                                                                }}
                                                            >
                                                                <div className="flex items-start justify-between">
                                                                    <div>
                                                                        <div className="text-sm font-bold text-slate-200 uppercase">{party.party_name}</div>
                                                                        <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-1">
                                                                            {party.party_type} • {party.phone || 'No Phone'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ))}

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const isPhone = /^\d+$/.test(partySearchTerm);
                                                                setEditingPartyModal(isPhone ? { phone: partySearchTerm } : { party_name: partySearchTerm });
                                                                setShowPartyModal(true);
                                                                setShowPartySuggestions(false);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-3 bg-brand-500/5 hover:bg-brand-500/10 transition-colors text-left border-t border-brand-500/20"
                                                        >
                                                            <Plus size={16} className="text-brand-400" />
                                                            <div className="text-xs font-bold text-brand-400 uppercase tracking-wide">Add New Party</div>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ),
                                    invoiceNode: (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Invoice No.</label>
                                            <input
                                                type="text"
                                                className="input-field font-bold text-brand-400"
                                                value={sessionRef}
                                                readOnly
                                                title="Auto-generated Invoice Number"
                                            />
                                        </div>
                                    ),
                                    dateNode: (
                                        <div className="space-y-3 opacity-60">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Date</label>
                                            <input
                                                type="date"
                                                className="input-field font-bold cursor-not-allowed"
                                                value={date}
                                                readOnly
                                            />
                                        </div>
                                    )
                                }}
                            />
                        )}
                    </div>

                    {/* Customer Settlement Panel (MOVED & HORIZONTAL) */}
                    {vouchers.length > 0 && (
                        <div className="surface-card p-6 bg-[#0f172a]/40 border border-slate-800/40 rounded-t-none border-t-0 shadow-none w-full relative z-10">
                            <div className="flex justify-between items-center mb-6">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] block text-brand-400">Customer Settlement</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBreakdownView('flow');
                                        setShowBreakdown(true);
                                    }}
                                    className="p-2 rounded-lg bg-slate-800/40 text-slate-500 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-2"
                                    title="View All Transactions"
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Full Breakdown</span>
                                    <Maximize2 size={12} strokeWidth={3} />
                                </button>
                            </div>

                            {partyId ? (
                                <div className={`grid ${!integrity.allTabsBalanced ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'} gap-8 items-center`}>
                                    {/* Col 1: Receive / Pay - ONLY show when all tabs balanced */}
                                    {integrity.allTabsBalanced && (
                                        <div className="space-y-4 md:border-r md:border-slate-800/50 md:pr-8">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    <span>You Receive</span>
                                                    <span className="text-white font-mono text-xs">{formatNumber(settlement.totalReceivable)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    <span>You Pay</span>
                                                    <span className="text-white font-mono text-xs">{formatNumber(settlement.totalPayable)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Col 2: Conditional Display - Integrity Check OR Net Position */}
                                    <div className="space-y-2 text-center flex flex-col items-center justify-center">
                                        {!integrity.allTabsBalanced ? (
                                            // STATE A: NOT BALANCED - Show Integrity Check Horizontally
                                            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 w-full">
                                                {/* Left - Debit */}
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Voucher Total Debit</span>
                                                    <span className="text-xl lg:text-2xl font-display font-black text-white tracking-widest">{formatNumber(integrity.totalDR)}</span>
                                                </div>

                                                {/* Center - Credit */}
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Voucher Total Credit</span>
                                                    <span className="text-xl lg:text-2xl font-display font-black text-white tracking-widest">{formatNumber(integrity.totalCR)}</span>
                                                </div>

                                                {/* Right - Status */}
                                                <div className="flex justify-center md:justify-end">
                                                    <div className={`flex items-center gap-5 px-6 py-3 rounded-[1.5rem] border transition-all min-w-[300px] ${integrity.totalDR === 0 && integrity.totalCR === 0
                                                        ? 'bg-slate-500/5 text-slate-500 border-slate-500/10'
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                                                        }`}>
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${integrity.totalDR === 0 && integrity.totalCR === 0
                                                            ? 'bg-slate-500/10 border-slate-500/20'
                                                            : 'bg-rose-500/20 border-rose-500/30'
                                                            }`}>
                                                            <AlertCircle size={18} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                                                                {integrity.totalDR === 0 && integrity.totalCR === 0 ? 'Wait Engine' : 'Entry Integrity'}
                                                            </span>
                                                            <span className="text-lg font-display font-black tracking-widest">
                                                                {integrity.totalDR === 0 && integrity.totalCR === 0
                                                                    ? 'AWAITING...'
                                                                    : `DIFF: +₹${formatNumber(Math.abs(integrity.difference))}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            // STATE B: BALANCED - Show Net Position
                                            <>
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Net Position</span>
                                                <span className={`text-2xl font-mono font-black ${settlement.status === 'RECEIVE' ? 'text-emerald-400' :
                                                    settlement.status === 'PAY' ? 'text-rose-500' :
                                                        'text-brand-400'
                                                    }`}>{settlement.status === 'SETTLED' ? '0.00' : formatNumber(Math.abs(settlement.netPosition))}</span>

                                                <div className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-slate-950/30 rounded-full border border-slate-800/50 mt-2 ${settlement.status === 'RECEIVE' ? 'text-emerald-400' :
                                                    settlement.status === 'PAY' ? 'text-rose-500' :
                                                        'text-slate-500'
                                                    }`}>
                                                    {settlement.status === 'RECEIVE' && "RECV FROM CUSTOMER"}
                                                    {settlement.status === 'PAY' && "GIVE TO CUSTOMER"}
                                                    {settlement.status === 'SETTLED' && "SETTLED NIL"}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Col 3: Cash/Bank Execution - ONLY show when all tabs balanced */}
                                    {integrity.allTabsBalanced && (
                                        <div className="md:border-l md:border-slate-800/50 md:pl-8 flex flex-col justify-center h-full">
                                            {(Math.abs(settlement.cash.net) > 0.01 || Math.abs(settlement.bank.net) > 0.01) ? (
                                                <div className="space-y-4">
                                                    {Math.abs(settlement.cash.net) > 0.01 && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[12px] font-black text-slate-500 uppercase tracking-widest">
                                                                {settlement.cash.net > 0 ? 'Recv Cash' : 'Give Cash'}
                                                            </span>
                                                            <span className={`text-[20px] font-mono font-black ${settlement.cash.net > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                                                {formatNumber(Math.abs(settlement.cash.net))}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {Math.abs(settlement.bank.net) > 0.01 && (
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center group cursor-pointer" onClick={() => {
                                                                setShowBankFlowModal(true);
                                                            }}>
                                                                <span className="text-[12px] font-black text-slate-500 uppercase tracking-widest group-hover:text-brand-400 transition-colors underline decoration-brand-500/30 underline-offset-4">
                                                                    {settlement.bank.net > 0 ? 'Recv Bank' : 'Give Bank'}
                                                                </span>
                                                                <span className={`text-[20px] font-mono font-black ${settlement.bank.net > 0 ? 'text-brand-400' : 'text-rose-500'}`}>
                                                                    {formatNumber(Math.abs(settlement.bank.net))}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-50">
                                                    <span className="text-[9px] font-black uppercase tracking-widest">No Immediate Settlement</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-8 flex flex-col items-center justify-center gap-3 bg-[#020617]/20 rounded-3xl border border-dashed border-slate-800/50">
                                    <Search size={20} className="text-slate-700" strokeWidth={1.5} />
                                    <span className="text-[9px] font-black text-slate-700 uppercase tracking-[0.2em] text-center px-6 leading-relaxed">
                                        Select a party to see settlement lens
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar logic for right is removed, integrated into VoucherEntry */}
            </div>




            {/* Bank Flow Modal */}
            {
                showBankFlowModal && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" onClick={() => setShowBankFlowModal(false)} />
                        <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                            {/* Modal Header */}
                            <div className="px-10 py-8 border-b border-slate-800/50 flex items-center justify-between bg-white/[0.02]">
                                <div>
                                    <h3 className="text-xl font-display font-black uppercase tracking-tight text-white flex items-center gap-3">
                                        <Landmark className="text-brand-500" size={24} />
                                        Settlement Transfer Route
                                    </h3>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1.5 opacity-60">Electronic Fund Movement Architecture</p>
                                </div>
                                <button type="button" onClick={() => setShowBankFlowModal(false)} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-all">
                                    <Maximize2 size={20} className="rotate-45" />
                                </button>
                            </div>

                            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {(settlement.bank.ledgers as any[]).map((entry, i) => {
                                    const isGive = entry.net < 0; // Owner gives to Party
                                    return (
                                        <div key={i} className={`p-8 rounded-[2.5rem] border transition-all duration-300 group ${isGive ? 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10' : 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'}`}>
                                            <div className="grid grid-cols-[1fr,auto,1fr] gap-10 items-center">
                                                {/* Column 1: Sender */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${isGive ? 'bg-rose-500 shadow-glow-sm' : 'bg-emerald-500 shadow-glow-sm'}`} />
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sender</span>
                                                    </div>

                                                    {isGive ? (
                                                        /* Owner Bank as Sender */
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-rose-500/10 rounded-2xl">
                                                                <Building2 size={24} className="text-rose-400" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight truncate">{systemConfig?.business_name || 'Our Company'}</h4>
                                                                <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1">
                                                                    <p className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest">
                                                                        {entry.ledger.bank_name && entry.ledger.bank_name !== entry.ledger.ledger_name
                                                                            ? `${entry.ledger.bank_name} (${entry.ledger.ledger_name})`
                                                                            : entry.ledger.ledger_name}
                                                                    </p>
                                                                    {entry.ledger.bank_ifsc && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {entry.ledger.bank_ifsc}</p>
                                                                    )}
                                                                    {entry.ledger.bank_account_no && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {entry.ledger.bank_account_no}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Party as Sender */
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                                                <UserPlus size={24} className="text-emerald-400" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight">{selectedParty?.party_name || 'Counterparty'}</h4>
                                                                {selectedParty?.bank_accounts?.[0] ? (
                                                                    <div className="relative" ref={bankDropdownRef}>
                                                                        {selectedParty.bank_accounts.length > 1 ? (
                                                                            <div className="flex flex-col gap-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setShowBankDropdown(!showBankDropdown)}
                                                                                    className="w-full bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl flex items-center justify-between transition-all group"
                                                                                >
                                                                                    <div className="flex items-center gap-3">
                                                                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{selectedParty.bank_accounts[partyBankIndex]?.bank_name}</span>
                                                                                        <span className="text-[9px] font-mono font-bold text-slate-500 opacity-60">**** {selectedParty.bank_accounts[partyBankIndex]?.bank_account_no.slice(-4)}</span>
                                                                                    </div>
                                                                                    <ChevronDown size={14} className={`text-emerald-500/50 transition-transform duration-300 ${showBankDropdown ? 'rotate-180' : ''}`} />
                                                                                </button>

                                                                                {showBankDropdown && (
                                                                                    <div className="absolute top-full left-0 right-0 mt-2 min-w-[200px] bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-scale-in origin-top">
                                                                                        {selectedParty.bank_accounts.map((acc, idx) => (
                                                                                            <button
                                                                                                type="button"
                                                                                                key={acc.id}
                                                                                                onClick={() => {
                                                                                                    setPartyBankIndex(idx);
                                                                                                    setShowBankDropdown(false);
                                                                                                }}
                                                                                                className={`w-full px-4 py-3 flex items-center justify-between hover:bg-emerald-500/10 transition-colors border-b border-slate-800/50 last:border-0 ${idx === partyBankIndex ? 'bg-emerald-500/5' : ''}`}
                                                                                            >
                                                                                                <span className={`text-[10px] font-black uppercase tracking-widest ${idx === partyBankIndex ? 'text-emerald-400' : 'text-slate-400'}`}>{acc.bank_name}</span>
                                                                                                <span className="text-[9px] font-mono font-bold text-slate-500">**** {acc.bank_account_no.slice(-4)}</span>
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                )}

                                                                                <div className="mt-1 space-y-0.5">
                                                                                    <p className="text-[11px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {selectedParty.bank_accounts[partyBankIndex]?.bank_ifsc}</p>
                                                                                    <p className="text-[11px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {selectedParty.bank_accounts[partyBankIndex]?.bank_account_no}</p>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1">
                                                                                <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest leading-tight">{selectedParty.bank_accounts[0].bank_name}</p>
                                                                                {selectedParty.bank_accounts[0].bank_ifsc && (
                                                                                    <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {selectedParty.bank_accounts[0].bank_ifsc}</p>
                                                                                )}
                                                                                <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {selectedParty.bank_accounts[0].bank_account_no}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-3 mt-2">
                                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                                                            <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] mb-2">⚠️ No Bank Account</p>
                                                                            <div className="space-y-1.5">
                                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Type:</span> {selectedParty?.party_type || 'N/A'}</p>
                                                                                {selectedParty?.phone && (
                                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Phone:</span> {selectedParty.phone}</p>
                                                                                )}
                                                                                {selectedParty?.email && (
                                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Email:</span> {selectedParty.email}</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (selectedParty) {
                                                                                    setEditingPartyModal(selectedParty);
                                                                                    setShowPartyModal(true);
                                                                                }
                                                                            }}
                                                                            className="w-full px-4 py-2.5 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-xl text-[10px] font-black text-brand-400 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                                        >
                                                                            <UserPlus size={14} />
                                                                            Add Bank Account
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Always show Edit Party button when recipient is party */}
                                                    {!isGive && selectedParty && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingPartyModal(selectedParty);
                                                                setShowPartyModal(true);
                                                            }}
                                                            className="mt-3 px-3 py-2 bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/50 rounded-xl text-[9px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                            title="Edit party and manage bank accounts"
                                                        >
                                                            <UserPlus size={12} />
                                                            Edit Party Profile
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Column 2: Flow Indicator & Amount */}
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className={`px-6 py-3 rounded-2xl ${isGive ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'} border shadow-glow-sm`}>
                                                        <p className={`text-xl font-mono font-black ${isGive ? 'text-rose-400' : 'text-emerald-400'} tracking-tight`}>₹ {formatNumber(Math.abs(entry.net))}</p>
                                                    </div>
                                                    <div className={`w-12 h-12 rounded-full ${isGive ? 'bg-rose-500 shadow-rose-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} flex items-center justify-center shadow-glow border-4 border-slate-900 transition-transform group-hover:scale-110`}>
                                                        <ArrowRight size={24} className="text-white" />
                                                    </div>
                                                </div>

                                                {/* Column 3: Recipient */}
                                                <div className="space-y-4 text-right">
                                                    <div className="flex items-center gap-3 justify-end">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recipient</span>
                                                        <div className={`w-2 h-2 rounded-full ${isGive ? 'bg-emerald-500 shadow-glow-sm' : 'bg-brand-500 shadow-glow-sm'}`} />
                                                    </div>

                                                    {!isGive ? (
                                                        /* Owner Bank as Recipient */
                                                        <div className="flex items-center gap-4 justify-end">
                                                            <div className="flex-1 min-w-0 text-right">
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight truncate">{systemConfig?.business_name || 'Our Company'}</h4>
                                                                <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1 text-right">
                                                                    <p className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest">
                                                                        {entry.ledger.bank_name && entry.ledger.bank_name !== entry.ledger.ledger_name
                                                                            ? `${entry.ledger.bank_name} (${entry.ledger.ledger_name})`
                                                                            : entry.ledger.ledger_name}
                                                                    </p>
                                                                    {entry.ledger.bank_ifsc && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {entry.ledger.bank_ifsc}</p>
                                                                    )}
                                                                    {entry.ledger.bank_account_no && (
                                                                        <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {entry.ledger.bank_account_no}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                                                <Building2 size={24} className="text-emerald-400" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Party as Recipient */
                                                        <div className="flex items-center gap-4 justify-end">
                                                            <div className="flex-1 min-w-0 text-right">
                                                                <h4 className="text-xs font-black text-white uppercase tracking-widest leading-tight truncate">{selectedParty?.party_name || 'Counterparty'}</h4>
                                                                {selectedParty?.bank_accounts?.[0] ? (
                                                                    <div className="mt-2" ref={bankDropdownRef}>
                                                                        {selectedParty.bank_accounts.length > 1 ? (
                                                                            <div className="flex flex-col items-end gap-1.5">
                                                                                <div className="relative">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setShowBankDropdown(!showBankDropdown)}
                                                                                        className="min-w-[180px] bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl flex items-center justify-between transition-all group"
                                                                                    >
                                                                                        <ChevronDown size={14} className={`text-rose-500/50 transition-transform duration-300 ${showBankDropdown ? 'rotate-180' : ''}`} />
                                                                                        <div className="flex items-center gap-3">
                                                                                            <span className="text-[9px] font-mono font-bold text-slate-500 opacity-60">**** {selectedParty.bank_accounts[partyBankIndex]?.bank_account_no.slice(-4)}</span>
                                                                                            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{selectedParty.bank_accounts[partyBankIndex]?.bank_name}</span>
                                                                                        </div>
                                                                                    </button>

                                                                                    {showBankDropdown && (
                                                                                        <div className="absolute top-full right-0 mt-2 w-full min-w-[220px] bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-scale-in origin-top-right">
                                                                                            {selectedParty.bank_accounts.map((acc, idx) => (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    key={acc.id}
                                                                                                    onClick={() => {
                                                                                                        setPartyBankIndex(idx);
                                                                                                        setShowBankDropdown(false);
                                                                                                    }}
                                                                                                    className={`w-full px-4 py-3 flex items-center justify-between hover:bg-rose-500/10 transition-colors border-b border-slate-800/50 last:border-0 ${idx === partyBankIndex ? 'bg-rose-500/5' : ''}`}
                                                                                                >
                                                                                                    <span className="text-[9px] font-mono font-bold text-slate-500">**** {acc.bank_account_no.slice(-4)}</span>
                                                                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${idx === partyBankIndex ? 'text-rose-400' : 'text-slate-400'}`}>{acc.bank_name}</span>
                                                                                                </button>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>

                                                                                <div className="mt-1 space-y-0.5 text-right">
                                                                                    <p className="text-[11px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {selectedParty.bank_accounts[partyBankIndex]?.bank_ifsc}</p>
                                                                                    <p className="text-[11px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {selectedParty.bank_accounts[partyBankIndex]?.bank_account_no}</p>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mt-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-1 text-right">
                                                                                <p className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest leading-tight">{selectedParty.bank_accounts[0].bank_name}</p>
                                                                                {selectedParty.bank_accounts[0].bank_ifsc && (
                                                                                    <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">IFSC: {selectedParty.bank_accounts[0].bank_ifsc}</p>
                                                                                )}
                                                                                <p className="text-[10px] font-mono font-bold text-slate-500 tracking-wider uppercase">A/C: {selectedParty.bank_accounts[0].bank_account_no}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-3 mt-2">
                                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-right">
                                                                            <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] mb-2">⚠️ No Bank Account</p>
                                                                            <div className="space-y-1.5">
                                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Type:</span> {selectedParty?.party_type || 'N/A'}</p>
                                                                                {selectedParty?.phone && (
                                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide"><span className="text-slate-600">Phone:</span> {selectedParty.phone}</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (selectedParty) {
                                                                                    setEditingPartyModal(selectedParty);
                                                                                    setShowPartyModal(true);
                                                                                }
                                                                            }}
                                                                            className="w-full px-4 py-2.5 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-xl text-[10px] font-black text-brand-400 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                                        >
                                                                            <UserPlus size={14} />
                                                                            Add Bank Account
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="p-3 bg-rose-500/10 rounded-2xl">
                                                                <UserPlus size={24} className="text-rose-400" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Always show Edit Party button when recipient is party */}
                                                    {isGive && selectedParty && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingPartyModal(selectedParty);
                                                                setShowPartyModal(true);
                                                            }}
                                                            className="mt-3 px-3 py-2 bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/50 rounded-xl text-[9px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                            title="Edit party and manage bank accounts"
                                                        >
                                                            <UserPlus size={12} />
                                                            Edit Party Profile
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-12 pt-8 border-t border-slate-800/50 flex flex-col items-center">
                                <div className="px-6 py-3 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex items-center gap-4">
                                    <div className="text-center">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Total Transaction Value</p>
                                        <p className="text-lg font-display font-black text-white tracking-widest">₹ {formatNumber(Math.abs(settlement.bank.net))}</p>
                                    </div>
                                    <div className="w-px h-8 bg-slate-700 mx-2" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!isRouteAcknowledged) {
                                                // Only check bank account if party is RECEIVING money (isGive = true)
                                                // When party is SENDER (isGive = false), we don't need their bank details
                                                const hasRecipientWithoutBank = (settlement.bank.ledgers as any[]).some(entry => {
                                                    const isGive = entry.net < 0; // Owner gives to Party
                                                    // Only validate if party is recipient (isGive = true)
                                                    if (isGive && selectedParty) {
                                                        return !selectedParty.bank_accounts ||
                                                            selectedParty.bank_accounts.length === 0 ||
                                                            !selectedParty.bank_accounts[0].bank_account_no ||
                                                            !selectedParty.bank_accounts[0].bank_ifsc;
                                                    }
                                                    return false;
                                                });

                                                if (hasRecipientWithoutBank) {
                                                    setErrors([`Cannot acknowledge: ${selectedParty?.party_name} has no bank account details. Please add bank account information first.`]);
                                                    setTimeout(() => setErrors([]), 5000);
                                                    return;
                                                }
                                                setIsRouteAcknowledged(true);
                                                // Close modal after acknowledgment
                                                setTimeout(() => setShowBankFlowModal(false), 300);
                                            } else {
                                                setShowBankFlowModal(false);
                                            }
                                        }}
                                        className={`px-12 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-glow ${isRouteAcknowledged
                                            ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/20'
                                            : 'bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300'
                                            }`}
                                    >
                                        {isRouteAcknowledged ? 'Acknowledged' : 'Acknowledge'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <PartyModal
                isOpen={showPartyModal}
                onClose={() => setShowPartyModal(false)}
                onSave={handleSaveParty}
                party={editingPartyModal}
                showDirectoryTab={true}
                onSelect={(party) => {
                    setPartyId(party.id);
                    setPartyName(party.party_name || '');
                    setSelectedParty(party);
                    setShowPartyModal(false);
                }}
            />

            <SessionBreakdownDrawer
                isOpen={showBreakdown}
                onClose={() => setShowBreakdown(false)}
                vouchers={vouchers}
                onSelectVoucher={(idx) => setActiveTabIndex(idx)}
                activeTabIndex={activeTabIndex}
                initialView={breakdownView}
                ledgers={ledgers}
                tags={tags}
            />

            <StaffPostingModal
                isOpen={showStaffPostingModal}
                onClose={() => setShowStaffPostingModal(false)}
                onConfirm={handleConfirmPost}
                staff={staff}
                loading={loadingStaff}
                isApprovalRequired={systemConfig?.enable_txn_approvals}
                isAdmin={isAdmin}

                sessionDetails={{
                    partyName: partyName,
                    date: date,
                    sessionRef: sessionRef
                }}
            />

        </div >
    );
}
