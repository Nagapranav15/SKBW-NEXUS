import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Tailwind width class, e.g. "max-w-2xl" */
  size?: string;
  maxWidth?: string;
  className?: string;
  hideCloseButton?: boolean;
  zIndex?: string;
  padding?: string;
}

const PAD_REM: Record<string, string> = { 'p-0': '0rem', 'p-1': '0.25rem', 'p-2': '0.5rem', 'p-3': '0.75rem', 'p-4': '1rem', 'p-5': '1.25rem', 'p-6': '1.5rem', 'p-8': '2rem' };

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size,
  maxWidth,
  className = '',
  hideCloseButton = false,
  zIndex = 'z-[9999]',
  padding = 'p-6',
}) => {
  const modalSize = maxWidth || size || 'max-w-lg';
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div className={`fixed inset-0 ${zIndex} `}>
      {/* Dedicated Full-Screen Backdrop Overlay covering 100% of viewport edge-to-edge */}
      <div 
        className="fixed inset-0 bg-gray-900/40 cursor-pointer dlg-fade"
        onClick={onClose}
      />

      {/* Modal Dialog Content Container */}
      <div className="fixed inset-0 overflow-y-auto flex items-center justify-center p-2 sm:p-4 lg:p-6 pointer-events-none">
        <div className={`relative bg-white rounded-2xl shadow-[0_24px_60px_-12px_rgba(15,23,42,0.28)] border border-gray-100 flex flex-col w-full ${modalSize} ${className.includes('max-h-') ? '' : 'max-h-[calc(90*var(--vh,1vh))]'} overflow-hidden pointer-events-auto ${className}`}>
          {title && (
            <div className="px-6 py-4 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
              <h3 className="text-[0.9375rem] font-semibold text-gray-900 flex items-center gap-2">
                {title}
              </h3>
              {!hideCloseButton && (
                <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 hover:bg-gray-100 rounded-full cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <div className={`dlg-modal-body overflow-y-auto flex-1 flex flex-col ${padding}`} style={{ ['--dlg-pad' as any]: PAD_REM[padding.split(' ')[0]] ?? '1.5rem' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default Modal;

