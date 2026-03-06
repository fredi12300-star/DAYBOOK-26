/**
 * businessDate.ts
 * -------------------------------------------------------
 * Singleton module that manages the "System Date" override.
 *
 * Usage:
 *   import { getBusinessDate, setBusinessDateOverride, onBusinessDateChange } from './businessDate';
 *
 * - getBusinessDate()         → returns overridden date (YYYY-MM-DD) if set, else today
 * - setBusinessDateOverride(date | null) → sets / clears override + notifies all subscribers
 * - onBusinessDateChange(cb)  → subscribe to changes; returns unsubscribe fn
 *
 * The override is stored in sessionStorage so it persists across hot-reloads but
 * is intentionally cleared on full browser close (each session must re-confirm the date
 * from the DB, which is done in App.tsx on startup).
 */

const SESSION_KEY = 'day_book_business_date_override';
const BROADCAST_KEY = 'business_date_changed';

type Listener = (date: string | null) => void;
const listeners = new Set<Listener>();

/** Returns the active business date (override or real today). */
export function getBusinessDate(): string {
    const override = sessionStorage.getItem(SESSION_KEY);
    if (override) return override;
    return getRealToday();
}

/** Returns the actual machine today date in YYYY-MM-DD. */
export function getRealToday(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Returns the raw override value (null if not set). */
export function getBusinessDateOverride(): string | null {
    return sessionStorage.getItem(SESSION_KEY);
}

/** Sets or clears the override and notifies all listeners. */
export function setBusinessDateOverride(date: string | null): void {
    if (date) {
        sessionStorage.setItem(SESSION_KEY, date);
    } else {
        sessionStorage.removeItem(SESSION_KEY);
    }

    // Notify in-page subscribers
    listeners.forEach(cb => cb(date));

    // Notify other tabs/windows via BroadcastChannel (if supported)
    try {
        const bc = new BroadcastChannel(BROADCAST_KEY);
        bc.postMessage({ date });
        bc.close();
    } catch {
        // BroadcastChannel not supported in all environments — fine to skip
    }
}

/**
 * Subscribes to business date changes.
 * Returns an unsubscribe function.
 */
export function onBusinessDateChange(cb: Listener): () => void {
    listeners.add(cb);

    // Also listen across tabs
    let bc: BroadcastChannel | null = null;
    try {
        bc = new BroadcastChannel(BROADCAST_KEY);
        bc.onmessage = (e) => cb(e.data.date ?? null);
    } catch {
        // Not supported — cross-tab sync won't work but in-page will
    }

    return () => {
        listeners.delete(cb);
        bc?.close();
    };
}

/**
 * Formats a date string for premium display.
 * Returns e.g. { day: '21', month: 'February', year: '2026', weekday: 'Saturday' }
 */
export function formatBusinessDateDisplay(dateStr: string): {
    day: string;
    month: string;
    year: string;
    weekday: string;
    iso: string;
} {
    const d = new Date(dateStr + 'T00:00:00'); // force local midnight
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: months[d.getMonth()],
        year: String(d.getFullYear()),
        weekday: days[d.getDay()],
        iso: dateStr,
    };
}
