import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, Loader2, Plus, Edit2 } from 'lucide-react';

interface Option {
    id: string;
    label: string;
    subLabel?: string;
    badge?: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (id: string, label: string) => void;
    onSearch: (term: string) => Promise<Option[]>;
    onCreateNew?: (searchTerm: string) => void;
    onEdit?: (id: string, label: string) => void;
    createNewLabel?: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    labelClassName?: string;
    size?: 'sm' | 'md' | 'lg';
    initialLabel?: string;
}

export default function SearchableSelect({
    value,
    onChange,
    onSearch,
    onCreateNew,
    onEdit,
    createNewLabel = "Add New Entry",
    placeholder = "Search...",
    disabled = false,
    className = "",
    labelClassName = "text-slate-100",
    size = 'md',
    initialLabel = ""
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [options, setOptions] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, placement: 'bottom' as 'top' | 'bottom' });

    const updateCoords = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const dropdownMaxHeight = 350; // Max allowed height (280 list + search/header)

            // Determine if we should open upwards
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;
            const placement = (spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow) ? 'top' : 'bottom';

            setCoords({
                top: rect.top,
                left: rect.left,
                width: rect.width,
                placement
            });
        }
    };

    useLayoutEffect(() => {
        if (isOpen) {
            updateCoords();
            window.addEventListener('scroll', updateCoords, true);
            window.addEventListener('resize', updateCoords);
        }
        return () => {
            window.removeEventListener('scroll', updateCoords, true);
            window.removeEventListener('resize', updateCoords);
        };
    }, [isOpen]);

    // Initial load and Search logic
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isOpen) {
                performSearch(searchTerm);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, isOpen]);

    // Resolve initial value label
    useEffect(() => {
        if (value && options.length === 0) {
            performSearch(""); // Load initial set to find the label
        }
    }, [value, onSearch]); // Adding onSearch ensures it retries if the parent's data source changes

    async function performSearch(term: string) {
        setLoading(true);
        try {
            const results = await onSearch(term);
            setOptions(results);
            setSelectedIndex(-1);
        } catch (error) {
            console.error("Search failed:", error);
            setOptions([]);
        } finally {
            setLoading(false);
        }
    }

    // Handle clicks outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const displayValue = selectedOption ? selectedOption.label : (initialLabel || "");

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === "ArrowDown") setIsOpen(true);
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
                break;
            case "Enter":
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < options.length) {
                    const opt = options[selectedIndex];
                    onChange(opt.id, opt.label);
                    setIsOpen(false);
                }
                break;
            case "Escape":
                setIsOpen(false);
                break;
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div
                className={`flex items-center justify-between px-4 transition-all cursor-pointer rounded-xl border ${size === 'sm' ? 'h-11 px-3' : 'h-14 px-5 rounded-2xl'} ${disabled ? 'opacity-50 cursor-not-allowed bg-[#020617]/20 border-slate-800' :
                    isOpen ? 'bg-[#020617]/50 border-brand-500/50 shadow-glow' : 'bg-[#020617]/50 border-slate-700/80'
                    }`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className={`font-black uppercase tracking-wide truncate ${size === 'sm' ? 'text-[11px]' : 'text-[13px]'} ${!value ? 'text-slate-600' : labelClassName}`}>
                    {displayValue || placeholder}
                </span>
                <ChevronDown size={size === 'sm' ? 12 : 14} className={`text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl z-[10000] overflow-hidden animate-scale-in"
                    style={{
                        top: coords.placement === 'bottom' ? (coords.top + containerRef.current?.offsetHeight! + 8) : undefined,
                        bottom: coords.placement === 'top' ? (window.innerHeight - coords.top + 8) : undefined,
                        left: coords.left,
                        width: coords.width,
                        transformOrigin: coords.placement === 'bottom' ? 'top center' : 'bottom center'
                    }}
                >
                    <div className="p-4 border-b border-white/5 bg-white/5">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full bg-slate-950/50 border border-white/5 rounded-xl pl-10 pr-4 h-10 text-[11px] font-bold text-white uppercase tracking-widest focus:outline-none focus:border-brand-500/50"
                                placeholder="TYPE TO FILTER..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                autoFocus
                            />
                        </div>
                    </div>

                    {onCreateNew && (
                        <button
                            type="button"
                            className="w-full px-6 py-4 flex items-center gap-3 text-brand-500 hover:bg-brand-500/10 transition-colors border-b border-white/5 bg-slate-900 sticky top-0 z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCreateNew(searchTerm);
                                setIsOpen(false);
                            }}
                        >
                            <Plus size={16} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{createNewLabel}</span>
                        </button>
                    )}

                    <div className="max-h-[280px] overflow-y-auto py-2">
                        {loading ? (
                            <div className="flex items-center justify-center py-10 gap-2">
                                <Loader2 size={16} className="text-brand-500 animate-spin" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Searching...</span>
                            </div>
                        ) : options.length === 0 ? (
                            <div className="text-center py-10">
                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No results found</span>
                            </div>
                        ) : (
                            options.map((opt, index) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    className={`w-full px-6 py-4 flex items-center justify-between text-left transition-all border-l-4 ${selectedIndex === index || value === opt.id ? 'bg-brand-500/10 border-brand-500' : 'border-transparent hover:bg-white/5'
                                        }`}
                                    onClick={() => {
                                        onChange(opt.id, opt.label);
                                        setIsOpen(false);
                                    }}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[12px] font-black uppercase tracking-wide ${value === opt.id ? 'text-brand-400' : 'text-white'}`}>
                                                {opt.label}
                                            </span>
                                            {opt.badge && (
                                                <span className="px-2 py-0.5 bg-slate-800 text-slate-500 text-[8px] font-black rounded-md uppercase tracking-tighter">
                                                    {opt.badge}
                                                </span>
                                            )}
                                        </div>
                                        {opt.subLabel && (
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                                {opt.subLabel}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {onEdit && (
                                            <button
                                                type="button"
                                                className="p-2 hover:bg-brand-500/20 rounded-lg text-slate-500 hover:text-brand-400 transition-all"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEdit(opt.id, opt.label);
                                                    setIsOpen(false);
                                                }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        )}
                                        {value === opt.id && <Check size={14} className="text-brand-400" />}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
