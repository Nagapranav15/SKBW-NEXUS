import React, { useEffect } from 'react';
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

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size,
  maxWidth,
  className = '',
  hideCloseButton = false,
  zIndex = 'z-[90]',
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
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${zIndex} overflow-y-auto flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-xs transition-all duration-300 animate-fadeIn`}>
      <div className={`relative bg-white rounded-2xl shadow-2xl shadow-slate-900/10 border border-slate-200/90 flex flex-col w-full ${modalSize} max-h-[90vh] overflow-hidden animate-modalPop ${className}`}>
        {title && (
          <div className="px-6 py-4 border-b border-slate-100 bg-white flex justify-between items-center shrink-0">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              {title}
            </h3>
            {!hideCloseButton && (
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className={`overflow-y-auto flex-1 flex flex-col ${padding}`}>
          {!title && !hideCloseButton && (
            <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-xl z-10 cursor-pointer transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
