import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'primary' | 'success';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  type = 'warning',
  isLoading = false,
}) => {
  const iconConfig = {
    danger: { icon: AlertTriangle, bg: 'bg-rose-100 text-rose-600', btn: 'bg-rose-600 hover:bg-rose-700 text-white' },
    warning: { icon: AlertTriangle, bg: 'bg-amber-100 text-amber-600', btn: 'bg-amber-600 hover:bg-amber-700 text-white' },
    primary: { icon: Info, bg: 'bg-blue-100 text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
    success: { icon: CheckCircle, bg: 'bg-emerald-100 text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  };

  const config = iconConfig[type];
  const IconComponent = config.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-full shrink-0 ${config.bg}`}>
          <IconComponent className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2 ${config.btn}`}
        >
          {isLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
};
