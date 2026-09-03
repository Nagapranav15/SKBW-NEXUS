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
    <div className="fixed inset-0 z-[70] overflow-y-auto flex items-center justify-center p-4 bg-gray-950/20">
      <div className={`relative bg-white rounded-xl shadow-2xl flex flex-col w-full ${modalSize} max-h-[90vh] overflow-hidden ${className}`}>
        {title && (
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {title}
            </h3>
            {!hideCloseButton && (
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-6 overflow-y-auto flex-1">
          {!title && !hideCloseButton && (
            <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-450 hover:text-gray-700 p-1 hover:bg-gray-100 rounded-lg z-10 cursor-pointer">
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
