import { useState } from 'react';
import { RotateCcw, X, AlertTriangle } from 'lucide-react';
import Modal from './ui/Modal';

interface ReversalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    loading?: boolean;
    voucherNo?: string;
}

export default function ReversalModal({
    isOpen,
    onClose,
    onConfirm,
    loading = false,
    voucherNo
}: ReversalModalProps) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason.trim()) {
            setError('Please provide a reason for the reversal.');
            return;
        }

        try {
            await onConfirm(reason);
            setReason('');
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to process reversal');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-3xl w-full max-w-lg overflow-hidden flex flex-col animate-scale-up border border-slate-200 dark:border-slate-800">
                {/* Header */}
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-rose-50/30 dark:bg-rose-950/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-500 rounded-2xl shadow-lg shadow-rose-500/20">
                            <RotateCcw className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-display font-black text-slate-900 dark:text-white leading-tight">Corrective Reversal</h2>
                            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest leading-none mt-1">
                                Voucher Audit Correction {voucherNo && `• ${voucherNo}`}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-10 space-y-8">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 p-5 rounded-2xl flex items-start gap-4">
                        <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                        <div className="space-y-1">
                            <h3 className="text-sm font-black text-amber-900 dark:text-amber-200 uppercase tracking-widest">Permanent Action</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-400/80 leading-relaxed font-medium">
                                Reversing a journal entry is permanent and will create counter-entries to zero out the impact.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Reversal Reason *</label>
                        <textarea
                            className="input-field !h-32 py-4 resize-none leading-relaxed"
                            placeholder="Describe why this transaction is being reversed..."
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value.toUpperCase());
                                if (error) setError(null);
                            }}
                            autoFocus
                        />
                        {error && (
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1 animate-fade-in">{error}</p>
                        )}
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-secondary flex-1 h-14 uppercase tracking-[0.3em] text-[10px] font-black"
                            disabled={loading}
                        >
                            Dismiss
                        </button>
                        <button
                            type="submit"
                            className="btn-danger flex-2 h-14 px-10 flex items-center justify-center gap-3 uppercase tracking-[0.3em] text-[10px] font-black shadow-lg shadow-rose-500/20"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white"></div>
                            ) : (
                                <>
                                    <RotateCcw size={16} /> Confirm Reversal
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
