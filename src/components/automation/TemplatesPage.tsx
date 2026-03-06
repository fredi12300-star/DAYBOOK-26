import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Search, FileText, AlertCircle,
    Trash2, Save, Edit3, Lock, Unlock, DollarSign,
    Calculator, GripVertical, ArrowUpRight, Settings, X
} from 'lucide-react';
import { supabase, upsertTemplateGroup, deleteTemplateGroup, reassignTemplates } from '../../lib/supabase';
import { Template, TemplateGroup, TemplateLine, VoucherType, Ledger } from '../../types/accounting';
import { toast } from 'react-hot-toast';
import SearchableSelect from '../ui/SearchableSelect';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import VoucherPickerModal from '../VoucherPickerModal';

// Types specific to this UI
type EditorMode = 'VIEW' | 'CREATE' | 'EDIT';

interface ExtendedTemplate extends Template {
    voucher_type_ids?: string[]; // For multi-select UI
}

export default function TemplatesPage() {
    const [mode, setMode] = useState<EditorMode>('VIEW');
    const [templates, setTemplates] = useState<ExtendedTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<ExtendedTemplate | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeGroupId, setActiveGroupId] = useState<string>('ALL'); // 'ALL', 'UNCATEGORIZED', or group UUID
    const [filterVoucherType] = useState<string>('ALL');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    // Dialog State
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const openConfirm = (title: string, message: string, onConfirm: () => void, isDestructive = false) => {
        setConfirmDialog({ isOpen: true, title, message, onConfirm, isDestructive });
    };

    const closeConfirm = () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    };

    // Master Data
    const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [templateGroups, setTemplateGroups] = useState<TemplateGroup[]>([]);
    const [voucherGroups, setVoucherGroups] = useState<import('../../types/accounting').VoucherGroup[]>([]);

    useEffect(() => {
        loadMasterData();
        loadTemplates(); // Initial load
    }, []);

    const loadMasterData = async () => {
        const { data: vtData } = await supabase.from('voucher_types').select('*').eq('is_active', true);
        const { data: lData } = await supabase.from('ledgers').select('*').eq('is_active', true);
        const { data: gData } = await supabase.from('template_groups').select('*').eq('is_active', true);
        const vGroups = await import('../../lib/supabase').then(m => m.fetchVoucherGroups()); // Dynamic import or use existing if exported

        if (vtData) setVoucherTypes(vtData);
        if (lData) setLedgers(lData);
        if (gData) setTemplateGroups(gData);
        setVoucherGroups(vGroups);
    };

    const loadTemplates = async () => {
        console.log('🔄 Loading templates from database...');
        // Fetch templates
        const { data, error } = await supabase
            .from('rapid_templates')
            .select(`
                *,
                group:template_groups(*),
                lines:template_lines(*),
                voucher_type:voucher_types!voucher_type_id(*)
            `)
            .order('template_name');

        if (error) {
            console.error('❌ Error loading templates:', error);
            toast.error('Failed to load templates');
            return;
        }

        if (data) {
            setTemplates(data as ExtendedTemplate[]);
        }
    };

    const handleCreateNew = () => {
        const executeCreate = () => {
            const uniqueCode = `TMPL_${Date.now()}`;
            setSelectedTemplate({
                id: '',
                voucher_type_id: null,
                group_id: null,
                template_name: '',
                template_code: uniqueCode,
                description: '',
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                lines: []
            });
            setMode('CREATE');
            setHasUnsavedChanges(false);
            closeConfirm();
        };

        if (hasUnsavedChanges) {
            openConfirm(
                'Unsaved Changes',
                'You have unsaved changes. Do you want to discard them and create a new template?',
                executeCreate
            );
            return;
        }

        executeCreate();
    };

    const handleSelectTemplate = (t: ExtendedTemplate) => {
        const executeSelect = () => {
            setSelectedTemplate(t);
            setMode('EDIT');
            setHasUnsavedChanges(false);
            closeConfirm();
        };

        if (hasUnsavedChanges) {
            openConfirm(
                'Unsaved Changes',
                'You have unsaved changes. Do you want to discard them and switch templates?',
                executeSelect
            );
            return;
        }

        executeSelect();
    };

    const displayedTemplates = templates.filter(t => {
        const matchesSearch = t.template_name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesVoucherType = filterVoucherType === 'ALL' || t.voucher_type_id === filterVoucherType;

        let matchesGroup = true;
        if (activeGroupId === 'UNCATEGORIZED') {
            matchesGroup = !t.group_id;
        } else if (activeGroupId !== 'ALL') {
            matchesGroup = t.group_id === activeGroupId;
        }

        return matchesSearch && matchesVoucherType && matchesGroup;
    }).sort((a, b) => {
        // 1. Active first
        if (a.is_active && !b.is_active) return -1;
        if (!a.is_active && b.is_active) return 1;
        // 2. Alphabetical by name
        return a.template_name.localeCompare(b.template_name);
    });

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6">
            {/* LEFT SIDEBAR: Template Library */}
            <div className="w-1/3 flex flex-col border-r border-slate-800/50 overflow-hidden">
                {/* Header */}
                <div className="p-5 bg-slate-900/10">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Template Library</h2>
                        <button
                            onClick={handleCreateNew}
                            className="p-1.5 bg-brand-600/10 hover:bg-brand-600/20 text-brand-400 rounded-lg transition-all border border-brand-500/20"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-[11px] font-bold text-slate-200 focus:outline-none focus:border-brand-500/50"
                        />
                    </div>
                </div>

                {/* Category Tabs */}
                <div className="px-4 border-b border-slate-800/30 bg-slate-900/10">
                    <div className="flex gap-1 overflow-x-auto custom-scrollbar py-3 scroll-smooth">
                        <button
                            type="button"
                            onClick={() => setActiveGroupId('ALL')}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeGroupId === 'ALL'
                                ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                                : 'text-slate-500 hover:text-slate-300 bg-slate-800/30'
                                }`}
                        >
                            All
                        </button>
                        {templateGroups.map(g => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => setActiveGroupId(g.id)}
                                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeGroupId === g.id
                                    ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                                    : 'text-slate-500 hover:text-slate-300 bg-slate-800/30'
                                    }`}
                            >
                                {g.group_name}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setActiveGroupId('UNCATEGORIZED')}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeGroupId === 'UNCATEGORIZED'
                                ? 'bg-brand-600 text-white shadow-glow shadow-brand-500/20'
                                : 'text-slate-500 hover:text-slate-300 bg-slate-800/30'
                                }`}
                        >
                            Uncategorized
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsCategoryModalOpen(true)}
                            className="p-1 px-2.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all text-slate-400 hover:text-white bg-slate-800/20 border border-slate-700/30 flex items-center gap-1.5 ml-2 mr-3"
                        >
                            <Settings size={10} />
                            Manage
                        </button>
                    </div>
                </div>

                {/* Templates List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {displayedTemplates.map(t => (
                        <div
                            key={t.id}
                            onClick={() => handleSelectTemplate(t)}
                            className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedTemplate?.id === t.id
                                ? 'bg-brand-600/10 border-brand-500/30'
                                : 'bg-slate-900/20 border-slate-800/50 hover:bg-slate-800/40'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className={`text-[11px] font-bold block ${selectedTemplate?.id === t.id ? 'text-brand-400' : 'text-slate-300'}`}>
                                        {t.template_name}
                                    </span>
                                    {activeGroupId === 'ALL' && (
                                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                                            {t.group?.group_name || 'Uncategorized'}
                                        </span>
                                    )}
                                </div>
                                {t.is_active && (
                                    <div className="w-1 h-1 rounded-full bg-brand-500" />
                                )}
                            </div>
                        </div>
                    ))}

                    {displayedTemplates.length === 0 && (
                        <div className="p-12 text-center text-slate-700">
                            <FileText size={32} className="mx-auto mb-4 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No templates found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT MAIN: Template Editor */}
            <div className="flex-1 surface-card flex flex-col relative overflow-hidden">
                {selectedTemplate ? (
                    <TemplateEditor
                        template={selectedTemplate}
                        mode={mode}
                        voucherTypes={voucherTypes}
                        templateGroups={templateGroups}
                        voucherGroups={voucherGroups}
                        ledgers={ledgers}
                        onSave={() => { loadTemplates(); loadMasterData(); setHasUnsavedChanges(false); }}
                        onCancel={() => { setSelectedTemplate(null); setMode('VIEW'); setHasUnsavedChanges(false); }}
                        onChangeDetected={() => setHasUnsavedChanges(true)}
                        openConfirm={openConfirm}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 opacity-60">
                        <ArrowUpRight size={48} className="mb-4 text-slate-700" strokeWidth={1} />
                        <p className="text-sm font-bold uppercase tracking-widest">Select a template to edit</p>
                    </div>
                )}
            </div>

            {/* Global Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                onConfirm={confirmDialog.onConfirm}
                onCancel={closeConfirm}
                isDestructive={confirmDialog.isDestructive}
            />

            {/* Category Manager Modal */}
            {isCategoryModalOpen && (
                <CategoryManagerModal
                    groups={templateGroups}
                    onClose={() => setIsCategoryModalOpen(false)}
                    onRefresh={() => { loadMasterData(); loadTemplates(); }}
                />
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// Sub-component: Category Manager Modal
// ----------------------------------------------------------------------

interface CategoryManagerModalProps {
    groups: TemplateGroup[];
    onClose: () => void;
    onRefresh: () => void;
}

function CategoryManagerModal({ groups, onClose, onRefresh }: CategoryManagerModalProps) {
    const [newGroupName, setNewGroupName] = useState('');
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
    const [migrationTargetId, setMigrationTargetId] = useState<string>(''); // Default to uncategorized (null)

    const handleCreate = async () => {
        if (!newGroupName.trim()) return;
        try {
            await upsertTemplateGroup({ group_name: newGroupName.trim() });
            setNewGroupName('');
            onRefresh();
            toast.success("Category created");
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleUpdate = async () => {
        if (!editingGroupId || !editingName.trim()) return;
        try {
            await upsertTemplateGroup({ id: editingGroupId, group_name: editingName.trim() });
            setEditingGroupId(null);
            onRefresh();
            toast.success("Category updated");
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleDelete = async () => {
        if (!isDeletingId) return;
        try {
            // 1. Reassign templates first
            await reassignTemplates(isDeletingId, migrationTargetId || null);
            // 2. Delete the group
            await deleteTemplateGroup(isDeletingId);
            setIsDeletingId(null);
            onRefresh();
            toast.success("Category removed and templates migrated");
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose}>
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden relative">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <Settings size={18} className="text-brand-500" />
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Manage Categories</h3>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Organize your rapid templates</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white">
                        <X size={20} className="rotate-45" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Add New */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Create New Category</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                placeholder="e.g. Jewellery, E-Seva..."
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl py-2 px-4 text-xs font-bold text-slate-200 focus:outline-none focus:border-brand-500/50"
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            />
                            <button
                                type="button"
                                onClick={handleCreate}
                                className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="h-px bg-slate-800/50" />

                    {/* Groups List */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Existing Categories</label>
                        <div className="space-y-2">
                            {groups.map(g => (
                                <div key={g.id} className="p-3 bg-slate-950 border border-slate-800/50 rounded-xl flex items-center justify-between group">
                                    {editingGroupId === g.id ? (
                                        <div className="flex-1 flex gap-2">
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                className="flex-1 bg-slate-900 border border-brand-500/30 rounded-lg py-1 px-3 text-xs font-bold text-white outline-none"
                                                autoFocus
                                                onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                                            />
                                            <button type="button" onClick={handleUpdate} className="text-emerald-500 hover:text-emerald-400">
                                                <Save size={16} />
                                            </button>
                                            <button type="button" onClick={() => setEditingGroupId(null)} className="text-slate-500 hover:text-slate-300">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-xs font-bold text-slate-200 uppercase tracking-tight">{g.group_name}</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingGroupId(g.id); setEditingName(g.group_name); }}
                                                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-brand-400"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsDeletingId(g.id)}
                                                    className="p-1.5 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-500"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sub-modal: Migration UI */}
                {isDeletingId && (
                    <div className="absolute inset-0 bg-slate-950/95 flex items-center justify-center p-8 z-[130] animate-fade-in">
                        <div className="w-full space-y-8 text-center animate-scale-up">
                            <div className="p-3 bg-rose-500/20 rounded-2xl w-fit mx-auto border border-rose-500/30 mb-2">
                                <AlertCircle size={32} className="text-rose-500" />
                            </div>
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Migration Required</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 leading-relaxed">
                                    Where should we move the templates currently assigned to <br />
                                    <span className="text-rose-400">"{groups.find(g => g.id === isDeletingId)?.group_name}"</span>?
                                </p>
                            </div>

                            <div className="max-w-xs mx-auto space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600">Select Target Category</label>
                                <select
                                    value={migrationTargetId}
                                    onChange={e => setMigrationTargetId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-white outline-none focus:border-brand-500/50"
                                >
                                    <option value="">( Uncategorized )</option>
                                    {groups.filter(g => g.id !== isDeletingId).map(g => (
                                        <option key={g.id} value={g.id}>{g.group_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-4 max-w-xs mx-auto">
                                <button
                                    type="button"
                                    onClick={() => setIsDeletingId(null)}
                                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-glow shadow-rose-500/20"
                                >
                                    Migrate & Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ----------------------------------------------------------------------
// Sub-component: Template Editor Form
// ----------------------------------------------------------------------

interface TemplateEditorProps {
    template: ExtendedTemplate;
    mode: EditorMode;
    voucherTypes: VoucherType[];
    templateGroups: TemplateGroup[];
    voucherGroups: import('../../types/accounting').VoucherGroup[];
    ledgers: Ledger[];
    onSave: () => void;
    onCancel: () => void;
    onChangeDetected: () => void;
    openConfirm: (title: string, message: string, onConfirm: () => void, isDestructive?: boolean) => void;
}

function TemplateEditor({ template, mode, voucherTypes, templateGroups, voucherGroups, ledgers, onSave, onCancel, onChangeDetected, openConfirm }: TemplateEditorProps) {
    // Local state for form
    const [formData, setFormData] = useState<ExtendedTemplate>(template);
    const [lines, setLines] = useState<TemplateLine[]>(template.lines || []);
    const [showVoucherPicker, setShowVoucherPicker] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    // Sync state when template prop changes (when user selects different template from library)
    useEffect(() => {
        setFormData(template);
        setLines(template.lines || []);
    }, [template]);

    // Wrapper functions to track changes
    const updateFormData = (newData: Partial<ExtendedTemplate>) => {
        setFormData(prev => ({ ...prev, ...newData }));
        onChangeDetected();
    };

    const updateLines = (newLines: TemplateLine[] | ((prev: TemplateLine[]) => TemplateLine[])) => {
        setLines(newLines);
        onChangeDetected();
    };

    const handleLedgerSearch = useCallback(async (term: string) => {
        return ledgers
            .filter(l => l.ledger_name.toLowerCase().includes(term.toLowerCase()))
            .map(l => ({ id: l.id, label: l.ledger_name, subLabel: l.nature }));
    }, [ledgers]);

    // -- Handlers --
    const handleAddLine = () => {
        const newLine: TemplateLine = {
            id: crypto.randomUUID(),
            template_id: formData.id,
            line_number: lines.length + 1,
            ledger_id: '',
            default_side: 'DR',
            is_fixed_side: false,
            is_required: true,
            amount_rule: 'INPUT',
            calc_formula: null,
            amount_value: 0,
            created_at: new Date().toISOString()
        };
        updateLines([...lines, newLine]);
    };

    const handleUpdateLine = (lineId: string, field: keyof TemplateLine, value: any) => {
        updateLines(lines.map(l => l.id === lineId ? { ...l, [field]: value } : l));
    };

    const handleDeleteLine = (lineId: string) => {
        updateLines(lines.filter(l => l.id !== lineId));
    };

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
    };

    const handleDrop = (index: number) => {
        if (draggedIndex === null || draggedIndex === index) return;

        const newLines = [...lines];
        const [movedLine] = newLines.splice(draggedIndex, 1);
        newLines.splice(index, 0, movedLine);

        // Re-assign line numbers to maintain sequence
        const renumberedLines = newLines.map((line, i) => ({
            ...line,
            line_number: i + 1
        }));

        updateLines(renumberedLines);
        setDraggedIndex(null);
    };


    const handleSaveTemplate = async () => {
        console.log('🔵 SAVE STARTED - formData:', formData);
        console.log('🔵 SAVE STARTED - lines:', lines);

        // 1. Validation
        if (!formData.template_name) {
            console.log('❌ Validation failed: No template name');
            toast.error("Template Name is required");
            return;
        }
        if (lines.length < 2) {
            console.log('❌ Validation failed: Need at least 2 lines, got:', lines.length);
            toast.error("Template must have at least 2 lines");
            return;
        }

        console.log('✅ Validation passed');

        try {
            // 2. Save Header
            const upsertData = {
                ...(formData.id && formData.id.trim() ? { id: formData.id } : {}),
                template_name: formData.template_name,
                template_code: formData.template_code,
                description: formData.description,
                group_id: formData.group_id || null, // Include group_id
                voucher_type_id: formData.voucher_type_id || null,
                is_active: formData.is_active,
                updated_at: new Date().toISOString()
            };

            const { data: savedTemplate, error: headerError } = await supabase
                .from('rapid_templates')
                .upsert(upsertData)
                .select()
                .single();

            console.log('🔵 Upsert result - savedTemplate:', savedTemplate);
            console.log('🔵 Upsert result - headerError:', headerError);

            if (headerError) throw headerError;
            if (!savedTemplate) throw new Error("Failed to save template header");

            console.log('✅ Template header saved, ID:', savedTemplate.id);

            // 3. Save Lines (Delete all and re-create for simplicity)
            if (formData.id) {
                console.log('🔵 Deleting old lines for template:', savedTemplate.id);
                await supabase.from('template_lines').delete().eq('template_id', savedTemplate.id);
            }

            // Prepare lines
            const linesToSave = lines.map((line, index) => ({
                template_id: savedTemplate.id,
                line_number: index + 1,
                ledger_id: line.ledger_id,
                default_side: line.default_side,
                is_fixed_side: line.is_fixed_side,
                amount_rule: line.amount_rule,
                amount_value: line.amount_value || 0,
                is_required: true,
                created_at: new Date().toISOString()
            }));

            console.log('🔵 Inserting lines:', linesToSave);
            const { error: linesError } = await supabase.from('template_lines').insert(linesToSave);
            console.log('🔵 Lines insert error:', linesError);

            if (linesError) throw linesError;

            console.log('✅ Template lines saved');
            console.log('🔵 Calling onSave to refresh list...');

            toast.success("Template Saved Successfully");
            await onSave(); // Refresh list - wait for it to complete

            console.log('✅ List refreshed, closing editor');
            onCancel(); // Close editor after refresh

        } catch (error: any) {
            console.error("❌ Save failed:", error);
            toast.error("Failed to save template: " + (error.message || JSON.stringify(error)));
        }
    };

    const handleDeleteTemplate = async () => {
        if (!formData.id) {
            toast.error("Cannot delete unsaved template");
            return;
        }

        openConfirm(
            'Delete Template',
            `Are you sure you want to delete "${formData.template_name}"? This action cannot be undone.`,
            async () => {
                try {
                    console.log('🗑️ Deleting template:', formData.id);

                    const { error } = await supabase
                        .from('rapid_templates')
                        .delete()
                        .eq('id', formData.id);

                    if (error) throw error;

                    console.log('✅ Template deleted successfully');
                    toast.success("Template deleted successfully");
                    await onSave(); // Refresh list
                    onCancel(); // Close editor

                } catch (error: any) {
                    console.error("❌ Delete failed:", error);
                    toast.error("Failed to delete template: " + (error.message || JSON.stringify(error)));
                }
            },
            true // isDestructive
        );
    };

    return (
        <div className="flex flex-col h-full">
            {/* Editor Header */}
            <div className="h-16 border-b border-slate-800/50 flex items-center justify-between px-6 bg-slate-900/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800/50 rounded-lg">
                        {mode === 'CREATE' ? <Plus size={18} className="text-brand-500" /> : <Edit3 size={18} className="text-brand-500" />}
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-200">
                            {mode === 'CREATE' ? 'New Template' : 'Edit Template'}
                        </h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {formData.template_name || 'Untitled'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    {mode === 'EDIT' && formData.id && (
                        <button
                            type="button"
                            onClick={handleDeleteTemplate}
                            className="px-4 py-2 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-600/30 text-rose-400 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                        >
                            <Trash2 size={14} />
                            <span>Delete</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSaveTemplate}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-glow shadow-brand-500/20"
                    >
                        <Save size={14} />
                        <span>Save Template</span>
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">

                <div className="grid grid-cols-2 gap-6 p-6 bg-slate-900/20 rounded-2xl border border-slate-800/30">
                    <div className="space-y-4">
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Template Name</span>
                            <input
                                type="text"
                                value={formData.template_name}
                                onChange={e => updateFormData({ template_name: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-bold text-slate-200 focus:outline-none focus:border-brand-500/50"
                                placeholder="e.g. Monthly Shop Rent"
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category Group</span>
                            <select
                                value={formData.group_id || ''}
                                onChange={e => updateFormData({ group_id: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-bold text-slate-200 focus:outline-none focus:border-brand-500/50"
                            >
                                <option value="">-- Uncategorized --</option>
                                {templateGroups.map(g => (
                                    <option key={g.id} value={g.id}>{g.group_name}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="space-y-4">
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Linked Voucher Type</span>
                            <button
                                type="button"
                                onClick={() => setShowVoucherPicker(true)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-bold text-slate-200 text-left flex items-center justify-between hover:border-brand-500/50 transition-colors"
                            >
                                {formData.voucher_type_id ? (
                                    <span className="text-white">
                                        {voucherTypes.find(v => v.id === formData.voucher_type_id)?.type_name || 'Unknown Type'}
                                    </span>
                                ) : (
                                    <span className="text-slate-500">-- Select Voucher Type --</span>
                                )}
                                <div className="flex items-center gap-2">
                                    {formData.voucher_type_id && (
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateFormData({ voucher_type_id: undefined });
                                            }}
                                            className="p-1 hover:bg-slate-800 rounded-full text-slate-500 hover:text-rose-400 transition-colors"
                                        >
                                            <X size={12} />
                                        </div>
                                    )}
                                </div>
                            </button>
                            <VoucherPickerModal
                                isOpen={showVoucherPicker}
                                onClose={() => setShowVoucherPicker(false)}
                                onSelect={(voucherType) => {
                                    updateFormData({ voucher_type_id: voucherType.id });
                                    setShowVoucherPicker(false);
                                }}
                                voucherTypes={voucherTypes}
                                groups={voucherGroups}
                                selectedVoucherId={formData.voucher_type_id || undefined}
                                skipTemplateSelection={true}
                            />
                        </label>

                        <div className="flex items-center gap-4 pt-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.is_active ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
                                    <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${formData.is_active ? 'left-6 bg-emerald-500' : 'left-1 bg-slate-500'}`} />
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={formData.is_active}
                                        onChange={e => updateFormData({ is_active: e.target.checked })}
                                    />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Template Active</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Section 2: The Grid */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <DollarSign size={14} />
                            Transaction Structure
                        </h4>
                        <button
                            type="button"
                            onClick={handleAddLine}
                            className="text-[10px] font-black uppercase tracking-widest text-brand-400 hover:text-brand-300 flex items-center gap-1"
                        >
                            <Plus size={12} />
                            Add Line
                        </button>
                    </div>

                    <div className="border border-slate-800 rounded-xl bg-slate-900/10">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-1 bg-slate-900/50 p-2 border-b border-slate-800 rounded-t-xl text-[9px] font-black uppercase tracking-widest text-slate-500">
                            <div className="col-span-1 text-center"></div>
                            <div className="col-span-1 text-center">Side</div>
                            <div className="col-span-4">Target Account</div>
                            <div className="col-span-2">Amount Rule</div>
                            <div className="col-span-3">Value / Formula</div>
                            <div className="col-span-1 text-center">Action</div>
                        </div>

                        {/* Rows */}
                        {lines.map((line, index) => (
                            <div
                                key={line.id}
                                draggable={true}
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={() => handleDrop(index)}
                                onDragEnd={() => setDraggedIndex(null)}
                                className={`grid grid-cols-12 gap-2 p-2 items-center border-b border-slate-800/50 hover:bg-slate-800/20 transition-all ${draggedIndex === index ? 'opacity-30 bg-slate-800' : ''}`}
                            >
                                <div className="col-span-1 flex justify-center text-slate-400 cursor-move group-hover:text-brand-400 transition-colors">
                                    <GripVertical size={14} />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateLine(line.id, 'default_side', line.default_side === 'DR' ? 'CR' : 'DR')}
                                        className={`w-8 h-6 rounded flex items-center justify-center text-[10px] font-black tracking-widest transition-all ${line.default_side === 'DR'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                            }`}
                                    >
                                        {line.default_side}
                                    </button>
                                </div>
                                <div className="col-span-4">
                                    <SearchableSelect
                                        value={line.ledger_id}
                                        onChange={(id) => handleUpdateLine(line.id, 'ledger_id', id)}
                                        onSearch={handleLedgerSearch}
                                        placeholder="Select Ledger"
                                        className="w-full"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <select
                                        value={line.amount_rule}
                                        onChange={(e) => handleUpdateLine(line.id, 'amount_rule', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2 text-[10px] font-bold text-slate-300 focus:outline-none focus:border-brand-500/50"
                                    >
                                        <option value="INPUT">User Input</option>
                                        <option value="FIXED">Fixed Amount</option>
                                        <option value="CALCULATED">Formula</option>
                                    </select>
                                </div>
                                <div className="col-span-3">
                                    {line.amount_rule === 'FIXED' ? (
                                        <div className="relative">
                                            <span className="absolute left-2 top-1.5 text-slate-500 text-[10px]">₹</span>
                                            <input
                                                type="number"
                                                value={line.amount_value || ''}
                                                onChange={(e) => handleUpdateLine(line.id, 'amount_value', parseFloat(e.target.value))}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-5 pr-2 text-[10px] font-mono font-bold text-slate-300"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    ) : line.amount_rule === 'CALCULATED' ? (
                                        <button type="button" className="w-full py-1.5 px-2 bg-slate-800 rounded-lg border border-slate-700 text-[9px] font-bold text-slate-400 flex items-center justify-between hover:bg-slate-700 transition-colors">
                                            <span>Configure Formula</span>
                                            <Calculator size={10} />
                                        </button>
                                    ) : (
                                        <div className="w-full py-1.5 px-2 bg-slate-800/30 rounded-lg border border-slate-800/50 text-[9px] font-bold text-slate-600 italic text-center">
                                            Entered by user
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-1 flex justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateLine(line.id, 'is_fixed_side', !line.is_fixed_side)}
                                        className={`p-1.5 rounded-lg transition-colors ${line.is_fixed_side ? 'text-amber-500 bg-amber-500/10' : 'text-slate-600 hover:text-slate-400'}`}
                                        title={line.is_fixed_side ? "Side Locked" : "Side Editable"}
                                    >
                                        {line.is_fixed_side ? <Lock size={12} /> : <Unlock size={12} />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteLine(line.id)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Empty State */}
                        {lines.length === 0 && (
                            <div className="p-12 text-center text-slate-600 bg-slate-900/20">
                                <FileText size={32} className="mx-auto mb-3 opacity-20" />
                                <p className="text-xs font-bold uppercase tracking-wide opacity-50">No lines defined</p>
                                <p className="text-[10px] opacity-40 mt-1">Add transaction legs to build the template</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Validation Panel */}
                <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/30">
                    <div className="flex items-center gap-2 text-amber-500 mb-2">
                        <AlertCircle size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Validation Status</span>
                    </div>
                    <ul className="space-y-1 pl-6 list-disc text-[10px] font-bold text-slate-500">
                        <li>Minimum 2 lines required</li>
                        <li>Total Debits must equal Total Credits (or formula must balance)</li>
                    </ul>
                </div>

            </div>
        </div >
    );
}
