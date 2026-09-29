import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 3000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const config = {
    success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', Icon: CheckCircle, iconColor: 'text-green-500' },
    error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', Icon: XCircle, iconColor: 'text-red-500' },
    warning: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-800', Icon: AlertTriangle, iconColor: 'text-yellow-500' },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', Icon: Info, iconColor: 'text-blue-500' }
  }[type];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl ${config.bg} animate-slide-in backdrop-blur-md`}>
      <config.Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0`} />
      <span className={`text-sm font-semibold ${config.text} flex-1 leading-snug`}>{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-lg transition-colors cursor-pointer">
        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
      </button>
    </div>
  );
};

// Toast container & manager
interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

let toastId = 0;
let addToastFn: ((msg: string, type: ToastItem['type']) => void) | null = null;

export const showToast = (message: string, type: ToastItem['type'] = 'info') => {
  if (addToastFn) addToastFn(message, type);
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (message, type) => {
      const id = ++toastId;
      setToasts(prev => [...prev, { id, message, type }]);
    };
    return () => { addToastFn = null; };
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed top-5 right-5 z-[9999999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast message={t.message} type={t.type} onClose={() => remove(t.id)} />
        </div>
      ))}
    </div>,
    document.body
  );
};

export default Toast;
