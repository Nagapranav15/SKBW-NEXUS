import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl' | 'max-w-5xl' | 'max-w-6xl' | 'max-w-7xl' | 'max-w-full';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'max-w-md',
}) => {
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

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full',
    'max-w-md': 'max-w-md',
    'max-w-lg': 'max-w-lg',
    'max-w-xl': 'max-w-xl',
    'max-w-2xl': 'max-w-2xl',
    'max-w-3xl': 'max-w-3xl',
    'max-w-4xl': 'max-w-4xl',
    'max-w-5xl': 'max-w-5xl',
    'max-w-6xl': 'max-w-6xl',
    'max-w-7xl': 'max-w-7xl',
    'max-w-full': 'max-w-full',
  };

  const maxWidthClass = sizeClasses[size] || size;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 overflow-hidden bg-gray-950/10 transition-opacity animate-in fade-in duration-200" onClick={onClose}></div>
      <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className={`pointer-events-auto w-screen ${maxWidthClass} animate-in slide-in-from-right duration-200`}>
          <div className="flex h-full flex-col overflow-hidden bg-white shadow-2xl">
            {title && (
              <div className="bg-gray-50 px-4 py-6 sm:px-6 border-b flex-shrink-0">
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    {title}
                  </h2>
                  <div className="ml-3 flex h-7 items-center space-x-2">
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-500 bg-gray-100 rounded border border-gray-200 shadow-xs select-none pointer-events-none">Esc</kbd>
                    <button type="button" onClick={onClose} className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none p-1 hover:bg-gray-100">
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="relative flex-1 overflow-hidden flex flex-col h-full">
              {!title && (
                <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-450 hover:text-gray-700 z-10 p-1 hover:bg-gray-100 rounded-lg">
                  <X className="h-6 w-6" />
                </button>
              )}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Drawer;
