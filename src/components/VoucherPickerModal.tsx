import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ChevronRight, ArrowLeft, Zap } from 'lucide-react';
import type { VoucherType, VoucherGroup, Template } from '../types/accounting';
import { fetchTemplatesByVoucherType } from '../lib/supabase';
import Modal from './ui/Modal';

interface VoucherPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (voucherType: VoucherType, template?: Template) => void;
    voucherTypes: VoucherType[];
    groups: VoucherGroup[];
    selectedVoucherId?: string;
    skipTemplateSelection?: boolean; // If true, bypass template selection and immediately select voucher type
}

export default function VoucherPickerModal({
    isOpen,
    onClose,
    onSelect,
    voucherTypes,
    groups,
    selectedVoucherId,
    skipTemplateSelection = false
}: VoucherPickerModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState<string | 'all'>('all');
    const [view, setView] = useState<'types' | 'templates'>('types');
    const [activeVoucher, setActiveVoucher] = useState<VoucherType | null>(null);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Filtered and sorted voucher list
    const filteredVouchers = useMemo(() => {
        let list = [...voucherTypes];

        // Group filter
        if (selectedGroupId !== 'all') {
            list = list.filter(v => v.group_id === selectedGroupId);
        }

        // Search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(v =>
                v.type_name.toLowerCase().includes(term) ||
                v.prefix.toLowerCase().includes(term) ||
                v.type_code.toLowerCase().includes(term)
            );
        }

        // Sort
        return list.sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            return a.type_name.localeCompare(b.type_name);
        });
    }, [voucherTypes, selectedGroupId, searchTerm]);

    // Handle search focus and initial selection
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
            if (selectedVoucherId) {
                const current = voucherTypes.find(v => v.id === selectedVoucherId);
                if (current) setActiveVoucher(current);
            }
            setView('types');
        } else {
            setSearchTerm('');
            setTemplates([]);
        }
    }, [isOpen, selectedVoucherId, voucherTypes]);

    const handleVoucherClick = async (voucher: VoucherType) => {
        // If skipTemplateSelection is enabled, immediately select the voucher type
        if (skipTemplateSelection) {
            onSelect(voucher);
            return;
        }

        // Otherwise, fetch templates and show selection view
        setLoadingTemplates(true);
        setActiveVoucher(voucher);
        try {
            const data = await fetchTemplatesByVoucherType(voucher.id);
            if (data.length > 0) {
                setTemplates(data);
                setView('templates');
            } else {
                onSelect(voucher);
            }
        } catch (error) {
            console.error('Error fetching templates:', error);
            onSelect(voucher);
        } finally {
            setLoadingTemplates(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            {/* Compact Modal Container */}
            <div className="relative w-full max-w-3xl h-[65vh] bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10 animate-scale-in">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-md flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all uppercase tracking-tight"
                            placeholder="Search types..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Sidebar: Categories */}
                    <div className="w-48 border-r border-slate-800/30 bg-slate-950/30 p-3 overflow-y-auto hidden md:block">
                        {view === 'types' ? (
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-3 mb-2 block">Categories</label>
                                <button
                                    type="button"
                                    onClick={() => setSelectedGroupId('all')}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${selectedGroupId === 'all'
                                        ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                        : 'text-slate-500 hover:bg-slate-800/50 border border-transparent'
                                        }`}
                                >
                                    <span>All</span>
                                    <span className="opacity-50">{voucherTypes.length}</span>
                                </button>
                                {groups.map(group => (
                                    <button
                                        type="button"
                                        key={group.id}
                                        onClick={() => setSelectedGroupId(group.id)}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${selectedGroupId === group.id
                                            ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                            : 'text-slate-500 hover:bg-slate-800/50 border border-transparent'
                                            }`}
                                    >
                                        <span className="truncate">{group.group_name}</span>
                                        <span className="opacity-50">{voucherTypes.filter(v => v.group_id === group.id).length}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <button
                                    type="button"
                                    onClick={() => setView('types')}
                                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all border border-slate-800"
                                >
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <div className="p-4 bg-brand-500/5 rounded-xl border border-brand-500/10 text-center">
                                    <div className="w-8 h-8 mx-auto bg-brand-500 rounded-lg flex items-center justify-center text-[10px] font-black text-white mb-2">
                                        {activeVoucher?.prefix}
                                    </div>
                                    <div className="text-[10px] font-black text-white uppercase">{activeVoucher?.type_name}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-900/20">
                        {view === 'types' ? (
                            <div className="grid grid-cols-1 gap-2">
                                {filteredVouchers.map(voucher => (
                                    <button
                                        type="button"
                                        key={voucher.id}
                                        onClick={() => handleVoucherClick(voucher)}
                                        disabled={loadingTemplates}
                                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all group ${activeVoucher?.id === voucher.id ? 'bg-slate-800/60 border-brand-500/30' : 'bg-slate-800/20 border-slate-800/50 hover:bg-slate-800/40 hover:border-slate-700'} ${(!voucher.is_active || loadingTemplates) && 'opacity-50 grayscale'}`}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] ${activeVoucher?.id === voucher.id ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                            {loadingTemplates && activeVoucher?.id === voucher.id ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                voucher.prefix
                                            )}
                                        </div>
                                        <div className="text-left flex-1">
                                            <div className="text-xs font-black text-slate-300 uppercase tracking-tight group-hover:text-white transition-colors">
                                                {voucher.type_name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[8px] font-bold text-slate-600 bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-800/50 uppercase tracking-wider">
                                                    {voucher.voucher_nature}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-700 group-hover:text-brand-500 transition-colors" />
                                    </button>
                                ))}
                                {filteredVouchers.length === 0 && (
                                    <div className="text-center py-20 text-slate-600 text-xs font-bold uppercase tracking-widest opacity-50">
                                        No vouchers found
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 max-w-lg mx-auto pt-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center mb-6">Select Template</h3>

                                {templates.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        {templates.map(template => (
                                            <button
                                                type="button"
                                                key={template.id}
                                                onClick={() => activeVoucher && onSelect(activeVoucher, template)}
                                                className="w-full flex items-center gap-4 p-4 rounded-2xl border bg-brand-500/5 border-brand-500/10 hover:bg-brand-500/10 hover:border-brand-500/30 transition-all group text-left"
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-400">
                                                    <Zap size={16} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-xs font-black text-white uppercase tracking-tight">{template.template_name}</div>
                                                    <div className="text-[9px] font-medium text-slate-500 mt-0.5 uppercase tracking-wide">{template.lines?.length || 0} Auto-filled Lines</div>
                                                </div>
                                                <div className="text-[9px] font-black text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    APPLY
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
