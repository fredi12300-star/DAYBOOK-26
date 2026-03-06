import { X, AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDestructive?: boolean;
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    isDestructive = false
}: ConfirmDialogProps) {
    return (
        <Modal isOpen={isOpen} onClose={onCancel}>
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isDestructive ? 'bg-rose-500/10 text-rose-500' : 'bg-brand-500/10 text-brand-500'}`}>
                            <AlertTriangle size={18} />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-200">
                            {title}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-sm font-medium text-slate-400 leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-950/30 border-t border-slate-800 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-transparent hover:border-slate-700"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all transform active:scale-95 ${isDestructive
                            ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
                            : 'bg-brand-600 hover:bg-brand-500 shadow-brand-500/20'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
