import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    showBackdrop?: boolean;
    closeOnBackdropClick?: boolean;
    className?: string; // Standardized backdrop class
    containerClassName?: string; // Standardized container class
}

/**
 * A reusable Modal component that uses React Portals to render at the document body.
 * This ensures the modal backdrop covers the entire screen, including sticky headers.
 */
export default function Modal({
    isOpen,
    onClose,
    children,
    showBackdrop = true,
    closeOnBackdropClick = true,
    className = "modal-backdrop",
    containerClassName = "modal-content-container"
}: ModalProps) {
    // Prevent scrolling on the body when the modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Handle Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <>
            {showBackdrop && (
                <div
                    className={className}
                    onClick={closeOnBackdropClick ? onClose : undefined}
                />
            )}
            <div className={containerClassName}>
                <div className="modal-content">
                    {children}
                </div>
            </div>
        </>,
        document.body
    );
}
