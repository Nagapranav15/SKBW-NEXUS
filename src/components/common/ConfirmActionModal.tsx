import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, Trash2, X, Loader2, CheckCircle2 } from 'lucide-react';

interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  subtitle?: string;
  description?: string;
  bullets?: string[];
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  bullets,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const getIcon = () => {
    if (variant === 'danger') return <Trash2 className="w-6 h-6 text-red-600" />;
    if (variant === 'warning') return <RotateCcw className="w-6 h-6 text-amber-600" />;
    return <AlertTriangle className="w-6 h-6 text-blue-600" />;
  };

  const getIconBg = () => {
    if (variant === 'danger') return 'bg-red-50 border-red-100 text-red-600';
    if (variant === 'warning') return 'bg-amber-50 border-amber-100 text-amber-600';
    return 'bg-blue-50 border-blue-100 text-blue-600';
  };

  const getConfirmBtnStyle = () => {
    if (variant === 'danger') return 'bg-red-600 hover:bg-red-700 text-white shadow-xs focus:ring-red-500';
    if (variant === 'warning') return 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs focus:ring-amber-500';
    return 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs focus:ring-blue-500';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${getIconBg()}`}>
            {getIcon()}
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-base font-bold text-gray-900 tracking-tight leading-snug">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs font-semibold text-gray-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {description && (
          <p className="text-xs text-gray-600 mt-3 leading-relaxed">
            {description}
          </p>
        )}

        {bullets && bullets.length > 0 && (
          <div className="mt-4 bg-gray-50 border border-gray-150 rounded-xl p-3.5 space-y-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">This action will:</p>
            <ul className="space-y-1.5">
              {bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs font-medium text-gray-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-xs hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 ${getConfirmBtnStyle()}`}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
