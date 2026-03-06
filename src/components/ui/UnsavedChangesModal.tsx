import { X, AlertTriangle, Save, Trash2 } from 'lucide-react';
import Modal from './Modal';

interface UnsavedChangesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveDraft: () => void;
    onDiscard: () => void;
}

export default function UnsavedChangesModal({
    isOpen,
    onClose,
    onSaveDraft,
    onDiscard
}: UnsavedChangesModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                            <AlertTriangle size={18} />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-200">
                            Unsaved Vouchers
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-sm font-medium text-slate-400 leading-relaxed">
                        You have entered voucher data that hasn't been saved. Would you like to save it as a draft before leaving?
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-950/30 border-t border-slate-800 flex flex-col gap-3">
                    <button
                        onClick={onSaveDraft}
                        className="w-full px-4 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-glow shadow-brand-500/20 flex items-center justify-center gap-2"
                    >
                        <Save size={14} />
                        Save as Draft & Continue
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={onDiscard}
                            className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Trash2 size={12} />
                            Discard
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 transition-all border border-slate-700/50 flex items-center justify-center"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
