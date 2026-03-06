import { useState, useEffect } from 'react';
import { X, Trash2, Settings, AlertCircle } from 'lucide-react';
import { fetchPartyGroups, upsertPartyGroup, deletePartyGroup, reassignParties } from '../lib/supabase';
import type { PartyGroup } from '../types/accounting';
import Modal from './ui/Modal';
import toast from 'react-hot-toast';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onGroupsChange: () => void;
}

export default function PartyGroupManagerModal({ isOpen, onClose, onGroupsChange }: Props) {
    const [groups, setGroups] = useState<PartyGroup[]>([]);

    const [editingGroup, setEditingGroup] = useState<Partial<PartyGroup> | null>(null);
    const [migrationGroupId, setMigrationGroupId] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadGroups();
        }
    }, [isOpen]);

    async function loadGroups() {
        try {
            const data = await fetchPartyGroups(false);
            setGroups(data);
        } catch (error) {
            console.error('Error loading groups:', error);
            toast.error('Failed to load groups');
        }
    }

    async function handleSaveGroup() {
        if (!editingGroup?.group_name) return;
        try {
            await upsertPartyGroup(editingGroup);
            toast.success(`Group ${editingGroup.id ? 'updated' : 'created'}`);
            setEditingGroup(null);
            loadGroups();
            onGroupsChange();
        } catch (error) {
            toast.error('Failed to save group');
        }
    }

    async function handleDeleteGroup(groupId: string) {
        try {
            // Reassign parties to selected group (or null for Uncategorized)
            await reassignParties(groupId, migrationGroupId);
            await deletePartyGroup(groupId);
            toast.success('Group deleted and parties reassigned');
            setShowDeleteConfirm(null);
            setMigrationGroupId(null);
            loadGroups();
            onGroupsChange();
        } catch (error) {
            toast.error('Failed to delete group');
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[2.5rem] shadow-2xl animate-scale-in">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.4em] text-brand-500">Manage Party Groups</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Categorize your customers & vendors for CRM</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-all">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {/* Add/Edit Form */}
                    <div className="p-6 bg-slate-950/30 rounded-3xl border border-white/5 space-y-4">
                        <div className="flex gap-4">
                            <input
                                type="text"
                                className="input-field flex-1 !h-12 uppercase"
                                placeholder="Group Name (e.g., Gold Loan Customers)"
                                value={editingGroup?.group_name || ''}
                                onChange={e => setEditingGroup(prev => ({ ...prev, group_name: e.target.value.toUpperCase() }))}
                            />
                            <button
                                onClick={handleSaveGroup}
                                disabled={!editingGroup?.group_name}
                                className="btn-primary !h-12 px-6 text-[10px] font-black uppercase tracking-widest"
                            >
                                {editingGroup?.id ? 'Update' : 'Add Group'}
                            </button>
                            {editingGroup && (
                                <button onClick={() => setEditingGroup(null)} className="p-3 text-slate-500 hover:text-white">
                                    <X size={18} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Groups List */}
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                        {groups.map(group => (
                            <div key={group.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-white/5 group hover:border-brand-500/30 transition-all">
                                <div>
                                    <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-200">{group.group_name}</span>
                                    {!group.is_active && <span className="ml-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">Inactive</span>}
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        onClick={() => setEditingGroup(group)}
                                        className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-500/10 rounded-lg transition-all"
                                    >
                                        <Settings size={14} />
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(group.id)}
                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Delete Confirmation Overlay */}
                {showDeleteConfirm && (
                    <div className="absolute inset-0 bg-slate-900/98 backdrop-blur-md rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center animate-fade-in z-20">
                        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
                            <AlertCircle size={32} className="text-rose-500" />
                        </div>
                        <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white mb-2">Delete Group?</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-loose max-w-xs mb-8">
                            Select a group to move existing parties to, or leave as Uncategorized.
                        </p>

                        <div className="w-full max-w-xs space-y-4 mb-8">
                            <select
                                className="select-field !h-12 w-full"
                                value={migrationGroupId || ''}
                                onChange={e => setMigrationGroupId(e.target.value || null)}
                            >
                                <option value="">Move to Uncategorized</option>
                                {groups.filter(g => g.id !== showDeleteConfirm).map(g => (
                                    <option key={g.id} value={g.id}>{g.group_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-4 w-full max-w-xs">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="flex-1 h-12 rounded-2xl border border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteGroup(showDeleteConfirm)}
                                className="flex-1 h-12 rounded-2xl bg-rose-500 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-rose-400 transition-all"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
