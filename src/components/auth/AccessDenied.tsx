import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';

interface AccessDeniedProps {
    onNavigateBack?: () => void;
    onGoHome?: () => void;
}

export default function AccessDenied({ onNavigateBack, onGoHome }: AccessDeniedProps) {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 animate-fade-in">
            <div className="relative mb-8">
                <div className="absolute inset-0 bg-rose-500/20 blur-[40px] rounded-full animate-pulse" />
                <div className="relative w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] flex items-center justify-center shadow-glow shadow-rose-500/5 transition-transform hover:scale-105 duration-500">
                    <ShieldAlert size={42} className="text-rose-500" />
                </div>
            </div>

            <div className="text-center space-y-4 max-w-sm">
                <div className="space-y-1">
                    <h2 className="text-2xl font-display font-black text-white uppercase tracking-tight">Security Protocol Active</h2>
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Unauthorized Access Detected</p>
                </div>

                <p className="text-sm text-slate-500 font-medium leading-relaxed uppercase tracking-tight">
                    Your current clearance level does not permit entry into this sector. This attempt has been logged.
                </p>
            </div>

            <div className="flex items-center gap-4 mt-12">
                <button
                    onClick={onNavigateBack}
                    className="flex items-center gap-3 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 group"
                >
                    <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Safety
                </button>

                <button
                    onClick={onGoHome}
                    className="flex items-center gap-3 px-6 py-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-glow shadow-brand-500/10 active:scale-95 group"
                >
                    <Home size={14} className="group-hover:scale-110 transition-transform" />
                    Command Center
                </button>
            </div>

            <div className="mt-16 pt-8 border-t border-slate-800/20 w-full max-w-md text-center">
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.4em]">
                    Enterprise Security Infrastructure &bull; v4.0.2
                </p>
            </div>
        </div>
    );
}
